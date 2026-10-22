# Nilai

Personal net-worth and investing tracker for Indonesian users. IDR-first, bilingual EN/ID.
- Architecture, data model, phases: `ARCHITECTURE.md`. Progress and decisions: `docs/PLAN.md`.
- UX/copy source of truth: `prototype/Nilai App.dc.html` — formulas, EN/ID strings and AI prompts live in its
  `<script data-dc-script>` block. Design spec + tokens: `docs/DESIGN.md` (already in `apps/web/app/globals.css`).

## Layout
- `apps/web` — Next.js 16 (App Router, TS, Tailwind v4). Read `apps/web/AGENTS.md`: check `node_modules/next/dist/docs/` before using Next APIs.
- `packages/core` — pure TS shared with the future Expo app: formatters, projection maths, constants. Unit-tested with Vitest.
- `supabase/` — SQL migrations (RLS on every table), edge functions, `config.toml`. Hosted project `exjglglsmrrtmwgbaeiu` (ap-southeast-1), provisioned via the Vercel Supabase integration; no Docker on this machine.

## Commands (repo root)
- `npm install` · `npm run dev` · `npm run build` · `npm run lint` · `npm test` (core tests)
- `vercel env pull apps/web/.env.local` — Supabase + Vercel env vars (never commit)
- Apply migrations (bash): `set -a; . apps/web/.env.local; set +a; npx supabase db push --db-url "$POSTGRES_URL_NON_POOLING"`
- Deploy: push to `main` (GitHub → Vercel), or `vercel deploy` (preview) / `vercel deploy --prod`

## Money rules
- Postgres stores money, quantity, price and rate as `NUMERIC`, in the original currency. Never store converted values (snapshots excepted).
- Conversion to IDR happens in SQL views (`holding_values`, `account_values`) using `fx_rates`. Sums for net worth come from those views.
- TS numbers are for display and projections only; formatting goes through `@nilai/core` (`formatShort`, `formatLong`). Never write a client-side computed amount back to the DB.
- Display formats match the prototype: `Rp 25 jt`, `Rp 1,2 M`, `$24.1k`, `Rp 392.320.000`, minus sign `−` (U+2212).

## Conventions
- Every user table has `user_id default auth.uid()` + RLS policy `user_id = auth.uid()`. New table → add RLS in the same migration.
- Schema changes only via new files in `supabase/migrations/`; never edit an applied migration.
- PIN: only via `set_pin` / `verify_pin` / `change_pin` / `has_pin` RPCs; `pins` table has no policies.
- Claude API and market-data APIs only from edge functions / server code. Keys in Supabase secrets or `.env.local`, never `NEXT_PUBLIC_`.
- UI copy: add both `en` and `id` strings, reuse prototype wording. Errors inline in accent-700, 14px/600. No border radius; 2px ink rules.
- Mobile-first: narrow layout is the default; `≥1100px` gets the prototype's wide layout.
- Small commits, one working step each; run `npm test` and `npm run build` before committing.
