import { createClient } from "@supabase/supabase-js";

// Server-side market data. Every fetcher returns what it got and skips what failed, so callers can fall back.
export type Quote = { price: number; currency: string; change_24h: number | null };

const TIMEOUT = 10_000;
const get = (url: string, headers: Record<string, string> = {}) =>
  fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Nilai)", ...headers }, signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${url.split("?")[0]} → ${r.status}`))));

const cgHeaders = (): Record<string, string> => (process.env.COINGECKO_API_KEY ? { "x-cg-demo-api-key": process.env.COINGECKO_API_KEY } : {});

export const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

/** CoinGecko ids → USD price + 24h change. */
export async function coingecko(ids: string[]): Promise<Record<string, Quote>> {
  if (!ids.length) return {};
  const r = await get(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.map(encodeURIComponent).join(",")}&vs_currencies=usd&include_24hr_change=true`, cgHeaders());
  const out: Record<string, Quote> = {};
  for (const id of ids) if (r[id]?.usd) out[id] = { price: r[id].usd, currency: "USD", change_24h: r[id].usd_24h_change ?? null };
  return out;
}

/** Hyperliquid perp mark prices by coin ticker (BTC, ETH…). Fallback only: futures price, no stablecoins. */
export async function hyperliquid(tickers: string[]): Promise<Record<string, Quote>> {
  if (!tickers.length) return {};
  const r = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "metaAndAssetCtxs" }), signal: AbortSignal.timeout(TIMEOUT),
  }).then((x) => x.json());
  const [meta, ctxs] = r as [{ universe: { name: string }[] }, { markPx: string; prevDayPx: string }[]];
  const out: Record<string, Quote> = {};
  meta.universe.forEach((u, i) => {
    if (!tickers.includes(u.name)) return;
    const px = Number(ctxs[i].markPx), prev = Number(ctxs[i].prevDayPx);
    if (px > 0) out[u.name] = { price: px, currency: "USD", change_24h: prev > 0 ? ((px - prev) / prev) * 100 : null };
  });
  return out;
}

/**
 * Yahoo Finance chart endpoint: US stocks/ETFs (VOO) and IDX (BBCA.JK).
 * shortcut: unofficial, unkeyed endpoint that can change without notice; move to EODHD before public launch.
 */
export async function yahoo(symbols: string[]): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  await Promise.all(symbols.map(async (s) => {
    try {
      const m = (await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=1d&interval=1d`)).chart.result[0].meta;
      const prev = m.chartPreviousClose ?? m.previousClose;
      if (m.regularMarketPrice > 0) out[s] = { price: m.regularMarketPrice, currency: m.currency, change_24h: prev ? ((m.regularMarketPrice - prev) / prev) * 100 : null };
    } catch { /* keep last stored price */ }
  }));
  return out;
}

export async function usdIdr(): Promise<number | null> {
  const r = await get("https://open.er-api.com/v6/latest/USD");
  return r?.rates?.IDR > 0 ? r.rates.IDR : null;
}

/** Best CoinGecko id for a ticker: exact symbol match with the best market-cap rank. */
export async function coingeckoSearch(ticker: string): Promise<{ id: string; name: string } | null> {
  const r = await get(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(ticker)}`, cgHeaders());
  const hit = (r.coins as { id: string; name: string; symbol: string; market_cap_rank: number | null }[])
    .filter((c) => c.symbol.toUpperCase() === ticker.toUpperCase())
    .sort((a, b) => (a.market_cap_rank ?? 1e9) - (b.market_cap_rank ?? 1e9))[0];
  return hit ? { id: hit.id, name: hit.name } : null;
}

/** Signed-in Supabase user from a bearer token, or null. */
export async function userFromRequest(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  const { data } = await admin().auth.getUser(token);
  return data.user;
}
