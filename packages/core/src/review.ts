import type { Category } from './constants';

export type ReviewTxn = { date: string; idr: number; category: Category; description: string };
const DISCRETIONARY: Category[] = ['Food', 'Shopping', 'Transport', 'Other'];

/**
 * Rule-based read of one month (YYYY-MM) against up to two earlier months that have data.
 * Investment outflows count in money out but not as "spending".
 */
export function reviewMonth(txns: ReviewTxn[], month: string) {
  const cur = txns.filter((x) => x.date.startsWith(month));
  const inn = cur.filter((x) => x.idr > 0).reduce((s, x) => s + x.idr, 0);
  const out = cur.filter((x) => x.idr < 0).reduce((s, x) => s - x.idr, 0);
  const spendBy = (rows: ReviewTxn[]) => {
    const m = new Map<Category, number>();
    for (const x of rows) if (x.idr < 0 && x.category !== 'Investment') m.set(x.category, (m.get(x.category) ?? 0) - x.idr);
    return m;
  };
  const now = spendBy(cur);
  const spend = [...now.values()].reduce((s, v) => s + v, 0);
  const cats = [...now.entries()].sort((a, b) => b[1] - a[1]).map(([cat, amount]) => ({ cat, amount, share: spend ? amount / spend : 0 }));

  let top = null as null | { cat: Category; amount: number; share: number; payee: string; payeeAmount: number };
  if (cats[0]) {
    const byPayee = new Map<string, number>();
    for (const x of cur) if (x.idr < 0 && x.category === cats[0].cat) byPayee.set(x.description, (byPayee.get(x.description) ?? 0) - x.idr);
    const [payee, payeeAmount] = [...byPayee.entries()].sort((a, b) => b[1] - a[1])[0];
    top = { ...cats[0], payee, payeeAmount };
  }

  const prevMonths = [...new Set(txns.map((x) => x.date.slice(0, 7)).filter((m) => m < month))].sort().slice(-2);
  let rising = null as null | { cat: Category; now: number; before: number; months: number };
  if (prevMonths.length) {
    const avg = new Map<Category, number>();
    for (const m of prevMonths) for (const [c, v] of spendBy(txns.filter((x) => x.date.startsWith(m)))) avg.set(c, (avg.get(c) ?? 0) + v / prevMonths.length);
    // biggest increase that matters: +30% and at least 5% of this month's spending
    for (const { cat, amount } of cats) {
      const before = avg.get(cat) ?? 0;
      if (amount >= before * 1.3 && amount - before >= spend * 0.05 && (!rising || amount - before > rising.now - rising.before))
        rising = { cat, now: amount, before, months: prevMonths.length };
    }
  }

  const disc = cats.find((c) => DISCRETIONARY.includes(c.cat)) ?? null;
  return {
    in: inn, out, net: inn - out, savingsRate: inn ? (inn - out) / inn : null, cats, top, rising,
    cut: disc && { cat: disc.cat, save: disc.amount * 0.2 },
  };
}
