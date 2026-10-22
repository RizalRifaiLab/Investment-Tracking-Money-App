"use client";

import { useState } from "react";
import { ASSET_CLASSES, COINGECKO_IDS, etaDate, formatShort, instrumentMeta, monthsTo, type AccountValue, type AssetClass, type Currency, type HoldingValue } from "@nilai/core";
import { supabase } from "@/lib/supabase";
import type { Strings } from "@/lib/i18n";
import type { Goal } from "./data";
import { Chips, Field, Modal } from "./ui";

type Common = { t: Strings; onClose: () => void; onSaved: () => void };
const USD_CLASSES: AssetClass[] = ["Crypto", "US stocks", "ETF"];
const positive = (s: string) => Number(s) > 0;

/** Run a Supabase write; on success reload + close, else show the error. */
function useSave({ onClose, onSaved }: Common) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (q: PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true);
    const { error } = await q;
    setBusy(false);
    if (error) return setError(error.message);
    onSaved();
    onClose();
  };
  return { busy, error, setError, run };
}

export function HoldingModal({ h, ...c }: Common & { h?: HoldingValue }) {
  const { t } = c;
  const s = useSave(c);
  const [f, setF] = useState({
    cls: h?.class ?? ("Crypto" as AssetClass), name: h?.name ?? "", ticker: h?.ticker ?? "",
    qty: h ? String(h.quantity) : "", price: h ? String(h.manual_price) : "", ccy: (h?.price_currency ?? "USD") as Currency,
    rate: h?.deposit_rate != null ? String(h.deposit_rate) : "", maturity: h?.maturity_date ?? "",
  });
  const set = (p: Partial<typeof f>) => { setF({ ...f, ...p }); s.setError(""); };
  const dep = f.cls === "Deposito";

  function save() {
    const T = f.ticker.trim().toUpperCase();
    if (!(f.name.trim() || T)) return s.setError(t.errNameTicker);
    if (!dep && !positive(f.qty)) return s.setError(t.errQty);
    if (!positive(f.price)) return s.setError(t.errPrice);
    const row = {
      class: f.cls, name: (f.name.trim() || T), ticker: dep ? "" : T,
      quantity: dep ? "1" : f.qty, manual_price: f.price, price_currency: dep ? "IDR" : f.ccy,
      deposit_rate: dep ? f.rate || "0" : null, maturity_date: dep && f.maturity ? f.maturity : null,
      ...instrumentMeta(f.cls, dep ? "" : T),
    };
    s.run(h ? supabase.from("holdings").update(row).eq("id", h.id) : supabase.from("holdings").insert(row));
  }

  const note = dep ? t.noteDep
    : f.cls === "Crypto" ? (COINGECKO_IDS[f.ticker.trim().toUpperCase()] ? t.noteCgLive : t.noteCgUnknown)
    : ["US stocks", "ETF", "IDX stocks"].includes(f.cls) ? t.noteFh : t.noteManual;
  const qtyLabel = f.cls === "IDX stocks" ? t.sharesLot : f.cls === "Gold" ? t.grams : f.cls === "Reksa dana" ? t.unit : t.qty;
  const ph = f.cls === "Crypto" ? "BTC" : f.cls === "IDX stocks" ? "BBCA" : f.cls === "Gold" ? "Antam" : "VOO";

  return (
    <Modal t={t} title={h ? t.editHolding : t.addHoldingT} onClose={c.onClose} onSave={save} busy={s.busy} error={s.error} note={note}
      onDelete={h ? () => s.run(supabase.from("holdings").delete().eq("id", h.id)) : undefined}>
      <Chips label={t.cls} value={f.cls} onChange={(cls) => set({ cls, ccy: USD_CLASSES.includes(cls) ? "USD" : "IDR" })}
        options={ASSET_CLASSES.map((v) => ({ v, name: v }))} />
      {!dep && <Chips label={t.pricedIn} value={f.ccy} onChange={(ccy) => set({ ccy })} options={[{ v: "IDR", name: "IDR" }, { v: "USD", name: "USD" }]} />}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        {dep ? (
          <>
            <Field label={t.bankL} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Bank Jago" />
            <Field label={t.principal} type="number" inputMode="decimal" min="0" step="any" value={f.price} onChange={(e) => set({ price: e.target.value })} placeholder="50000000" />
            <Field label={t.ratePa} type="number" inputMode="decimal" min="0" step="any" value={f.rate} onChange={(e) => set({ rate: e.target.value })} placeholder="6" />
            <Field label={t.maturityL} type="date" value={f.maturity} onChange={(e) => set({ maturity: e.target.value })} />
          </>
        ) : (
          <>
            <Field label="Ticker" value={f.ticker} onChange={(e) => set({ ticker: e.target.value })} placeholder={ph} autoCapitalize="characters" />
            <Field label={t.name} value={f.name} onChange={(e) => set({ name: e.target.value })} />
            <Field label={qtyLabel} type="number" inputMode="decimal" min="0" step="any" value={f.qty} onChange={(e) => set({ qty: e.target.value })} />
            <Field label={`${t.pricePerUnit} (${f.ccy})`} type="number" inputMode="decimal" min="0" step="any" value={f.price} onChange={(e) => set({ price: e.target.value })} />
          </>
        )}
      </div>
    </Modal>
  );
}

export function BankModal({ a, canDelete, ...c }: Common & { a?: AccountValue; canDelete: boolean }) {
  const { t } = c;
  const s = useSave(c);
  const [f, setF] = useState({ bank: a?.bank ?? "", label: a?.label ?? "", ccy: (a?.currency ?? "IDR") as Currency, balance: a ? String(a.balance) : "" });
  const set = (p: Partial<typeof f>) => { setF({ ...f, ...p }); s.setError(""); };

  function save() {
    if (!f.bank.trim()) return s.setError(t.errBank);
    const row = { bank: f.bank.trim(), label: f.label.trim() || t.savings, currency: f.ccy, balance: f.balance || "0" };
    s.run(a ? supabase.from("accounts").update(row).eq("id", a.id) : supabase.from("accounts").insert(row));
  }

  return (
    <Modal t={t} title={a ? t.editBank : t.addBankT} width={480} onClose={c.onClose} onSave={save} busy={s.busy} error={s.error}
      onDelete={a && canDelete ? () => s.run(supabase.from("accounts").delete().eq("id", a.id)) : undefined}>
      <Chips label={t.currency} value={f.ccy} onChange={(ccy) => set({ ccy })} options={[{ v: "IDR", name: "IDR" }, { v: "USD", name: "USD" }]} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <Field label={t.bankL} value={f.bank} onChange={(e) => set({ bank: e.target.value })} placeholder="BCA, Mandiri, BRI, Jago, SeaBank…" />
        <Field label={t.accountName} value={f.label} onChange={(e) => set({ label: e.target.value })} placeholder={t.savings} />
        <Field label={`${t.balance} (${f.ccy})`} type="number" inputMode="decimal" step="any" value={f.balance} onChange={(e) => set({ balance: e.target.value })} />
      </div>
    </Modal>
  );
}

export function GoalModal({ g, hasActive, total, invest, retPct, usdIdr, loc, ...c }: Common & {
  g?: Goal; hasActive: boolean; total: number; invest: number; retPct: number; usdIdr: number; loc: string;
}) {
  const { t } = c;
  const s = useSave(c);
  const [f, setF] = useState({ name: g?.name ?? "", target: g ? String(g.target_idr) : "" });
  const set = (p: Partial<typeof f>) => { setF({ ...f, ...p }); s.setError(""); };

  function save() {
    if (!f.name.trim() || !positive(f.target)) return s.setError(t.errGoal);
    const row = { name: f.name.trim(), target_idr: f.target };
    s.run(g ? supabase.from("goals").update(row).eq("id", g.id) : supabase.from("goals").insert({ ...row, is_active: !hasActive }));
  }

  let note = "";
  if (positive(f.target)) {
    const n = monthsTo(total, Number(f.target), invest, retPct), d = etaDate(n);
    note = t.estimate + (n === 0 ? t.reached : d ? d.toLocaleDateString(loc, { month: "long", year: "numeric" }) : t.yrs60)
      + " · " + formatShort(invest, "IDR", usdIdr) + t.perMonth + " · " + retPct + "%";
  }

  return (
    <Modal t={t} title={g ? t.editGoal : t.newGoalT} width={480} onClose={c.onClose} onSave={save} busy={s.busy} error={s.error} note={note}
      onDelete={g ? () => s.run(supabase.from("goals").delete().eq("id", g.id)) : undefined}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <Field label={t.name} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={t.goalPh} />
        <Field label={t.targetAmt} type="number" inputMode="numeric" min="0" step="any" value={f.target} onChange={(e) => set({ target: e.target.value })} placeholder="1000000000" />
      </div>
    </Modal>
  );
}
