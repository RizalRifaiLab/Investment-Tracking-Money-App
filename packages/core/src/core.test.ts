import { describe, expect, it } from 'vitest';
import { formatChange, formatLong, formatPct, formatShort, monthsTo, projectPath, etaDate, MAX_MONTHS } from './index';

const R = 16000;

describe('formatShort', () => {
  it('IDR tiers', () => {
    expect(formatShort(25_000_000, 'IDR', R)).toBe('Rp 25 jt');
    expect(formatShort(1_250_000, 'IDR', R)).toBe('Rp 1,3 jt');
    expect(formatShort(1_200_000_000, 'IDR', R)).toBe('Rp 1,2 M');
    expect(formatShort(1_000_000_000, 'IDR', R)).toBe('Rp 1 M');
    expect(formatShort(10_000_000_000, 'IDR', R)).toBe('Rp 10 M');
    expect(formatShort(650_000, 'IDR', R)).toBe('Rp 650.000');
  });
  it('USD tiers', () => {
    expect(formatShort(385_600_000, 'USD', R)).toBe('$24.1k');
    expect(formatShort(32_000_000_000, 'USD', R)).toBe('$2.00M');
    expect(formatShort(1_600_000, 'USD', R)).toBe('$100');
  });
  it('negative uses U+2212', () => {
    expect(formatShort(-650_000, 'IDR', R)).toBe('−Rp 650.000');
  });
});

describe('formatLong', () => {
  it('formats full numbers', () => {
    expect(formatLong(392_320_000, 'IDR', R)).toBe('Rp 392.320.000');
    expect(formatLong(386_288_000, 'USD', R)).toBe('$24,143');
  });
});

describe('percent helpers', () => {
  it('formats', () => {
    expect(formatPct(0.125)).toBe('12.5%');
    expect(formatPct(0.2)).toBe('20%');
    expect(formatChange(2.4)).toBe('+2.4%');
    expect(formatChange(-1.2)).toBe('−1.2%');
    expect(formatChange(0)).toBe('0.0%');
  });
});

describe('projection', () => {
  it('0 when already reached', () => expect(monthsTo(100, 50, 0, 9)).toBe(0));
  it('pure contributions with 0% return', () => expect(monthsTo(0, 1200, 100, 0)).toBe(12));
  it('caps at MAX_MONTHS', () => expect(monthsTo(0, 1e12, 1, 0)).toBe(MAX_MONTHS));
  it('compounding reaches goal sooner than contributions alone', () => {
    expect(monthsTo(400e6, 1e9, 6e6, 9)).toBeLessThan(100);
  });
  it('path matches monthsTo', () => {
    const n = monthsTo(400e6, 1e9, 6e6, 9);
    const p = projectPath(400e6, n, 6e6, 9);
    expect(p[n]).toBeGreaterThanOrEqual(1e9);
    expect(p[n - 1]).toBeLessThan(1e9);
  });
  it('eta date', () => {
    expect(etaDate(0)).toBeNull();
    expect(etaDate(MAX_MONTHS)).toBeNull();
    expect(etaDate(3, new Date(2026, 10, 15))).toEqual(new Date(2027, 1, 1));
  });
});
