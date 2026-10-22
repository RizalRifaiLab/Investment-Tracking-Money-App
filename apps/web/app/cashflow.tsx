"use client";

import { useCallback, useEffect, useState } from "react";
import { CATEGORIES, formatShort, type Category, type Currency } from "@nilai/core";
import { supabase } from "@/lib/supabase";
import type { Strings } from "@/lib/i18n";
import type { Data, Salary } from "./data";
import type { Open } from "./portfolio";
import { btnOutline, btnPrimary, Chips, Field, kicker, Modal } from "./ui";

type Txn = { id: string; account_id: string; date: string; description: string; amount: number; category: Category; source: string };

const ym = (d: Date) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
const todayIso = () => { const d = new Date(); return ym(d) + "-" + String(d.getDate()).padStart(2, "0"); };
const cellShadow = "shadow-[2px_0_0_var(--color-text),0_2px_0_var(--color-text),2px_2px_0_var(--color-text)]";

export function CashFlow({ data, t, cur, loc, open, reload }: { data: Data; t: Strings; cur: Currency; loc: string; open: Open; reload: () => void }) {
  const R = data.usdIdr, S = (v: number) => formatShort(v, cur, R);
  const [month, setMonth] = useState(() => ym(new Date()));
  const [txns, setTxns] = useState<Txn[]>([]);
  const [salaryTx, setSalaryTx] = useState<string | null>(null); // date of this month's Salary txn
  const [modal, setModal] = useState<"txn" | "salary" | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    const [y, m] = month.split("-").map(Number);
    const end = ym(new Date(y, m, 1)) + "-01";
    const nowStart = ym(new Date()) + "-01";
    Promise.all([
      supabase.from("transactions").select("id,account_id,date,description,amount,category,source").gte("date", month + "-01").lt("date", end).order("date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("transactions").select("date").eq("category", "Salary").gte("date", nowStart).order("date").limit(1).maybeSingle(),
    ]).then(([tx, sal]) => {
      if (tx.error) return setErr(tx.error.message);
      setTxns(tx.data);
      setSalaryTx(sal.data?.date ?? null);
    });
  }, [month]);
  useEffect(() => { load(); }, [load]);
  const changed = () => { load(); reload(); };

  const accById = Object.fromEntries(data.accounts.map((a) => [a.id, a]));
  const toIdr = (x: Txn) => Number(x.amount) * (accById[x.account_id]?.currency === "USD" ? R : 1);
  const mIn = txns.filter((x) => x.amount > 0).reduce((s, x) => s + toIdr(x), 0);
  const mOut = -txns.filter((x) => x.amount < 0).reduce((s, x) => s + toIdr(x), 0);
  const outs: Record<string, number> = {};
  for (const x of txns) if (x.amount < 0) outs[x.category] = (outs[x.category] ?? 0) - toIdr(x);
  const outMax = Math.max(1, ...Object.values(outs));
  const cash = data.accounts.reduce((s, a) => s + Number(a.value_idr), 0);

  const sal = data.salary;
  const invest = (Number(sal?.amount) || 0) * (Number(sal?.invest_pct) || 0) / 100;
  const salAcc = sal?.account_id ? accById[sal.account_id] : undefined;
  const fmtDay = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(loc, { day: "numeric", month: "short" });
  const salaryStatus = salaryTx ? t.salaryLoggedOn + fmtDay(salaryTx) + "."
    : sal?.auto ? t.salaryAutoA + sal.payday + t.salaryAutoB : t.salaryManual;

  async function logSalary() {
    setErr("");
    if (!sal || !(Number(sal.amount) > 0)) return setModal("salary");
    if (!salAcc) return setErr(t.needIdrAccount);
    const { error } = await supabase.from("transactions").insert({ account_id: salAcc.id, date: todayIso(), description: t.salary, amount: String(sal.amount), category: "Salary", source: "salary" });
    if (error) return setErr(error.code === "23505" ? t.alreadyLogged : error.message);
    changed();
  }
  async function del(x: Txn) {
    const { error } = await supabase.from("transactions").delete().eq("id", x.id);
    if (error) return setErr(error.message);
    changed();
  }
  const shift = (d: number) => { const [y, m] = month.split("-").map(Number); setMonth(ym(new Date(y, m - 1 + d, 1))); };
  const pad = "px-4 py-5 wide:p-8";
  const row = (label: string, value: string) => <div className="flex justify-between gap-3"><span>{label}</span><b className="text-right">{value}</b></div>;

  return (
    <div>
      <div className={`${pad} flex justify-between items-end gap-4 flex-wrap border-b-2 border-text`}>
        <div className="flex flex-col gap-1">
          <div className={kicker}>{t.totalCash} · {data.accounts.length}{t.accountsN}</div>
          <div className="text-[44px] font-extrabold tracking-[-0.03em] leading-none">{S(cash)}</div>
        </div>
        <button className={btnPrimary} onClick={() => setModal("txn")} disabled={!data.accounts.length}>{t.logTxn}</button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-0.5 overflow-hidden border-b-2 border-text">
        {data.accounts.map((a) => (
          <button key={a.id} onClick={() => open({ type: "bank", id: a.id })} className={`${cellShadow} bg-bg hover:bg-neutral-200 text-left cursor-pointer px-6 py-5 flex flex-col gap-1`}>
            <div className="text-[13px] font-extrabold uppercase tracking-[0.06em]">{a.bank}</div>
            <div className="text-[13px] text-neutral-800">{a.label} · {a.currency}</div>
            <div className="text-[26px] font-extrabold tracking-[-0.02em] mt-1.5">{a.currency === "USD" ? "$" + Number(a.balance).toLocaleString("en-US") : "Rp " + Math.round(Number(a.balance)).toLocaleString("id-ID")}</div>
            <div className="text-xs text-neutral-700">{a.currency === "USD" ? "≈ Rp " + Math.round(Number(a.value_idr)).toLocaleString("id-ID") : cur === "USD" ? "≈ " + S(Number(a.value_idr)) : ""}</div>
          </button>
        ))}
        <button onClick={() => open({ type: "bank" })} className={`${cellShadow} bg-bg hover:bg-neutral-200 text-left cursor-pointer px-6 py-5 font-extrabold text-sm text-accent-700`}>{t.addBank}</button>
      </div>

      <div className="grid wide:grid-cols-[2fr_1fr] gap-0.5 bg-text border-b-2 border-text">
        <div className={`bg-bg ${pad} flex flex-col gap-5 min-w-0`}>
          <div className="flex justify-between items-center gap-2">
            <div className={kicker}>{new Date(month + "-01T00:00:00").toLocaleDateString(loc, { month: "long", year: "numeric" })}</div>
            <div className="flex gap-1">
              <button onClick={() => shift(-1)} aria-label="Previous month" className="w-11 h-9 border-2 border-text font-extrabold cursor-pointer">←</button>
              <button onClick={() => shift(1)} aria-label="Next month" className="w-11 h-9 border-2 border-text font-extrabold cursor-pointer">→</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><div className="text-xs text-neutral-800">{t.moneyIn}</div><div className="text-[22px] wide:text-[26px] font-extrabold tracking-[-0.02em]">{S(mIn)}</div></div>
            <div><div className="text-xs text-neutral-800">{t.moneyOut}</div><div className="text-[22px] wide:text-[26px] font-extrabold tracking-[-0.02em] text-accent-700">{S(mOut)}</div></div>
            <div><div className="text-xs text-neutral-800">{t.net}</div><div className="text-[22px] wide:text-[26px] font-extrabold tracking-[-0.02em]">{(mIn - mOut >= 0 ? "+" : "") + S(mIn - mOut)}</div></div>
          </div>
          <div className={kicker}>{t.spendingBy}</div>
          <div className="flex flex-col gap-2">
            {Object.entries(outs).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[90px_1fr_90px] wide:grid-cols-[110px_1fr_100px] gap-3 items-center text-[13px]">
                <span>{k}</span><div className="h-3 bg-neutral-200"><div className="h-full bg-text" style={{ width: (v / outMax) * 100 + "%" }} /></div><span className="text-right font-extrabold">{S(v)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={`bg-bg ${pad} flex flex-col gap-3`}>
          <div className={kicker}>{t.salary}</div>
          <div className="text-4xl font-extrabold tracking-[-0.02em] leading-none">{S(Number(sal?.amount) || 0)}</div>
          <div className="flex flex-col gap-1.5 text-sm">
            {row(t.payday, t.dayL + (sal?.payday ?? 25))}
            {row(t.autoInvest, (Number(sal?.invest_pct) || 0) + "% · " + S(invest))}
            {row(t.mode, sal?.auto ? t.automatic : t.manual)}
            {row(t.into, salAcc ? salAcc.bank : "—")}
          </div>
          <div className="text-[13px] text-neutral-800">{salaryStatus}</div>
          <div className="text-sm font-semibold text-accent-700" role="alert">{err}</div>
          <div className="flex gap-2 flex-wrap mt-auto">
            <button className={`${btnPrimary} flex-1`} onClick={logSalary}>{t.logSalary}</button>
            <button className={btnOutline} onClick={() => setModal("salary")}>{t.editSalary}</button>
          </div>
        </div>
      </div>

      <div className={pad}>
        <div className={`${kicker} mb-3`}>{t.txns}</div>
        {txns.map((x) => {
          const a = accById[x.account_id];
          return (
            <div key={x.id} className="grid grid-cols-[56px_1fr_auto_28px] wide:grid-cols-[80px_2fr_1fr_1fr_1fr_28px] gap-3 text-sm py-2.5 border-b border-divider items-baseline">
              <span className="text-[13px] text-neutral-800">{fmtDay(x.date)}</span>
              <span><b>{x.description}</b><span className="block wide:hidden text-xs text-neutral-700">{a?.bank ?? "—"} · {x.category}</span></span>
              <span className="hidden wide:block">{a?.bank ?? "—"}</span>
              <span className="hidden wide:block"><span className={`text-xs font-extrabold px-2 py-0.5 ${x.category === "Salary" ? "bg-accent-200" : "bg-neutral-200"}`}>{x.category}</span></span>
              <span className={`text-right font-extrabold ${x.amount < 0 ? "" : "text-accent-700"}`}>{(x.amount > 0 ? "+" : "") + S(toIdr(x))}</span>
              <button onClick={() => del(x)} aria-label={t.delTxn} className="text-[13px] text-neutral-700 hover:text-accent-700 cursor-pointer">✕</button>
            </div>
          );
        })}
        {!txns.length && <div className="py-6 text-neutral-800">{t.noTx}</div>}
      </div>

      {modal === "txn" && <TxnModal t={t} data={data} onClose={() => setModal(null)} onSaved={(d) => { if (d.slice(0, 7) !== month) setMonth(d.slice(0, 7)); changed(); }} />}
      {modal === "salary" && <SalaryModal t={t} data={data} sal={sal} S={S} onClose={() => setModal(null)} onSaved={changed} />}
    </div>
  );
}

function TxnModal({ t, data, onClose, onSaved }: { t: Strings; data: Data; onClose: () => void; onSaved: (date: string) => void }) {
  const [f, setF] = useState({ dir: "Out", cat: "Food" as Category, account: data.accounts[0]?.id ?? "", desc: "", amount: "", date: todayIso() });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => { setF((x) => ({ ...x, ...p })); setErr(""); };
  async function save() {
    if (!f.desc.trim() || !(Number(f.amount) > 0)) return setErr(t.errTxn);
    setBusy(true);
    const { error } = await supabase.from("transactions").insert({
      account_id: f.account, date: f.date, description: f.desc.trim(), category: f.cat, source: "manual",
      amount: (f.dir === "Out" ? "-" : "") + f.amount,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    onSaved(f.date);
    onClose();
  }
  const acc = data.accounts.find((a) => a.id === f.account);
  return (
    <Modal t={t} title={t.logTxnT} onClose={onClose} onSave={save} busy={busy} error={err} note={t.noteTxn}>
      <Chips label={t.dirL} value={f.dir} onChange={(dir) => set({ dir })} options={[{ v: "In", name: t.moneyIn }, { v: "Out", name: t.moneyOut }]} />
      <Chips label={t.catL} value={f.cat} onChange={(cat) => set({ cat })} options={CATEGORIES.map((v) => ({ v, name: v }))} />
      <Chips label={t.accountL} value={f.account} onChange={(account) => set({ account })} options={data.accounts.map((a) => ({ v: a.id, name: `${a.bank} · ${a.label}` }))} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <Field label={t.descL} value={f.desc} onChange={(e) => set({ desc: e.target.value })} placeholder={t.descPh} />
        <Field label={`${t.amountF} (${acc?.currency ?? "IDR"})`} type="number" inputMode="decimal" min="0" step="any" value={f.amount} onChange={(e) => set({ amount: e.target.value })} />
        <Field label={t.dateL} type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
      </div>
    </Modal>
  );
}

export function SalaryModal({ t, data, sal, S, onClose, onSaved }: { t: Strings; data: Data; sal: Salary | null; S: (v: number) => string; onClose: () => void; onSaved: () => void }) {
  // Salary is in IDR, so only IDR accounts can receive it.
  const idrAccounts = data.accounts.filter((a) => a.currency === "IDR");
  const [f, setF] = useState({
    amount: sal && Number(sal.amount) > 0 ? String(sal.amount) : "", payday: String(sal?.payday ?? 25), pct: String(sal?.invest_pct ?? 0),
    auto: sal?.auto ?? true, account: sal?.account_id ?? idrAccounts[0]?.id ?? "",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => { setF((x) => ({ ...x, ...p })); setErr(""); };
  async function save() {
    if (!(Number(f.amount) > 0)) return setErr(t.errSalary);
    setBusy(true);
    const { error } = await supabase.from("salary_settings").update({
      amount: f.amount, payday: Math.min(31, Math.max(1, Math.round(Number(f.payday)) || 25)),
      invest_pct: Math.min(100, Math.max(0, Number(f.pct) || 0)), auto: f.auto, account_id: f.account || null,
    }).not("user_id", "is", null); // RLS limits this to the signed-in user's single row
    setBusy(false);
    if (error) return setErr(error.message);
    onSaved();
    onClose();
  }
  return (
    <Modal t={t} title={t.salary} width={520} onClose={onClose} onSave={save} busy={busy} error={err}
      note={t.toInvest + S((Number(f.amount) || 0) * (Number(f.pct) || 0) / 100) + t.perMonth}>
      <Chips label={t.mode} value={f.auto ? "auto" : "manual"} onChange={(v) => set({ auto: v === "auto" })} options={[{ v: "auto", name: t.autoPayday }, { v: "manual", name: t.manual }]} />
      {idrAccounts.length ? <Chips label={t.into} value={f.account} onChange={(account) => set({ account })} options={idrAccounts.map((a) => ({ v: a.id, name: `${a.bank} · ${a.label}` }))} />
        : <div className="text-sm font-semibold text-accent-700">{t.needIdrAccount}</div>}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        <Field label={t.takeHome} type="number" inputMode="numeric" min="0" step="any" value={f.amount} onChange={(e) => set({ amount: e.target.value })} />
        <Field label={t.payday} type="number" inputMode="numeric" min="1" max="31" value={f.payday} onChange={(e) => set({ payday: e.target.value })} placeholder="25" />
        <Field label={t.pctInvest} type="number" inputMode="numeric" min="0" max="100" value={f.pct} onChange={(e) => set({ pct: e.target.value })} placeholder="40" />
      </div>
    </Modal>
  );
}
