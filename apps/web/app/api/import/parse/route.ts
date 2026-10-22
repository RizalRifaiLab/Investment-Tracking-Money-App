import { getDocumentProxy } from "unpdf";
import * as XLSX from "xlsx";
import { parseMandiri, parseMandiriLivin, type Line } from "@nilai/core";
import { userFromRequest } from "@/lib/prices";

export const maxDuration = 120;
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
  if (!(await userFromRequest(req))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const password = String(form.get("password") ?? "") || undefined;
  if (!(file instanceof File)) return Response.json({ code: "noFile" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ code: "tooBig" }, { status: 413 });

  const ext = file.name.split(".").pop()?.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "";
  try {
    if (ext === "pdf") {
      const pages = await pdfLines(bytes, password);
      text = pages.map((p) => p.map((l) => l.map((c) => c.s).join(" ")).join("\n")).join("\n");
      // Mandiri Livin' e-Statement (downloaded in the app) or the emailed Rekening Koran / consolidated statement
      const accounts = /Nominal \(IDR\)/.test(text) ? parseMandiriLivin(pages)
        : /bankmandiri|Rekening Koran/i.test(text) ? parseMandiri(pages).filter((a) => a.transactions.length) : [];
      if (accounts.length) return Response.json({ accounts, parser: "mandiri" });
    } else if (ext === "xlsx" || ext === "xls") {
      const wb = XLSX.read(bytes);
      text = wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join("\n");
    } else if (ext === "csv" || ext === "txt") {
      text = new TextDecoder().decode(bytes);
    } else return Response.json({ code: "type" }, { status: 400 });
  } catch (e) {
    if ((e as { name?: string }).name === "PasswordException") return Response.json({ code: password ? "badPassword" : "needPassword" }, { status: 422 });
    return Response.json({ code: "read" }, { status: 422 });
  }
  if (!text.trim()) return Response.json({ code: "empty" }, { status: 422 });

  // Other banks and spreadsheets: AI reading, only when a key is configured.
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ code: "unsupported" }, { status: 422 });
  try {
    const { parseStatement } = await import("@/lib/ai");
    return Response.json({ ...(await parseStatement(text)), parser: "ai" });
  } catch (e) {
    return Response.json({ code: "ai", error: (e as Error).message }, { status: 502 });
  }
}
