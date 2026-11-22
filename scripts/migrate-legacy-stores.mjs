import { isDeepStrictEqual } from "node:util";
/** Admin-only legacy data migration. Preserves links/revisions; never changes source data. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contentSchema, publicContentSchema } from "../shared/domain.ts";
const deployment = process.env.CONVEX_MIGRATION_DEPLOYMENT;
if (!deployment || !/^[a-z0-9-]+$/.test(deployment))
  throw new Error(
    "Set CONVEX_MIGRATION_DEPLOYMENT to the explicit target deployment.",
  );
const cli = join(process.cwd(), "node_modules/convex/bin/main.js");
const run = (args) =>
  execFileSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
const existing = JSON.parse(
  run([
    "run",
    "--deployment",
    deployment,
    "--inline-query",
    'const rows = await ctx.db.query("storefronts").collect(); return rows.map(r=>r.slug);',
  ]),
);
const source = JSON.parse(
  execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_ai-storefront-generator",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-X",
      "-A",
      "-t",
      "-c",
      "SELECT coalesce(json_agg(s),'[]'::json) FROM public.storefronts s;",
    ],
    {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  ),
);
const fields = [
  "slug",
  "edit_token_hash",
  "status",
  "niche",
  "language",
  "input_text",
  "audience_size",
  "instagram_handle",
  "offer_status",
  "existing_offer",
  "content",
  "published_content",
  "views",
  "updated_at",
  "published_at",
  "first_published_at",
  "setup_session_id",
  "setup_started_at",
  "new_creator_session",
];
const rows = source
  .filter((row) => !existing.includes(row.slug))
  .map((row) => {
    const item = Object.fromEntries(
      fields.map((key) => [key, row[key] ?? null]),
    );
    item.content = contentSchema.parse(row.content);
    item.published_content = row.published_content
      ? publicContentSchema.parse(row.published_content)
      : null;
    item.views = row.views ?? 0;
    item.new_creator_session = row.new_creator_session === true;
    return item;
  });
if (!rows.length) {
  console.log(`All ${source.length} source stores already exist in Convex.`);
  process.exit(0);
}
const temp = mkdtempSync(join(tmpdir(), "storefront-migration-"));
try {
  const file = join(temp, "stores.json");
  writeFileSync(file, JSON.stringify(rows), { mode: 0o600 });
  run([
    "import",
    "--deployment",
    deployment,
    "--table",
    "storefronts",
    "--append",
    file,
  ]);
  const verification = JSON.parse(
    run([
      "run",
      "--deployment",
      deployment,
      "--inline-query",
      'const rows = await ctx.db.query("storefronts").collect(); return rows.map(({slug,edit_token_hash,updated_at,published_content})=>({slug,edit_token_hash,updated_at,published_content}));',
    ]),
  );
  for (const row of rows) {
    const imported = verification.find((item) => item.slug === row.slug);
    if (
      !imported ||
      imported.edit_token_hash !== row.edit_token_hash ||
      imported.updated_at !== row.updated_at ||
      !isDeepStrictEqual(imported.published_content, row.published_content)
    )
      throw new Error("Verification failed. Source records remain intact.");
  }
  console.log(
    `Verified ${rows.length} migrated stores; skipped ${source.length - rows.length} existing records. Source database untouched.`,
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
