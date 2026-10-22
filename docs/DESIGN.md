# Handoff: Nilai — personal investment & goal tracker

## Overview
Nilai tracks one person's total money (investments + bank cash) against user-defined goals (e.g. Rp 1 Miliar), in IDR or USD. It covers crypto, IDX stocks, US stocks, ETFs, deposito, reksa dana, gold and multiple bank accounts. Salary is added to net worth automatically on payday or manually; bank statements (PDF/Excel/CSV) can be imported and categorised by AI. An AI advisor gives a daily brief and answers questions using the user's portfolio and risk profile. Login is email/Google once, then a 6-digit PIN (biometrics on mobile).

See `../ARCHITECTURE.md` for the recommended stack, data model, build phases and budget.

## About the design files
`../prototype/Nilai App.dc.html` is a **design reference built in HTML** — a working prototype that shows intended look and behaviour. It is not production code. Recreate it in the target stack (recommended: Next.js + Supabase, then Expo for mobile — see ARCHITECTURE.md). Open it in a browser via a local server (`npx serve prototype`) to click through. Prototype-only shortcuts to replace: data in localStorage, fake OTP (any 6 digits), PIN stored in plain text, AI and price calls made from the browser.

## Fidelity
**High-fidelity.** Colours, type, spacing, rules and interactions are final. Recreate pixel-accurately using the tokens below.

## Screens

Global shell
- Desktop (≥1100px): sticky 60px top bar, 2px bottom rule. Left: wordmark "Nilai" (Archivo 800, 22px, −0.02em). Tabs: Dashboard, Holdings, Cash flow, Goals, Markets, Advisor, Settings (14px; active = 800 weight + 2px accent underline). Right: IDR/USD segmented control, EN/ID segmented control, "Lock" outlined button.
- Narrow (<1100px): header row (wordmark + toggles + Lock) and a horizontally scrolling tab row beneath, 3px active underline. All tap targets ≥44px.
- Grids use 2px ink rules between cells (no gaps, no cards, no radius).

1. Auth (signup → OTP → set PIN → confirm PIN; returning users: PIN unlock)
   - Two columns (1.1fr / 1fr); stacked on narrow. Left: accent-red panel, wordmark, statement "Every rupiah, counted toward the goal you set." (64px / 36px narrow, 800, line-height 1.02). Right: EN/ID toggle, form (max 540px).
   - Inputs: 48px min height, 2px ink border, no radius. Primary button full-width, flush-left label.
   - PIN: six 22px squares (filled = ink), 3×4 keypad (64px keys, 2px ink grid, flush-left digits, ⌫). Keyboard digits/backspace work. 5 wrong attempts → back to email verification. "Forgot PIN? Verify with email".
2. Dashboard
   - Hero row (2fr/1fr): net worth (84px/44px, 800, full number e.g. "Rp 392.320.000"), "+Rp 1,2 jt (+0.3%) today · Rp 6 jt invested from each salary". Right: active goal % (64px), progress bar 12px (accent on neutral-300), ETA.
   - Goals row: auto-fit cells ≥220px; click = set active; active cell tinted accent-100. "+ New goal" cell.
   - Row (2fr/1fr): 12-month net-worth area chart (accent line 2.5px, accent-100 fill) + allocation stacked bar (28px, 2px gaps) with legend (click → filter). Right: Today's brief (3 items: kicker label, 17px/800 title, 14px body), "Ask the advisor →", "Regenerate".
   - Holdings table with filter chips (All, Crypto, IDX stocks, US stocks, ETF, Cash, Deposito, Reksa dana, Gold; count per chip), filtered total + share of net worth. Columns: Instrument, Class, Quantity, Value, Today, Weight. Row click opens edit.
3. Holdings — total, live-price timestamp, Refresh prices, + Add bank account, + Add holding; same filters; adds Price and Source (Live · CoinGecko / Live · Finnhub / Manual) columns.
4. Cash flow — total cash across accounts; bank cells (name, label, currency, balance, IDR equivalent for USD accounts) + add; month switcher; Money in / out / net; spending-by-category bars; Salary cell (amount, payday, auto-invest %, mode auto/manual, paid-into account, status, "Log salary now", "Edit salary"); transactions list (delete ✕); "Import statement"; "+ Log transaction".
5. Goals — net worth / invested monthly / expected return cells; projection chart with dashed goal lines and markers at ETA; goal cells with % , ETA, amount to go, Set active, Edit.
6. Markets — watchlist (holdings + USD/IDR, IHSG, S&P 500) with price and 24h change; TradingView advanced chart for the selected symbol (620px tall desktop).
7. Advisor — brief (3 cards) + risk-profile segmented control; chat thread (user messages on surface fill, advisor messages plain with accent kicker); quick prompts; input + Ask (Enter submits). Right column: TradingView news timeline.
8. Settings — account (name, email, Lock, Change PIN, Log out); risk profile with description; language & currency; market-data API key; salary summary; reset data.

Modals (backdrop ink 50%, panel 2px ink border, shadow-lg, max-width 480–720px): Add/Edit holding (class chips; currency chips; fields change by class — Deposito: bank, principal, interest % p.a., maturity), Bank account, Goal (shows live ETA estimate), Log transaction (in/out, category, account), Salary, Import statement (account → file → optional PDF password → AI parse → review rows with include checkbox and tap-to-cycle category, salary detection banner, optional "set balance to closing balance" → Import N).

## Interactions & behaviour
- Currency toggle re-renders every amount. Short format: "Rp 25 jt", "Rp 1,2 M", "$24.1k". Long format for hero.
- Net worth = Σ(qty × live-or-manual price × FX) + Σ bank balances.
- ETA: monthly compounding at profile return (Conservative 6%, Balanced 9%, Aggressive 12%) + monthly contribution = salary × auto-invest %.
- Crypto caps per profile (10/20/35%) drive the rule-based "Rebalance/Hold" brief fallback.
- Salary auto mode: on/after payday, if no Salary transaction this month, add it to the chosen account (net worth rises).
- Manual transactions adjust the account balance; deleting reverses it.
- Brief: generated once per day per language/profile; cached; regenerate on demand.
- Errors shown inline in accent-700, 14px/600.

## State (per user)
holdings, banks, transactions, goals, activeGoal, salary {amount, payday, pct, auto, bankId}, settings {currency, language, riskProfile}, brief cache, chat history, price cache, FX rate.

## Design tokens (Modernist design system)
- Colours: bg #f3f2f2, surface #eae9e9, text #201e1d, accent #ec3013, divider = text @ 40%.
  Accent ramp 100 #fff2ef, 200 #ffe0d9, 300 #ffc4b8, 600 #dd2b0f, 700 #ae1800, 800 #7c1405. Neutral ramp 200 #eae7e7, 300 #d7d3d3, 400 #bab6b6, 500 #9b9797, 700 #605d5d, 800 #444141, 900 #2d2b2b.
- Type: Archivo 400/600/800 only. Kickers 12px/800, 0.08em, uppercase. Body 14–15px. Display 84/64/44/40/32px with −0.02 to −0.035em tracking.
- Spacing: 4, 8, 12, 16, 24, 32 (cell padding 20–32px).
- Radius: 0 everywhere. Rules: 2px ink between sections, 1px divider between rows.
- Shadows: sm 0 1px 2px, md 0 3px 10px, lg 0 12px 32px (ink 14/16/22%) — modals only.
- Focus: 2px accent outline, 2px offset. Hover: neutral-200 fill (outlined) / accent-600 (primary).
- Allocation colours in order: accent, neutral-900, neutral-700, accent-300, neutral-500, accent-700, neutral-400, neutral-300.

## Assets
No images. Icons: Lucide if needed. Charts: TradingView widgets (attribution required) or TradingView Lightweight Charts.

## Files
- `../prototype/Nilai App.dc.html` — full prototype (template + logic class in one file; logic in the `<script data-dc-script>` block shows every formula and AI prompt).
- `../prototype/support.js`, `../prototype/_ds/…` — runtime + design-system stylesheet needed to open it.
- `../ARCHITECTURE.md` — stack, data model, security, phases, budget.
- `../CLAUDE_CODE_KICKOFF.md` — how to start in Claude Code + the first prompt.
