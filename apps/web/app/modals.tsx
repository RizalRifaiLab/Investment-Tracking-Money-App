"use client";

import { useState } from "react";
import { ASSET_CLASSES, etaDate, quantityFromAmount, formatShort, instrumentMeta, monthsTo, type AccountValue, type AssetClass, type Currency, type HoldingValue } from "@nilai/core";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Strings } from "@/lib/i18n";
import type { Goal } from "./data";
import { Chips, Field, Modal } from "./ui";

type Common = { t: Strings; onClose: () => void; onSaved: () => void };
const USD_CLASSES: AssetClass[] = ["Crypto", "US stocks", "ETF"];
const positive = (s: string) => Number(s) > 0;
const LIVE_CLASSES: AssetClass[] = ["Crypto", "US stocks", "ETF", "IDX stocks"];

type Lookup = ReturnType<typeof instrumentMeta> & { key: string; name: string | null; quote: { price: number; currency: Currency } | null };

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

export function HoldingModal({ h, usdIdr, ...c }: Common & { h?: HoldingValue; usdIdr: number }) {
  const { t } = c;
  const s = useSave(c);
  const [f, setF] = useState({
    cls: h?.class ?? ("Crypto" as AssetClass), name: h?.name ?? "", ticker: h?.ticker ?? "",
    qty: h ? String(h.quantity) : "", price: h ? String(h.manual_price) : "", ccy: (h?.price_currency ?? "USD") as Currency,
    rate: h?.deposit_rate != null ? String(h.deposit_rate) : "", maturity: h?.maturity_date ?? "",
  });
  const [byAmount, setByAmount] = useState(!h); // new holdings: "I have Rp 5 jt of BTC"
  const [amount, setAmount] = useState("");
  const [amountCcy, setAmountCcy] = useState<Currency>("IDR");
  // Editing keeps the stored provider ids until the class or ticker changes.
  const [look, setLook] = useState<Lookup | null>(h ? { key: h.class + ":" + h.ticker, provider: h.provider, provider_symbol: h.provider_symbol, tv_symbol: h.tv_symbol, name: null, quote: null } : null);
  const [looking, setLooking] = useState(false);
  const set = (p: Partial<typeof f>) => { setF((x) => ({ ...x, ...p })); s.setError(""); };
  const dep = f.cls === "Deposito";
  const T = f.ticker.trim().toUpperCase();
  const lookKey = f.cls + ":" + T;
  const lk = look?.key === lookKey ? look : null;
  // Amount mode stores units, so the value follows the price from then on.
  const q = quantityFromAmount(Number(amount), amountCcy, Number(f.price), f.ccy, usdIdr);
  const qty = byAmount ? (q ? String(q) : "") : f.qty;

  async function lookup() {
    if (!LIVE_CLASSES.includes(f.cls) || !T || lk) return;
    setLooking(true);
    const r = await api<Omit<Lookup, "key">>(`/api/lookup?cls=${encodeURIComponent(f.cls)}&ticker=${encodeURIComponent(T)}`).catch(() => null);
    setLooking(false);
    if (!r) return;
    setLook({ ...r, key: lookKey });
    set({
      ...(r.quote ? { price: String(r.quote.price), ccy: r.quote.currency === "USD" ? "USD" : "IDR" } : {}),
      ...(r.name && !f.name.trim() ? { name: r.name } : {}),
    });
  }

  function save() {
    if (!(f.name.trim() || T)) return s.setError(t.errNameTicker);
    if (!dep && !positive(qty)) return s.setError(t.errQty);
    if (!positive(f.price)) return s.setError(t.errPrice);
    const { provider, provider_symbol, tv_symbol } = lk ?? instrumentMeta(f.cls, dep ? "" : T);
    const row = {
      class: f.cls, name: (f.name.trim() || T), ticker: dep ? "" : T,
      quantity: dep ? "1" : qty, manual_price: f.price, price_currency: dep ? "IDR" : f.ccy,
      deposit_rate: dep ? f.rate || "0" : null, maturity_date: dep && f.maturity ? f.maturity : null,
      provider, provider_symbol, tv_symbol,
    };
    s.run(h ? supabase.from("holdings").update(row).eq("id", h.id) : supabase.from("holdings").insert(row));
  }

  const fmtPrice = (p: number, c: Currency) => (c === "USD" ? "$" + p.toLocaleString("en-US", { maximumFractionDigits: 6 }) : "Rp " + p.toLocaleString("id-ID", { maximumFractionDigits: 2 }));
  const note = dep ? t.noteDep
    : looking ? t.updating
    : lk?.quote ? t.liveQuote + fmtPrice(lk.quote.price, lk.quote.currency) + " · " + (f.cls === "Crypto" ? t.noteCgLive : t.noteFh)
    : lk && !lk.provider ? t.notFound
    : LIVE_CLASSES.includes(f.cls) ? (f.cls === "Crypto" ? t.noteCgLive : t.noteFh) : t.noteManual;
  const qtyHint = byAmount && qty ? `${t.approx}${qty} ${f.cls === "Crypto" ? T : ""}`.trim() : "";
  const qtyLabel = f.cls === "IDX stocks" ? t.sharesLot : f.cls === "Gold" ? t.grams : f.cls === "Reksa dana" ? t.unit : t.qty;
  const ph = f.cls === "Crypto" ? "BTC" : f.cls === "IDX stocks" ? "BBCA" : f.cls === "Gold" ? "Antam" : "VOO";

  return (
    <Modal t={t} title={h ? t.editHolding : t.addHoldingT} onClose={c.onClose} onSave={save} busy={s.busy || looking} error={s.error} note={[qtyHint, note].filter(Boolean).join(" · ")}
      onDelete={h ? () => s.run(supabase.from("holdings").delete().eq("id", h.id)) : undefined}>
      <Chips label={t.cls} value={f.cls} onChange={(cls) => set({ cls, ccy: USD_CLASSES.includes(cls) ? "USD" : "IDR" })}
        options={ASSET_CLASSES.map((v) => ({ v, name: v }))} />
      {!dep && <Chips label={t.pricedIn} value={f.ccy} onChange={(ccy) => set({ ccy })} options={[{ v: "IDR", name: "IDR" }, { v: "USD", name: "USD" }]} />}
      {!dep && <Chips label={t.enterBy} value={byAmount ? "amount" : "qty"} onChange={(v) => setByAmount(v === "amount")}
        options={[{ v: "amount", name: t.byAmount }, { v: "qty", name: t.byQty }]} />}
      {!dep && byAmount && <Chips label={t.amountCcy} value={amountCcy} onChange={setAmountCcy} options={[{ v: "IDR", name: "Rupiah" }, { v: "USD", name: "USD" }]} />}
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
            <Field label="Ticker" value={f.ticker} onChange={(e) => set({ ticker: e.target.value })} onBlur={lookup} placeholder={ph} autoCapitalize="characters" />
            <Field label={t.name} value={f.name} onChange={(e) => set({ name: e.target.value })} />
            {byAmount
              ? <Field label={`${t.amountL} (${amountCcy})`} type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
              : <Field label={qtyLabel} type="number" inputMode="decimal" min="0" step="any" value={f.qty} onChange={(e) => set({ qty: e.target.value })} />}
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
