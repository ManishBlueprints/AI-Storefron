import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
async function cleanup(ctx: MutationCtx, now: number) {
  const expired = await ctx.db
    .query("rate_limits")
    .withIndex("by_window", (q) => q.lt("window_start", now - 2 * 86400000))
    .take(500);
  for (const row of expired) await ctx.db.delete(row._id);
}
async function bucket(ctx: MutationCtx, key: string, window: number) {
  return ctx.db
    .query("rate_limits")
    .withIndex("by_key_window", (q) =>
      q.eq("key", key).eq("window_start", window),
    )
    .unique();
}
export const claimGeneration = internalMutation({
  args: { key: v.string(), ipLimit: v.number(), dailyCap: v.number() },
  handler: async (ctx, { key, ipLimit, dailyCap }) => {
    const now = Date.now();
    await cleanup(ctx, now);
    const hour = Math.floor(now / 3600000) * 3600000,
      day = Math.floor(now / 86400000) * 86400000;
    const ip = await bucket(ctx, key, hour);
    if ((ip?.count ?? 0) >= ipLimit)
      return { allowed: false, model_allowed: false };
    if (ip) await ctx.db.patch(ip._id, { count: ip.count + 1 });
    else
      await ctx.db.insert("rate_limits", { key, window_start: hour, count: 1 });
    const daily = await bucket(ctx, "global:daily", day);
    if ((daily?.count ?? 0) >= dailyCap)
      return { allowed: true, model_allowed: false };
    if (daily) await ctx.db.patch(daily._id, { count: daily.count + 1 });
    else
      await ctx.db.insert("rate_limits", {
        key: "global:daily",
        window_start: day,
        count: 1,
      });
    return { allowed: true, model_allowed: true };
  },
});
export const claimTracking = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const now = Date.now();
    await cleanup(ctx, now);
    const window = Math.floor(now / 60000) * 60000,
      row = await bucket(ctx, key, window);
    if ((row?.count ?? 0) >= 60) return false;
    if (row) await ctx.db.patch(row._id, { count: row.count + 1 });
    else
      await ctx.db.insert("rate_limits", {
        key,
        window_start: window,
        count: 1,
      });
    return true;
  },
});
