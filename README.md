# Tumbuh

_Formerly "Nilai". Repo, Vercel project and Supabase project keep the old name._

**Every rupiah, counted toward the goal you set.**

Nilai is a personal net-worth and investing tracker for Indonesian investors — IDR-first and bilingual (English / Bahasa Indonesia). It brings crypto, IDX and US stocks, ETFs, deposito, reksa dana, gold and bank accounts into one net worth, and shows when you will reach your goals.

Live: https://nilai-pied.vercel.app

## Features (planned)
- Email OTP sign-in, then a 6-digit PIN to unlock the app every day
- Dashboard: net worth, today's change, allocation, active goal with ETA
- Holdings across asset classes, with live prices (CoinGecko, Finnhub) and USD/IDR rate
- Cash flow: bank accounts, transactions, salary with auto-invest, bank-statement import (PDF/XLSX/CSV)
- Goals with projections based on your risk profile
- AI advisor and daily brief (Claude), markets watchlist with TradingView charts

See [`docs/PLAN.md`](docs/PLAN.md) for progress and [`ARCHITECTURE.md`](ARCHITECTURE.md) for the design of the system.

## Stack
- **Web:** Next.js 16 (App Router, TypeScript), Tailwind CSS v4 — `apps/web`
- **Shared logic:** formatters and projection maths — `packages/core`
- **Backend:** Supabase (Postgres with Row Level Security, Auth, Edge Functions, pg_cron) — `supabase/`
- **Hosting:** Vercel

## Getting started
Requires Node.js 20+ and the [Vercel CLI](https://vercel.com/docs/cli).

```bash
npm install
vercel link              # once, pick the "nilai" project
vercel env pull apps/web/.env.local
npm run dev              # http://localhost:3000
```

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Unit tests for `packages/core` |
| `npm run build` | Production build of the web app |
| `npm run lint` | ESLint |

Database migrations live in `supabase/migrations/` and are applied with `npx supabase db push --db-url "$POSTGRES_URL_NON_POOLING"`.

## Repository layout
```
apps/web/          Next.js app
packages/core/     Shared TS: money formatting, goal projection, constants
supabase/          Migrations and config
prototype/         Approved HTML prototype (UX and copy reference)
docs/              Design spec (DESIGN.md) and build plan (PLAN.md)
```

## Design
The approved prototype is in `prototype/Nilai App.dc.html` (serve it with `npx serve prototype`). Tokens and screen specs are in [`docs/DESIGN.md`](docs/DESIGN.md).
