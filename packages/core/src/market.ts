// Trend summary of a daily close series (oldest first), as fed to the advisor.
export type Trend = { last: number; d1: number | null; m1: number | null; m3: number | null; y1: number | null; vs50: number | null; vs200: number | null };

const pct = (a: number, b: number | undefined) => (b ? ((a - b) / b) * 100 : null);
const sma = (c: number[], n: number) => (c.length >= n ? c.slice(-n).reduce((x, y) => x + y, 0) / n : undefined);

/** Trading days: 1 month ≈ 21, 3 months ≈ 63; 1 year = first close of a 1-year series (IDX has ~240 days). Missing history gives null. */
export function trendOf(closes: number[]): Trend | null {
  const c = closes.filter((x) => Number.isFinite(x) && x > 0);
  if (c.length < 2) return null;
  const last = c[c.length - 1], back = (n: number) => (c.length > n ? c[c.length - 1 - n] : undefined);
  return { last, d1: pct(last, back(1)), m1: pct(last, back(21)), m3: pct(last, back(63)), y1: pct(last, c.length >= 200 ? c[0] : undefined), vs50: pct(last, sma(c, 50)), vs200: pct(last, sma(c, 200)) };
}

/** One line per market, e.g. "S&P 500 5,800 · 1d +0.4% · 1m +2.1% · 3m … · above 50d avg by 1.2%, above 200d by 8.0%". */
export function trendLine(name: string, t: Trend): string {
  const f = (v: number | null) => (v === null ? "n/a" : (v >= 0 ? "+" : "") + v.toFixed(1) + "%");
  const ma = (v: number | null, n: number) => (v === null ? "" : `, ${v >= 0 ? "above" : "below"} ${n}d avg by ${Math.abs(v).toFixed(1)}%`);
  return `${name} ${t.last.toLocaleString("en-US", { maximumFractionDigits: 2 })} · 1d ${f(t.d1)} · 1m ${f(t.m1)} · 3m ${f(t.m3)} · 1y ${f(t.y1)}${ma(t.vs50, 50)}${ma(t.vs200, 200)}`;
}
