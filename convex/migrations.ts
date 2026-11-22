import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { storeFields } from "./schema";
import { contentSchema, publicContentSchema } from "../shared/domain";
// Admin-only, idempotent transfer. Never overwrite a store already in Convex.
export const importStores = internalMutation({
  args: { stores: v.array(v.object(storeFields)) },
  handler: async (ctx, { stores }) => {
    let imported = 0,
      skipped = 0;
    for (const store of stores) {
      contentSchema.parse(store.content);
      if (store.published_content)
        publicContentSchema.parse(store.published_content);
      if (
        await ctx.db
          .query("storefronts")
          .withIndex("by_slug", (q) => q.eq("slug", store.slug))
          .unique()
      ) {
        skipped++;
        continue;
      }
      await ctx.db.insert("storefronts", store);
      imported++;
    }
    return { imported, skipped };
  },
});
