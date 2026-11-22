/** Real local/hosted Supabase integration check. Creates one test storefront. */
import assert from "node:assert/strict";
const base =
  process.env.VITE_API_URL ||
  (process.env.VITE_SUPABASE_URL
    ? `${process.env.VITE_SUPABASE_URL}/functions/v1/api`
    : "");
if (!base) throw new Error("Set VITE_API_URL or VITE_SUPABASE_URL first.");
async function call(path, body, method) {
  const response = await fetch(`${base}${path}`, {
    method: method || (body ? "POST" : "GET"),
    signal: AbortSignal.timeout(26000),
    headers: body ? { "content-type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}
const session = crypto.randomUUID();
const started = new Date(Date.now() - 120000).toISOString();
const generated = await call("/generate", {
  description: "I teach affordable vegetarian cooking for college students.",
  language: "en",
  offer_status: "existing",
  existing_offer:
    "A live 30-minute meal-planning session with a personal shopping list.",
  setup_session_id: session,
  setup_started_at: started,
  new_creator_session: true,
});
assert.equal(generated.status, 200);
assert.equal(generated.data.input_quality, "ok");
const { slug, edit_token, content } = generated.data;
assert.ok(content.products.every((product) => product.ready_to_sell === false));
async function owner() {
  const response = await fetch(`${base}/owner/${slug}`, {
    headers: { "x-edit-token": edit_token },
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200);
  return response.json();
}
const initial = await owner();
assert.equal(
  (
    await call("/publish", {
      slug,
      edit_token,
      expected_updated_at: initial.updated_at,
      current_setup_session_id: session,
    })
  ).status,
  400,
);
assert.equal((await call(`/public/${slug}`)).status, 404);
content.products[0].ready_to_sell = true;
let saved = await call(
  "/storefront",
  {
    slug,
    edit_token,
    expected_updated_at: initial.updated_at,
    content,
  },
  "PATCH",
);
assert.equal(saved.status, 200);
const first = await call("/publish", {
  slug,
  edit_token,
  expected_updated_at: saved.data.updated_at,
  current_setup_session_id: session,
});
assert.equal(first.status, 200);
assert.equal(first.data.publication.first_publish, true);
assert.equal(first.data.publication.same_setup_session, true);
assert.equal(first.data.publication.setup_session_id, session);
assert.ok(first.data.publication.time_to_first_publish_ms >= 120000);
const live = await call(`/public/${slug}`);
assert.equal(live.status, 200);
assert.equal(live.data.content.products.length, 1);
const liveTitle = live.data.content.products[0].title;
const unpublished = structuredClone(content);
unpublished.products[0].title = "Private revision awaiting review";
unpublished.products[0].ready_to_sell = false;
saved = await call(
  "/storefront",
  {
    slug,
    edit_token,
    expected_updated_at: first.data.updated_at,
    content: unpublished,
  },
  "PATCH",
);
assert.equal(saved.status, 200);
assert.equal(
  (await call(`/public/${slug}`)).data.content.products[0].title,
  liveTitle,
);
assert.equal(
  (
    await call("/publish", {
      slug,
      edit_token,
      expected_updated_at: saved.data.updated_at,
      current_setup_session_id: session,
    })
  ).status,
  400,
);
unpublished.products[0].ready_to_sell = true;
saved = await call(
  "/storefront",
  {
    slug,
    edit_token,
    expected_updated_at: saved.data.updated_at,
    content: unpublished,
  },
  "PATCH",
);
assert.equal(saved.status, 200);
const update = await call("/publish", {
  slug,
  edit_token,
  expected_updated_at: saved.data.updated_at,
  current_setup_session_id: session,
});
assert.equal(update.status, 200);
assert.equal(update.data.publication.first_publish, false);
assert.equal(update.data.first_published_at, first.data.first_published_at);
assert.equal(
  update.data.publication.time_to_first_publish_ms,
  first.data.publication.time_to_first_publish_ms,
);
assert.equal(
  (await call(`/public/${slug}`)).data.content.products[0].title,
  "Private revision awaiting review",
);
console.log(
  `Activation integration checks passed (${generated.data.content.source}): readiness, private drafts, published snapshots, first-publish timing, and update exclusion. No edit tokens logged.`,
);
