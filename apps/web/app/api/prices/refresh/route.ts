import { admin, coingecko, hyperliquid, usdIdr, userFromRequest, yahoo, type Quote } from "@/lib/prices";

const COOLDOWN_MS = 60_000; // user-triggered refreshes share the cron's data; don't hammer free APIs

// Refreshes fx_rates and prices for every symbol any user holds. Called by pg_cron (CRON_SECRET) or a signed-in user.
export async function POST(req: Request) {
  const isCron = !!process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron && !(await userFromRequest(req))) return Response.json({ error: "unauthorized" }, { status: 401 });

  const db = admin();
  if (!isCron) {
    const { data } = await db.from("prices").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (data && Date.now() - new Date(data.updated_at).getTime() < COOLDOWN_MS) return Response.json({ skipped: "fresh" });
  }

  const { data: hs, error } = await db.from("holdings").select("provider,provider_symbol,ticker").not("provider", "is", null);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const cgIds = [...new Set(hs.filter((h) => h.provider === "coingecko").map((h) => h.provider_symbol as string))];
  const ySyms = [...new Set(hs.filter((h) => h.provider === "yahoo").map((h) => h.provider_symbol as string))];
  const tickerOf = Object.fromEntries(hs.filter((h) => h.provider === "coingecko").map((h) => [h.provider_symbol, h.ticker]));

  const [fx, cg, y] = await Promise.allSettled([usdIdr(), coingecko(cgIds), yahoo(ySyms)]);
  const crypto: Record<string, Quote> = cg.status === "fulfilled" ? cg.value : {};
  // CoinGecko missed some (rate limit / outage) → Hyperliquid by ticker
  const missing = cgIds.filter((id) => !crypto[id]);
  if (missing.length) {
    const hl = await hyperliquid(missing.map((id) => tickerOf[id])).catch(() => ({} as Record<string, Quote>));
    for (const id of missing) if (hl[tickerOf[id]]) crypto[id] = hl[tickerOf[id]];
  }

  const now = new Date().toISOString();
  const rows = [
    ...Object.entries(crypto).map(([sym, q]) => ({ provider: "coingecko", provider_symbol: sym, ...q, updated_at: now })),
    ...Object.entries(y.status === "fulfilled" ? y.value : {}).map(([sym, q]) => ({ provider: "yahoo", provider_symbol: sym, ...q, updated_at: now })),
  ];
  const writes = await Promise.all([
    rows.length ? db.from("prices").upsert(rows) : null,
    fx.status === "fulfilled" && fx.value ? db.from("fx_rates").upsert({ pair: "USDIDR", rate: fx.value, updated_at: now }) : null,
  ]);
  const writeErr = writes.find((w) => w?.error)?.error;
  if (writeErr) return Response.json({ error: writeErr.message }, { status: 500 });

  return Response.json({
    prices: rows.length, wanted: cgIds.length + ySyms.length,
    fx: fx.status === "fulfilled" ? fx.value : null,
    failed: [...cgIds.filter((id) => !crypto[id]), ...ySyms.filter((s) => !rows.some((r) => r.provider_symbol === s))],
  });
}
