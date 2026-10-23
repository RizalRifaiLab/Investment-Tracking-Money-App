"use client";

import { useCallback, useEffect, useState } from "react";
import type { RiskProfile } from "@nilai/core";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Lang, Strings } from "@/lib/i18n";
import { Advisor } from "./advisor";
import { CashFlow } from "./cashflow";
import { useData, type Goal } from "./data";
import { BankModal, GoalModal, HoldingModal } from "./modals";
import { Goals } from "./goals";
import { Markets } from "./markets";
import { Dashboard, Holdings, viewModel, type Open } from "./portfolio";
import { profileLabel, Settings } from "./settings";
import { Logo, Segmented } from "./ui";

export type Profile = { user_id: string; name: string; currency: "IDR" | "USD"; language: Lang; risk_profile: RiskProfile };

const TABS = ["home", "holdings", "cash", "goals", "markets", "advisor", "settings"] as const;
type Tab = (typeof TABS)[number];

type Props = {
  t: Strings; lang: Lang; setLang: (l: Lang) => void; email: string;
  profile: Profile; setProfile: (p: Profile) => void; lock: () => void; logout: () => void;
};

export default function Shell({ t, lang, setLang, email, profile, setProfile, lock, logout }: Props) {
  const [tab, setTab] = useState<Tab>("home");
  const [modal, setModal] = useState<Parameters<Open>[0] | null>(null);
  const { data, error, reload } = useData();
  const vm = data && viewModel(data, profile.currency, lang, profile.risk_profile, t);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(() => {
    setRefreshing(true);
    // a failed refresh just leaves the last stored prices in place
    api("/api/prices/refresh", { method: "POST" }).catch(() => null).then(() => reload()).finally(() => setRefreshing(false));
  }, [reload]);
  useEffect(() => {
    api("/api/prices/refresh", { method: "POST" }).catch(() => null).then(() => reload());
  }, [reload]);

  async function activate(g: Goal) {
    if (g.is_active) return;
    // one active goal per user (unique index): clear the old one first
    await supabase.from("goals").update({ is_active: false }).eq("is_active", true);
    await supabase.from("goals").update({ is_active: true }).eq("id", g.id);
    reload();
  }

  const close = () => setModal(null);
  const common = { t, onClose: close, onSaved: reload };
  const modalEl = modal && data && vm && (
    modal.type === "holding" ? <HoldingModal {...common} h={data.holdings.find((x) => x.id === modal.id)} usdIdr={vm.R} />
    : modal.type === "bank" ? <BankModal {...common} a={data.accounts.find((x) => x.id === modal.id)} canDelete={data.accounts.length > 1} />
    : <GoalModal {...common} g={data.goals.find((x) => x.id === modal.id)} hasActive={data.goals.some((x) => x.is_active)}
        total={vm.total} invest={vm.invest} retPct={vm.retPct} usdIdr={vm.R} loc={vm.loc} />
  );
  const setCur = (c: string) => {
    setProfile({ ...profile, currency: c as Profile["currency"] });
    supabase.from("profiles").update({ currency: c }).eq("user_id", profile.user_id).then();
  };

  const toggles = (pad: string) => (
    <>
      <Segmented options={[["IDR", "IDR"], ["USD", "USD"]]} value={profile.currency} onChange={setCur} pad={pad} />
      <Segmented options={[["en", "EN"], ["id", "ID"]]} value={lang} onChange={(v) => setLang(v as Lang)} pad={pad} />
      <button onClick={lock} className={`border-2 border-text hover:bg-neutral-200 font-extrabold text-xs cursor-pointer ${pad}`}>{t.lock}</button>
    </>
  );
  const tabs = (wide: boolean) => TABS.map((k) => (
    <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined}
      className={`whitespace-nowrap cursor-pointer text-sm ${tab === k ? "font-extrabold border-accent" : "border-transparent"} ${wide ? "border-b-2 pt-1 pb-0.5" : "border-b-3 pt-3 pb-[9px]"}`}>
      {t[k]}
    </button>
  ));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-bg border-b-2 border-text">
        {/* narrow: header row + scrolling tab row */}
        <div className="wide:hidden">
          <div className="flex items-center gap-2 px-4 py-2.5">
            <div className="flex-1"><Logo size={20} /></div>
            {toggles("px-[9px] py-2.5")}
          </div>
          <nav className="flex gap-5 overflow-x-auto px-4 border-t-2 border-text">{tabs(false)}</nav>
        </div>
        {/* wide: single 60px bar */}
        <div className="hidden wide:flex h-[60px] items-center gap-7 px-8">
          <Logo size={22} />
          <nav className="flex gap-[22px] flex-1 min-w-0">{tabs(true)}</nav>
          {toggles("px-2.5 py-[5px]")}
        </div>
      </header>

      {error && <div className="px-4 py-3 wide:px-8 text-sm font-semibold text-accent-700" role="alert">{error}</div>}
      {vm && tab === "home" && <Dashboard vm={vm} t={t} cur={profile.currency} open={setModal} activate={activate} />}
      {vm && data && tab === "cash" && <CashFlow data={data} t={t} cur={profile.currency} loc={vm.loc} open={setModal} reload={reload} />}
      {vm && tab === "holdings" && <Holdings vm={vm} t={t} open={setModal} refresh={refresh} refreshing={refreshing} />}
      {modalEl}
      {vm && tab === "goals" && <Goals vm={vm} t={t} profileLabel={profileLabel(t, profile.risk_profile)} open={setModal} activate={activate} />}
      {data && tab === "markets" && <Markets data={data} t={t} lang={lang} refresh={refresh} refreshing={refreshing} />}
      {data && tab === "settings" && <Settings t={t} lang={lang} setLang={setLang} email={email} profile={profile} setProfile={setProfile} data={data} reload={reload} lock={lock} logout={logout} />}
      {tab === "advisor" && <Advisor t={t} lang={lang} userId={profile.user_id} />}
    </div>
  );
}
