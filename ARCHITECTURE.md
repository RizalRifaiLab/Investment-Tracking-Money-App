# Nilai — Recommended architecture & budget
Prices are estimates as of Oct 2026 in USD; check each vendor before committing.

## 1. Stack
| Layer | Choice | Why |
|---|---|---|
| Web app | Next.js (App Router, TypeScript) + Tailwind (tokens from README) | One codebase for desktop + mobile web; installable as a PWA in phase 1 |
| Mobile app (phase 2) | Expo / React Native, sharing a `packages/core` (types, formatters, projection maths) | Native biometrics + secure storage for PIN |
| Backend | Supabase: Postgres, Auth (email OTP + Google), Row Level Security, Storage, Edge Functions, pg_cron | Auth + DB + storage in one, low cost, RLS isolates every user's data |
| Workers | Small Python service on Fly.io / Railway (pdfplumber + pikepdf, openpyxl) | Unlocks password PDFs and extracts text server-side; Edge Functions can't run these |
| AI | Claude API — Haiku 4.5 for statement parsing + daily briefs (Batch API, 50% off), Sonnet for advisor chat; prompt caching on the portfolio context | Quality/cost balance |
| Market data | Crypto: CoinGecko. US stocks/ETF: Finnhub or Twelve Data. IDX: EODHD (".JK" tickers) or Twelve Data. FX: open.er-api / exchangerate.host. Gold: Antam price via scraping job or XAU×FX | Fetched **server-side on a schedule into a `prices` table**, never per user from the browser |
| Charts & news | TradingView widgets (free, attribution) or Lightweight Charts with your own price data; news from Finnhub/Marketaux | |
| Email | Resend (OTP + weekly summary) | Supabase's built-in mailer is rate-limited |
| Monitoring | Sentry (free tier), Supabase logs | |

```
Browser / Expo app
   │  Supabase JS (auth session + RLS queries)
   ▼
Supabase ── Postgres (RLS) ── Storage (statements, auto-delete after parse)
   │  Edge Functions: /advisor-chat, /brief, /import-start
   │  pg_cron: prices every 5 min (crypto) / 15 min (stocks), FX hourly,
   │           salary auto-post daily, briefs daily 06:00 WIB
   ▼
Python worker (statement → text → Claude → rows)   Claude API   Market-data APIs
```
All API keys live in Supabase secrets / worker env. The client never calls Claude or paid market APIs directly.

## 2. Data model (Postgres, every table has `user_id` + RLS `user_id = auth.uid()`)
- `profiles` (user_id, name, currency, language, risk_profile, pin_hash, pin_failed, created_at)
- `accounts` (id, user_id, bank, label, currency, balance)
- `holdings` (id, user_id, class, name, ticker, quantity, manual_price, price_currency, provider, provider_symbol, tv_symbol, deposit_rate, maturity_date)
- `transactions` (id, user_id, account_id, date, description, amount, category, source manual|import|salary, import_id)
- `imports` (id, user_id, account_id, file_path, status, closing_balance, created_at)
- `goals` (id, user_id, name, target_idr, is_active)
- `salary_settings` (user_id, amount, payday, invest_pct, auto, account_id)
- `prices` (provider_symbol, price, currency, change_24h, updated_at) — shared, read-only to clients
- `fx_rates` (pair, rate, updated_at)
- `networth_snapshots` (user_id, date, total_idr) — daily job, powers the history chart
- `briefs` (user_id, date, language, profile, items jsonb)
- `chat_messages` (id, user_id, role, content, created_at)

## 3. Auth & PIN
- First login: Supabase email OTP or Google OAuth → long-lived refresh token.
- PIN = **app unlock**, not the account password. Hash with argon2/bcrypt server-side (`pin_hash`); after 5 failures, revoke the session and require OTP again. On Expo, store a device key in SecureStore and allow Face ID / fingerprint.
- Auto-lock after N minutes in background.

## 4. Security & compliance (Indonesia)
- UU PDP (Law 27/2022, personal data protection): consent at signup, privacy policy, data export/delete, breach procedure. Host in Singapore (`ap-southeast-1`) for latency.
- Bank statements: encrypted storage bucket, delete original file right after parsing, never log contents, never store the PDF password.
- AI advice: personalised investment advice may fall under OJK regulation. Position the advisor as educational/informational with a clear disclaimer, and get local legal advice before charging for it or promoting it publicly.
- Rate-limit AI endpoints per user (e.g. 30 chat messages/day on free plan).

## 5. Build phases
1. **MVP web (4–6 weeks solo with Claude Code):** auth + PIN, accounts, holdings CRUD, manual prices + CoinGecko + FX cron, dashboard, goals + projection, salary auto-post, IDR/USD, EN/ID.
2. **Data:** stock providers (US + IDX), net-worth snapshots, Markets screen, CSV/Excel import.
3. **AI:** daily brief (batch), advisor chat, PDF import via worker.
4. **Mobile:** Expo app, biometrics, push notification for the daily brief and deposito maturity.
5. **Later:** Open-banking aggregation (Brick, Ayoconnect, Finantier) to replace statement uploads; broker/exchange read-only APIs (Indodax, Tokocrypto).

## 6. Budget

### Minimum for development (just you)
| Item | Monthly |
|---|---|
| Claude Code (Claude Pro; Max if you code daily for long sessions) | $20 (Max $100) |
| Supabase Free (2 projects) | $0 |
| Vercel Hobby | $0 |
| CoinGecko Demo, Finnhub free, open.er-api | $0 |
| Claude API usage while testing | ~$5–15 |
| Domain (.com / .id) | ~$1–3 |
| **Total** | **~$25–40** (≈ Rp 400–650 rb) |

Note: Vercel Hobby and free data tiers are non-commercial or rate-limited — fine for building, not for launch.

### Production — small launch (~500–1,000 active users)
| Item | Monthly |
|---|---|
| Supabase Pro | $25 (+ usage, usually <$10) |
| Vercel Pro | $20 |
| Python worker (Fly.io / Railway) | $5–10 |
| Market data: CoinGecko paid tier + stock/IDX provider (EODHD / Twelve Data) | $50–130 |
| Claude API: daily briefs (Haiku, batch) ≈ $0.003/user/day + chat + imports | $100–250 |
| Resend email | $0–20 |
| Sentry | $0 |
| Apple Developer ($99/yr) + Google Play ($25 one-off), amortised | ~$9 |
| **Total** | **~$210–475** (≈ Rp 3,5–7,8 jt) |

Cost levers: generate briefs only for users active in the last 7 days; cache the portfolio system prompt; use Haiku for chat on a free plan and Sonnet on a paid plan; cron prices once for everyone instead of per user.

### Scale reference (~10,000 active users)
Roughly $1,200–2,500/month, dominated by AI (~60%) and market-data licensing. A freemium plan (e.g. Rp 29–49 rb/month for AI advisor + PDF import) covers this at ~3–5% conversion.

One-off: legal review (privacy policy, OJK positioning) and a security review before launch, typically Rp 10–30 jt in Indonesia.
