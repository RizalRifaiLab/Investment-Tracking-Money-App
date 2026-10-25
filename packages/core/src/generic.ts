import { addsUp, categorize, MONTHS, type ParsedAccount, type ParsedTxn } from './statement';

// Any bank or e-wallet statement without a dedicated parser: general rules, no AI.

const BANKS = ['BCA', 'BRI', 'BNI', 'BSI', 'BTN', 'CIMB Niaga', 'Permata', 'Danamon', 'OCBC', 'Sinarmas', 'Mega', 'Panin', 'Maybank', 'UOB', 'DBS', 'HSBC',
  'Jago', 'Jenius', 'SeaBank', 'blu', 'Allo', 'Superbank', 'GoPay', 'OVO', 'DANA', 'ShopeePay'];
const MONEY = /^[-+]?(?:Rp\.?)?(?:\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d{1,3}(?:[.,]\d{3})+)$/i; // 1,250,000.00 · 1.250.000,00 · Rp8.500.000
const PLAIN = /^[-+]?\d+(?:[.,]\d{1,2})?$/; // spreadsheet cells: 8500000 or 8500000.50
const MARK = /^(DB|DR|D|DEBIT|DEBET|CR|K|KREDIT|CREDIT)$/i;
const DATE = /^(?:(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2}))?|(\d{4})-(\d{2})-(\d{2})|(\d{1,2})[ -]([A-Za-z]{3,9})(?:[ -](\d{4}|\d{2}))?)(?=[\sT]|$)/;
const OPEN = /(?:saldo awal|opening balance|beginning balance|saldo sebelumnya|previous balance)\s*:?\s*(?:IDR|Rp\.?)?\s*([-+]?\d[\d.,]*)/i;
const CLOSE = /(?:saldo akhir|closing balance|ending balance)\s*:?\s*(?:IDR|Rp\.?)?\s*([-+]?\d[\d.,]*)/i;
const NOT_DESC = /halaman|page|saldo|total|jumlah|mutasi|tanggal|keterangan|balance|dicetak|printed/i;

/** "1.250.000,00" or "1,250,000.00" → 1250000: a last separator followed by 1–2 digits is the decimal point. */
function money(s: string): number {
  const d = s.replace(/[^\d.,]/g, ''), m = d.match(/^(.*)[.,](\d{1,2})$/);
  const v = Number((m ? m[1] : d).replace(/[.,]/g, '') + (m ? '.' + m[2] : ''));
  return s.trim().startsWith('-') ? -v : v;
}

/** Date at the start of a row (a row number may come first) → [year | null, month, day] and the index of the next token. */
function dateAt(tokens: string[], tabular: boolean): { ymd: [number | null, number, number]; next: number } | null {
  for (let s = 0; s < Math.min(2, tokens.length); s++) {
    const m = (tabular ? tokens[s] : tokens.slice(s, s + 3).join(' ')).match(DATE);
    if (m) {
      const [d, mo, y] = m[1] ? [m[1], Number(m[2]), m[3]] : m[4] ? [m[6], Number(m[5]), m[4]]
        : [m[7], MONTHS[m[8][0].toUpperCase() + m[8].slice(1, 3).toLowerCase()], m[9]];
      if (!(mo >= 1 && mo <= 12 && +d >= 1 && +d <= 31)) return null;
      return { ymd: [y ? (y.length === 2 ? 2000 + +y : +y) : null, mo, +d], next: s + (tabular ? 1 : m[0].split(' ').length) };
    }
    if (!/^\d{1,4}$/.test(tokens[s])) break; // only a row number may come before the date
  }
  return null;
}

/**
 * Statement as text rows: PDF lines, or spreadsheet/CSV rows when `tabular`. A transaction is a row starting with a date.
 * When the row ends with a running balance, the change in balance gives the amount and its sign whatever the layout
 * (DB/CR, D/K, separate debit and credit columns); otherwise the sign comes from a DB/CR marker or a minus sign.
 * Anything that cannot be verified sets balanced = false so the user checks it before importing.
 * shortcut: one account per file and no Dec→Jan year rollover; split by account header if a bank needs it.
 */
export function parseGeneric(lines: string[][], tabular = false): ParsedAccount[] {
  const rows = lines.map((l) => (tabular ? l.map((c) => String(c ?? '').trim()).filter(Boolean) : l.join(' ').split(/\s+/).filter(Boolean)));
  const text = rows.map((r) => r.join(' ')).join('\n');
  const isMoney = (t: string) => MONEY.test(t) || (tabular && PLAIN.test(t));
  const labelled = (re: RegExp) => rows.flatMap((r) => {
    const v = r.join(' ').match(re)?.[1].replace(/[.,]$/, '');
    return v && isMoney(v) ? [money(v)] : [];
  });
  const opening = labelled(OPEN)[0] ?? null, closing = labelled(CLOSE).pop() ?? null;
  const year = Number(text.match(/\b(20\d{2})\b/)?.[1] ?? new Date().getFullYear());

  type Raw = { date: string; amounts: { v: number; sign: number }[]; desc: string[]; extra: number };
  const raws: Raw[] = [];
  let last: Raw | null = null;
  for (const r of rows) {
    const joined = r.join(' ');
    if (OPEN.test(joined) || CLOSE.test(joined)) { last = null; continue; }
    const at = dateAt(r, tabular);
    if (!at) { // a description that wraps onto the next line
      if (last && last.extra < 2 && !r.some(isMoney) && !NOT_DESC.test(joined)) { last.desc.push(joined); last.extra++; }
      continue;
    }
    const amounts: Raw['amounts'] = [], desc: string[] = [];
    const rest = r.slice(at.next);
    rest.forEach((t, i) => {
      if (isMoney(t)) {
        const mark = rest[i + 1]?.match(MARK)?.[1].toUpperCase();
        amounts.push({ v: money(t), sign: t.startsWith('-') ? -1 : t.startsWith('+') ? 1 : mark ? (mark.startsWith('D') ? -1 : 1) : 0 });
      } else if (!(MARK.test(t) && i > 0 && isMoney(rest[i - 1])) && !/^(Rp\.?|IDR)$/i.test(t) && !/\d{3,}|\d:\d|\d.*\/|\/.*\d/.test(t)) desc.push(t); // drop codes, times, references
    });
    const [y, m, d] = at.ymd;
    last = amounts.length ? { date: `${y ?? year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, amounts, desc, extra: 0 } : null;
    if (last) raws.push(last);
  }
  if (raws.length > 1 && raws[0].date > raws[raws.length - 1].date) raws.reverse(); // newest-first exports
  const minusUsed = raws.some((r) => r.amounts.some((a) => a.v < 0)); // a signed amount column: unsigned means money in

  let prev: number | null = opening, ok = true, hasBalance = false;
  const transactions: ParsedTxn[] = [];
  for (const r of raws) {
    const bal = r.amounts.length > 1 ? r.amounts[r.amounts.length - 1].v : null;
    const cands = (bal === null ? r.amounts : r.amounts.slice(0, -1)).filter((a) => a.v !== 0);
    let amount: number | undefined;
    if (bal !== null) {
      hasBalance = true;
      const delta: number = prev === null ? NaN : Math.round((bal - prev) * 100) / 100;
      if (cands.some((a) => Math.abs(Math.abs(a.v) - Math.abs(delta)) < 0.005)) amount = delta;
    }
    if (amount === undefined && cands[0]) {
      const c = cands[0], sure = c.sign !== 0 || minusUsed;
      amount = (sure ? c.sign || 1 : -1) * Math.abs(c.v); // unknown sign: assume money out and flag it
      if (!sure || (bal !== null && prev !== null)) ok = false; // a balance that does not follow means a misread
    }
    prev = bal ?? (prev === null ? null : prev + (amount ?? 0));
    if (!amount) continue;
    const description = r.desc.join(' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    transactions.push({ date: r.date, description, amount, category: categorize(description, amount) });
  }
  if (!transactions.length) return [];

  const bank = BANKS.find((b) => new RegExp(`\\b${b}\\b`, b.length >= 5 ? 'i' : '').test(text)) ?? 'Bank';
  const no = text.match(/(?:no\.?\s*rek(?:ening)?|nomor rekening|account\s*(?:no\.?|number)|rekening)\s*[:.]?\s*(\d[\d -]{5,}\d)/i)?.[1].replace(/\s/g, '') ?? '';
  const currency = text.match(/(?:mata uang|currency)\s*:?\s*([A-Z]{3})\b/i)?.[1].toUpperCase() ?? 'IDR';
  return [{
    label: `${bank} ${no}`.trim(), currency, closing_balance: closing ?? (hasBalance ? prev : null), transactions,
    balanced: ok && addsUp(opening, closing, transactions) && (hasBalance || (opening !== null && closing !== null)),
  }];
}
