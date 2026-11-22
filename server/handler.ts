import { z } from "zod";
import {
  creatorContext,
  generateSchema,
  mutationSchema,
  patchSchema,
  preflight,
  publishableContent,
  regenerateSchema,
  slugSchema,
  tokenSchema,
} from "../shared/domain.ts";
import { publicationMetrics } from "../shared/activation.ts";
import { generate, ModelUnavailableError } from "../shared/generation.ts";
import { constantTimeEqual, hashToken, newToken } from "../shared/security.ts";
import type { ModelConfig } from "../shared/generation.ts";
import { ownerDTO } from "./repository";
import type { StoreRepository } from "./repository";

interface Settings {
  origin: string;
  salt: string;
  ipLimit: number;
  dailyCap: number;
  model: ModelConfig;
}
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export function createHandler(db: StoreRepository, settings: Settings) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("Origin");
    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
      "Access-Control-Allow-Headers":
        "content-type,x-edit-token,apikey,authorization",
      "Access-Control-Max-Age": "86400",
      "X-Content-Type-Options": "nosniff",
    });
    if (origin === settings.origin) {
      headers.set("Access-Control-Allow-Origin", origin);
    }
    const respond = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers });
    if (origin && origin !== settings.origin) {
      return respond({ error: "This origin is not allowed." }, 403);
    }
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    try {
      const url = new URL(req.url);
      const path = url.pathname.replace(/^\/api(?=\/|$)/, "");
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        "unknown";
      const ipKey = `ip:${await hashToken(`${settings.salt}:${ip}`)}`;
      async function json() {
        const length = Number(req.headers.get("content-length") || "0");
        if (length > 20000) throw new HttpError(413, "Request is too large.");
        // Bound streaming input too: a missing Content-Length cannot bypass the limit.
        const reader = req.body?.getReader();
        if (!reader) throw new HttpError(400, "A JSON body is required.");
        let size = 0;
        const chunks: Uint8Array[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 20000) {
            await reader.cancel();
            throw new HttpError(413, "Request is too large.");
          }
          chunks.push(value);
        }
        const data = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          data.set(chunk, offset);
          offset += chunk.length;
        }
        try {
          return JSON.parse(new TextDecoder().decode(data));
        } catch {
          throw new HttpError(400, "Send a valid JSON request.");
        }
      }
      async function quota() {
        const data = await db.claimGeneration(
          ipKey,
          settings.ipLimit,
          settings.dailyCap,
        );
        if (!data?.allowed) {
          headers.set("Retry-After", "3600");
          throw new HttpError(
            429,
            "You’ve reached the hourly limit. Please try again in an hour.",
          );
        }
        return Boolean(data.model_allowed);
      }
      async function owner(slug: string, token: string) {
        const data = await db.findOwner(slug);
        // Hash and compare even when a slug is absent. Do not expose the hash.
        const valid = constantTimeEqual(
          await hashToken(token),
          data?.edit_token_hash ?? "0".repeat(64),
        );
        if (!data || !valid) {
          throw new HttpError(
            403,
            "This edit link is invalid. Use your saved private edit link.",
          );
        }
        return data;
      }
      if (req.method === "POST" && path === "/generate") {
        const input = generateSchema.parse(await json());
        const gate = preflight(creatorContext(input));
        if (gate) return respond(gate);
        const modelAllowed = await quota();
        const result = await generate(
          input,
          settings.model,
          undefined,
          modelAllowed,
        );
        if (result.input_quality !== "ok") return respond(result);
        const slug = crypto.randomUUID();
        const edit_token = newToken();
        await db.insert({
          slug,
          edit_token_hash: await hashToken(edit_token),
          niche: result.content.niche,
          language: input.language,
          audience_size: input.audience_size ?? null,
          input_text: input.description,
          instagram_handle: input.handle?.trim().replace(/^@/, "") || null,
          offer_status: input.offer_status ?? null,
          existing_offer:
            input.offer_status === "existing"
              ? (input.existing_offer ?? null)
              : null,
          setup_session_id: input.setup_session_id ?? null,
          setup_started_at:
            input.setup_session_id &&
            input.setup_started_at &&
            Date.parse(input.setup_started_at) <= Date.now() &&
            Date.parse(input.setup_started_at) >= Date.now() - 86400000
              ? input.setup_started_at
              : null,
          new_creator_session: input.new_creator_session === true,
          content: result.content,
        });
        return respond({ ...result, slug, edit_token });
      }
      if (req.method === "POST" && path === "/regenerate") {
        const input = regenerateSchema.parse(await json());
        const record = await owner(input.slug, input.edit_token);
        if (record.updated_at !== input.expected_updated_at) {
          throw new HttpError(
            409,
            "Your store changed in another tab. Reload the latest saved version before trying again.",
          );
        }
        if (input.scope !== "all" && input.language !== record.language) {
          throw new HttpError(
            400,
            "Switch language for the whole store to keep it consistent.",
          );
        }
        if (
          input.scope === "product" &&
          !record.content.products.some(
            (p: { id: string }) => p.id === input.product_id,
          )
        ) {
          throw new HttpError(404, "Product not found.");
        }
        const modelAllowed = await quota();
        const result = await generate(
          {
            description: record.input_text,
            offer_status: record.offer_status,
            existing_offer: record.existing_offer ?? undefined,
            audience_size: record.audience_size,
            language: input.language,
          },
          settings.model,
          {
            scope: input.scope,
            current: record.content,
            product_id: input.product_id,
          },
          modelAllowed,
        );
        if (result.input_quality !== "ok") return respond(result);
        const data = await db.update(
          input.slug,
          record.edit_token_hash,
          input.expected_updated_at,
          {
            content: result.content,
            language: input.language,
            niche: result.content.niche,
          },
        );
        if (!data) {
          throw new HttpError(
            409,
            "Your store changed in another tab. Reload before trying again.",
          );
        }
        return respond(ownerDTO(data));
      }
      if (req.method === "PATCH" && path === "/storefront") {
        const input = patchSchema.parse(await json());
        const record = await owner(input.slug, input.edit_token);
        if (record.updated_at !== input.expected_updated_at) {
          throw new HttpError(
            409,
            "Your store changed in another tab. Reload the latest saved version before saving.",
          );
        }
        // Source is assigned by generation, never supplied as an analytics claim by an edit.
        const content = { ...input.content, source: record.content.source };
        const data = await db.update(
          input.slug,
          record.edit_token_hash,
          input.expected_updated_at,
          {
            content,
            niche: content.niche,
            language: content.language,
          },
        );
        if (!data) {
          throw new HttpError(
            409,
            "Your store changed in another tab. Reload before saving.",
          );
        }
        return respond(ownerDTO(data));
      }
      if (req.method === "POST" && path === "/publish") {
        const input = mutationSchema
          .extend({ current_setup_session_id: z.string().uuid().optional() })
          .strict()
          .parse(await json());
        const record = await owner(input.slug, input.edit_token);
        if (record.updated_at !== input.expected_updated_at) {
          throw new HttpError(
            409,
            "Your store changed in another tab. Reload the latest saved version before publishing.",
          );
        }
        if (
          !record.content.products.some(
            (product: { ready_to_sell?: boolean }) => product.ready_to_sell,
          )
        ) {
          throw new HttpError(
            400,
            "Review your offers and mark at least one ready to deliver before publishing.",
          );
        }
        const snapshot = publishableContent(record.content);
        const now = new Date().toISOString();
        const publication = publicationMetrics(
          record,
          now,
          input.current_setup_session_id,
        );
        const data = await db.update(
          input.slug,
          record.edit_token_hash,
          input.expected_updated_at,
          {
            status: "published",
            published_at: now,
            first_published_at: record.first_published_at || now,
            published_content: snapshot,
          },
        );
        if (!data) {
          throw new HttpError(
            409,
            "Your store changed while publishing. Reload and try again.",
          );
        }
        return respond({ ...ownerDTO(data), publication });
      }
      if (req.method === "GET" && path.startsWith("/public/")) {
        const slug = slugSchema.parse(path.slice("/public/".length));
        const data = await db.findPublic(slug);
        if (!data) {
          throw new HttpError(
            404,
            "This store hasn’t been published or doesn’t exist.",
          );
        }
        if (!data.published_content) {
          throw new HttpError(404, "This store has not been published yet.");
        }
        return respond({
          slug: data.slug,
          status: data.status,
          content: data.published_content,
          published_at: data.published_at,
          instagram_handle: data.instagram_handle ?? null,
          niche: data.published_content.niche,
          language: data.published_content.language,
        });
      }
      if (req.method === "GET" && path.startsWith("/owner/")) {
        const slug = slugSchema.parse(path.slice("/owner/".length));
        const record = await owner(
          slug,
          tokenSchema.parse(req.headers.get("x-edit-token")),
        );
        return respond(ownerDTO(record));
      }
      if (req.method === "POST" && path === "/track") {
        const input = z
          .object({ slug: slugSchema, event: z.literal("view") })
          .strict()
          .parse(await json());
        const allowed = await db.claimTracking(`track:${ipKey}`);
        if (!allowed) return respond({ ok: true });
        await db.track(input.slug);
        return respond({ ok: true });
      }
      return respond({ error: "Endpoint not found." }, 404);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return respond(
          {
            error: "Please check the highlighted fields.",
            issues: error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          },
          400,
        );
      }
      if (
        error instanceof HttpError ||
        error instanceof ModelUnavailableError
      ) {
        return respond({ error: error.message }, error.status);
      }
      console.error(
        JSON.stringify({
          event: "api_error",
          type: error instanceof Error ? error.name : "unknown",
        }),
      );
      return respond(
        {
          error:
            "Something went wrong. Your work on this device is safe. Please retry.",
        },
        500,
      );
    }
  };
}
