import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const contentValidator = v.object({
  niche: v.union(
    v.literal("fitness"),
    v.literal("finance"),
    v.literal("cooking"),
    v.literal("exam_prep"),
    v.literal("astrology"),
    v.literal("other"),
  ),
  language: v.union(v.literal("en"), v.literal("hinglish")),
  bio: v.object({ headline: v.string(), about: v.string() }),
  source: v.union(v.literal("ai"), v.literal("template")),
  products: v.array(
    v.object({
      id: v.string(),
      title: v.string(),
      format: v.union(
        v.literal("ebook"),
        v.literal("template_pack"),
        v.literal("recorded_course"),
        v.literal("cohort_course"),
        v.literal("one_on_one"),
        v.literal("community"),
      ),
      price_inr: v.number(),
      billing: v.union(v.literal("one_time"), v.literal("monthly")),
      description: v.string(),
      price_rationale: v.string(),
      ready_to_sell: v.boolean(),
    }),
  ),
});
export const storeFields = {
  slug: v.string(),
  edit_token_hash: v.string(),
  status: v.union(v.literal("draft"), v.literal("published")),
  niche: contentValidator.fields.niche,
  language: contentValidator.fields.language,
  input_text: v.string(),
  audience_size: v.union(
    v.literal("under_5k"),
    v.literal("5k_25k"),
    v.literal("25k_plus"),
    v.null(),
  ),
  instagram_handle: v.union(v.string(), v.null()),
  offer_status: v.union(
    v.literal("existing"),
    v.literal("exploring"),
    v.null(),
  ),
  existing_offer: v.union(v.string(), v.null()),
  content: contentValidator,
  published_content: v.union(contentValidator, v.null()),
  views: v.number(),
  updated_at: v.string(),
  published_at: v.union(v.string(), v.null()),
  first_published_at: v.union(v.string(), v.null()),
  setup_session_id: v.union(v.string(), v.null()),
  setup_started_at: v.union(v.string(), v.null()),
  new_creator_session: v.boolean(),
};
export default defineSchema({
  storefronts: defineTable(storeFields).index("by_slug", ["slug"]),
  rate_limits: defineTable({
    key: v.string(),
    window_start: v.number(),
    count: v.number(),
  })
    .index("by_key_window", ["key", "window_start"])
    .index("by_window", ["window_start"]),
});
