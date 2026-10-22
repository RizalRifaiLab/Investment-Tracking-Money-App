import { ASSET_CLASSES, COINGECKO_IDS, instrumentMeta, type AssetClass } from "@nilai/core";
import { admin, coingecko, coingeckoSearch, hyperliquid, userFromRequest, yahoo } from "@/lib/prices";

// GET /api/lookup?cls=Crypto&ticker=PEPE → provider ids + live quote, used by the add-holding form.
export async function GET(req: Request) {
  if (!(await userFromRequest(req))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const cls = url.searchParams.get("cls") as AssetClass;
  const ticker = (url.searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ASSET_CLASSES.includes(cls) || !/^[A-Z0-9.\-]{1,20}$/.test(ticker)) return Response.json({ error: "bad request" }, { status: 400 });

  let meta = instrumentMeta(cls, ticker), name: string | null = null, quote = null;
  try {
    if (cls === "Crypto") {
      const hit = COINGECKO_IDS[ticker] ? { id: COINGECKO_IDS[ticker], name: null } : await coingeckoSearch(ticker);
      if (hit) { meta = { ...meta, provider: "coingecko", provider_symbol: hit.id }; name = hit.name; }
      quote = (hit && (await coingecko([hit.id]))[hit.id]) || (await hyperliquid([ticker]))[ticker] || null;
    } else if (meta.provider === "yahoo") {
      quote = (await yahoo([meta.provider_symbol!]))[meta.provider_symbol!] ?? null;
    }
  } catch { /* no quote: the form falls back to a manual price */ }

  // Store it so a holding saved right after shows a live value without waiting for the cron.
  if (quote && meta.provider && meta.provider_symbol)
    await admin().from("prices").upsert({ provider: meta.provider, provider_symbol: meta.provider_symbol, ...quote, updated_at: new Date().toISOString() });

  return Response.json({ ...meta, name, quote });
}
