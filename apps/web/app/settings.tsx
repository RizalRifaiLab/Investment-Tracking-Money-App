"use client";

import { useState } from "react";
import { formatShort, type RiskProfile } from "@nilai/core";
import { supabase } from "@/lib/supabase";
import type { Lang, Strings } from "@/lib/i18n";
import { SalaryModal } from "./cashflow";
import type { Data } from "./data";
import type { Profile } from "./shell";
import { btnOutline, Field, kicker, Modal, Segmented } from "./ui";

const PROFILES: RiskProfile[] = ["Conservative", "Balanced", "Aggressive"];
export const profileLabel = (t: Strings, p: RiskProfile) => t[p.toLowerCase() as "conservative" | "balanced" | "aggressive"];
const cell = "shadow-[2px_0_0_var(--color-text),0_2px_0_var(--color-text),2px_2px_0_var(--color-text)] bg-bg p-6 flex flex-col gap-2.5";

export function Settings({ t, lang, setLang, email, profile, setProfile, data, reload, lock, logout }: {
  t: Strings; lang: Lang; setLang: (l: Lang) => void; email: string; profile: Profile; setProfile: (p: Profile) => void;
  data: Data; reload: () => void; lock: () => void; logout: () => void;
}) {
  const [modal, setModal] = useState<"pin" | "salary" | null>(null);
  const [msg, setMsg] = useState("");
  const update = (p: Partial<Profile>) => {
    setProfile({ ...profile, ...p });
    supabase.from("profiles").update(p).eq("user_id", profile.user_id).then(({ error }) => error && setMsg(error.message));
  };
  const sal = data.salary;
  const S = (v: number) => formatShort(v, profile.currency, data.usdIdr);
  const desc = { Conservative: t.descConservative, Balanced: t.descBalanced, Aggressive: t.descAggressive }[profile.risk_profile];

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-0.5 overflow-hidden border-b-2 border-text">
      <div className={cell}>
        <div className={kicker}>{t.account}</div>
        <div className="text-[22px] font-extrabold">{profile.name}</div>
        <div className="text-sm text-neutral-800">{email} · PIN ••••••</div>
        <div className="flex gap-2 mt-2 flex-wrap">
          <button className={btnOutline} onClick={lock}>{t.lock}</button>
          <button className={btnOutline} onClick={() => { setMsg(""); setModal("pin"); }}>{t.changePin}</button>
          <button className="font-extrabold text-[13px] px-1 py-2 text-accent-700 cursor-pointer" onClick={logout}>{t.logout}</button>
        </div>
        <div className="text-sm font-semibold text-accent-700" role="status">{msg}</div>
      </div>

      <div className={cell}>
        <div className={kicker}>{t.risk}</div>
        <Segmented options={PROFILES.map((p) => [p, profileLabel(t, p)])} value={profile.risk_profile}
          onChange={(v) => update({ risk_profile: v as RiskProfile })} className="self-start" pad="px-3 py-2" />
        <div className="text-sm text-neutral-800">{desc}</div>
      </div>

      <div className={cell}>
        <div className={kicker}>{t.language} · {t.currency}</div>
        <div className="flex gap-2">
          <Segmented options={[["en", "EN"], ["id", "ID"]]} value={lang} onChange={(v) => setLang(v as Lang)} pad="px-3 py-2" />
          <Segmented options={[["IDR", "IDR"], ["USD", "USD"]]} value={profile.currency} onChange={(v) => update({ currency: v as Profile["currency"] })} pad="px-3 py-2" />
        </div>
        <div className="text-sm text-neutral-800">USD/IDR {Math.round(data.usdIdr).toLocaleString("id-ID")} · live</div>
      </div>

      <div className={cell}>
        <div className={kicker}>{t.salary}</div>
        <div className="text-[22px] font-extrabold">{S(Number(sal?.amount) || 0)}</div>
        <div className="text-sm text-neutral-800">{t.payday} {t.dayL}{sal?.payday ?? 25} · {t.autoInvest} {Number(sal?.invest_pct) || 0}% · {sal?.auto ? t.automatic : t.manual}</div>
        <button className={`${btnOutline} self-start`} onClick={() => setModal("salary")}>{t.editSalary}</button>
      </div>

      <div className={cell}>
        <div className={kicker}>{t.dataSources}</div>
        <div className="text-sm text-neutral-800">{t.mkNote}</div>
      </div>

      {modal === "pin" && <ChangePinModal t={t} onClose={() => setModal(null)} onDone={() => setMsg(t.pinChanged)} />}
      {modal === "salary" && <SalaryModal t={t} data={data} sal={sal} S={S} onClose={() => setModal(null)} onSaved={reload} />}
    </div>
  );
}

function ChangePinModal({ t, onClose, onDone }: { t: Strings; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ cur: "", next: "", again: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value.replace(/\D/g, "").slice(0, 6) }); setErr(""); };
  async function save() {
    if (![f.cur, f.next].every((p) => /^\d{6}$/.test(p))) return setErr(t.errPin6);
    if (f.next !== f.again) return setErr(t.pinMismatch);
    setBusy(true);
    const { error } = await supabase.rpc("change_pin", { current_pin: f.cur, new_pin: f.next });
    setBusy(false);
    if (error) return setErr(error.message === "wrong PIN" ? t.wrongCurrent : error.message);
    onDone();
    onClose();
  }
  const pin = { type: "password", inputMode: "numeric" as const, autoComplete: "off", maxLength: 6 };
  return (
    <Modal t={t} title={t.changePin} width={480} onClose={onClose} onSave={save} busy={busy} error={err}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3">
        <Field label={t.currentPin} {...pin} value={f.cur} onChange={set("cur")} />
        <Field label={t.newPin} {...pin} value={f.next} onChange={set("next")} />
        <Field label={t.confirmNewPin} {...pin} value={f.again} onChange={set("again")} />
      </div>
    </Modal>
  );
}
