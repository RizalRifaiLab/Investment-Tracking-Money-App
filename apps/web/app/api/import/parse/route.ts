import { getDocumentProxy } from "unpdf";
import * as XLSX from "xlsx";
import { parseGeneric, parseMandiri, parseMandiriLivin, type Line, type ParsedAccount } from "@nilai/core";
import { AiError, userAi } from "@/lib/advisor";
import { parseStatement } from "@/lib/ai";
import { userFromRequest } from "@/lib/prices";

export const maxDuration = 300; // AI reading of a long statement
const MAX_BYTES = 4 * 1024 * 1024; // Vercel request body limit is 4.5 MB

/** PDF pages → visual lines of {x, text} cells (items on the same baseline, left to right). */
async function pdfLines(bytes: Uint8Array, password?: string): Promise<Line[][]> {
  const pdf = await getDocumentProxy(bytes, { password });
  const pages: Line[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const rows = new Map<number, Line>();
    for (const it of (await (await pdf.getPage(p)).getTextContent()).items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      (rows.get(y) ?? rows.set(y, []).get(y)!).push({ x: Math.round(it.transform[4]), y, s: it.str.trim() });
    }
    pages.push([...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, cells]) => cells.sort((a, b) => a.x - b.x)));
  }
  return pages;
}

// POST multipart {file, password?} → transactions grouped by account, for the user to review.
// Nothing is stored here, and neither the file, its contents nor the password is logged.
export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const password = String(form.get("password") ?? "") || undefined;
  if (!(file instanceof File)) return Response.json({ code: "noFile" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ code: "tooBig" }, { status: 413 });

  const ext = file.name.split(".").pop()?.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "", rules: ParsedAccount[] = [];
  try {
    if (ext === "pdf") {
      const pages = await pdfLines(bytes, password);
      text = pages.map((p) => p.map((l) => l.map((c) => c.s).join(" ")).join("\n")).join("\n");
      // Mandiri Livin' e-Statement (downloaded in the app) or the emailed Rekening Koran / consolidated statement
      const accounts = /Nominal \(IDR\)/.test(text) ? parseMandiriLivin(pages)
        : /bankmandiri|Rekening Koran/i.test(text) ? parseMandiri(pages).filter((a) => a.transactions.length) : [];
      if (accounts.length) return Response.json({ accounts, parser: "mandiri" });
      rules = parseGeneric(pages.flat().map((l) => l.map((c) => c.s)));
    } else if (["xlsx", "xls", "csv", "txt"].includes(ext ?? "")) {
      // CSV text like "01/09/2026" stays as written (raw); Excel date cells print as ISO instead of US m/d/yy (dateNF)
      const wb = ext === "csv" || ext === "txt" ? XLSX.read(new TextDecoder().decode(bytes), { type: "string", raw: true }) : XLSX.read(bytes, { dateNF: "yyyy-mm-dd" });
      text = wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join("\n");
      rules = parseGeneric(wb.SheetNames.flatMap((n) => XLSX.utils.sheet_to_json<string[]>(wb.Sheets[n], { header: 1, raw: false })), true);
    } else return Response.json({ code: "type" }, { status: 400 });
  } catch (e) {
    if ((e as { name?: string }).name === "PasswordException") return Response.json({ code: password ? "badPassword" : "needPassword" }, { status: 422 });
    return Response.json({ code: "read" }, { status: 422 });
  }
  if (!text.trim()) return Response.json({ code: "empty" }, { status: 422 });

  // Other banks, e-wallets and spreadsheets: general rules first (free). The user's AI only reads what the rules could not
  // verify against the balances, and only when they have a key in Advisor settings.
  if (rules[0]?.balanced) return Response.json({ accounts: rules, parser: "rules" });
  const ai = await userAi(user.id);
  if (!ai.apiKey) return rules.length ? Response.json({ accounts: rules, parser: "rules" }) : Response.json({ code: "unsupported" }, { status: 422 });
  try {
    const r = await parseStatement(text, ai.ask);
    return r.accounts.length ? Response.json({ ...r, parser: "ai" }) : Response.json({ code: "ai", error: "no transactions found." }, { status: 422 });
  } catch (e) {
    const unreadable = !(e instanceof AiError) && ["SyntaxError", "ZodError"].includes((e as Error).name); // cut-off or malformed JSON
    return Response.json({ code: "ai", error: unreadable ? "its answer was incomplete. Try a shorter period." : (e as Error).message }, { status: 502 });
  }
}
