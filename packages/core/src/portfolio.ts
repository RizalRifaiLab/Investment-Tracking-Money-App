import { COINGECKO_IDS, type AssetClass } from './constants';

/** Row of the `holding_values` view. */
export type HoldingValue = {
  id: string; class: AssetClass; name: string; ticker: string;
  quantity: number; manual_price: number; price_currency: 'IDR' | 'USD';
  provider: 'coingecko' | 'yahoo' | null; provider_symbol: string | null; tv_symbol: string | null;
  deposit_rate: number | null; maturity_date: string | null;
  price: number; change_24h: number; is_live: boolean; value_idr: number; price_updated_at?: string | null;
};
/** Row of the `account_values` view. */
export type AccountValue = { id: string; bank: string; label: string; currency: 'IDR' | 'USD'; balance: number; value_idr: number };

export type RowClass = AssetClass | 'Cash';
export type Row = {
  id: string; kind: 'holding' | 'bank'; name: string; ticker: string; cls: RowClass;
  qtyS: string; priceS: string; idr: number; chg: number; src: string; live: boolean;
};

/** Allocation order, matches the prototype's colour order. */
export const CLASS_ORDER: RowClass[] = ['Crypto', 'ETF', 'US stocks', 'Deposito', 'Reksa dana', 'Gold', 'IDX stocks', 'Cash'];

const price = (v: number, ccy: string) =>
  ccy === 'USD' ? '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : 'Rp ' + v.toLocaleString('id-ID', { maximumFractionDigits: 2 });

function qtyLabel(h: HoldingValue, loc: string): string {
  const q = Number(h.quantity);
  switch (h.class) {
    case 'Crypto': return `${q} ${h.ticker}`;
    case 'IDX stocks': return `${q / 100} lot`;
    case 'US stocks': case 'ETF': return `${q} sh`;
    case 'Gold': return `${q} g`;
    case 'Deposito': return h.maturity_date ? '→ ' + new Date(h.maturity_date).toLocaleDateString(loc, { day: 'numeric', month: 'short' }) : '—';
    default: return q.toLocaleString('en-US') + ' unit';
  }
}

export function buildPortfolio(holdings: HoldingValue[], accounts: AccountValue[], loc = 'en-GB') {
  const rows: Row[] = [
    ...holdings.map((h): Row => {
      const dep = h.class === 'Deposito';
      return {
        id: h.id, kind: 'holding', name: h.name, cls: h.class,
        ticker: dep ? `${Number(h.deposit_rate ?? 0)}% p.a.` : h.ticker,
        qtyS: qtyLabel(h, loc),
        priceS: dep ? `${Number(h.deposit_rate ?? 0)}% p.a.` : price(Number(h.price), h.price_currency),
        idr: Number(h.value_idr), chg: Number(h.change_24h),
        src: h.is_live ? (h.provider === 'coingecko' ? 'Live · CoinGecko' : 'Live · Yahoo') : 'Manual', live: h.is_live,
      };
    }),
    ...accounts.map((a): Row => ({
      id: a.id, kind: 'bank', name: a.bank, ticker: a.label, cls: 'Cash',
      qtyS: a.currency === 'USD' ? '$' + Number(a.balance).toLocaleString('en-US') : 'IDR', priceS: '—',
      idr: Number(a.value_idr), chg: 0, src: 'Manual', live: false,
    })),
  ];
  const total = rows.reduce((s, r) => s + r.idr, 0);
  const cash = rows.filter((r) => r.kind === 'bank').reduce((s, r) => s + r.idr, 0);
  const day = rows.reduce((s, r) => s + (r.idr * r.chg) / 100, 0);
  const classes = CLASS_ORDER.map((cls, i) => {
    const idr = rows.filter((r) => r.cls === cls).reduce((s, r) => s + r.idr, 0);
    return { cls, idr, share: total ? idr / total : 0, colorIndex: i };
  }).filter((c) => c.idr > 0);
  return { rows, total, cash, day, classes };
}

/** Live-price provider and TradingView symbol for a ticker, as in the prototype. */
type Meta = { provider: 'coingecko' | 'yahoo' | null; provider_symbol: string | null; tv_symbol: string | null };
export function instrumentMeta(cls: AssetClass, ticker: string): Meta {
  const T = ticker.trim().toUpperCase();
  const none: Meta = { provider: null, provider_symbol: null, tv_symbol: null };
  if (!T) return cls === 'Gold' ? { ...none, tv_symbol: 'OANDA:XAUUSD' } : none;
  switch (cls) {
    case 'Crypto': return COINGECKO_IDS[T] ? { provider: 'coingecko', provider_symbol: COINGECKO_IDS[T], tv_symbol: `BINANCE:${T}USDT` } : { ...none, tv_symbol: `BINANCE:${T}USDT` };
    case 'US stocks': case 'ETF': return { provider: 'yahoo', provider_symbol: T, tv_symbol: T };
    case 'IDX stocks': return { provider: 'yahoo', provider_symbol: `${T}.JK`, tv_symbol: `IDX:${T}` };
    case 'Gold': return { ...none, tv_symbol: 'OANDA:XAUUSD' };
    default: return none;
  }
}

/** Units held from "I have this much of it": amount (IDR or USD) converted to the price currency, ÷ unit price. */
export function quantityFromAmount(amount: number, amountCcy: 'IDR' | 'USD', price: number, priceCcy: 'IDR' | 'USD', usdIdr: number): number {
  if (!(amount > 0 && price > 0 && usdIdr > 0)) return 0;
  const inPriceCcy = amountCcy === priceCcy ? amount : amountCcy === 'IDR' ? amount / usdIdr : amount * usdIdr;
  return +(inPriceCcy / price).toFixed(10); // NUMERIC(28,10) column
}
