import { z } from "zod";
import { addsUp, CATEGORIES, type ParsedAccount } from "@nilai/core";
import type { ChatMsg } from "./advisor";

// Reader for statements the rule-based Mandiri parsers do not cover, using the user's own AI (DeepSeek or Claude).
const num = z.coerce.number();
const Statement = z.object({
  accounts: z.array(z.object({
    label: z.string(),
    currency: z.string().catch("IDR"),
    opening_balance: num.nullable().catch(null),
    closing_balance: num.nullable().catch(null),
    transactions: z.array(z.object({ date: z.string(), description: z.string().catch(""), amount: num, category: z.enum(CATEGORIES).catch("Other") })),
  })),
});

const SYSTEM = `You extract transactions from Indonesian bank and e-wallet statements and reply with JSON only.
Formats you will meet (text comes from a PDF, Excel or CSV export, columns separated by spaces or commas):
- Mandiri: "Tanggal | Keterangan | Debit/Kredit | Saldo"; a consolidated statement ("Laporan Konsolidasi") lists several accounts.
- BCA e-Statement / KlikBCA: "TANGGAL KETERANGAN CBG MUTASI SALDO"; dates DD/MM; a debit has "DB" after the amount, a credit has "CR" or nothing; "SALDO AWAL" is the opening balance.
- BRI (BRImo): "Tanggal Transaksi | Uraian Transaksi | Teller | Debet | Kredit | Saldo".
- BNI: "Tanggal | Uraian | Debet/Kredit (D/K) | Saldo", or separate Debit and Credit columns.
- BSI, CIMB Niaga, Permata, Danamon, OCBC, BTN: separate Debit/Credit (Debet/Kredit) columns plus running balance.
- Digital banks (Jago, Jenius/SMBC, SeaBank, blu by BCA Digital, Bank Neo, Allo, Superbank) and e-wallets (GoPay, OVO, DANA, ShopeePay): one signed amount per row, or "Masuk/Keluar", "Uang masuk/Uang keluar", "+/-".
- Credit cards: purchases are money out (negative), payments to the card are money in (positive).`;

const RULES = `Return {"accounts":[{"label","currency","opening_balance","closing_balance","transactions":[{"date","description","amount","category"}]}]}.
- One entry per account. label: bank, product and account number as printed, e.g. "BCA Tahapan 123xxxx890". currency: ISO code (IDR, USD, …).
- amount: a plain JSON number in the account currency; positive = money in (CR, Kredit, Masuk), negative = money out (DB, Debet, D, Keluar).
- Numbers may be "1,250,000.00" (BCA, Mandiri, BRI) or "1.250.000,00": the last separator followed by exactly 2 digits is the decimal point; both mean 1250000.
- The running balance (Saldo) column is not an amount. Use the balance changes to decide the sign when the debit/credit marker is unclear.
- opening_balance: "Saldo Awal"/opening balance, closing_balance: "Saldo Akhir"/closing balance; null if not printed. Never list them as transactions.
- date: YYYY-MM-DD; infer the year from the statement period.
- description: short and readable, without reference numbers.
- category, one of: Salary (payroll, gaji), Transfer (between people or own accounts), Investment (securities, reksa dana, crypto exchanges, deposito), Bills (utilities, phone, internet, rent, insurance, loan instalments, card fees), Food, Transport, Shopping, Income (other money in), Other.
- Skip summary-only sections. Extract every transaction; do not invent any.`;

/** Raises SyntaxError / ZodError when the reply is not usable; the caller reports it. */
export async function parseStatement(text: string, ask: (m: ChatMsg[], json: boolean, maxTokens: number) => Promise<string>): Promise<{ accounts: ParsedAccount[] }> {
  const reply = await ask([{ role: "system", content: SYSTEM }, { role: "user", content: `${RULES}\n\nSTATEMENT:\n${text}` }], true, 64_000);
  const j = Statement.parse(JSON.parse(reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1)));
  return {
    accounts: j.accounts.filter((a) => a.transactions.length).map(({ opening_balance, ...a }) =>
      ({ ...a, balanced: addsUp(opening_balance, a.closing_balance, a.transactions) })),
  };
}
