import assert from "node:assert/strict";
const root = process.env.PAGES_TEST_URL || "http://127.0.0.1:8789";
const index = await fetch(`${root}/`);
assert.equal(index.status, 200);
const html = await index.text();
for (const route of [
  "/setup/about",
  "/setup/offers",
  "/s/test-store",
  "/edit/test-store",
  "/published/test-store",
  "/unknown-page",
]) {
  const response = await fetch(`${root}${route}`);
  assert.equal(response.status, 200, route);
  assert.equal(await response.text(), html, `SPA route ${route}`);
}
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(
  (match) => match[1],
);
assert.ok(assets.length >= 2);
for (const asset of assets) {
  const response = await fetch(`${root}${asset}`);
  assert.equal(response.status, 200, asset);
  assert.match(
    response.headers.get("content-type"),
    asset.endsWith(".css") ? /text\/css/ : /javascript/,
  );
  assert.notEqual(
    await response.text(),
    html,
    `Asset must not be rewritten: ${asset}`,
  );
}
assert.equal(index.headers.get("x-content-type-options"), "nosniff");
assert.equal(index.headers.get("x-frame-options"), "DENY");
assert.equal(index.headers.get("referrer-policy"), "no-referrer");
assert.match(
  index.headers.get("content-security-policy"),
  /frame-ancestors 'none'/,
);
console.log(
  "Cloudflare Pages checks passed: SPA deep links, JS/CSS assets, and security headers.",
);
