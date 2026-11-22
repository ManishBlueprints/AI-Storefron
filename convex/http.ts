import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { createHandler } from "../server/handler";
import { allowedFrontendOrigins, serverSettings } from "../server/settings";
import type { StoreRepository } from "../server/repository";
const http = httpRouter();
const handler = httpAction(async (ctx, request) => {
  try {
    const db: StoreRepository = {
      findOwner: (slug) =>
        ctx.runQuery(internal.storefronts.findOwner, { slug }),
      findPublic: (slug) =>
        ctx.runQuery(internal.storefronts.findPublic, { slug }),
      insert: async (store) => {
        await ctx.runMutation(internal.storefronts.insert, { store });
      },
      update: (slug, tokenHash, revision, patch) =>
        ctx.runMutation(internal.storefronts.update, {
          slug,
          tokenHash,
          revision,
          patch,
        }),
      claimGeneration: (key, ipLimit, dailyCap) =>
        ctx.runMutation(internal.quotas.claimGeneration, {
          key,
          ipLimit,
          dailyCap,
        }),
      claimTracking: (key) =>
        ctx.runMutation(internal.quotas.claimTracking, { key }),
      track: async (slug) => {
        await ctx.runMutation(internal.storefronts.track, { slug });
      },
    };
    return await createHandler(
      db,
      serverSettings((name) => process.env[name]),
    )(request);
  } catch {
    const origin = request.headers.get("Origin");
    let allowed = false;
    try {
      allowed =
        origin !== null &&
        allowedFrontendOrigins((name) => process.env[name]).includes(origin);
    } catch {
      /* Invalid configuration must not widen CORS access. */
    }
    return new Response(
      JSON.stringify({
        error:
          "The store service is not configured yet. Your work is saved on this device.",
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          Vary: "Origin",
          ...(origin && allowed
            ? { "Access-Control-Allow-Origin": origin }
            : {}),
        },
      },
    );
  }
});
for (const method of ["GET", "POST", "PATCH", "OPTIONS"] as const)
  http.route({ pathPrefix: "/api/", method, handler });
export default http;
