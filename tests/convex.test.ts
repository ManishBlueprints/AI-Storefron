import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { internal } from "../convex/_generated/api";
import { templateContent } from "../shared/templates";
import { hashToken } from "../shared/security";
import type { StoreRecord } from "../server/repository";
const modules = import.meta.glob("../convex/**/*.ts");
const token = "a".repeat(64),
  slug = "test-store";
const revision = "2026-11-21T10:00:00.000Z";
async function fixture(t: ReturnType<typeof convexTest>, published = false) {
  const content = templateContent(
    "I teach vegetarian cooking to students",
    "en",
  );
  const row: StoreRecord = {
    slug,
    edit_token_hash: await hashToken(token),
    status: published ? "published" : "draft",
    niche: content.niche,
    language: content.language,
    input_text: "I teach vegetarian cooking to students",
    assumptions: ["Affordable meals for students"],
    context_tags: ["Students"],
    clarification_answer: "Vegetarian recipes",
    audience_size: "under_5k",
    instagram_handle: "demo.creator",
    offer_status: "exploring",
    existing_offer: null,
    content,
    published_content: published
      ? {
          ...content,
          products: [{ ...content.products[0], ready_to_sell: true }],
        }
      : null,
    views: 0,
    updated_at: revision,
    published_at: published ? revision : null,
    first_published_at: published ? revision : null,
    setup_session_id: null,
    setup_started_at: null,
    new_creator_session: false,
  };
  await t.run(async (ctx) => {
    await ctx.db.insert("storefronts", row);
  });
  return row;
}
function request(
  t: ReturnType<typeof convexTest>,
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return t.fetch("/api" + path, {
    method,
    headers: {
      Origin: "https://app.example",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  vi.stubEnv("APP_ORIGIN", "https://app.example");
  vi.stubEnv("APP_ALLOWED_ORIGINS", "");
  vi.stubEnv("RATE_LIMIT_SALT", "test-salt");
  vi.stubEnv("KILO_MODELS", "test:free");
  vi.stubEnv("KILO_JSON_MODELS", "test:free");
  vi.stubEnv("KILO_API_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("keeps database functions internal, without public query/mutation endpoints", async () => {
  const t = convexTest(schema, modules);
  await fixture(t);
  const response = await request(t, `/public/${slug}`);
  const data = await response.json();
  expect(response.status).toBe(404);
  expect(data).not.toHaveProperty("edit_token_hash");
});
it("serves only a published snapshot and creator-supplied Instagram username", async () => {
  const t = convexTest(schema, modules);
  const row = await fixture(t, true);
  const response = await request(t, `/public/${slug}`);
  const data = await response.json();
  expect(response.status).toBe(200);
  expect(data.content).toEqual(row.published_content);
  expect(data.instagram_handle).toBe("demo.creator");
  for (const key of [
    "edit_token_hash",
    "input_text",
    "assumptions",
    "context_tags",
    "clarification_answer",
    "setup_session_id",
    "_id",
    "views",
  ])
    expect(data).not.toHaveProperty(key);
});
it.each(["/storefront", "/publish", "/regenerate", "/owner/test-store"])(
  "rejects incorrect edit tokens for %s",
  async (path) => {
    const t = convexTest(schema, modules);
    const row = await fixture(t);
    const method = path.startsWith("/owner")
      ? "GET"
      : path === "/storefront"
        ? "PATCH"
        : "POST";
    const body =
      method === "GET"
        ? undefined
        : {
            slug,
            edit_token: "b".repeat(64),
            expected_updated_at: revision,
            ...(path === "/storefront"
              ? { content: row.content }
              : path === "/regenerate"
                ? { scope: "bio", language: "en" }
                : {}),
          };
    const response = await request(t, path, method, body, {
      "x-edit-token": "b".repeat(64),
    });
    expect(response.status).toBe(403);
    expect(
      (await t.query(internal.storefronts.findOwner, { slug }))?.updated_at,
    ).toBe(revision);
  },
);
it("handles CORS, preflight, malformed JSON and bounded request bodies", async () => {
  const t = convexTest(schema, modules);
  expect(
    (
      await request(
        t,
        "/generate",
        "POST",
        {},
        { Origin: "https://wrong.example" },
      )
    ).status,
  ).toBe(403);
  const options = await request(t, "/generate", "OPTIONS");
  expect(options.status).toBe(204);
  expect(options.headers.get("Access-Control-Allow-Origin")).toBe(
    "https://app.example",
  );
  expect(
    (await t.fetch("/api/generate", { method: "POST", body: "invalid" }))
      .status,
  ).toBe(400);
  expect(
    (
      await t.fetch("/api/generate", {
        method: "POST",
        body: "x".repeat(20001),
      })
    ).status,
  ).toBe(413);
});
it.each(["I make content", "asdfghjkl qwerty", "@creator"])(
  "returns a clarification without a store for %s",
  async (description) => {
    const t = convexTest(schema, modules);
    const response = await request(t, "/generate", "POST", {
      description,
      language: "en",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty("slug");
    expect(
      await t.run((ctx) => ctx.db.query("storefronts").collect()),
    ).toHaveLength(0);
  },
);
it("saves private edits, preserves user prices and rejects stale saves atomically", async () => {
  const t = convexTest(schema, modules);
  const row = await fixture(t, true);
  const content = structuredClone(row.content);
  content.products[0].price_inr = 0;
  content.source = "ai";
  const body = {
    slug,
    edit_token: token,
    expected_updated_at: revision,
    content,
  };
  const saved = await request(t, "/storefront", "PATCH", body);
  expect(saved.status).toBe(200);
  const result = await saved.json();
  expect(result.content.products[0].price_inr).toBe(0);
  expect(result.content.source).toBe("template");
  expect(result).not.toHaveProperty("edit_token_hash");
  expect((await request(t, "/storefront", "PATCH", body)).status).toBe(409);
  expect((await (await request(t, `/public/${slug}`)).json()).content).toEqual(
    row.published_content,
  );
});
it("publishes only selected offers and preserves first publication across updates", async () => {
  const t = convexTest(schema, modules);
  const row = await fixture(t);
  expect(
    (
      await request(t, "/publish", "POST", {
        slug,
        edit_token: token,
        expected_updated_at: revision,
      })
    ).status,
  ).toBe(400);
  row.content.products[0].ready_to_sell = true;
  const saved = await (
    await request(t, "/storefront", "PATCH", {
      slug,
      edit_token: token,
      expected_updated_at: revision,
      content: row.content,
    })
  ).json();
  const published = await (
    await request(t, "/publish", "POST", {
      slug,
      edit_token: token,
      expected_updated_at: saved.updated_at,
    })
  ).json();
  expect(published.publication.first_publish).toBe(true);
  const publicStore = await (await request(t, `/public/${slug}`)).json();
  expect(publicStore.content.products).toHaveLength(1);
  const updated = await (
    await request(t, "/publish", "POST", {
      slug,
      edit_token: token,
      expected_updated_at: published.updated_at,
    })
  ).json();
  expect(updated.first_published_at).toBe(published.first_published_at);
  expect(updated.publication.first_publish).toBe(false);
});
it("tracks published views atomically without advancing content revisions", async () => {
  const t = convexTest(schema, modules);
  await fixture(t, true);
  for (let i = 0; i < 3; i++)
    expect(
      (await request(t, "/track", "POST", { slug, event: "view" })).status,
    ).toBe(200);
  const row = await t.query(internal.storefronts.findOwner, { slug });
  expect(row?.views).toBe(3);
  expect(row?.updated_at).toBe(revision);
  expect(
    (await request(t, "/track", "POST", { slug, event: "buy_click" })).status,
  ).toBe(400);
});
it("keeps drafts untracked and ignores missing slugs", async () => {
  const t = convexTest(schema, modules);
  await fixture(t);
  await t.mutation(internal.storefronts.track, { slug });
  await t.mutation(internal.storefronts.track, { slug: "missing-store" });
  expect((await t.query(internal.storefronts.findOwner, { slug }))?.views).toBe(
    0,
  );
});
it("enforces hourly and global generation caps in database transactions", async () => {
  const t = convexTest(schema, modules);
  expect(
    await t.mutation(internal.quotas.claimGeneration, {
      key: "ip:test",
      ipLimit: 2,
      dailyCap: 1,
    }),
  ).toEqual({ allowed: true, model_allowed: true });
  expect(
    await t.mutation(internal.quotas.claimGeneration, {
      key: "ip:other",
      ipLimit: 2,
      dailyCap: 1,
    }),
  ).toEqual({ allowed: true, model_allowed: false });
  await t.mutation(internal.quotas.claimGeneration, {
    key: "ip:test",
    ipLimit: 2,
    dailyCap: 1,
  });
  expect(
    await t.mutation(internal.quotas.claimGeneration, {
      key: "ip:test",
      ipLimit: 2,
      dailyCap: 1,
    }),
  ).toEqual({ allowed: false, model_allowed: false });
});
it("bounds tracking quotas and cleans expired buckets", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("rate_limits", {
      key: "expired",
      window_start: Date.now() - 3 * 86400000,
      count: 1,
    });
  });
  for (let i = 0; i < 60; i++)
    expect(
      await t.mutation(internal.quotas.claimTracking, { key: "track:test" }),
    ).toBe(true);
  expect(
    await t.mutation(internal.quotas.claimTracking, { key: "track:test" }),
  ).toBe(false);
  expect(
    await t.run((ctx) =>
      ctx.db
        .query("rate_limits")
        .filter((q) => q.eq(q.field("key"), "expired"))
        .collect(),
    ),
  ).toHaveLength(0);
});
it("generates through the provider and stores a normalized Instagram username", async () => {
  const t = convexTest(schema, modules);
  const { source: _source, ...content } = templateContent(
    "I teach cooking recipes to students",
    "en",
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    ...content,
                    input_quality: "ok",
                    clarifying_question: null,
                  }),
                },
              },
            ],
          }),
        ),
    ),
  );
  const response = await request(t, "/generate", "POST", {
    description: "I teach cooking recipes to students",
    language: "en",
    handle: "@creator.name",
  });
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.content.source).toBe("ai");
  const owner = await t.query(internal.storefronts.findOwner, {
    slug: result.slug,
  });
  expect(owner?.instagram_handle).toBe("creator.name");
  expect(owner?.edit_token_hash).toBe(await hashToken(result.edit_token));
});
it("does not create a template store when Kilo is unavailable", async () => {
  const t = convexTest(schema, modules);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 429 })),
  );
  const response = await request(t, "/generate", "POST", {
    description: "I teach cooking recipes to students",
    language: "en",
  });
  expect(response.status).toBe(429);
  expect(
    await t.run((ctx) => ctx.db.query("storefronts").collect()),
  ).toHaveLength(0);
});
it("imports stores idempotently without changing hashes, snapshots or revisions", async () => {
  const t = convexTest(schema, modules);
  const row = await fixture(t, true);
  const source = { ...row, slug: "migrated-store" };
  expect(
    await t.mutation(internal.migrations.importStores, { stores: [source] }),
  ).toEqual({ imported: 1, skipped: 0 });
  expect(
    await t.mutation(internal.migrations.importStores, {
      stores: [{ ...source, views: 99 }],
    }),
  ).toEqual({ imported: 0, skipped: 1 });
  const migrated = await t.query(internal.storefronts.findOwner, {
    slug: "migrated-store",
  });
  expect(migrated?.edit_token_hash).toBe(row.edit_token_hash);
  expect(migrated?.updated_at).toBe(revision);
  expect(migrated?.published_content).toEqual(row.published_content);
  expect(migrated?.views).toBe(0);
});

it("preserves offers during bio-only regeneration on Convex", async () => {
  const t = convexTest(schema, modules);
  const row = await fixture(t, true);
  const bio = {
    ...row.content.bio,
    headline: "Everyday cooking for busy students",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(bio) } }],
          }),
        ),
    ),
  );
  const response = await request(t, "/regenerate", "POST", {
    slug,
    edit_token: token,
    expected_updated_at: revision,
    scope: "bio",
    language: "en",
  });
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.content.bio).toEqual(bio);
  expect(result.content.products).toEqual(row.content.products);
  expect((await (await request(t, `/public/${slug}`)).json()).content).toEqual(
    row.published_content,
  );
});
it("rejects scope language changes and missing offers before provider calls", async () => {
  const t = convexTest(schema, modules);
  await fixture(t);
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(
    (
      await request(t, "/regenerate", "POST", {
        slug,
        edit_token: token,
        expected_updated_at: revision,
        scope: "bio",
        language: "hinglish",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await request(t, "/regenerate", "POST", {
        slug,
        edit_token: token,
        expected_updated_at: revision,
        scope: "product",
        product_id: "p4",
        language: "en",
      })
    ).status,
  ).toBe(404);
  expect(fetcher).not.toHaveBeenCalled();
});
it("returns an explicit quota error without invoking the provider", async () => {
  const t = convexTest(schema, modules);
  vi.stubEnv("GLOBAL_DAILY_GENERATION_CAP", "0");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const response = await request(t, "/generate", "POST", {
    description: "I teach cooking recipes to students",
    language: "en",
  });
  expect(response.status).toBe(429);
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    await t.run((ctx) => ctx.db.query("storefronts").collect()),
  ).toHaveLength(0);
});
it("returns a safe configuration error when server settings are missing", async () => {
  const t = convexTest(schema, modules);
  vi.stubEnv("RATE_LIMIT_SALT", "");
  const response = await request(t, "/generate", "POST", {
    description: "I teach cooking recipes to students",
    language: "en",
  });
  expect(response.status).toBe(503);
  expect((await response.json()).error).toContain("not configured");
});

it("keeps assumptions private and reloads them with the owner's draft", async () => {
  const t = convexTest(schema, modules);
  await fixture(t);
  const owned = await request(t, `/owner/${slug}`, "GET", undefined, {
    "x-edit-token": token,
  });
  expect((await owned.json()).assumptions).toEqual([
    "Affordable meals for students",
  ]);
  const updated = await t.mutation(internal.storefronts.update, {
    slug,
    tokenHash: await hashToken(token),
    revision,
    patch: { assumptions: ["Beginner home cooks"] },
  });
  expect(updated?.assumptions).toEqual(["Beginner home cooks"]);
  const reopened = await request(t, `/owner/${slug}`, "GET", undefined, {
    "x-edit-token": token,
  });
  expect((await reopened.json()).assumptions).toEqual(["Beginner home cooks"]);
});

it("replaces saved assumptions on full regeneration and keeps the public snapshot unchanged", async () => {
  const t = convexTest(schema, modules);
  const row = await fixture(t, true);
  const { source: _source, ...content } = row.content;
  const output = {
    ...content,
    input_quality: "ok",
    clarifying_question: null,
    assumptions: ["Short sessions for beginner cooks"],
    bio: { ...content.bio, headline: "Practical cooking lessons for students" },
    products: content.products.map((p) => ({
      ...p,
      title: "New " + p.title,
      description: "Together, " + p.description,
    })),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(output) } }],
          }),
        ),
    ),
  );
  const response = await request(t, "/regenerate", "POST", {
    slug,
    edit_token: token,
    expected_updated_at: revision,
    scope: "all",
    language: "en",
  });
  expect(response.status).toBe(200);
  expect((await response.json()).assumptions).toEqual(output.assumptions);
  expect(
    (await t.query(internal.storefronts.findOwner, { slug }))?.assumptions,
  ).toEqual(output.assumptions);
  expect((await (await request(t, `/public/${slug}`)).json()).content).toEqual(
    row.published_content,
  );
});

it("checks input without inserting a storefront or calling the model for obvious junk", async () => {
  const t = convexTest(schema, modules);
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const response = await request(t, "/assess-input", "POST", {
    description: "asdfghjkl",
    language: "en",
  });
  expect(response.status).toBe(200);
  expect((await response.json()).input_quality).toBe("unusable");
  expect(fetcher).not.toHaveBeenCalled();
  expect(await t.run((ctx) => ctx.db.query("storefronts").collect())).toEqual(
    [],
  );
});
it("returns semantic input feedback without creating a draft", async () => {
  const t = convexTest(schema, modules);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    input_quality: "too_vague",
                    clarifying_question: "What kind of pottery do you teach?",
                    clarification_options: ["Hand building", "Wheel throwing"],
                  }),
                },
              },
            ],
          }),
        ),
    ),
  );
  const response = await request(t, "/assess-input", "POST", {
    description: "pottery",
    language: "en",
  });
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.input_quality).toBe("too_vague");
  expect(result).not.toHaveProperty("slug");
  expect(await t.run((ctx) => ctx.db.query("storefronts").collect())).toEqual(
    [],
  );
});

it("allows only configured live and local origins, including preflight and validation errors", async () => {
  const t = convexTest(schema, modules);
  vi.stubEnv(
    "APP_ALLOWED_ORIGINS",
    "http://127.0.0.1:5173,http://localhost:5173",
  );
  for (const origin of [
    "https://app.example",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
  ]) {
    const response = await request(
      t,
      "/assess-input",
      "POST",
      { description: "12345", language: "en" },
      { Origin: origin },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    const options = await request(t, "/assess-input", "OPTIONS", undefined, {
      Origin: origin,
    });
    expect(options.status).toBe(204);
    expect(options.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  }
  for (const origin of [
    "https://untrusted.example",
    "http://localhost:5174",
    "https://app.example.evil.test",
  ]) {
    const response = await request(t, "/assess-input", "OPTIONS", undefined, {
      Origin: origin,
    });
    expect(response.status).toBe(403);
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  }
});
