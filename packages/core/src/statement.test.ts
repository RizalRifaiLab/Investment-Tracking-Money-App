import { describe, expect, it } from 'vitest';
import { addsUp, categorize, parseMandiri, type Line } from './statement';

// Synthetic statement in Mandiri's layout (cell text @ x position). Names and numbers are made up.
const L = (...cells: [string, number][]): Line => cells.map(([s, x]) => ({ s, x }));
const page1: Line[] = [
  L(['Ringkasan Akun /', 40]),
  L(['999-00-1234567-8', 40], ['MANDIRI TAB', 132], ['30/09/26', 239], ['66,000.00', 582]), // summary page: no "s/d", ignored
  L(['999-00-1234567-8', 40], ['MANDIRI TAB', 127], ['12610 - KCP Contoh', 236], ['1/09/26 s/d', 400], ['Indonesian', 472], ['1,234.00', 580]),
  L(['PAYROLL', 127], ['30/09/26', 400], ['Rupiah', 472]),
  L(['Tanggal', 40], ['Tanggal', 97], ['Rincian Transaksi / Nomor Referensi', 140], ['Debit / Kredit', 470], ['Saldo', 604]),
  L(['01/09', 40], ['Saldo Awal', 140], ['1,000,000.00', 579]),
  L(['01/09', 40], ['01/09', 97], ['-UBP60146073901FFFFFF6073908213', 140], ['122,500.00 D', 469], ['877,500.00', 579]),
  L(['02/09', 40], ['02/09', 97], ['MCM InhouseTrf-', 140], ['200,000.00 D', 461], ['677,500.00', 579]),
  L(['KE BUDI SANTOSO', 140]),
  L(['Kos', 140]),
  L(['Hal', 545], ['Page 1 of 2', 590]),
];
const page2: Line[] = [
  L(['Tanggal', 40], ['Tanggal', 97], ['Rincian Transaksi / Nomor Referensi', 140]),
  L(['25/09', 40], ['25/09', 97], ['GAJI PT CONTOH JAYA', 140], ['15,000,000.00', 455], ['15,677,500.00', 579]),
  L(['30/09', 40], ['30/09', 97], ['-609701124831', 140], ['62,000.00 D', 474], ['15,615,500.00', 579]),
  L(["MCDONALD'S SOK 47701", 140]),
  L(['000885004191418-A0GS5900', 140]),
  L(['30/09', 40], ['30/09', 97], ['Bunga -', 140], ['2,715.08', 480], ['15,618,215.08', 579]),
  L(['Saldo Awal /', 272], ['Previous Balance', 330], [':', 481], ['1,000,000.00', 579]),
  L(['Saldo Akhir /', 272], ['Current Balance', 332], [':', 481], ['15,618,215.08', 579]),
];

describe('parseMandiri', () => {
  const [a] = parseMandiri([page1, page2]);
  it('finds the account from the transaction section only', () => {
    expect(parseMandiri([page1, page2])).toHaveLength(1);
    expect(a.label).toBe('Mandiri MANDIRI TAB 999-00-1234567-8');
    expect(a.currency).toBe('IDR');
  });
  it('reads rows, signs, dates and closing balance', () => {
    expect(a.transactions.map((x) => [x.date, x.amount])).toEqual([
      ['2026-09-01', -122500], ['2026-09-02', -200000], ['2026-09-25', 15000000], ['2026-09-30', -62000], ['2026-09-30', 2715.08],
    ]);
    expect(a.closing_balance).toBe(15618215.08);
    expect(a.balanced).toBe(true);
  });
  it('builds readable descriptions across lines', () => {
    expect(a.transactions[1].description).toBe('Transfer KE BUDI SANTOSO Kos');
    expect(a.transactions[3].description).toBe("MCDONALD'S SOK 47701");
    expect(a.transactions[0].description).toBe('UBP payment');
  });
  it('categorises', () => {
    expect(a.transactions.map((x) => x.category)).toEqual(['Other', 'Bills', 'Salary', 'Food', 'Income']) // 'Kos' note = rent;
  });
  it('flags a misread when the running balance does not add up', () => {
    const bad = page2.map((l) => l.map((c) => (c.s === '15,000,000.00' ? { ...c, s: '1,500,000.00' } : c)));
    expect(parseMandiri([page1, bad])[0].balanced).toBe(false);
  });
});

describe('categorize', () => {
  it('rules', () => {
    expect(categorize('TOKOPEDIA', -1)).toBe('Shopping');
    expect(categorize('PLN PREPAID', -1)).toBe('Bills');
    expect(categorize('BIBIT REKSADANA', -1)).toBe('Investment');
    expect(categorize('GRAB* A-123', -1)).toBe('Transport');
    expect(categorize('GRABFOOD', -1)).toBe('Food');
    expect(categorize('something', 5)).toBe('Income');
    expect(categorize('Transfer KE BIBI makan siang', -1)).toBe('Food');
    expect(categorize('MONTHLY CARD CHARGE 04-09-26', -1)).toBe('Bills');
  });
});

describe('addsUp', () => {
  it('checks opening + transactions against the closing balance, and passes when a balance is unknown', () => {
    const tx = [{ amount: 250_000.1 }, { amount: -100_000 }];
    expect(addsUp(1_000_000, 1_150_000.1, tx)).toBe(true);
    expect(addsUp(1_000_000, 1_250_000, tx)).toBe(false);
    expect(addsUp(null, 1_250_000, tx)).toBe(true);
  });
});
