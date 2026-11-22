import { apiBaseUrl } from "../shared/api-url.ts";
/** Real integration checks. Never substitutes fixtures for live generation. */
import assert from "node:assert/strict";
const root = apiBaseUrl(process.env);
if (!root)
  throw new Error(
    "Set VITE_API_URL or VITE_CONVEX_URL. Run with: node --env-file=.env.development.local scripts/live-check.mjs",
  );
async function call(path, body, options = {}) {
  const response = await fetch(`${root}${path}`, {
    method: options.method || (body ? "POST" : "GET"),
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  return { status: response.status, result };
}
for (const [description, quality] of [
  ["asdfghjkl qwerty", "unusable"],
  ["@creator", "too_vague"],
  ["I make content", "too_vague"],
]) {
  const { result } = await call("/generate", { description, language: "en" });
  assert.equal(result.input_quality, quality);
  assert.equal(result.slug, undefined);
}
const topicOnly = await call("/generate", {
  description: "fitness",
  language: "en",
});
assert.equal(topicOnly.status, 200, JSON.stringify(topicOnly.result));
assert.equal(topicOnly.result.input_quality, "ok");
assert.ok(topicOnly.result.slug && topicOnly.result.edit_token);
assert.ok(Array.isArray(topicOnly.result.assumptions));
const descriptions = [
  "I teach home fitness workouts for busy women.",
  "I teach personal finance budgeting for college students without investment recommendations.",
  "I share affordable vegetarian cooking recipes for students.",
  "I help UPSC aspirants with exam preparation and current affairs revision.",
  "I share astrology journaling prompts for personal reflection, not predictions.",
];
let last;
for (const language of ["en", "hinglish"])
  for (const description of descriptions) {
    const { status, result } = await call("/generate", {
      description,
      language,
    });
    assert.equal(status, 200, JSON.stringify(result));
    assert.equal(result.input_quality, "ok");
    assert.equal(result.content.language, language);
    assert.ok(result.slug && result.edit_token);
    if (process.env.EXPECT_SOURCE)
      assert.equal(result.content.source, process.env.EXPECT_SOURCE);
    if (language === "hinglish")
      assert.doesNotMatch(JSON.stringify(result.content), /[\u0900-\u097f]/);
    console.log(
      `${language} · ${result.content.niche} · ${result.content.source}`,
    );
    last = result;
  }
const { slug, edit_token, content } = last;
assert.equal((await call(`/public/${slug}`)).status, 404);
const wrong = "b".repeat(64);
assert.equal(
  (
    await call(`/owner/${slug}`, undefined, {
      headers: { "x-edit-token": wrong },
    })
  ).status,
  403,
);
const initialOwner = (
  await call(`/owner/${slug}`, undefined, {
    headers: { "x-edit-token": edit_token },
  })
).result;
assert.equal(
  (
    await call(
      "/storefront",
      {
        slug,
        edit_token: wrong,
        expected_updated_at: initialOwner.updated_at,
        content,
      },
      { method: "PATCH" },
    )
  ).status,
  403,
);
content.products[0].ready_to_sell = true;
const reviewed = await call(
  "/storefront",
  {
    slug,
    edit_token,
    expected_updated_at: initialOwner.updated_at,
    content,
  },
  { method: "PATCH" },
);
assert.equal(reviewed.status, 200);
assert.equal(
  (
    await call("/publish", {
      slug,
      edit_token,
      expected_updated_at: reviewed.result.updated_at,
    })
  ).status,
  200,
);
const publicResult = await call(`/public/${slug}`);
assert.equal(publicResult.status, 200);
assert.equal(publicResult.result.edit_token_hash, undefined);
const before = (
  await call(`/owner/${slug}`, undefined, {
    headers: { "x-edit-token": edit_token },
  })
).result;
await Promise.all(
  Array.from({ length: 5 }, () => call("/track", { slug, event: "view" })),
);
const after = (
  await call(`/owner/${slug}`, undefined, {
    headers: { "x-edit-token": edit_token },
  })
).result;
assert.ok(after.views >= before.views + 5);
assert.equal(
  after.updated_at,
  before.updated_at,
  "Counter updates must not invalidate content revisions",
);
const saved = await call(
  "/storefront",
  {
    slug,
    edit_token,
    expected_updated_at: after.updated_at,
    content,
  },
  { method: "PATCH" },
);
assert.equal(saved.status, 200);
const stale = await call(
  "/storefront",
  {
    slug,
    edit_token,
    expected_updated_at: after.updated_at,
    content,
  },
  { method: "PATCH" },
);
assert.equal(stale.status, 409, "A stale tab must not overwrite a newer save");
console.log(
  "Live API checks passed. Created ten test stores (one published); keep private edit links out of logs.",
);
