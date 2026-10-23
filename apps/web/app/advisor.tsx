"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NewsItem } from "@nilai/core";
import { supabase } from "@/lib/supabase";
import type { Lang, Strings } from "@/lib/i18n";
import { btnOutline, btnPrimary, Field, kicker, Segmented } from "./ui";

type Msg = { role: "user" | "assistant"; content: string };
type Settings = { rules: string; defaultRules: string; model: string; provider: string; keyHint: string | null; claudeKeyHint: string | null };

async function call<T>(method: string, body?: unknown): Promise<{ ok: boolean; status: number; j: T }> {
  const { data } = await supabase.auth.getSession();
  const r = await fetch("/api/advisor", {
    method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: r.ok, status: r.status, j: await r.json().catch(() => ({}) as T) };
}

export function Advisor({ t, lang, userId }: { t: Strings; lang: Lang; userId: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [st, setSt] = useState<Settings | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [note, setNote] = useState("");
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(() => call<{ messages: Msg[]; news: NewsItem[]; settings: Settings }>("GET").then(({ ok, j }) => {
    if (!ok) return;
    setMsgs(j.messages); setNews(j.news); setSt(j.settings);
  }), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs, busy]);

  const errFor = (code?: string, fallback?: string) =>
    code === "limit" ? t.errLimit : code === "nokey" ? t.errNoKey : code === "auth" ? t.errKeyAuth : fallback ?? t.errRead;

  async function ask(q: string) {
    q = q.trim();
    if (!q || busy) return;
    setErr(""); setInput(""); setBusy(true);
    setMsgs((m) => [...m, { role: "user", content: q }]);
    const { ok, j } = await call<{ reply?: string; code?: string; error?: string }>("POST", { message: q });
    setBusy(false);
    if (ok && j.reply) setMsgs((m) => [...m, { role: "assistant", content: j.reply! }]);
    else { setMsgs((m) => m.slice(0, -1)); setInput(q); setErr(errFor(j.code, j.error)); }
  }

  async function saveSettings(p: Partial<Pick<Settings, "rules" | "model" | "provider">>) {
    if (!st) return;
    const next = { ...st, ...p };
    setSt(next);
    // rules equal to the default are stored as null so future default improvements still apply
    const { error } = await supabase.from("advisor_settings").upsert({ user_id: userId, rules: next.rules.trim() === next.defaultRules.trim() ? null : next.rules, model: next.model, provider: next.provider });
    setNote(error ? error.message : t.saved);
  }
  async function saveKey(apiKey: string | null) {
    if (!st) return;
    setNote("");
    const { ok, j } = await call<{ keyHint?: string | null; code?: string; error?: string }>("PUT", { apiKey, provider: st.provider });
    if (!ok) return setNote(j.code === "format" ? t.errKeyFormat : errFor(j.code, j.error));
    setKeyDraft("");
    setSt((s) => s && { ...s, [s.provider === "claude" ? "claudeKeyHint" : "keyHint"]: j.keyHint ?? null });
    setNote(t.saved);
  }
  const isClaude = st?.provider === "claude";
  const hint = isClaude ? st?.claudeKeyHint : st?.keyHint;

  const quick = lang === "id"
    ? [t.q5, "Gajiku bulan ini sebaiknya ke mana?", "Apakah aku on track ke target aktifku?", "Investasi terbaik jangka panjang untukku?"]
    : [t.q5, "Where should this month’s salary go?", "Am I on track for my active goal?", "Best long-term investment for me?"];
  const fmtDate = (d: string) => (d ? new Date(d).toLocaleDateString(lang === "id" ? "id-ID" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

  return (
    <div className="grid wide:grid-cols-[1.6fr_1fr] gap-0.5 bg-text border-b-2 border-text">
      <section className="bg-bg px-4 py-5 wide:p-8 flex flex-col gap-4 min-w-0">
        <div className={`${kicker} text-accent-700`}>{t.advisor}</div>
        <div className="flex flex-col gap-3">
          {!msgs.length && <div className="text-[15px] text-neutral-800 text-pretty">{t.chatIntro}</div>}
          {st && !hint && <div className="text-sm font-extrabold text-accent-700">{t.errNoKey}</div>}
          {msgs.map((m, i) => (
            <div key={i} className={`flex flex-col gap-1 ${m.role === "user" ? "bg-surface p-3" : "py-1"}`}>
              <div className={`text-[11px] font-extrabold tracking-[0.08em] uppercase ${m.role === "user" ? "text-neutral-700" : "text-accent-700"}`}>
                {m.role === "user" ? (lang === "id" ? "Kamu" : "You") : (lang === "id" ? "Penasihat Nilai" : "Nilai advisor")}
              </div>
              <div className="text-[15px] whitespace-pre-wrap text-pretty">{m.content}</div>
            </div>
          ))}
          {busy && <div className="text-sm font-extrabold text-accent-700">{t.thinking}</div>}
          <div ref={end} />
        </div>
        <div className="flex flex-wrap gap-2">
          {quick.map((q) => <button key={q} onClick={() => ask(q)} disabled={busy} className="text-[13px] font-extrabold px-3 py-2 border-2 border-text hover:bg-neutral-200 cursor-pointer text-left">{q}</button>)}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t.chatPh} maxLength={2000} aria-label={t.chatPh}
            className="flex-1 min-w-0 min-h-12 px-3 py-2 text-base border-2 border-text bg-bg text-text" />
          <button className={btnPrimary} disabled={busy || !input.trim()}>{t.ask}</button>
        </form>
        <div className="text-sm font-semibold text-accent-700" role="alert">{err}</div>
        <div className="text-xs text-neutral-700">{t.disclaimer}</div>
      </section>

      <aside className="bg-bg flex flex-col min-w-0">
        <div className="px-6 pt-5 pb-3 flex flex-col gap-1">
          <div className={kicker}>{t.headlines}</div>
          <div className="text-xs text-neutral-700">{t.headlinesNote}</div>
        </div>
        <ul className="max-h-[520px] overflow-auto border-t border-divider">
          {news.map((n) => (
            <li key={n.link} className="px-6 py-3 border-b border-divider">
              <a href={n.link} target="_blank" rel="noopener noreferrer" className="text-sm font-extrabold text-text hover:text-accent-700 text-pretty">{n.title}</a>
              <div className="text-xs text-neutral-700 mt-0.5">{n.source} · {fmtDate(n.date)}</div>
            </li>
          ))}
        </ul>

        {st && (
          <details className="px-6 py-5 border-t-2 border-text" open={!hint}>
            <summary className={`${kicker} cursor-pointer`}>{t.advSettings}</summary>
            <div className="flex flex-col gap-4 mt-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-neutral-800">{t.rulesL}</span>
                <textarea value={st.rules} onChange={(e) => setSt({ ...st, rules: e.target.value })} onBlur={() => saveSettings({ rules: st.rules })}
                  rows={9} maxLength={4000} className="w-full px-3 py-2 text-[13px] border-2 border-text bg-bg text-text font-mono" />
              </label>
              <button className="self-start text-[13px] font-extrabold text-accent-700 cursor-pointer" onClick={() => saveSettings({ rules: st.defaultRules })}>{t.resetRules}</button>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-neutral-800">{t.providerL}</span>
                <Segmented options={[["deepseek", "DeepSeek"], ["claude", "Claude"]]} value={st.provider} onChange={(provider) => { setKeyDraft(""); saveSettings({ provider }); }} className="self-start" pad="px-3 py-2" />
              </div>
              {isClaude ? <div className="text-xs text-neutral-700">{t.claudeModelNote}</div> : (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-neutral-800">{t.modelL}</span>
                  <Segmented options={[["deepseek-flash", "Flash"], ["deepseek-v4-pro", "Pro"]]} value={st.model} onChange={(model) => saveSettings({ model })} className="self-start" pad="px-3 py-2" />
                </div>
              )}
              <Field label={isClaude ? t.ownKeyClaude : t.ownKey} type="password" autoComplete="off" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder={hint ? t.keyActive + hint : isClaude ? "sk-ant-…" : "sk-…"} />
              <div className="text-xs text-neutral-700">{isClaude ? t.keyNoteClaude : t.keyNote}</div>
              <div className="flex gap-2 flex-wrap">
                <button className={btnOutline} onClick={() => saveKey(keyDraft)} disabled={!keyDraft.trim()}>{t.saveKey}</button>
                {hint && <button className="text-[13px] font-extrabold text-accent-700 cursor-pointer" onClick={() => saveKey(null)}>{t.removeKey}</button>}
              </div>
              <div className="text-sm font-semibold text-accent-700" role="status">{note}</div>
            </div>
          </details>
        )}
      </aside>
    </div>
  );
}
