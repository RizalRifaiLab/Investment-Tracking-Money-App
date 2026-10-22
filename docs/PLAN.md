# Nilai — plan & decisions

Source of truth for UX/copy: `prototype/Nilai App.dc.html` (template at the top, all logic, formulas,
EN/ID strings and AI prompts in the `<script data-dc-script>` block, lines ~348–863).
It is not packed/bundled — it opens with `npx serve prototype`.

## 1. What the prototype contains

### Screens
| Screen | Contents |
|---|---|
| Auth | Signup (name, email) → OTP (6 digits) → set PIN → confirm PIN. Returning: PIN unlock "Welcome back, {name}". 5 wrong PINs → back to OTP. "Forgot PIN" → OTP. Google button (fake). EN/ID toggle. |
| Shell | Top bar: wordmark, 7 tabs, IDR/USD toggle, EN/ID toggle, Lock. Breakpoint 1100px (narrow = scrolling tab row). |
| Dashboard | Hero net worth (long format) + today's change + "Rp X invested from each salary"; active goal % + bar + ETA; goals row (click = set active, + New goal); 12-month chart; allocation bar + legend (click = filter); Today's brief (3 items, AI or rule-based, Regenerate); holdings table with class filter chips. |
| Holdings | Total, "Prices updated HH:MM · USD/IDR", Refresh prices, + bank account, + holding; table adds Price + Source (Live · CoinGecko / Live · Finnhub / Manual). Bank accounts appear as "Cash" rows. |
| Cash flow | Total cash; bank cells (USD shows ≈ Rp); month switcher; in/out/net; spending-by-category bars; Salary cell (amount, payday, auto-invest %, mode, paid into, status, Log salary now, Edit); transactions list with delete; Import statement; + Log transaction. |
| Goals | Net worth / invested monthly / expected return; projection chart with goal lines + ETA markers; goal cells (%, ETA, to go, Set active, Edit). |
| Markets | Watchlist (holdings with a TradingView symbol + USD/IDR, IHSG, S&P 500); TradingView advanced chart for selected symbol. |
| Advisor | Brief + risk-profile segmented control; chat with quick prompts; TradingView news timeline. |
| Settings | Name/email, Lock, Change PIN, Log out; risk profile + description; language & currency; Finnhub key; salary summary; reset demo data. |

Modals: Holding (class chips, IDR/USD chips, fields vary by class; Deposito = bank, principal, rate, maturity), Bank account, Goal (live ETA estimate), Transaction (in/out, category, account), Salary, Import (account → file → PDF password → AI parse → review rows: include checkbox, tap-to-cycle category, salary detected banner, "set balance to closing balance" → Import N).

### Entities (prototype shape)
- **holding** `{cls, name, ticker, qty, price, ccy, chg, rate?, maturity?, cg?, fh?, tv?}` — classes: Crypto, IDX stocks, US stocks, ETF, Deposito, Reksa dana, Gold
- **bank** `{name, label, ccy IDR|USD, balance}`
- **txn** `{date, desc, amount (signed), cat, bank, src?}` — cats: Salary, Income, Food, Transport, Bills, Shopping, Transfer, Investment, Other
- **goal** `{name, target (IDR)}` + `activeGoal`
- **salary** `{amount, payday 1–31, pct 0–100, auto, bank}`
- **settings** `{cur, lang, profile Conservative|Balanced|Aggressive}`, brief cache, chat (last 30)

### Formulas
- Value (IDR) = qty × (live ?? manual price) × (USD ? USDIDR : 1). Net worth = Σ holdings + Σ bank balances (IDR-converted). USDIDR fallback 16 250.
- Today's change = Σ value × chg24h%. Deposito/Cash show "—".
- Monthly invest = salary × pct. ETA = months until `v = v·(1 + R/12) + invest` ≥ target, cap 720 months ("60+ yrs"). R: 6/9/12 %. Crypto cap: 10/20/35 %.
- Short format: `Rp 25 jt`, `Rp 1,2 M`, `$24.1k`, `$1.25M`; long: `Rp 392.320.000`, `$24,143`. Negative sign is U+2212 "−".
- Qty display: IDX in lots (÷100), US/ETF "sh", Gold "g", Reksa dana "unit", Crypto "{qty} {ticker}", Deposito "→ {maturity}".
- Manual transaction adjusts bank balance; delete reverses it. Auto-salary: on/after payday, if no Salary txn this month, add one to the chosen bank.

## 2. Decisions (approved 2026-10-22)
- Stack, data model and phases follow `ARCHITECTURE.md` (Next.js + Supabase, `packages/core`); the original prompt fills gaps.
- Goals + salary settings are in phase 1 (dashboard hero needs the active goal ETA).
- Mobile-first: narrow layout default, prototype wide layout at ≥1100px.
- Dropped from the prototype: per-user Finnhub key in Settings (server secret instead), "Reset to demo data".
- 12-month chart hidden until `networth_snapshots` has data; "today" change shows "—" for manual prices.
- Change PIN requires the current PIN. Forgot PIN = email OTP, then `set_pin` (allowed within 10 min of OTP sign-in).
- Auto-salary runs as a daily cron job (Asia/Jakarta), payday clamped to the month's last day.
- Deposito value = principal (no accrual). Reksa dana and gold: manual prices.
- Deleting a bank account with transactions is blocked (`on delete restrict`).
- PIN hash lives in its own `pins` table (no RLS policies) instead of `profiles.pin_hash`, so no client query can read it.
- No Docker on the dev machine → hosted Supabase project; migrations applied with `supabase db push`.

## 3. Phase 1 checklist (ARCHITECTURE.md §5.1)
- [x] Monorepo: `apps/web` (Next.js 16, Tailwind v4 tokens, Archivo), `packages/core` (formatters, projection, constants + tests)
- [x] `supabase/migrations/…_init.sql`: full data model, RLS, PIN RPCs, valuation views (not yet applied — needs project)
- [ ] Supabase project linked, migration pushed, auth email OTP enabled (code, not magic link)
- [ ] Auth screens: signup → OTP → set/confirm PIN; PIN unlock; forgot PIN; auto-lock
- [ ] Shell: tabs, IDR/USD, EN/ID, Lock
- [ ] Dashboard, Holdings (+ bank accounts), Goals, Cash flow (accounts + salary), Settings
- [ ] Modals: holding, bank, goal, salary, transaction
- [ ] Edge function + pg_cron: CoinGecko (5 min) and USD/IDR (hourly) into `prices` / `fx_rates`
- [ ] Salary auto-post cron
- [ ] Google sign-in, PWA manifest
