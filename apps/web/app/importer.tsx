"use client";

import { useState } from "react";
import { CATEGORIES, mergeStatements, type AccountValue, type Category, type ParsedAccount } from "@nilai/core";
import { supabase } from "@/lib/supabase";
import type { Strings } from "@/lib/i18n";
import { Chips, Field, Modal } from "./ui";

type Row = { date: string; description: string; amount: number; category: Category; inc: boolean };
type StmtAccount = { label: string; currency: string; closing_balance: number | null; rows: Row[]; target: string; useClosing: boolean; balanced: boolean };
const SKIP = "skip";

const ERR: Record<string, keyof Strings> = {
  needPassword: "errNeedPassword", badPassword: "errBadPassword", empty: "errEmpty", type: "errType",
  tooBig: "errTooBig", read: "errRead", noFile: "errNoFile", unsupported: "errUnsupported",
};

/** Default target: a Nilai account in the same currency whose bank name appears in the statement's account label. */
function guessTarget(label: string, currency: string, accounts: AccountValue[]) {
  const l = label.toLowerCase();
  return accounts.find((a) => a.currency === currency && l.includes(a.bank.toLowerCase()))?.id ?? SKIP;
}

export function ImportModal({ t, accounts, onClose, onDone }: {
  t: Strings; accounts: AccountValue[]; onClose: () => void; onDone: (lastMonth: string | null) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [reading, setReading] = useState(0); // index of the file being read
  const [pw, setPw] = useState("");
  const [step, setStep] = useState<"pick" | "busy" | "review">("pick");
  const [stmt, setStmt] = useState<StmtAccount[]>([]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function read() {
    if (!files.length) return setErr(t.errNoFile);
    setErr("");
    setStep("busy");
    const { data } = await supabase.auth.getSession();
    const results: ParsedAccount[][] = [];
    // one file at a time keeps each request under the server's size and time limits
    for (const [i, file] of files.entries()) {
      setReading(i);
      const fd = new FormData();
      fd.append("file", file);
      if (pw) fd.append("password", pw);
      const r = await fetch("/api/import/parse", { method: "POST", body: fd, headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
      const j = await r.json().catch(() => ({ code: "read" }));
      if (!r.ok) {
        setStep("pick");
        return setErr(file.name + ": " + (j.code === "ai" ? t.errAi + (j.error ?? "") : t[ERR[j.code] ?? "errRead"]));
      }
      results.push((j.accounts as ParsedAccount[]).map((a) => ({ ...a, currency: a.currency.toUpperCase(), balanced: a.balanced ?? true })));
    }
    const accs: StmtAccount[] = mergeStatements(results).filter((a) => a.transactions.length).map((a) => ({
      label: a.label, currency: a.currency, closing_balance: a.closing_balance, balanced: a.balanced,
      rows: a.transactions.map((x) => ({ ...x, inc: true })),
      target: guessTarget(a.label, a.currency, accounts), useClosing: a.closing_balance != null,
    }));
    if (!accs.length) { setStep("pick"); return setErr(t.noTx); }
    setStmt(accs);
    setStep("review");
  }

  const upd = (i: number, p: Partial<StmtAccount>) => setStmt((s) => s.map((a, j) => (j === i ? { ...a, ...p } : a)));
  const updRow = (i: number, k: number, p: Partial<Row>) => upd(i, { rows: stmt[i].rows.map((r, j) => (j === k ? { ...r, ...p } : r)) });
  const chosen = stmt.filter((a) => a.target !== SKIP && a.rows.some((r) => r.inc));
  const count = chosen.reduce((s, a) => s + a.rows.filter((r) => r.inc).length, 0);

  async function commit() {
    if (step === "pick") return read();
    if (step !== "review") return;
    if (!chosen.length) return setErr(t.chooseAccount);
    setSaving(true);
    let last: string | null = null;
    for (const a of chosen) {
      const rows = a.rows.filter((r) => r.inc).map(({ date, description, amount, category }) => ({ date, description, amount, category }));
      const { error } = await supabase.rpc("commit_import", { p_account: a.target, p_rows: rows, p_closing: a.useClosing ? a.closing_balance : null });
      if (error) { setSaving(false); return setErr(error.message); }
      const m = rows.map((r) => r.date).sort().pop()!.slice(0, 7);
      if (!last || m > last) last = m;
    }
    setSaving(false);
    onDone(last);
    onClose();
  }

  const money = (v: number, ccy: string) => (ccy === "USD" ? "$" + v.toLocaleString("en-US") : "Rp " + Math.round(v).toLocaleString("id-ID"));

  return (
    <Modal t={t} title={t.import} width={760} onClose={onClose} onSave={commit} busy={step === "busy" || saving}
      saveLabel={step === "review" ? t.importN + count : t.readFile} error={err}
      note={step === "pick" ? t.privacyNote : step === "review" ? t.replaceNote : undefined}>
      {step === "pick" && (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-neutral-800">{t.imFormats}</span>
            <span className="min-h-11 px-3 py-2.5 border-2 border-dashed border-text text-[15px] cursor-pointer hover:bg-neutral-200">
              {files.length ? files.map((f) => f.name).join(", ") : t.chooseFile}
            </span>
            <input type="file" multiple accept=".pdf,.xlsx,.xls,.csv" className="sr-only" onChange={(e) => { setFiles([...(e.target.files ?? [])]); setErr(""); }} />
          </label>
          <Field label={t.pdfPw} type="password" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} />
        </>
      )}
      {step === "busy" && (
        <div className="flex flex-col gap-1.5 py-3">
          <b className="text-lg text-accent-700">{t.reading}{files[reading]?.name}{files.length > 1 ? ` (${reading + 1}/${files.length})` : ""}…</b>
          <span className="text-[13px] text-neutral-800">{t.imBusyNote}</span>
        </div>
      )}
      {step === "review" && stmt.map((a, i) => {
        const inc = a.rows.filter((r) => r.inc);
        const sal = inc.filter((r) => r.category === "Salary");
        return (
          <section key={i} className="flex flex-col gap-3 border-t-2 border-text pt-4 first:border-t-0 first:pt-0">
            <div className="flex justify-between gap-3 flex-wrap items-baseline">
              <b className="text-base">{a.label}</b>
              <span className="text-[13px] text-neutral-800">{a.currency} · {inc.length}{t.rowsN}</span>
            </div>
            <Chips label={t.saveInto} value={a.target} onChange={(target) => upd(i, { target })}
              options={[...accounts.filter((x) => x.currency === a.currency).map((x) => ({ v: x.id, name: `${x.bank} · ${x.label}` })), { v: SKIP, name: t.skip }]} />
            {a.target !== SKIP && (
              <>
                {!a.balanced && <div className="text-sm font-semibold text-accent-700">{t.unbalanced}</div>}
                {sal.length > 0 && <div className="text-sm font-extrabold px-3 py-2.5 bg-accent-100 text-accent-800">{t.salaryDetected}{sal.map((r) => money(r.amount, a.currency) + " · " + r.date).join(", ")}</div>}
                <div className="text-xs text-neutral-700">{t.imTip}</div>
                <div className="max-h-72 overflow-auto border-y border-divider">
                  {a.rows.map((r, k) => (
                    <div key={k} className={`grid grid-cols-[24px_1fr_auto] gap-2.5 items-center text-[13px] py-1.5 border-b border-divider ${r.inc ? "" : "opacity-45"}`}>
                      <button type="button" aria-label="include" aria-pressed={r.inc} onClick={() => updRow(i, k, { inc: !r.inc })} className={`size-5 border-2 border-text cursor-pointer ${r.inc ? "bg-text" : ""}`} />
                      <span className="min-w-0">
                        <span className="block truncate">{r.description}</span>
                        <span className="text-xs text-neutral-700">{r.date} · </span>
                        <button type="button" onClick={() => updRow(i, k, { category: CATEGORIES[(CATEGORIES.indexOf(r.category) + 1) % CATEGORIES.length] })}
                          className={`text-xs font-extrabold px-1.5 cursor-pointer ${r.category === "Salary" ? "bg-accent-200" : "bg-neutral-200"}`}>{r.category}</button>
                      </span>
                      <span className={`text-right font-extrabold ${r.amount < 0 ? "" : "text-accent-700"}`}>{(r.amount > 0 ? "+" : "") + money(r.amount, a.currency)}</span>
                    </div>
                  ))}
                </div>
                {a.closing_balance != null && (
                  <button type="button" onClick={() => upd(i, { useClosing: !a.useClosing })} className="flex gap-2.5 items-center text-left text-sm cursor-pointer">
                    <span className={`size-5 border-2 border-text shrink-0 ${a.useClosing ? "bg-text" : ""}`} />
                    {t.setClosing}{money(a.closing_balance, a.currency)}
                  </button>
                )}
              </>
            )}
          </section>
        );
      })}
    </Modal>
  );
}
