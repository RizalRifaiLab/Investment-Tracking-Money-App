import { describe, expect, it } from 'vitest';
import { reviewMonth, type ReviewTxn } from './review';

const t = (date: string, idr: number, category: ReviewTxn['category'], description = 'x'): ReviewTxn => ({ date, idr, category, description });

describe('reviewMonth', () => {
  const txns = [
    t('2026-07-05', -1_000_000, 'Food'), t('2026-08-05', -1_000_000, 'Food'),
    t('2026-09-01', 10_000_000, 'Salary'),
    t('2026-09-02', -3_000_000, 'Food', 'Warung A'), t('2026-09-03', -500_000, 'Food', 'Cafe B'),
    t('2026-09-04', -2_000_000, 'Bills', 'Kos'), t('2026-09-05', -4_000_000, 'Investment', 'Bibit'),
    t('2026-10-01', -9_999, 'Food'),
  ];
  const r = reviewMonth(txns, '2026-09');
  it('totals the month only', () => {
    expect(r.in).toBe(10_000_000);
    expect(r.out).toBe(9_500_000);
    expect(r.net).toBe(500_000);
    expect(r.savingsRate).toBeCloseTo(0.05);
  });
  it('top spending excludes investments and names the biggest payee', () => {
    expect(r.top).toMatchObject({ cat: 'Food', amount: 3_500_000, payee: 'Warung A', payeeAmount: 3_000_000 });
    expect(r.cats.map((c) => c.cat)).toEqual(['Food', 'Bills']);
  });
  it('finds a category rising vs the previous two months', () => {
    expect(r.rising).toEqual({ cat: 'Food', now: 3_500_000, before: 1_000_000, months: 2 });
  });
  it('suggests cutting the largest discretionary category by 20%', () => {
    expect(r.cut).toEqual({ cat: 'Food', save: 700_000 });
  });
  it('no history → no rising; empty month is safe', () => {
    expect(reviewMonth(txns.filter((x) => x.date >= '2026-09'), '2026-09').rising).toBeNull();
    const e = reviewMonth([], '2026-09');
    expect([e.in, e.out, e.top, e.cut, e.savingsRate]).toEqual([0, 0, null, null, null]);
  });
});
