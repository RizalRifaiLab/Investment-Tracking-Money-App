import type { AssetClass } from './constants';

// Paper-trading lab: an AI trades fake IDR at real prices and is compared with buy-and-hold.

/** Yahoo symbol → name and class. The AI may only trade these. */
export const PAPER_UNIVERSE: Record<string, { name: string; class: AssetClass }> = {
  'BTC-USD': { name: 'Bitcoin', class: 'Crypto' },
  'ETH-USD': { name: 'Ethereum', class: 'Crypto' },
  'SOL-USD': { name: 'Solana', class: 'Crypto' },
  'BNB-USD': { name: 'BNB', class: 'Crypto' },
  'XRP-USD': { name: 'XRP', class: 'Crypto' },
  VOO: { name: 'Vanguard S&P 500 ETF', class: 'ETF' },
  QQQ: { name: 'Invesco Nasdaq 100 ETF', class: 'ETF' },
  GLD: { name: 'SPDR Gold ETF', class: 'ETF' },
  'BBCA.JK': { name: 'Bank Central Asia', class: 'IDX stocks' },
  'BBRI.JK': { name: 'Bank Rakyat Indonesia', class: 'IDX stocks' },
  'BMRI.JK': { name: 'Bank Mandiri', class: 'IDX stocks' },
  'TLKM.JK': { name: 'Telkom Indonesia', class: 'IDX stocks' },
  'ASII.JK': { name: 'Astra International', class: 'IDX stocks' },
};
/** What the AI must beat: bought on day one and never touched. */
export const PAPER_BENCHMARK: Record<string, number> = { VOO: 0.5, 'BBCA.JK': 0.25, 'BTC-USD': 0.25 };
export const PAPER_FEE = 0.002; // 0.2% per trade, close to Indonesian brokers and exchanges
const MAX_ORDERS = 6, MIN_ORDER_IDR = 10_000;

export type PaperOrder = { symbol: string; side: 'buy' | 'sell'; amount_idr: number; reason: string };
export type PaperFill = { symbol: string; side: 'buy' | 'sell'; qty: number; price_idr: number; fee_idr: number; reason: string };

export function positionsOf(trades: { symbol: string; side: string; qty: number | string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of trades) out[t.symbol] = (out[t.symbol] ?? 0) + (t.side === 'buy' ? 1 : -1) * Number(t.qty);
  for (const s in out) if (out[s] <= 1e-12) delete out[s];
  return out;
}

export const valueOf = (units: Record<string, number>, priceIdr: Record<string, number>) =>
  Object.entries(units).reduce((v, [s, q]) => v + q * (priceIdr[s] ?? 0), 0);

/** Sells first (freeing cash), then buys, each capped by what is held or affordable. No leverage, no shorting. */
export function fillOrders(cash: number, positions: Record<string, number>, orders: PaperOrder[], priceIdr: Record<string, number>) {
  const pos = { ...positions }, fills: PaperFill[] = [], rejected: string[] = [];
  const sorted = orders.slice(0, MAX_ORDERS).sort((a, b) => (a.side === b.side ? 0 : a.side === 'sell' ? -1 : 1));
  for (const o of sorted) {
    const px = priceIdr[o.symbol];
    if (!PAPER_UNIVERSE[o.symbol] || !(px > 0)) { rejected.push(`${o.symbol}: not tradable`); continue; }
    let qty: number;
    if (o.side === 'sell') {
      const held = pos[o.symbol] ?? 0;
      qty = Math.min(held, o.amount_idr / px);
      if (held - qty < held * 0.01) qty = held; // "sell almost all" means sell all
    } else qty = Math.min(o.amount_idr, cash / (1 + PAPER_FEE)) / px;
    const gross = qty * px;
    if (gross < MIN_ORDER_IDR) { rejected.push(`${o.symbol}: ${o.side === 'sell' ? 'nothing to sell' : 'not enough cash'}`); continue; }
    const fee = gross * PAPER_FEE;
    cash += o.side === 'sell' ? gross - fee : -gross - fee;
    pos[o.symbol] = (pos[o.symbol] ?? 0) + (o.side === 'buy' ? qty : -qty);
    if (pos[o.symbol] <= 1e-12) delete pos[o.symbol];
    fills.push({ symbol: o.symbol, side: o.side, qty, price_idr: px, fee_idr: fee, reason: o.reason.slice(0, 500) });
  }
  return { cash, positions: pos, fills, rejected };
}

/** The AI replies with JSON, sometimes wrapped in prose or a code fence. Bad orders are dropped. */
export function parseOrders(text: string): { note: string; orders: PaperOrder[] } {
  const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const orders = (Array.isArray(j.orders) ? j.orders : []).flatMap((o: Record<string, unknown>) => {
    const amount = Number(o?.amount_idr);
    return typeof o?.symbol === 'string' && (o.side === 'buy' || o.side === 'sell') && amount > 0
      ? [{ symbol: o.symbol.toUpperCase(), side: o.side, amount_idr: amount, reason: String(o.reason ?? '') }] : [];
  });
  return { note: String(j.note ?? '').slice(0, 1500), orders };
}
