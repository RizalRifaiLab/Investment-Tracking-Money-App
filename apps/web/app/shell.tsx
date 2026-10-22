"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Lang, Strings } from "@/lib/i18n";
import { Segmented } from "./ui";

export type Profile = { user_id: string; name: string; currency: "IDR" | "USD"; language: Lang; risk_profile: string };

const TABS = ["home", "holdings", "cash", "goals", "markets", "advisor", "settings"] as const;
type Tab = (typeof TABS)[number];

type Props = {
  t: Strings; lang: Lang; setLang: (l: Lang) => void; email: string;
  profile: Profile; setProfile: (p: Profile) => void; lock: () => void; logout: () => void;
};

export default function Shell({ t, lang, setLang, email, profile, setProfile, lock, logout }: Props) {
  const [tab, setTab] = useState<Tab>("home");
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
            <div className="font-extrabold text-xl flex-1">Nilai</div>
            {toggles("px-[9px] py-2.5")}
          </div>
          <nav className="flex gap-5 overflow-x-auto px-4 border-t-2 border-text">{tabs(false)}</nav>
        </div>
        {/* wide: single 60px bar */}
        <div className="hidden wide:flex h-[60px] items-center gap-7 px-8">
          <div className="font-extrabold text-[22px] tracking-[-0.02em]">Nilai</div>
          <nav className="flex gap-[22px] flex-1 min-w-0">{tabs(true)}</nav>
          {toggles("px-2.5 py-[5px]")}
        </div>
      </header>

      <main className="px-4 py-5 wide:p-8">
        {tab === "settings" ? (
          <section className="flex flex-col gap-3 max-w-[540px]">
            <div className="text-xs font-extrabold uppercase tracking-[0.08em]">{t.account}</div>
            <div className="text-[32px] font-extrabold tracking-[-0.02em]">{profile.name}</div>
            <div className="text-[15px] text-neutral-800">{email}</div>
            <div className="flex gap-3">
              <button onClick={lock} className="border-2 border-text hover:bg-neutral-200 font-extrabold text-sm px-4 py-3 cursor-pointer">{t.lock}</button>
              <button onClick={logout} className="border-2 border-text hover:bg-neutral-200 font-extrabold text-sm px-4 py-3 cursor-pointer">{t.logout}</button>
            </div>
          </section>
        ) : (
          <section>
            <div className="text-xs font-extrabold uppercase tracking-[0.08em]">{t[tab]}</div>
            <div className="text-[32px] font-extrabold tracking-[-0.02em] mt-2">{t.comingSoon}</div>
          </section>
        )}
      </main>
    </div>
  );
}
