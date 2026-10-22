"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Lang, Strings } from "@/lib/i18n";
import { Segmented } from "./ui";

export type AuthStep = "signup" | "otp" | "setpin" | "confirmpin" | "locked";

// Set while a PIN reset is pending (forgot / locked out). In localStorage because the email link opens a new tab.
const RESET_KEY = "nilai-reset-pin";
export const resetPending = () => { try { return localStorage.getItem(RESET_KEY) === "1"; } catch { return false; } };
const setResetPending = (on: boolean) => { try { if (on) localStorage.setItem(RESET_KEY, "1"); else localStorage.removeItem(RESET_KEY); } catch {} };

type Props = {
  t: Strings; lang: Lang; setLang: (l: Lang) => void;
  step: AuthStep; setStep: (s: AuthStep) => void;
  email: string; setEmail: (e: string) => void; name: string;
  onUnlocked: () => void;
};

const input = "w-full min-h-12 px-3 py-2 text-base border-2 border-text bg-bg text-text";
const primary = "bg-accent hover:bg-accent-600 text-bg font-extrabold text-[15px] px-4 py-3.5 text-left cursor-pointer disabled:opacity-60";

export default function Auth({ t, lang, setLang, step, setStep, email, setEmail, name, onUnlocked }: Props) {
  const [signName, setSignName] = useState("");
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [pinBuf, setPinBuf] = useState("");
  const pinTmp = useRef("");

  const go = (s: AuthStep, e = "") => { setErr(e); setPinBuf(""); setStep(s); };

  async function sendCode(addr: string, opts: { name?: string; reset?: boolean; errMsg?: string } = {}) {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: addr, options: { data: opts.name ? { name: opts.name } : undefined, emailRedirectTo: location.origin } });
    setBusy(false);
    if (error) return setErr(error.message);
    setResetPending(!!opts.reset);
    setOtp("");
    go("otp", opts.errMsg);
  }

  async function signup() {
    const em = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return setErr(t.badEmail);
    setEmail(em);
    await sendCode(em, { name: signName.trim() || em.split("@")[0] });
  }

  async function verifyOtp() {
    if (!/^\d{6,10}$/.test(otp)) return setErr(t.badCode);
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: "email" });
    if (error) { setBusy(false); return setErr(error.message); }
    const { data: hasPin } = await supabase.rpc("has_pin");
    setBusy(false);
    go(hasPin && !resetPending() ? "locked" : "setpin");
  }

  async function pinComplete(buf: string) {
    if (step === "setpin") { pinTmp.current = buf; return go("confirmpin"); }
    if (step === "confirmpin") {
      if (buf !== pinTmp.current) return go("setpin", t.pinMismatch);
      const { error } = await supabase.rpc("set_pin", { new_pin: buf });
      if (error) return go("setpin", error.message);
      setResetPending(false);
      return onUnlocked();
    }
    // locked
    const { data: left, error } = await supabase.rpc("verify_pin", { pin: buf });
    if (error) return go("locked", error.message);
    if (left === 5) return onUnlocked();
    if (left === 0) {
      // Server already revoked every session; drop ours and send a fresh code.
      await supabase.auth.signOut({ scope: "local" });
      return sendCode(email, { reset: true, errMsg: t.lockedOut });
    }
    go("locked", t.wrongPin + left + t.triesLeft);
  }

  function press(k: string) {
    if (busy) return;
    if (k === "del") { setErr(""); return setPinBuf((b) => b.slice(0, -1)); }
    if (pinBuf.length >= 6) return;
    const buf = pinBuf + k;
    setErr("");
    setPinBuf(buf);
    if (buf.length === 6) {
      setBusy(true);
      setTimeout(() => pinComplete(buf).finally(() => setBusy(false)), 140);
    }
  }

  const pinMode = step === "setpin" || step === "confirmpin" || step === "locked";
  const pressRef = useRef(press);
  useEffect(() => { pressRef.current = press; });
  useEffect(() => {
    if (!pinMode) return;
    const kd = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) pressRef.current(e.key);
      else if (e.key === "Backspace") pressRef.current("del");
    };
    window.addEventListener("keydown", kd);
    return () => window.removeEventListener("keydown", kd);
  }, [pinMode]);

  const errEl = <div className="text-sm font-semibold text-accent-700 min-h-5" role="alert">{err}</div>;

  return (
    <main className="min-h-screen grid wide:grid-cols-[1.1fr_1fr]">
      <section className="bg-accent text-bg px-5 py-7 wide:p-14 flex flex-col justify-between gap-8">
        <div className="font-extrabold text-2xl tracking-[-0.02em]">Nilai</div>
        <div className="font-extrabold text-4xl wide:text-[64px] leading-[1.02] tracking-[-0.03em] max-w-[640px] text-pretty">{t.welcome}</div>
        <div className="text-sm font-semibold">IDR · USD · Crypto · Saham · ETF · Deposito · Reksa dana · Emas</div>
      </section>

      <section className="px-5 py-7 wide:p-14 flex flex-col justify-center gap-5 max-w-[540px] w-full">
        <Segmented options={[["en", "EN"], ["id", "ID"]]} value={lang} onChange={(v) => setLang(v as Lang)} className="self-start" pad="px-3 py-2" />

        {step === "signup" && (
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); signup(); }}>
            <h2 className="m-0 text-[32px] font-extrabold">{t.signup}</h2>
            <label className="flex flex-col gap-1.5"><span className="text-xs text-neutral-800">{t.name}</span>
              <input className={input} value={signName} onChange={(e) => setSignName(e.target.value)} autoComplete="name" /></label>
            <label className="flex flex-col gap-1.5"><span className="text-xs text-neutral-800">Email</span>
              <input className={input} type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }} placeholder="you@email.com" autoComplete="email" /></label>
            {errEl}
            <button className={primary} disabled={busy}>{t.cont} →</button>
          </form>
        )}

        {step === "otp" && (
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); verifyOtp(); }}>
            <h2 className="m-0 text-[32px] font-extrabold">{t.otpT}</h2>
            <div className="text-[15px] text-neutral-800">{t.otpS} <b className="text-text">{email}</b></div>
            <input className={`${input} min-h-14 text-[28px] font-extrabold tracking-[0.3em]`} value={otp} inputMode="numeric" autoComplete="one-time-code"
              maxLength={10} placeholder="000000" aria-label={t.otpT} onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "")); setErr(""); }} />
            {errEl}
            <button className={primary} disabled={busy}>{t.verify} →</button>
            <div className="flex gap-5 text-sm font-extrabold">
              <button type="button" className="text-accent-700 cursor-pointer" onClick={() => sendCode(email, { reset: resetPending() })} disabled={busy}>{t.resend}</button>
              <button type="button" className="text-accent-700 cursor-pointer" onClick={() => go("signup")}>{t.useOther}</button>
            </div>
          </form>
        )}

        {pinMode && (
          <div className="flex flex-col gap-[18px] max-w-[360px]">
            <h2 className="m-0 text-[32px] font-extrabold">
              {step === "locked" ? t.hi + (name ? ", " + name : "") : step === "confirmpin" ? t.confirmPin : t.setPin}
            </h2>
            <div className="text-[15px] text-neutral-800 min-h-[22px]">{step === "locked" ? t.enterPin : t.setPinS}</div>
            <div className="flex gap-2.5" aria-label={`${pinBuf.length} / 6`}>
              {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className={`size-[22px] border-2 border-text ${i < pinBuf.length ? "bg-text" : ""}`} />)}
            </div>
            {errEl}
            <div className="grid grid-cols-3 gap-0.5 bg-text border-2 border-text">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) => (
                <button key={i} type="button" disabled={!k} aria-label={k === "⌫" ? "Backspace" : k || undefined}
                  className={`h-16 bg-bg hover:bg-neutral-200 active:bg-accent-200 text-2xl font-extrabold text-left px-[18px] cursor-pointer ${k ? "" : "invisible"}`}
                  onClick={() => press(k === "⌫" ? "del" : k)}>{k}</button>
              ))}
            </div>
            {step === "locked" && (
              <button type="button" className="text-left text-sm font-extrabold text-accent-700 cursor-pointer"
                onClick={() => sendCode(email, { reset: true })} disabled={busy}>{t.forgot}</button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
