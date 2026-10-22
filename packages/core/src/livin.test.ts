import { describe, expect, it } from 'vitest';
import { parseMandiriLivin, type Line } from './statement';

// Synthetic Livin' e-Statement page: cells as [text, x, y]. Names and numbers are made up.
const L = (...cells: [string, number, number][]): Line => cells.map(([s, x, y]) => ({ s, x, y }));
const page: Line[] = [
  L(['e-Statement', 16, 800]),
  L(['Tabungan Payroll', 16, 760]),
  L(['Saldo Awal/', 298, 755], ['Initial Balance', 343, 755], [':', 446, 755], ['1.000.000,00', 515, 755]),
  L(['9990001234567', 160, 750]),
  L(['Mata Uang/', 16, 735], ['Currency', 61, 735], [':', 148, 735], ['IDR', 160, 735]),
  L(['Saldo Akhir/', 298, 720], ['Closing Balance', 345, 720], [':', 446, 720], ['15.773.000,00', 515, 720]),
  L(['No', 20, 690], ['Date', 52, 690], ['Remarks', 124, 690], ['Amount (IDR)', 385, 690], ['Balance (IDR)', 523, 690]),
  // block 1: remarks above the amount line, reference below
  L(['Pembayaran Gopay Payment', 124, 657]),
  L(['01 Sep 2026', 52, 656]),
  L(['1', 20, 652], ['-122.000,00', 389, 652], ['878.000,00', 516, 652]),
  L(['08:33:06 WIB', 52, 647], ['60739082136545873', 124, 647]),
  // block 2: a transfer whose note sits under the time
  L(['Transfer ke BANK MANDIRI', 124, 618]),
  L(['02 Sep 2026', 52, 612]),
  L(['2', 20, 608], ['BUDI SANTOSO 1330000000000', 124, 608], ['-105.000,00', 376, 608], ['773.000,00', 519, 608]),
  L(['20:18:56 WIB', 52, 603]),
  L(['makan siang', 124, 598]),
  // block 3: salary credit
  L(['Transfer dari PT CONTOH GAJI', 124, 560]),
  L(['25 Sep 2026', 52, 559]),
  L(['3', 20, 555], ['+15.000.000,00', 378, 555], ['15.773.000,00', 516, 555]),
  L(['17:12:55 WIB', 52, 550]),
];

describe('parseMandiriLivin', () => {
  const [a] = parseMandiriLivin([page]);
  it('reads the header', () => {
    expect(a.label).toBe('Mandiri Tabungan Payroll 9990001234567');
    expect(a.currency).toBe('IDR');
    expect(a.closing_balance).toBe(15773000);
  });
  it('splits blocks and keeps remarks from above and below the amount line', () => {
    expect(a.transactions).toEqual([
      { date: '2026-09-01', description: 'Pembayaran Gopay Payment', amount: -122000, category: 'Transfer' },
      { date: '2026-09-02', description: 'Transfer ke BANK MANDIRI BUDI SANTOSO makan siang', amount: -105000, category: 'Food' },
      { date: '2026-09-25', description: 'Transfer dari PT CONTOH GAJI', amount: 15000000, category: 'Salary' },
    ]);
    expect(a.balanced).toBe(true);
  });
  it('flags a misread against the running balance', () => {
    const bad = page.map((l) => l.map((c) => (c.s === '-105.000,00' ? { ...c, s: '-10.500,00' } : c)));
    expect(parseMandiriLivin([bad])[0].balanced).toBe(false);
  });
});
