import type { Category } from './constants';

/** One visual line of a PDF page: text cells with their x position, left to right. */
export type Cell = { x: number; s: string };
export type Line = Cell[];

export type ParsedTxn = { date: string; description: string; amount: number; category: Category };
export type ParsedAccount = { label: string; currency: string; closing_balance: number | null; transactions: ParsedTxn[]; balanced: boolean };

const ACCOUNT_NO = /^\d{3}-\d{2}-\d{7}-\d$/;
const DAY = /^\d{2}\/\d{2}$/;
const AMOUNT = /^(\d{1,3}(?:,\d{3})*\.\d{2})( D)?$/;
const REF = /^-?[A-Z0-9]*\d[A-Z0-9-]{7,}$/; // reference numbers: long tokens with digits
const num = (s: string) => Number(s.replace(/,/g, ''));

/** Readable description: drop reference numbers, name transfers. */
function clean(parts: string[]): string {
  return parts.join(' ').replace(/MCM InhouseTrf-?/g, 'Transfer ').replace(/^-?UBP\S*/, 'UBP payment ').split(/\s+/)
    .filter((w) => w && !REF.test(w)).join(' ').replace(/^-\s*/, '').replace(/\s+-$/, '').trim();
}

type Work = {
  label: string; currency: string; closing: number | null; balanced: boolean;
  year: number; month: number; bal: number | null; rows: { date: string; amount: number; parts: string[] }[];
};

/**
 * Mandiri "Rekening Koran" / consolidated statement, savings sections.
 * Columns: date | value date | details | amount ("D" = debit) | running balance.
 * Every row is checked against the running balance; a misread sets balanced = false.
 */
export function parseMandiri(pages: Line[][]): ParsedAccount[] {
  const out: Work[] = [];
  let acc: Work | null = null;
  let parts: string[] | null = null; // details of the last row, extended by continuation lines

  for (const line of pages.flat()) {
    const texts = line.map((c) => c.s);
    const joined = texts.join(' ');
    // The account header on the transaction pages carries the period ("1/09/26 s/d").
    const no = line.find((c) => c.x < 60 && ACCOUNT_NO.test(c.s));
    const period = joined.match(/(\d{1,2})\/(\d{2})\/(\d{2}) s\/d/);
    if (no && period) {
      const product = texts.find((s) => s !== no.s && /^[A-Z][A-Z ]+$/.test(s)) ?? 'Tabungan';
      acc = { label: `Mandiri ${product} ${no.s}`, currency: /USD|Dollar/i.test(joined) ? 'USD' : 'IDR', closing: null, balanced: true,
        year: 2000 + Number(period[3]), month: Number(period[2]), bal: null, rows: [] };
      out.push(acc);
      parts = null;
      continue;
    }
    if (!acc) continue;

    if (texts.some((s) => s.startsWith('Saldo Akhir'))) {
      const v = texts.filter((s) => AMOUNT.test(s)).pop();
      if (v) acc.closing = num(v);
      parts = null;
      continue;
    }
    if (line[0] && line[0].x < 80 && DAY.test(line[0].s)) {
      const amounts = line.filter((c) => AMOUNT.test(c.s));
      parts = null;
      if (texts.includes('Saldo Awal')) { acc.bal = amounts.length ? num(amounts[amounts.length - 1].s) : null; continue; }
      if (amounts.length < 2) continue;
      const [amtCell, balCell] = amounts.slice(-2);
      const m = amtCell.s.match(AMOUNT)!;
      const amount = (m[2] ? -1 : 1) * num(m[1]);
      const balance = num(balCell.s);
      if (acc.bal != null && Math.abs(acc.bal + amount - balance) > 0.005) acc.balanced = false;
      acc.bal = balance;
      const [dd, mm] = line[0].s.split('/').map(Number);
      const year = mm < acc.month ? acc.year + 1 : acc.year; // a Dec→Jan period
      parts = line.filter((c) => c.x >= 120 && c.x < amtCell.x - 5).map((c) => c.s);
      acc.rows.push({ date: `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`, amount, parts });
      continue;
    }
    // A continuation line holds only text in the details column (summary lines have a ':' cell).
    if (parts && line.length && line.every((c) => c.x >= 120 && c.x < 450) && !texts.includes(':')) parts.push(...texts);
    else parts = null;
  }

  return out.map((a) => ({
    label: a.label, currency: a.currency, closing_balance: a.closing ?? a.bal, balanced: a.balanced,
    transactions: a.rows.map((r) => {
      const description = clean(r.parts) || (r.amount < 0 ? 'Payment' : 'Credit');
      return { date: r.date, description, amount: r.amount, category: categorize(description, r.amount) };
    }),
  }));
}

// Keyword rules, first match wins. The user can tap to change any category before importing.
const RULES: [Category, RegExp][] = [
  ['Salary', /\b(GAJI|PAYROLL|SALARY|THR)\b/i],
  ['Investment', /BIBIT|AJAIB|BAREKSA|STOCKBIT|IPOT|INDOPREMIER|MIRAE|PINTU|INDODAX|TOKOCRYPTO|REKSA|\bSBN\b|\bORI\b|\bSBR\b|DEPOSITO|SAHAM/i],
  ['Bills', /PLN|TELKOM|INDIHOME|BPJS|PDAM|PULSA|TELKOMSEL|XL ?AXIATA|INDOSAT|SMARTFREN|BIZNET|FIRST ?MEDIA|ASURANSI|PREMI|CICILAN|ANGSURAN|KARTU KREDIT|CREDIT CARD|BIAYA ADM|CARD CHARGE|PAJAK|NETFLIX|SPOTIFY|YOUTUBE|\bKOS\b/i],
  ['Food', /MAKAN|NASGOR|\bNASI\b|MCDONALD|KFC|BURGER|PIZZA|STARBUCKS|KOPI|COFFEE|CAFE|RESTO|BAKSO|SATE|\bMIE\b|AYAM|WARUNG|GOFOOD|GRABFOOD|SHOPEEFOOD|BAKERY|HOKBEN|SOLARIA|CHATIME|MIXUE/i],
  ['Transport', /GOJEK|GO-JEK|GRAB(?!FOOD)|MAXIM|\bKRL\b|\bMRT\b|\bLRT\b|TRANSJAKARTA|\bKAI\b|PERTAMINA|SPBU|SHELL|\bTOL\b|PARKIR|TRAVELOKA|TIKET|GARUDA|CITILINK|LION ?AIR|BLUEBIRD/i],
  ['Shopping', /TOKOPEDIA|SHOPEE|LAZADA|BLIBLI|TIKTOK|INDOMARET|ALFAMART|ALFAMIDI|SUPERINDO|HYPERMART|TRANSMART|LOTTE|IKEA|UNIQLO|ZALORA|ACE HARDWARE|MATAHARI/i],
  ['Transfer', /TRANSFER|\bTRF\b|BI-FAST|BIFAST|\bKE\b|\bDARI\b|TOP ?UP|GOPAY|\bOVO\b|\bDANA\b|SHOPEEPAY|\bFLIP\b/i],
];

export function categorize(description: string, amount: number): Category {
  for (const [cat, re] of RULES) if (re.test(description)) return cat === 'Salary' && amount < 0 ? 'Transfer' : cat;
  return amount > 0 ? 'Income' : 'Other';
}
