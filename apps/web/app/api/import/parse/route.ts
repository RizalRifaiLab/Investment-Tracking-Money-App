import { extractText, getDocumentProxy } from "unpdf";
import * as XLSX from "xlsx";
import { parseStatement } from "@/lib/ai";
import { userFromRequest } from "@/lib/prices";

export const maxDuration = 300; // reading a long statement can take a minute or two
const MAX_BYTES = 4 * 1024 * 1024; // Vercel request body limit is 4.5 MB

// POST multipart {file, password?} → transactions grouped by account, for the user to review.
// Nothing is stored here, and neither the file, its text nor the password is logged.
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
      const pdf = await getDocumentProxy(bytes, { password });
      text = (await extractText(pdf, { mergePages: true })).text;
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

  try {
    return Response.json(await parseStatement(text));
  } catch (e) {
    return Response.json({ code: "ai", error: (e as Error).message }, { status: 502 });
  }
}
