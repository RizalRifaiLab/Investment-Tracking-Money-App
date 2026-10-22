import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CATEGORIES } from "@nilai/core";

// ARCHITECTURE.md: Haiku for statement parsing and briefs (cheap, high volume).
export const MODEL = "claude-haiku-5-5";
const client = () => new Anthropic(); // ANTHROPIC_API_KEY from the server env

/** Streams (outputs can be long) and validates the JSON answer against `schema`. */
async function structured<T extends z.ZodType>(schema: T, system: string, user: string, effort: "low" | "medium"): Promise<z.infer<T>> {
  const msg = await client().messages.stream({
    model: MODEL, max_tokens: 64000, system,
    output_config: { format: zodOutputFormat(schema), effort },
    messages: [{ role: "user", content: user }],
  }).finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("The AI declined to read this file.");
  if (msg.stop_reason === "max_tokens") throw new Error("The statement is too long to read in one go. Try a shorter period.");
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return schema.parse(JSON.parse(text));
}

const Statement = z.object({
  accounts: z.array(z.object({
    label: z.string().describe("Account name and number as printed, e.g. 'Tabungan Mandiri 123-00-xxxx'"),
    currency: z.string().describe("ISO code, e.g. IDR or USD"),
    closing_balance: z.number().nullable(),
    transactions: z.array(z.object({
      date: z.string().describe("YYYY-MM-DD"),
      description: z.string(),
      amount: z.number().describe("Positive = money in (CR/kredit), negative = money out (DB/debet), in the account currency"),
      category: z.enum(CATEGORIES),
    })),
  })),
});
export type ParsedStatement = z.infer<typeof Statement>;

export function parseStatement(text: string) {
  return structured(Statement,
    "You extract transactions from Indonesian bank statements (Mandiri, BCA, BRI, BNI, Jago, Jenius and others), including consolidated statements that list several accounts.",
    `Extract every transaction, grouped by account. A consolidated statement (for example Mandiri "Laporan Konsolidasi") lists several accounts: return each one separately; skip sections that are summaries only.
Rules:
- Amounts are plain numbers in the account currency. Indonesian format "1.250.000,00" means 1250000. CR/Kredit/Masuk is positive, DB/Debet/Keluar is negative.
- Dates as YYYY-MM-DD; infer the year from the statement period.
- Skip opening/closing balance lines and running-balance columns. closing_balance is the account's final balance, or null if not printed.
- Category: Salary for payroll/gaji/salary credits; Transfer for transfers between own accounts or to people; Investment for securities, mutual funds, crypto exchanges, deposito placements; Bills for utilities, phone, internet, rent, insurance, loan instalments; then Food, Transport, Shopping, Income (other money in), Other.
- description: short and readable, without reference numbers.

STATEMENT:
${text}`, "low");
}

const Insights = z.object({
  items: z.array(z.object({
    k: z.string().describe("One or two word label"),
    title: z.string().describe("One sentence with a specific finding or action and IDR amount"),
    body: z.string().describe("One or two short sentences explaining why"),
  })),
});
export type Insight = z.infer<typeof Insights>["items"][number];

export async function analyseMonth(summary: string, lang: "en" | "id"): Promise<Insight[]> {
  const r = await structured(Insights,
    `You review one month of a personal cash flow for an Indonesian user of Nilai. Reply in ${lang === "id" ? "Bahasa Indonesia" : "English"}. Write IDR amounts like "Rp 2,5 jt" or "Rp 1,2 M". Be specific and practical; no generic advice.`,
    `Give exactly 3 items, most important first: where the money went (top spending), what to watch (unusual items, categories rising versus the previous months, or money out above money in), and one concrete action. Base everything only on these numbers.

${summary}`, "medium");
  return r.items.slice(0, 3);
}
