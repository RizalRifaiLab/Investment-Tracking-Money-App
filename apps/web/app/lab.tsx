"use client";

import { useCallback, useEffect, useState } from "react";
import { formatLong, formatShort, PAPER_BENCHMARK } from "@nilai/core";
import { supabase } from "@/lib/supabase";
import type { Lang, Strings } from "@/lib/i18n";
import { btnPrimary, kicker, Segmented } from "./ui";

type Run = { created_at: string; note: string; value_idr: number; bench_idr: number };
type Trade = { created_at: string; symbol: string; side: "buy" | "sell"; qty: number; price: number; currency: string; usd_idr: number; fee_idr: number; reason: string };
type Lab = {
  account: { start_idr: number; cash_idr: number; last_run_at: string | null; created_at: string } | null;
  amounts?: number[]; runs?: Run[]; trades?: Trade[]; benchValue?: number | null;
  positions?: { symbol: string; name: string; qty: number; price_idr: number | null }[];
};

async function call<T>(method: string, body?: unknown): Promise<{ ok: boolean; j: T }> {
  const { data } = await supabase.auth.getSession();
  const r = await fetch("/api/paper", {
    method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: r.ok, j: await r.json().catch(() => ({}) as T) };
}

const S = (v: number) => formatShort(v, "IDR", 1);
const L = (v: number) => formatLong(v, "IDR", 1);
const signed = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1) + "%";
const cell = "bg-bg p-4 wide:p-6 flex flex-col gap-1.5 min-w-0";

export function PaperLab({ t, lang }: { t: Strings; lang: Lang }) {
  const [d, setD] = useState<Lab | null>(null);
  const [amount, setAmount] = useState("100000000");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => call<Lab>("GET").then(({ ok, j }) => ok && setD(j)), []);
  useEffect(() => { load(); }, [load]);

  const errFor = (j: { code?: string; error?: string }) => ({
    nokey: t.labNoKey, cooldown: t.labCooldown, badreply: t.labBadReply, prices: t.labPrices, auth: t.errKeyAuth, rate: t.labRate,
  } as Record<string, string>)[j.code ?? ""] ?? j.error ?? t.errRead;

  async function act(body: object, confirmText?: string) {
    if (busy || (confirmText && !confirm(confirmText))) return;
    setBusy(true); setMsg("");
    const { ok, j } = await call<{ code?: string; error?: string; fills?: number }>("POST", body);
    setBusy(false);
    if (!ok) setMsg(errFor(j));
    else if ("action" in body && body.action === "run") setMsg(j.fills ? t.labTraded.replace("{n}", String(j.fills)) : t.labNoTrades);
    load();
  }

  if (!d) return null;
  const when = (s: string) => new Date(s).toLocaleString(lang === "id" ? "id-ID" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const benchText = Object.entries(PAPER_BENCHMARK).map(([s, w]) => `${w * 100}% ${s.replace(/-USD$|\.JK$/, "")}`).join(" · ");

  if (!d.account) return (
    <section className="px-4 py-6 wide:p-8 flex flex-col gap-4 max-w-[720px] border-b-2 border-text">
      <div className={`${kicker} text-accent-700`}>{t.lab}</div>
      <h2 className="text-[26px] font-extrabold leading-tight text-balance">{t.labTitle}</h2>
      <p className="text-[15px] text-neutral-800 text-pretty">{t.labIntro}</p>
      <p className="text-sm text-neutral-800">{t.labBench} {benchText}.</p>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-neutral-800">{t.labStart}</span>
        <Segmented options={(d.amounts ?? []).map((a) => [String(a), S(a)])} value={amount} onChange={setAmount} className="self-start" pad="px-3 py-2" />
      </div>
      <button className={`${btnPrimary} self-start`} disabled={busy} onClick={() => act({ action: "start", amount: Number(amount) })}>{t.labStartBtn}</button>
      <div className="text-sm font-semibold text-accent-700" role="alert">{msg}</div>
      <p className="text-xs text-neutral-700">{t.labNote}</p>
    </section>
  );

  const a = d.account, runs = d.runs ?? [], trades = d.trades ?? [], positions = d.positions ?? [];
  const start = Number(a.start_idr), cash = Number(a.cash_idr);
  const priced = positions.every((p) => p.price_idr !== null);
  const value = cash + positions.reduce((v, p) => v + p.qty * (p.price_idr ?? 0), 0);
  const bench = d.benchValue ?? null;
  const ret = (v: number) => (v / start - 1) * 100;
  const lead = bench === null ? null : ret(value) - ret(bench);

  return (
    <div className="border-b-2 border-text">
      <div className="grid grid-cols-1 wide:grid-cols-3 gap-0.5 bg-text border-b-2 border-text">
        <div className={cell}>
          <div className={kicker}>{t.labAi}</div>
          <div className="text-[28px] font-extrabold">{priced ? S(value) : "—"}</div>
          <div className="text-sm text-neutral-800">{priced ? signed(ret(value)) : ""} · {t.labFrom} {S(start)}</div>
        </div>
        <div className={cell}>
          <div className={kicker}>{t.labBenchK}</div>
          <div className="text-[28px] font-extrabold">{bench === null ? "—" : S(bench)}</div>
          <div className="text-sm text-neutral-800">{bench === null ? "" : signed(ret(bench))} · {benchText}</div>
        </div>
        <div className={cell}>
          <div className={kicker}>{t.labScore}</div>
          <div className={`text-[28px] font-extrabold ${lead !== null && lead < 0 ? "text-accent-700" : ""}`}>{lead === null || !priced ? "—" : signed(lead)}</div>
          <div className="text-sm text-neutral-800">{lead === null || !priced ? "" : lead >= 0 ? t.labAhead : t.labBehind}</div>
        </div>
      </div>

      <div className="grid wide:grid-cols-[1.6fr_1fr] gap-0.5 bg-text">
        <section className="bg-bg px-4 py-5 wide:p-8 flex flex-col gap-4 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <button className={btnPrimary} disabled={busy} onClick={() => act({ action: "run" })}>{busy ? t.thinking : t.labRun}</button>
            <span className="text-sm text-neutral-800">{a.last_run_at ? t.labLast + when(a.last_run_at) : t.labNever} · {t.labDaily}</span>
          </div>
          <div className="text-sm font-semibold text-accent-700" role="status">{msg}</div>
          <Chart runs={runs} start={start} startAt={a.created_at} t={t} />
          {runs.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className={kicker}>{t.labNoteK} · {when(runs[runs.length - 1].created_at)}</div>
              <div className="text-[15px] whitespace-pre-wrap text-pretty">{runs[runs.length - 1].note}</div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <div className={kicker}>{t.labTrades}</div>
            {!trades.length && <div className="text-sm text-neutral-800">{t.labNoTradesYet}</div>}
            <ul className="flex flex-col">
              {trades.map((x, i) => (
                <li key={i} className="py-2.5 border-b border-divider flex flex-col gap-0.5">
                  <div className="text-sm"><span className={`font-extrabold ${x.side === "buy" ? "" : "text-accent-700"}`}>{x.side === "buy" ? t.labBuy : t.labSell}</span>{" "}
                    <span className="font-extrabold">{x.symbol}</span> · {L(Number(x.qty) * Number(x.price) * Number(x.usd_idr))} · <span className="text-neutral-700">{when(x.created_at)}</span></div>
                  <div className="text-[13px] text-neutral-800 text-pretty">{x.reason}</div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside className="bg-bg px-4 py-5 wide:p-6 flex flex-col gap-3 min-w-0">
          <div className={kicker}>{t.labPositions}</div>
          <table className="w-full text-sm">
            <tbody>
              {positions.map((p) => (
                <tr key={p.symbol} className="border-b border-divider">
                  <td className="py-2"><div className="font-extrabold">{p.symbol}</div><div className="text-xs text-neutral-700">{p.name}</div></td>
                  <td className="py-2 text-right tabular-nums">{p.price_idr === null ? "—" : S(p.qty * p.price_idr)}<div className="text-xs text-neutral-700">{p.price_idr === null ? "" : ((p.qty * p.price_idr / value) * 100).toFixed(1) + "%"}</div></td>
                </tr>
              ))}
              <tr><td className="py-2 font-extrabold">{t.labCash}</td><td className="py-2 text-right tabular-nums">{S(cash)}<div className="text-xs text-neutral-700">{((cash / value) * 100).toFixed(1)}%</div></td></tr>
            </tbody>
          </table>
          <p className="text-xs text-neutral-700">{t.labNote}</p>
          <button className="self-start text-[13px] font-extrabold text-accent-700 cursor-pointer" disabled={busy} onClick={() => act({ action: "reset" }, t.labResetConfirm)}>{t.labReset}</button>
        </aside>
      </div>
    </div>
  );
}

/** AI portfolio (accent) vs buy-and-hold (ink), one point per run, starting from the opening amount. */
function Chart({ runs, start, startAt, t }: { runs: Run[]; start: number; startAt: string; t: Strings }) {
  if (runs.length < 2) return <div className="text-sm text-neutral-800">{t.labChartSoon}</div>;
  const pts = [{ created_at: startAt, value_idr: start, bench_idr: start }, ...runs].map((r) => ({ x: new Date(r.created_at).getTime(), a: Number(r.value_idr), b: Number(r.bench_idr) }));
  const W = 600, H = 180, P = 6;
  const x0 = pts[0].x, x1 = pts[pts.length - 1].x || x0 + 1;
  const ys = pts.flatMap((p) => [p.a, p.b]), lo = Math.min(...ys), hi = Math.max(...ys) || lo + 1;
  const X = (x: number) => P + ((x - x0) / (x1 - x0 || 1)) * (W - 2 * P);
  const Y = (y: number) => H - P - ((y - lo) / (hi - lo || 1)) * (H - 2 * P);
  const line = (k: "a" | "b") => pts.map((p) => `${X(p.x).toFixed(1)},${Y(p[k]).toFixed(1)}`).join(" ");
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" role="img" aria-label={`${t.labAi} vs ${t.labBenchK}`}>
        <line x1={P} x2={W - P} y1={Y(start)} y2={Y(start)} stroke="var(--color-divider)" strokeDasharray="4 4" />
        <polyline points={line("b")} fill="none" stroke="var(--color-text)" strokeWidth={2} />
        <polyline points={line("a")} fill="none" stroke="var(--color-accent)" strokeWidth={2.5} />
      </svg>
      <figcaption className="flex gap-4 text-xs text-neutral-800">
        <span><span className="inline-block w-3 h-0.5 bg-accent align-middle mr-1.5" />{t.labAi}</span>
        <span><span className="inline-block w-3 h-0.5 bg-text align-middle mr-1.5" />{t.labBenchK}</span>
        <span>{t.labStartLine}</span>
      </figcaption>
    </figure>
  );
}
