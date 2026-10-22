import type { Category } from './constants';

/** One visual line of a PDF page: text cells with their x (and baseline y) position, left to right. */
export type Cell = { x: number; y?: number; s: string };
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

const MONTHS: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Mei: 5, Jun: 6, Jul: 7, Aug: 8, Agu: 8, Agt: 8, Sep: 9, Oct: 10, Okt: 10, Nov: 11, Dec: 12, Des: 12 };
const ID_AMOUNT = /^[+-]\d{1,3}(?:\.\d{3})*,\d{2}$/; // +1.100.000,00
const ID_BALANCE = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/;
const idNum = (s: string) => Number(s.replace(/[+.]/g, '').replace(',', '.'));
const LONG_DATE = /^(\d{2}) ([A-Za-z]{3}) (\d{4})$/;

/**
 * Mandiri Livin' e-Statement ("No | Tanggal | Keterangan | Nominal | Saldo"). Each transaction is a block of lines with the
 * amount line in the middle and remarks above and below it; blocks are separated by a vertical gap.
 * Every row is checked against the running balance; a misread sets balanced = false.
 */
export function parseMandiriLivin(pages: Line[][]): ParsedAccount[] {
  const all = pages.flat();
  const text = all.map((l) => l.map((c) => c.s).join(' ')).join('\n');
  const accountNo = text.match(/\b(\d{13})\b/)?.[1] ?? '';
  const product = all.find((l) => l.length === 1 && l[0].x < 40 && /^(Tabungan|Giro)\b/.test(l[0].s))?.[0].s ?? 'Tabungan';
  const currency = text.match(/Currency\s*:\s*([A-Z]{3})/)?.[1] ?? 'IDR';
  const after = (label: RegExp) => { const l = all.find((x) => x.some((c) => label.test(c.s))); const v = l?.map((c) => c.s.replace(/^[+-] /, '')).filter((s) => ID_BALANCE.test(s)).pop(); return v != null ? idNum(v) : null; };
  let bal = after(/^Saldo Awal/);
  const closing = after(/^Saldo Akhir/);
  const acc: ParsedAccount = { label: `Mandiri ${product} ${accountNo}`.trim(), currency, closing_balance: closing, transactions: [], balanced: true };

  for (const page of pages) {
    // split the page into blocks wherever the gap between consecutive lines is large
    const blocks: Line[][] = [];
    let prevY: number | null = null;
    for (const line of page) {
      const y = line[0]?.y ?? 0;
      if (prevY == null || prevY - y > 14) blocks.push([]);
      blocks[blocks.length - 1].push(line);
      prevY = y;
    }
    for (const block of blocks) {
      const cells = block.flat();
      const amt = cells.find((c) => ID_AMOUNT.test(c.s));
      const balCell = cells.find((c) => c !== amt && c.x > 450 && ID_BALANCE.test(c.s));
      const no = cells.find((c) => c.x < 40 && /^\d+$/.test(c.s));
      const date = cells.map((c) => c.s.match(LONG_DATE)).find(Boolean);
      if (!amt || !balCell || !no || !date) continue;
      const amount = idNum(amt.s), balance = idNum(balCell.s);
      if (bal != null && Math.abs(bal + amount - balance) > 0.005) acc.balanced = false;
      bal = balance;
      const parts = block.flatMap((l) => l.filter((c) => c.x >= 100 && c.x < amt.x - 5).map((c) => c.s));
      const description = clean(parts) || (amount < 0 ? 'Payment' : 'Credit');
      acc.transactions.push({
        date: `${date[3]}-${String(MONTHS[date[2]] ?? 1).padStart(2, '0')}-${date[1]}`,
        description, amount, category: categorize(description, amount),
      });
    }
  }
  if (acc.closing_balance == null) acc.closing_balance = bal;
  return acc.transactions.length ? [acc] : [];
}

// Keyword rules, first match wins. The user can tap to change any category before importing.
const RULES: [Category, RegExp][] = [
  ['Salary', /\b(GAJI|PAYROLL|SALARY|THR)\b/i],
  ['Investment', /BIBIT|AJAIB|BAREKSA|STOCKBIT|IPOT|INDOPREMIER|MIRAE|PINTU|INDODAX|TOKOCRYPTO|REKSA|\bSBN\b|\bORI\b|\bSBR\b|DEPOSITO|SAHAM/i],
  ['Bills', /PAYLATER|KREDIVO|AKULAKU|BIAYA|PLN|TELKOM|INDIHOME|BPJS|PDAM|PULSA|TELKOMSEL|XL ?AXIATA|INDOSAT|SMARTFREN|BIZNET|FIRST ?MEDIA|ASURANSI|PREMI|CICILAN|ANGSURAN|KARTU KREDIT|CREDIT CARD|BIAYA ADM|CARD CHARGE|PAJAK|NETFLIX|SPOTIFY|YOUTUBE|\bKOS\b/i],
  ['Food', /MAKAN|NASGOR|\bNASI\b|MCDONALD|KFC|BURGER|PIZZA|STARBUCKS|KOPI|COFFEE|CAFE|RESTO|BAKSO|SATE|\bMIE\b|AYAM|WARUNG|GOFOOD|GRABFOOD|SHOPEEFOOD|BAKERY|HOKBEN|SOLARIA|CHATIME|MIXUE/i],
  ['Transport', /GOJEK|GO-JEK|GRAB(?!FOOD)|MAXIM|\bKRL\b|\bMRT\b|\bLRT\b|TRANSJAKARTA|\bKAI\b|PERTAMINA|SPBU|SHELL|\bTOL\b|PARKIR|TRAVELOKA|TIKET|GARUDA|CITILINK|LION ?AIR|BLUEBIRD/i],
  ['Shopping', /TOKOPEDIA|SHOPEE|LAZADA|BLIBLI|TIKTOK|INDOMARET|ALFAMART|ALFAMIDI|SUPERINDO|HYPERMART|TRANSMART|LOTTE|IKEA|UNIQLO|ZALORA|ACE HARDWARE|MATAHARI/i],
  ['Transfer', /TRANSFER|\bTRF\b|BI-FAST|BIFAST|\bKE\b|\bDARI\b|TOP ?UP|GOPAY|\bOVO\b|\bDANA\b|SHOPEEPAY|\bFLIP\b/i],
];

export function categorize(description: string, amount: number): Category {
  for (const [cat, re] of RULES) if (re.test(description)) return cat === 'Salary' && amount < 0 ? 'Transfer' : cat;
  return amount > 0 ? 'Income' : 'Other';
}

/**
 * Combine statements from several files: the same account (by account-number digits + currency) is merged, a month that
 * appears in two files is taken from the later file, and the closing balance comes from the most recent period.
 */
export function mergeStatements(files: ParsedAccount[][]): ParsedAccount[] {
  const byKey = new Map<string, { acc: ParsedAccount; months: Map<string, ParsedTxn[]>; lastDate: string }>();
  for (const file of files) for (const a of file) {
    const key = a.currency + ':' + (a.label.replace(/\D/g, '') || a.label);
    const e = byKey.get(key) ?? byKey.set(key, { acc: { ...a, transactions: [] }, months: new Map(), lastDate: '' }).get(key)!;
    const months = new Map<string, ParsedTxn[]>();
    for (const x of a.transactions) (months.get(x.date.slice(0, 7)) ?? months.set(x.date.slice(0, 7), []).get(x.date.slice(0, 7))!).push(x);
    for (const [m, rows] of months) e.months.set(m, rows); // later file replaces that month
    const last = a.transactions.map((x) => x.date).sort().pop() ?? '';
    if (last >= e.lastDate) { e.lastDate = last; e.acc.closing_balance = a.closing_balance; e.acc.label = a.label; }
    e.acc.balanced &&= a.balanced;
  }
  return [...byKey.values()].map(({ acc, months }) => ({
    ...acc, transactions: [...months.keys()].sort().flatMap((m) => months.get(m)!.slice().sort((x, y) => x.date.localeCompare(y.date))),
  }));
}
