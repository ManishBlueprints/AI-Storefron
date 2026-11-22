import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { contentValidator, storeFields } from "./schema";
import { constantTimeEqual } from "../shared/security";
import { contentSchema, publicContentSchema } from "../shared/domain";

export const findOwner = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) =>
    ctx.db
      .query("storefronts")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique(),
});
export const findPublic = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const row = await ctx.db
      .query("storefronts")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    return row?.status === "published" && row.published_content ? row : null;
  },
});
const {
  status: _status,
  published_content: _published,
  views: _views,
  updated_at: _updated,
  published_at: _at,
  first_published_at: _first,
  ...newFields
} = storeFields;
export const insert = internalMutation({
  args: { store: v.object(newFields) },
  handler: async (ctx, { store }) => {
    contentSchema.parse(store.content);
    if (
      await ctx.db
        .query("storefronts")
        .withIndex("by_slug", (q) => q.eq("slug", store.slug))
        .unique()
    )
      throw new Error("Store already exists");
    await ctx.db.insert("storefronts", {
      ...store,
      status: "draft",
      published_content: null,
      views: 0,
      updated_at: new Date().toISOString(),
      published_at: null,
      first_published_at: null,
    });
  },
});
export const update = internalMutation({
  args: {
    slug: v.string(),
    tokenHash: v.string(),
    revision: v.string(),
    patch: v.object({
      assumptions: v.optional(v.array(v.string())),
      content: v.optional(contentValidator),
      niche: v.optional(storeFields.niche),
      language: v.optional(storeFields.language),
      status: v.optional(storeFields.status),
      published_at: v.optional(storeFields.published_at),
      first_published_at: v.optional(storeFields.first_published_at),
      published_content: v.optional(storeFields.published_content),
    }),
  },
  handler: async (ctx, { slug, tokenHash, revision, patch }) => {
    const row = await ctx.db
      .query("storefronts")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (
      !row ||
      !constantTimeEqual(row.edit_token_hash, tokenHash) ||
      row.updated_at !== revision
    )
      return null;
    if (patch.content) contentSchema.parse(patch.content);
    if (patch.published_content)
      publicContentSchema.parse(patch.published_content);
    // ISO timestamps remain compatible with saved local drafts; monotonic even within one millisecond.
    const updated_at = new Date(
      Math.max(Date.now(), Date.parse(row.updated_at) + 1),
    ).toISOString();
    await ctx.db.patch(row._id, { ...patch, updated_at });
    return { ...row, ...patch, updated_at };
  },
});
export const track = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const row = await ctx.db
      .query("storefronts")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (row?.status === "published")
      await ctx.db.patch(row._id, { views: row.views + 1 });
  },
});
