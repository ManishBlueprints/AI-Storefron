# AI Storefront Generator

A mobile-first take-home for SuperProfile: turn a creator description into an AI-written bio and 2–4 offers with INR prices, edit or regenerate the draft, then publish a shareable storefront.

**Stack:** React, TypeScript, Vite and Tailwind; Cloudflare Pages; Supabase Edge Functions and real Postgres; Kilo AI Gateway. No login, profile scraping, checkout, or contact collection.

## Run locally

Requires Node 22.18+ (Node 24 recommended), npm, Docker, and the Supabase CLI.

```sh
npm ci
cp .env.example .env.development.local
cp supabase/functions/.env.example supabase/functions/.env
openssl rand -hex 32
```

Put the generated value in `RATE_LIMIT_SALT` in `supabase/functions/.env`. Configure `KILO_API_KEY` there if using an authenticated Kilo account. Anonymous free access is supported but can hit shared upstream limits. Check that the configured free model is available to your account.

```sh
npx supabase start
npx supabase functions serve api --env-file supabase/functions/.env
```

In another terminal:

```sh
npm run dev
```

Open **http://127.0.0.1:5173**. Use this exact origin; the API intentionally restricts CORS. The database uses port **55322**, the API **55321**, and Supabase Studio **55323**, isolated from other local Supabase projects. `supabase start` applies the migrations on a fresh stack. Run `npx supabase migration up --local` when applying later migrations to an existing stack. No in-memory database is used.

## Product flow

Home → About you → Your offers → Generate → Review offers → Preview → Publish → Share

- Audience, language, and optional Instagram context stay visible during setup. Instagram is context only; profiles are not read.
- Back and refresh preserve answers. Starting a new store requires confirmation; existing stores remain accessible.
- Generation uses a centered progress dialog. Errors preserve input and offer retry.
- Creators can edit bio and offer fields, regenerate the whole store or one part, and restore recent versions.
- Each offer must be reviewed and selected before publication. Private edits stay private until republished.
- A public URL shows the bio and selected offers. A separate private edit link grants owner access; save it safely because there is no account recovery.

## Configuration

Browser values belong in `.env.development.local` or Cloudflare build settings. Server values belong in the ignored `supabase/functions/.env` or hosted Supabase secrets.

| Variable                                                 | Location | Purpose                                                                  |
| -------------------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| `VITE_API_URL`                                           | Browser  | Full API URL override; used for local development.                       |
| `VITE_SUPABASE_URL`                                      | Browser  | Hosted project URL; derives `/functions/v1/api` when no override is set. |
| `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`                  | Browser  | Optional analytics. Blank key disables delivery.                         |
| `APP_ORIGIN`                                             | Server   | Exact allowed frontend origin, without a trailing slash.                 |
| `RATE_LIMIT_SALT`                                        | Server   | Random secret for hashing rate-limit IP keys.                            |
| `AI_PROVIDER`                                            | Server   | `kilo` for this submission.                                              |
| `KILO_API_KEY`                                           | Server   | Optional Kilo token; never use an OpenRouter credential.                 |
| `KILO_MODELS`                                            | Server   | Ordered free model IDs, attempted within the request deadline.           |
| `KILO_JSON_MODELS`                                       | Server   | Models that support the strict JSON response schema.                     |
| `KILO_DISABLE_REASONING`, `KILO_MAX_TOKENS`              | Server   | Defaults: `true`, `3000`.                                                |
| `IP_GENERATIONS_PER_HOUR`, `GLOBAL_DAILY_GENERATION_CAP` | Server   | Defaults: `10`, `100`; shared generation/regeneration budgets.           |

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the Edge Function. Never place privileged keys in `VITE_` variables. Rebuild the frontend after changing browser configuration.

## Checks

```sh
npm run check          # formatting, TypeScript, unit tests, Edge checks, build
npm run test:database  # requires the real Docker Supabase database
```

The database check rolls back its test writes. Unit tests use provider fixtures; the running app uses real model calls. Optional integration scripts create real stores and consume provider quota; run them against a disposable test environment:

```sh
node --env-file=.env.development.local scripts/activation-check.mjs
EXPECT_SOURCE=ai node --env-file=.env.development.local scripts/live-check.mjs
```

The live checker creates ten stores, publishes one, and requires a test-only generation allowance above the default hourly quota. The activation checker creates one store. Neither prints edit tokens. Do not point these checks at a production submission containing real creator data.

For Cloudflare routing and headers, run these in separate terminals after building:

```sh
npx wrangler pages dev dist --port 8789
npm run test:pages
```

## Deploy

1. Create a Supabase project and Cloudflare Pages project.
2. Link Supabase and deploy the database and API:

   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   # Set APP_ORIGIN to your final Pages domain in a separate server secrets file.
   npx supabase secrets set --env-file supabase/functions/.env
   npx supabase functions deploy api --no-verify-jwt
   ```

3. Set production browser configuration to the hosted `VITE_SUPABASE_URL`. Remove any local `VITE_API_URL` override. For direct upload, use an ignored `.env.production.local`.
4. For Git-connected Pages, use build command `npm run build:production`, output `dist`, and Node 24. For direct upload, update the project name in `wrangler.toml`, create that Pages project, and run `npm run deploy` after `npx wrangler login`.
5. Verify generation, editing, regeneration, publishing, and direct public-link access from the final origin on a phone. Keep the deployment running for at least two weeks after submission.

The production build guard rejects missing or local API endpoints. Pages uses its native SPA fallback for setup, editor, published, and public routes; do not add a top-level `404.html`. `public/_headers` supplies security headers. Hosted deployment and live analytics delivery still require configuration and verification.

## Implementation notes

The Edge Function owns model calls and database access. Zod validates structured output, price bands, and distinct offer formats. Generated prose must use Roman script and complete sentence endings; prompting asks for concise, professional everyday language. Invalid model output receives a corrective retry within an 18.5-second total budget. Kilo errors and exhausted quotas return explicit errors rather than generic replacement cards. This is a heuristic quality check, not a guarantee of semantic accuracy; creator review remains essential.

Owner operations use 256-bit edit tokens; only hashes are stored in Postgres. RLS denies public table access. Optimistic locking prevents stale saves from overwriting newer content. Public reads return only the published snapshot. View counts do not change content revisions. Optional PostHog excludes creator copy, handles, private URLs, and tokens.

The existing OpenRouter adapter and template fixtures remain tested for compatibility; Kilo is the configured submission path. Historical migrations retain legacy columns to preserve existing databases; the app does not expose contact or purchase features.

## Submission material

- [Decision brief](docs/decision-brief.pdf) — three pages covering the flow, alternatives, trade-offs, AI, metrics, launch, and next steps.
- [Submission checklist and walkthrough outline](docs/submission-checklist.md).

**Still to supply:** hosted app URL, shared repository URL, and the recorded 5–10 minute Loom walkthrough. These are not claimed as completed.

Brand assets follow SuperProfile for this take-home. Hind Madurai and Instrument Serif are self-hosted, with their OFL licenses in `public/fonts`. Built with Codex assistance for implementation, debugging, tests, and documentation; product choices were reviewed and iterated with the creator of this submission.
