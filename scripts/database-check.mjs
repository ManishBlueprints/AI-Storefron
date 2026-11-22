/** Integration checks against this project's actual Docker Postgres.
 * Every test mutation is inside one transaction that is rolled back. */
import { execFileSync } from "node:child_process";
const container =
  process.env.SUPABASE_DB_CONTAINER || "supabase_db_ai-storefront-generator";
const sql = `
BEGIN;
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('storefronts','rate_limits') AND c.relrowsecurity) <> 2
    THEN RAISE EXCEPTION 'Both app tables must exist with RLS enabled'; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN ('storefronts','rate_limits'))
    THEN RAISE EXCEPTION 'App tables must have no public policies'; END IF;
  IF has_table_privilege('anon','public.storefronts','select') OR
     has_function_privilege('anon','public.claim_generation(text,integer,integer)','execute') OR
     has_function_privilege('authenticated','public.track_storefront(text,text)','execute')
    THEN RAISE EXCEPTION 'Public roles must not access app tables or privileged RPCs'; END IF;
END $$;
-- Isolate the daily quota check from existing usage; ROLLBACK restores it.
DELETE FROM public.rate_limits WHERE key='global:daily' OR key LIKE 'integration-check:%';
DO $$
DECLARE result jsonb;
BEGIN
  result := public.claim_generation('integration-check:one',2,1);
  IF result <> '{"allowed":true,"model_allowed":true}'::jsonb THEN RAISE EXCEPTION 'First request should use model'; END IF;
  result := public.claim_generation('integration-check:two',2,1);
  IF result <> '{"allowed":true,"model_allowed":false}'::jsonb THEN RAISE EXCEPTION 'Daily cap should select template'; END IF;
  PERFORM public.claim_generation('integration-check:one',2,1);
  result := public.claim_generation('integration-check:one',2,1);
  IF result <> '{"allowed":false,"model_allowed":false}'::jsonb THEN RAISE EXCEPTION 'Hourly cap should reject request'; END IF;
END $$;
DO $$
DECLARE draft text := 'integration-draft-' || gen_random_uuid();
        published text := 'integration-public-' || gen_random_uuid();
        v integer;
BEGIN
  INSERT INTO public.storefronts(slug,edit_token_hash,niche,language,input_text,content,status)
    VALUES (draft,repeat('a',64),'other','en','integration test','{}','draft'),
           (published,repeat('a',64),'other','en','integration test','{}','published');
  PERFORM public.track_storefront(draft,'view');
  PERFORM public.track_storefront(published,'view');
  PERFORM public.track_storefront(published,'unknown');
  PERFORM public.track_storefront('integration-missing-' || gen_random_uuid(),'view');
  SELECT views INTO v FROM public.storefronts WHERE slug=draft;
  IF v <> 0 THEN RAISE EXCEPTION 'Draft counters must stay zero'; END IF;
  SELECT views INTO v FROM public.storefronts WHERE slug=published;
  IF v <> 1 THEN RAISE EXCEPTION 'Published counters should increment only for known events'; END IF;
END $$;
-- Counter writes must leave the content revision untouched.
DO $$
DECLARE s text := 'integration-revision-' || gen_random_uuid();
        previous_revision timestamptz; current_revision timestamptz;
BEGIN
  INSERT INTO public.storefronts(slug,edit_token_hash,niche,language,input_text,content,status)
    VALUES (s,repeat('a',64),'other','en','integration test','{}','published')
    RETURNING updated_at INTO previous_revision;
  PERFORM public.track_storefront(s,'view');
  SELECT updated_at INTO current_revision FROM public.storefronts WHERE slug=s;
  IF previous_revision <> current_revision THEN RAISE EXCEPTION 'Tracking changed content revision'; END IF;
  UPDATE public.storefronts SET content='{"edited":true}' WHERE slug=s;
  SELECT updated_at INTO current_revision FROM public.storefronts WHERE slug=s;
  IF previous_revision = current_revision THEN RAISE EXCEPTION 'Content edit must advance revision'; END IF;
  UPDATE public.storefronts SET content='{"stale":true}' WHERE slug=s AND updated_at=previous_revision;
  IF FOUND THEN RAISE EXCEPTION 'Stale revision must not update content'; END IF;
END $$;
-- Quota maintenance must work without a model-eligible generation.
DELETE FROM public.rate_limits WHERE window_start < now() - interval '2 days';
INSERT INTO public.rate_limits(key,window_start,count)
  SELECT 'integration-check:expired:' || i, now() - interval '3 days', 1 FROM generate_series(1,600) i;
SELECT public.claim_tracking('integration-check:tracking-cleanup');
DO $$
BEGIN
  IF (SELECT count(*) FROM public.rate_limits WHERE key LIKE 'integration-check:expired:%') <> 100
    THEN RAISE EXCEPTION 'Tracking cleanup must delete a bounded batch of 500 expired rows'; END IF;
END $$;
SELECT public.claim_generation('integration-check:capped-cleanup',30,0);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.rate_limits WHERE key LIKE 'integration-check:expired:%')
    THEN RAISE EXCEPTION 'Template-only generation must still clean expired quotas'; END IF;
  IF has_function_privilege('anon','public.cleanup_rate_limits()','execute')
    THEN RAISE EXCEPTION 'Cleanup must stay private'; END IF;
END $$;
ROLLBACK;
`;
try {
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, stdio: ["pipe", "pipe", "pipe"], timeout: 30000 },
  );
  console.log(
    "Real Docker Postgres checks passed: RLS, privileges, quotas, expiry, counters, and content revisions. Test writes rolled back.",
  );
} catch (error) {
  console.error(
    "Database checks require this app’s running Docker Supabase stack with its migration applied. Start it with npx supabase start.",
  );
  if (error.stderr) console.error(error.stderr.toString().trim());
  process.exitCode = 1;
}
