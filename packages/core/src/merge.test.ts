import { describe, expect, it } from 'vitest';
import { mergeStatements, type ParsedAccount } from './statement';

const acc = (label: string, closing: number, rows: [string, number][], balanced = true): ParsedAccount => ({
  label, currency: 'IDR', closing_balance: closing, balanced,
  transactions: rows.map(([date, amount]) => ({ date, description: 'x', amount, category: 'Other' })),
});

describe('mergeStatements', () => {
  it('joins months of the same account across formats, newest closing balance wins', () => {
    const [m] = mergeStatements([
      [acc('Mandiri Tabungan Payroll 1260011780433', 300, [['2026-09-01', -1], ['2026-09-30', -2]])],
      [acc('Mandiri MANDIRI TAB 126-00-1178043-3', 200, [['2026-08-02', -3]])],
    ]);
    expect(m.transactions.map((x) => x.date)).toEqual(['2026-08-02', '2026-09-01', '2026-09-30']);
    expect(m.closing_balance).toBe(300);
  });
  it('a month in two files is taken once, from the later file', () => {
    const [m] = mergeStatements([
      [acc('A 111', 1, [['2026-09-01', -1], ['2026-09-02', -1]])],
      [acc('A 111', 2, [['2026-09-05', -9]], false)],
    ]);
    expect(m.transactions.map((x) => x.amount)).toEqual([-9]);
    expect(m.balanced).toBe(false);
  });
  it('keeps different accounts apart', () => {
    expect(mergeStatements([[acc('A 111', 1, [['2026-09-01', -1]])], [acc('B 222', 1, [['2026-09-01', -1]])]])).toHaveLength(2);
  });
});
