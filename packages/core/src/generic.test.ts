import { describe, expect, it } from 'vitest';
import { parseGeneric } from './generic';

// Synthetic statements in common layouts. Names and numbers are made up.
const lines = (s: string) => s.trim().split('\n').map((l) => [l]);

describe('parseGeneric', () => {
  it('reads a BCA-style statement: DD/MM dates, DB marker, running balance', () => {
    const [a] = parseGeneric(lines(`
REKENING TAHAPAN
NO. REKENING : 1234567890 PERIODE : SEPTEMBER 2026 MATA UANG : IDR
TANGGAL KETERANGAN CBG MUTASI SALDO
01/09 SALDO AWAL 5,000,000.00
01/09 TRSF E-BANKING CR 0109/FTSCY/WS95031 8,500,000.00 PT CONTOH MAJU GAJI 8,500,000.00 13,500,000.00
03/09 TARIKAN ATM 03/09 500,000.00 DB 13,000,000.00
05/09 TRANSAKSI DEBIT QRC014 GOFOOD 85,500.00 DB 12,914,500.00
30/09 BUNGA 1,250.35 12,915,750.35
SALDO AWAL : 5,000,000.00 MUTASI CR : 8,501,250.35 MUTASI DB : 585,500.00 SALDO AKHIR : 12,915,750.35`));
    expect(a.label).toBe('Bank 1234567890'); // "BCA" is not printed in this sample
    expect(a.transactions.map((t) => [t.date, t.amount])).toEqual([
      ['2026-09-01', 8_500_000], ['2026-09-03', -500_000], ['2026-09-05', -85_500], ['2026-09-30', 1250.35]]);
    expect(a.transactions[2].description).toBe('TRANSAKSI DEBIT GOFOOD');
    expect(a.closing_balance).toBe(12_915_750.35);
    expect(a.balanced).toBe(true);
  });

  it('reads separate debit/credit columns, row numbers, Indonesian number format and wrapped descriptions', () => {
    const [a] = parseGeneric(lines(`
Bank Sinarmas Rekening Koran Nomor Rekening: 0012 3456 78 Periode 01/09/2021 - 30/09/2021
No Tanggal Keterangan Debet Kredit Saldo
Saldo Awal 7.000.941,00
1 02/09/2021 10:15 Transfer dari BUDI 0,00 1.500.000,00 8.500.941,00
gaji bulanan
2 14/09/2021 Pembayaran PLN 250.000,00 0,00 8.250.941,00
Halaman 1 dari 1`));
    expect(a.label).toBe('Sinarmas 0012345678');
    expect(a.transactions.map((t) => [t.date, t.amount, t.description])).toEqual([
      ['2021-09-02', 1_500_000, 'Transfer dari BUDI gaji bulanan'], ['2021-09-14', -250_000, 'Pembayaran PLN']]);
    expect(a.closing_balance).toBe(8_250_941);
    expect(a.balanced).toBe(true);
  });

  it('reads a newest-first spreadsheet export with a signed amount column', () => {
    const [a] = parseGeneric([
      ['Date', 'Description', 'Amount', 'Balance'],
      ['2026-09-03 08:10:00', 'Kopi', '-45000', '955000'],
      ['2026-09-01', 'Top up', '1000000', '1000000'],
    ], true);
    expect(a.transactions.map((t) => [t.date, t.amount])).toEqual([['2026-09-01', 1_000_000], ['2026-09-03', -45_000]]);
    expect(a.balanced).toBe(true);
  });

  it('flags a balance that does not follow, and ignores files without dated amounts', () => {
    const [a] = parseGeneric(lines(`
Saldo Awal 100.000,00
01/09/2026 Belanja 20.000,00 D 80.000,00
02/09/2026 Belanja 10.000,00 D 75.000,00`));
    expect(a.balanced).toBe(false);
    expect(parseGeneric(lines('Ringkasan\nTotal 1.000.000,00'))).toEqual([]);
  });
});
