export type Currency = 'IDR' | 'USD';
const MINUS = '−';

/** Short amount: "Rp 25 jt", "Rp 1,2 M", "$24.1k". `idr` is the value in IDR. */
export function formatShort(idr: number, cur: Currency, usdIdr: number): string {
  const neg = idr < 0;
  const v = Math.abs(idr);
  let o: string;
  if (cur === 'USD') {
    const u = v / usdIdr;
    o = u >= 1e6 ? '$' + (u / 1e6).toFixed(2) + 'M' : u >= 1e4 ? '$' + (u / 1e3).toFixed(1) + 'k' : '$' + Math.round(u).toLocaleString('en-US');
  } else if (v >= 1e9) o = 'Rp ' + (v / 1e9).toFixed(2).replace(/\.?0+$/, '').replace('.', ',') + ' M';
  else if (v >= 1e6) o = 'Rp ' + (v / 1e6).toFixed(1).replace(/\.0$/, '').replace('.', ',') + ' jt';
  else o = 'Rp ' + Math.round(v).toLocaleString('id-ID');
  return (neg ? MINUS : '') + o;
}

/** Long amount for the hero: "Rp 392.320.000", "$24,143". */
export function formatLong(idr: number, cur: Currency, usdIdr: number): string {
  const neg = idr < 0;
  const v = Math.abs(idr);
  const o = cur === 'USD' ? '$' + Math.round(v / usdIdr).toLocaleString('en-US') : 'Rp ' + Math.round(v).toLocaleString('id-ID');
  return (neg ? MINUS : '') + o;
}

/** "12.5%" / "12%" */
export const formatPct = (x: number) => (x * 100).toFixed(1).replace(/\.0$/, '') + '%';

/** "+2.4%" / "−1.2%" from a percent value */
export const formatChange = (pct: number) => (pct > 0 ? '+' : pct < 0 ? MINUS : '') + Math.abs(pct).toFixed(1) + '%';
