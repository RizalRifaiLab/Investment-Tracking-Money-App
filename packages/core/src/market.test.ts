import { describe, expect, it } from 'vitest';
import { trendLine, trendOf } from './market';

describe('trendOf', () => {
  it('computes returns and distance from moving averages', () => {
    const closes = Array.from({ length: 253 }, (_, i) => 100 + i); // steady climb, last = 352
    const t = trendOf(closes)!;
    expect(t.last).toBe(352);
    expect(t.d1).toBeCloseTo((352 / 351 - 1) * 100);
    expect(t.m1).toBeCloseTo((352 / 331 - 1) * 100);
    expect(t.y1).toBeCloseTo((352 / 100 - 1) * 100);
    expect(t.vs50).toBeGreaterThan(0);
    expect(t.vs200).toBeGreaterThan(t.vs50!);
  });
  it('gives null for missing history and ignores bad points', () => {
    const t = trendOf([10, NaN, 0, 11])!;
    expect(t.d1).toBeCloseTo(10);
    expect(t.m1).toBeNull();
    expect(t.vs50).toBeNull();
    expect(trendOf([5])).toBeNull();
    expect(trendLine('Gold', t)).toBe('Gold 11 · 1d +10.0% · 1m n/a · 3m n/a · 1y n/a');
  });
});
