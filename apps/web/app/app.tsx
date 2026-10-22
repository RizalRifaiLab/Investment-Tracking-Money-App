"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { T, type Lang } from "@/lib/i18n";
import Auth, { type AuthStep } from "./auth";
import Shell, { type Profile } from "./shell";

const AUTO_LOCK_MS = 5 * 60 * 1000;
const LANG_KEY = "nilai-lang";

function storedLang(): Lang {
  try { return localStorage.getItem(LANG_KEY) === "id" ? "id" : "en"; } catch { return "en"; }
}

export default function App() {
  const [step, setStep] = useState<AuthStep | "loading" | "in">("loading");
  const [lang, setLangState] = useState<Lang>("en");
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const t = T[lang];

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(LANG_KEY, l); } catch {}
    setProfile((p) => {
      if (p) supabase.from("profiles").update({ language: l }).eq("user_id", p.user_id).then();
      return p && { ...p, language: l };
    });
  }, []);

  // On load: no session → signup; session without PIN → set one; otherwise ask for the PIN.
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setLangState(storedLang());
      if (!data.session) return setStep("signup");
      setEmail(data.session.user.email ?? "");
      const [{ data: hasPin }, { data: p }] = await Promise.all([
        supabase.rpc("has_pin"),
        supabase.from("profiles").select("*").eq("user_id", data.session.user.id).single(),
      ]);
      if (p) setProfile(p);
      setStep(hasPin ? "locked" : "setpin");
    });
  }, []);

  // Auto-lock after the app has been in the background for a while.
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > AUTO_LOCK_MS) setStep((s) => (s === "in" ? "locked" : s));
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const unlocked = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setStep("signup");
    const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();
    if (data) {
      setProfile(data);
      setLangState(data.language);
    }
    setStep("in");
  }, []);

  if (step === "loading") return <main className="min-h-screen bg-bg" />;
  if (step === "in" && profile)
    return (
      <Shell
        t={t} lang={lang} setLang={setLang} profile={profile} setProfile={setProfile} email={email}
        lock={() => setStep("locked")}
        logout={async () => { await supabase.auth.signOut(); setProfile(null); setEmail(""); setStep("signup"); }}
      />
    );
  return (
    <Auth
      t={t} lang={lang} setLang={setLang} step={step === "in" ? "locked" : step} setStep={setStep}
      email={email} setEmail={setEmail} name={profile?.name ?? ""} onUnlocked={unlocked}
    />
  );
}
