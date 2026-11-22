import { apiBaseUrl } from "../shared/api-url";
import {
  contentSchema,
  publicContentSchema,
  slugSchema,
  tokenSchema,
} from "../shared/domain";
import type { Content, GenerateInput } from "../shared/domain";
import { publicationSchema } from "../shared/activation";
import { z } from "zod";
const base = apiBaseUrl({
  VITE_API_URL: import.meta.env.VITE_API_URL,
  VITE_CONVEX_URL: import.meta.env.VITE_CONVEX_URL,
});
export const configured = Boolean(base);
const storeSchema = z.object({
  slug: slugSchema,
  status: z.enum(["draft", "published"]),
  content: publicContentSchema,
  instagram_handle: z.string().nullable().optional(),
  views: z.number().optional(),
  updated_at: z.string().optional(),
  published_at: z.string().nullable().optional(),
});
const ownerStoreSchema = storeSchema.extend({
  content: contentSchema,
  first_published_at: z.string().nullable().optional(),
  publication: publicationSchema.optional(),
  updated_at: z.string().datetime({ offset: true }),
});
export type OwnedStore = z.infer<typeof ownerStoreSchema>;
export type Store = z.infer<typeof storeSchema>;
const generatedSchema = z.object({
  input_quality: z.literal("ok"),
  content: contentSchema,
  assumptions: z.array(z.string()).default([]),
  slug: slugSchema,
  edit_token: tokenSchema,
});
const clarificationSchema = z.object({
  input_quality: z.enum(["too_vague", "unusable"]),
  clarifying_question: z.string().min(1),
  clarification_options: z.array(z.string()).default([]),
});
export type GenerateResult =
  z.infer<typeof generatedSchema> | z.infer<typeof clarificationSchema>;
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
export async function request(
  path: string,
  method = "GET",
  body?: unknown,
  token?: string,
) {
  if (!configured)
    throw new ApiError(
      "Connect Convex to bring your store to life. Add VITE_CONVEX_URL to .env.development.local, then restart the app. Your description is saved on this device.",
    );
  try {
    const response = await fetch(`${base}${path}`, {
      method,
      signal: AbortSignal.timeout(26000),
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { "x-edit-token": token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) {
      const detail = data.issues
        ?.map(
          (i: { path: string; message: string }) => `${i.path}: ${i.message}`,
        )
        .join(" · ");
      throw new ApiError(
        detail || data.error || "Something went wrong. Please retry.",
        response.status,
      );
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "We couldn’t reach your store. Check your connection and try again. Your work is saved on this device.",
    );
  }
}
export const api = {
  generate: async (input: GenerateInput): Promise<GenerateResult> =>
    z
      .union([generatedSchema, clarificationSchema])
      .parse(await request("/generate", "POST", input)),
  owner: async (slug: string, token: string) =>
    ownerStoreSchema.parse(
      await request(`/owner/${slug}`, "GET", undefined, token),
    ),
  public: async (slug: string) =>
    storeSchema.parse(await request(`/public/${slug}`)),
  save: async (
    slug: string,
    edit_token: string,
    content: Content,
    expected_updated_at: string,
  ) =>
    ownerStoreSchema.parse(
      await request("/storefront", "PATCH", {
        slug,
        edit_token,
        content,
        expected_updated_at,
      }),
    ),
  regenerate: async (
    slug: string,
    edit_token: string,
    scope: string,
    language: string,
    expected_updated_at: string,
    product_id?: string,
  ) =>
    ownerStoreSchema.parse(
      await request("/regenerate", "POST", {
        slug,
        edit_token,
        scope,
        language,
        expected_updated_at,
        ...(product_id ? { product_id } : {}),
      }),
    ),
  publish: async (
    slug: string,
    edit_token: string,
    expected_updated_at: string,
    current_setup_session_id?: string,
  ) =>
    ownerStoreSchema.parse(
      await request("/publish", "POST", {
        ...(current_setup_session_id ? { current_setup_session_id } : {}),
        slug,
        edit_token,
        expected_updated_at,
      }),
    ),
  track: (slug: string, event: "view") =>
    request("/track", "POST", { slug, event }).catch(() => undefined),
};
