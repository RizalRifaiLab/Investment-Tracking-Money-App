# Continue Nilai in Claude Code

## Setup (once)
1. Install Node.js 20+ and Git.
2. Install Claude Code: `npm install -g @anthropic-ai/claude-code` (or follow docs.anthropic.com/claude-code). Sign in with your Claude Pro/Max account.
3. Create accounts: GitHub, Supabase, Vercel, CoinGecko (demo key), Finnhub (free key), Anthropic Console (API key for the in-app AI).
4. Unzip this handoff into a new folder, e.g. `nilai/design_handoff_nilai/`.
5. In a terminal: `cd nilai && git init && claude`

## First prompt to paste
```
Read design_handoff_nilai/README.md and design_handoff_nilai/ARCHITECTURE.md, and open
design_handoff_nilai/prototype/Nilai App.dc.html (its <script data-dc-script> block holds
all formulas and AI prompts). Build Phase 1 from ARCHITECTURE.md:

- Next.js (App Router, TypeScript, Tailwind) web app in /apps/web, shared logic in /packages/core
- Supabase: SQL migrations for the data model with RLS on every table, email OTP + Google auth,
  6-digit PIN unlock (argon2 hash, 5-attempt lockout)
- Screens: Auth, Dashboard, Holdings (with class filters), Cash flow (multi-bank, salary auto/manual),
  Goals (projection), Settings — matching the prototype pixel-for-pixel using the README tokens
- IDR/USD and EN/ID toggles
- Supabase cron + edge function that caches CoinGecko and USD/IDR prices into the prices table

Start by writing a plan and a CLAUDE.md with conventions, then implement step by step,
running the app and tests after each step. Ask me for env keys when you need them.
```

## Next prompts (one phase at a time)
- "Phase 2: add US + IDX stock prices via <provider>, daily net-worth snapshots, the Markets screen, CSV/Excel statement import."
- "Phase 3: daily brief (Claude Haiku, batch, cached per user/day/lang/profile), advisor chat edge function with portfolio context and rate limits, PDF import via a Python worker on Fly.io."
- "Phase 4: Expo app in /apps/mobile reusing packages/core, biometrics unlock, push notifications."

## Tips
- Keep `CLAUDE.md` updated with decisions; Claude Code reads it every session.
- Commit after each working step; ask Claude Code to write tests for the money maths (formatters, ETA, FX).
- Never commit `.env` files; put keys in Supabase/Vercel secrets.
