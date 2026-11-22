import { describe, it, expect, vi } from "vitest";
import { createHandler } from "../supabase/functions/api/handler";
import { hashToken } from "../supabase/functions/_shared/security";
import { templateContent } from "../supabase/functions/_shared/templates";
import type { SupabaseClient } from "@supabase/supabase-js";
const token = "a".repeat(64),
  slug = "test-store";
const revision = "2026-11-21T10:00:00.000000+00:00";
const content = templateContent("I teach fitness workouts to beginners", "en");
const settings = {
  origin: "https://app.example",
  salt: "test-salt",
  ipLimit: 10,
  dailyCap: 100,
  model: { key: "", models: [], jsonModels: [], origin: "https://app.example" },
};
function mockDB(
  row: unknown,
  rpcValue: unknown = { allowed: true, model_allowed: false },
) {
  const query: Record<string, any> = {};
  for (const method of ["select", "eq", "update", "insert"])
    query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  query.single = vi.fn(async () => ({ data: row, error: null }));
  // Insert is awaitable; do not make it return an unresolved query.
  query.then = (resolve: (value: unknown) => void) =>
    resolve({ data: row, error: null });
  const db = {
    from: vi.fn(() => query),
    rpc: vi.fn(async () => ({ data: rpcValue, error: null })),
  };
  return {
    db: db as unknown as SupabaseClient,
    query,
    rpc: db.rpc,
    from: db.from,
  };
}
function req(
  path: string,
  method = "GET",
  body?: unknown,
  headers?: Record<string, string>,
) {
  return new Request(`https://project.supabase.co/functions/v1/api${path}`, {
    method,
    headers: {
      Origin: settings.origin,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
describe("ownership boundaries", () => {
  it.each(["/storefront", "/publish", "/regenerate", "/owner/test-store"])(
    "rejects a wrong edit token for %s before mutation or stats",
    async (path) => {
      const { db, query } = mockDB({
        id: "id",
        edit_token_hash: await hashToken(token),
        content,
      });
      const wrong = "b".repeat(64);
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
              edit_token: wrong,
              expected_updated_at: revision,
              ...(path === "/storefront"
                ? { content }
                : path === "/regenerate"
                  ? { scope: "bio", language: "en" }
                  : {}),
            };
      const result = await createHandler(
        db,
        settings,
      )(req(path, method, body, { "x-edit-token": wrong }));
      expect(result.status).toBe(403);
      expect(query.update).not.toHaveBeenCalled();
      expect(await result.text()).not.toContain("edit_token_hash");
    },
  );
  it("returns public fields only and filters for published status", async () => {
    const { db, query } = mockDB({
      slug,
      published_content: content,
    });
    const result = await createHandler(db, settings)(req(`/public/${slug}`));
    expect(result.status).toBe(200);
    expect(query.select.mock.calls[0][0]).not.toContain("edit_token");
    expect(query.eq).toHaveBeenCalledWith("status", "published");
    expect(query.select.mock.calls[0][0]).not.toContain("views");
  });
});
it("restricts CORS to the exact configured origin", async () => {
  const { db, from } = mockDB(null);
  const handler = createHandler(db, settings);
  const blocked = await handler(
    req("/generate", "POST", {}, { Origin: "https://attacker.example" }),
  );
  expect(blocked.status).toBe(403);
  expect(blocked.headers.has("Access-Control-Allow-Origin")).toBe(false);
  expect(from).not.toHaveBeenCalled();
  const options = await handler(req("/generate", "OPTIONS"));
  expect(options.status).toBe(204);
  expect(options.headers.get("Access-Control-Allow-Origin")).toBe(
    settings.origin,
  );
});
it("does not create a page for one-word input, and rate limits requests", async () => {
  const { db, query } = mockDB(null);
  const result = await createHandler(
    db,
    settings,
  )(req("/generate", "POST", { description: "fitness", language: "en" }));
  expect((await result.json()).input_quality).toBe("too_vague");
  expect(query.insert).not.toHaveBeenCalled();
  const denied = mockDB(null, { allowed: false, model_allowed: false });
  const limited = await createHandler(
    denied.db,
    settings,
  )(
    req("/generate", "POST", {
      description: "I teach cooking to beginners",
      language: "en",
    }),
  );
  expect(limited.status).toBe(429);
  expect(limited.headers.get("Retry-After")).toBe("3600");
});
it("rejects a draft/unknown public store and bounded oversized bodies gracefully", async () => {
  const { db } = mockDB(null);
  const missing = await createHandler(db, settings)(req(`/public/${slug}`));
  expect(missing.status).toBe(404);
  const oversized = await createHandler(
    db,
    settings,
  )(
    req("/generate", "POST", {
      description: "x".repeat(21000),
      language: "en",
    }),
  );
  expect(oversized.status).toBe(413);
});
it("makes atomic tracking RPC calls rather than reading and writing counters", async () => {
  const { db, rpc, from } = mockDB(null, true);
  const result = await createHandler(
    db,
    settings,
  )(req("/track", "POST", { slug, event: "view" }));
  expect(result.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("track_storefront", {
    p_slug: slug,
    p_event: "view",
  });
  expect(from).not.toHaveBeenCalled();
});

it.each(["/storefront", "/regenerate", "/publish"])(
  "rejects stale client revisions for %s before writes or model quota",
  async (path) => {
    const { db, query, rpc } = mockDB({
      id: "id",
      edit_token_hash: await hashToken(token),
      content,
      updated_at: "2026-11-21T10:01:00.000000+00:00",
    });
    const body = {
      slug,
      edit_token: token,
      expected_updated_at: revision,
      ...(path === "/storefront"
        ? { content }
        : path === "/regenerate"
          ? { scope: "bio", language: "en" }
          : {}),
    };
    const result = await createHandler(
      db,
      settings,
    )(req(path, path === "/storefront" ? "PATCH" : "POST", body));
    expect(result.status).toBe(409);
    expect(query.update).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  },
);
it("uses the submitted revision atomically and rejects an overlapping save", async () => {
  const { db, query } = mockDB(null);
  query.maybeSingle.mockResolvedValueOnce({
    data: {
      id: "id",
      edit_token_hash: await hashToken(token),
      content,
      updated_at: revision,
    },
    error: null,
  });
  const result = await createHandler(
    db,
    settings,
  )(
    req("/storefront", "PATCH", {
      slug,
      edit_token: token,
      expected_updated_at: revision,
      content,
    }),
  );
  expect(result.status).toBe(409);
  expect(query.eq).toHaveBeenCalledWith("updated_at", revision);
});
it("returns owner fields with one database read and removes private fields", async () => {
  const { db, from } = mockDB({
    slug,
    edit_token_hash: await hashToken(token),
    input_text: "private creator description",
    audience_size: "under_5k",
    content,
    updated_at: revision,
    views: 3,
  });
  const result = await createHandler(
    db,
    settings,
  )(req(`/owner/${slug}`, "GET", undefined, { "x-edit-token": token }));
  expect(result.status).toBe(200);
  const dto = await result.json();
  expect(dto.views).toBe(3);
  expect(dto.updated_at).toBe(revision);
  expect(dto).not.toHaveProperty("edit_token_hash");
  expect(dto).not.toHaveProperty("input_text");
  expect(dto).not.toHaveProperty("audience_size");
  expect(from).toHaveBeenCalledTimes(1);
});

it("refuses publication without reviewed offers", async () => {
  const { db, query } = mockDB({
    id: "id",
    edit_token_hash: await hashToken(token),
    content,
    updated_at: revision,
  });
  const result = await createHandler(
    db,
    settings,
  )(
    req("/publish", "POST", {
      slug,
      edit_token: token,
      expected_updated_at: revision,
    }),
  );
  expect(result.status).toBe(400);
  expect(query.update).not.toHaveBeenCalled();
});
it("publishes a reviewed snapshot, identifies first publication, and keeps unfinished ideas private", async () => {
  const ready = structuredClone(content);
  ready.products[0].ready_to_sell = true;
  const { db, query } = mockDB({ slug, content: ready, updated_at: revision });
  query.maybeSingle.mockResolvedValueOnce({
    data: {
      id: "id",
      edit_token_hash: await hashToken(token),
      content: ready,
      updated_at: revision,
      first_published_at: null,
      setup_session_id: "550e8400-e29b-41d4-a716-446655440000",
      setup_started_at: "2026-11-21T10:00:00Z",
      new_creator_session: true,
    },
    error: null,
  });
  const response = await createHandler(
    db,
    settings,
  )(
    req("/publish", "POST", {
      slug,
      edit_token: token,
      expected_updated_at: revision,
      current_setup_session_id: "550e8400-e29b-41d4-a716-446655440000",
    }),
  );
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.publication.first_publish).toBe(true);
  expect(data.publication.same_setup_session).toBe(true);
  const update = query.update.mock.calls[0][0];
  expect(update.published_content.products).toHaveLength(1);
});
it("serves the published snapshot rather than subsequent private edits", async () => {
  const snapshot = structuredClone(content);
  snapshot.products = [{ ...snapshot.products[0], ready_to_sell: true }];
  const privateDraft = structuredClone(content);
  privateDraft.products[0].title = "Private unfinished idea";
  const { db } = mockDB({
    slug,
    status: "published",
    published_content: snapshot,
    content: privateDraft,
  });
  const response = await createHandler(db, settings)(req(`/public/${slug}`));
  const data = await response.json();
  expect(data.content.products).toHaveLength(1);
  expect(JSON.stringify(data)).not.toContain("Private unfinished idea");
});
it("publishing an update does not count as first publication or replace its timestamp", async () => {
  const ready = structuredClone(content);
  ready.products[0].ready_to_sell = true;
  const first = "2026-11-21T10:03:00.000Z";
  const { db, query } = mockDB({ slug, content: ready, updated_at: revision });
  query.maybeSingle.mockResolvedValueOnce({
    data: {
      id: "id",
      edit_token_hash: await hashToken(token),
      content: ready,
      updated_at: revision,
      first_published_at: first,
    },
    error: null,
  });
  const response = await createHandler(
    db,
    settings,
  )(
    req("/publish", "POST", {
      slug,
      edit_token: token,
      expected_updated_at: revision,
    }),
  );
  expect(response.status).toBe(200);
  expect((await response.json()).publication.first_publish).toBe(false);
  expect(query.update.mock.calls[0][0].first_published_at).toBe(first);
});

it("returns provider quota failures without creating a generic storefront", async () => {
  const { db, query } = mockDB(null, { allowed: true, model_allowed: true });
  const fetcher = vi.fn().mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          error: { message: "Rate limit exceeded: free-models-per-day" },
        }),
        { status: 429 },
      ),
  );
  const handler = createHandler(db, {
    ...settings,
    model: {
      ...settings.model,
      key: "test-key",
      models: ["test:free"],
      fetcher,
    },
  });
  const result = await handler(
    req("/generate", "POST", {
      description: "I teach fitness workouts to beginners",
      language: "en",
    }),
  );
  expect(result.status).toBe(429);
  expect((await result.json()).error).toContain("daily free-request limit");
  expect(query.insert).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("does not expose legacy contact fields or support the removed contact endpoint", async () => {
  const { db } = mockDB({
    slug,
    status: "published",
    published_content: content,
    published_contact_link: "https://example.com/legacy",
  });
  const handler = createHandler(db, settings);
  const publicResult = await handler(req(`/public/${slug}`));
  expect(await publicResult.json()).not.toHaveProperty("contact_link");
  expect((await handler(req("/contact", "PATCH", {}))).status).toBe(404);
  expect(
    (await handler(req("/track", "POST", { slug, event: "buy_click" }))).status,
  ).toBe(400);
});
