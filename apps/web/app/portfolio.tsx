"use client";

import { useState } from "react";
import { etaDate, formatChange, formatLong, formatPct, formatShort, monthsTo, RETURN_PCT, type Currency, type RiskProfile, type Row, type RowClass, buildPortfolio } from "@nilai/core";
import type { Lang, Strings } from "@/lib/i18n";
import type { Data, Goal } from "./data";
import { btnOutline, btnPrimary, kicker } from "./ui";

// Allocation colours in CLASS_ORDER, from the design spec.
const CLASS_COLORS = ["bg-accent", "bg-neutral-900", "bg-neutral-700", "bg-accent-300", "bg-neutral-500", "bg-accent-700", "bg-neutral-400", "bg-neutral-300"];
const FILTERS: (RowClass | "All")[] = ["All", "Crypto", "IDX stocks", "US stocks", "ETF", "Cash", "Deposito", "Reksa dana", "Gold"];

export type Open = (m: { type: "holding" | "bank" | "goal"; id?: string }) => void;

/** Everything the two screens display, derived from the loaded data. */
export function viewModel(data: Data, cur: Currency, lang: Lang, profile: RiskProfile, t: Strings) {
  const loc = lang === "id" ? "id-ID" : "en-GB";
  const R = data.usdIdr;
  const S = (v: number) => formatShort(v, cur, R);
  const p = buildPortfolio(data.holdings, data.accounts, loc);
  const invest = (Number(data.salary?.amount) || 0) * (Number(data.salary?.invest_pct) || 0) / 100;
  const retPct = RETURN_PCT[profile];
  const active = data.goals.find((g) => g.is_active) ?? data.goals[0];
  const goals = data.goals.map((g) => {
    const target = Number(g.target_idr), n = monthsTo(p.total, target, invest, retPct), d = etaDate(n);
    return {
      ...g, target, active: g.id === active?.id, targetS: S(target), pct: formatPct(Math.min(1, p.total / target)),
      eta: n === 0 ? t.reached : d ? d.toLocaleDateString(loc, { month: "short", year: "numeric" }) : t.yrs60,
    };
  });
  const anyLive = p.rows.some((r) => r.live);
  return { ...p, loc, R, S, invest, retPct, goals, ag: goals.find((g) => g.active), anyLive };
}
type VM = ReturnType<typeof viewModel>;

function useFilter(vm: VM, t: Strings) {
  const [filter, setFilter] = useState<RowClass | "All">("All");
  const rows = filter === "All" ? vm.rows : vm.rows.filter((r) => r.cls === filter);
  const sum = rows.reduce((s, r) => s + r.idr, 0);
  const chips = (
    <div className="flex flex-wrap gap-2">
      {FILTERS.map((f) => {
        const count = f === "All" ? vm.rows.length : vm.rows.filter((r) => r.cls === f).length;
        if (!count && f !== "All") return null;
        return (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={f === filter}
            className={`font-extrabold text-[13px] px-3 py-[7px] border-2 border-text cursor-pointer ${f === filter ? "bg-text text-bg" : ""}`}>
            {f === "All" ? t.all : f} <span className="font-normal">{count}</span>
          </button>
        );
      })}
    </div>
  );
  return { rows, sumS: vm.S(sum), share: formatPct(vm.total ? sum / vm.total : 0), chips, setFilter };
}

const chg = (r: Row) => (r.cls === "Cash" || r.cls === "Deposito" || !r.live ? "—" : formatChange(r.chg));
const chgCol = (r: Row) => (r.live && r.chg < 0 ? "text-accent-700" : "");

function Table({ vm, rows, t, open, detailed }: { vm: VM; rows: Row[]; t: Strings; open: Open; detailed?: boolean }) {
  const cols = detailed ? "wide:grid-cols-[2fr_1fr_1fr_1fr_1.1fr_.7fr_.6fr_1fr]" : "wide:grid-cols-[2.2fr_1fr_1.1fr_1.2fr_.8fr_.7fr]";
  const grid = `grid grid-cols-[1fr_auto] ${cols} gap-3`;
  const W = "hidden wide:block";
  return (
    <div>
      <div className={`${grid} text-xs font-extrabold tracking-[0.06em] uppercase py-2 border-b-2 border-text`}>
        <span>{t.instrument}</span><span className={W}>{t.cls}</span><span className={W}>{t.qty}</span>
        {detailed && <span className={`${W} text-right`}>{t.price}</span>}
        <span className="text-right">{t.value}</span><span className={`${W} text-right`}>{t.todayCol}</span><span className={`${W} text-right`}>{t.weight}</span>
        {detailed && <span className={W}>{t.source}</span>}
      </div>
      {rows.map((r) => (
        <button key={r.id} onClick={() => open({ type: r.kind, id: r.id })}
          className={`${grid} w-full text-sm ${detailed ? "py-3" : "py-2.5"} border-b border-divider items-baseline text-left cursor-pointer hover:bg-neutral-200`}>
          <span>
            <b>{r.name}</b> <span className="text-neutral-700 text-xs">{r.ticker}</span>
            <span className="block wide:hidden text-xs text-neutral-700">{r.cls} · {r.qtyS}{detailed ? " · " + r.src : ""}</span>
          </span>
          <span className={W}>{r.cls}</span><span className={W}>{r.qtyS}</span>
          {detailed && <span className={`${W} text-right`}>{r.priceS}</span>}
          <span className="text-right"><b>{vm.S(r.idr)}</b><span className={`block wide:hidden text-xs ${chgCol(r)}`}>{chg(r)}</span></span>
          <span className={`${W} text-right ${chgCol(r)}`}>{chg(r)}</span>
          <span className={`${W} text-right`}>{formatPct(vm.total ? r.idr / vm.total : 0)}</span>
          {detailed && <span className={`${W} text-xs font-semibold ${r.live ? "text-accent-700" : "text-neutral-700"}`}>{r.src}</span>}
        </button>
      ))}
    </div>
  );
}

export function Dashboard({ vm, t, cur, open, activate }: { vm: VM; t: Strings; cur: Currency; open: Open; activate: (g: Goal) => void }) {
  const f = useFilter(vm, t);
  const todayS = new Date().toLocaleDateString(vm.loc, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const dayS = vm.anyLive ? (vm.day >= 0 ? "+" : "−") + vm.S(Math.abs(vm.day)) + " (" + formatChange(vm.total ? (vm.day / vm.total) * 100 : 0) + ")" : "—";
  const ag = vm.ag;
  const cell = "bg-bg px-4 py-5 wide:p-8 flex flex-col";
  return (
    <div>
      <div className="grid wide:grid-cols-[2fr_1fr] gap-0.5 bg-text border-b-2 border-text">
        <div className={`${cell} gap-2`}>
          <div className={kicker}>{t.netWorth} · {todayS}</div>
          <div className="text-[44px] wide:text-[84px] font-extrabold tracking-[-0.035em] leading-none [overflow-wrap:anywhere]">{formatLong(vm.total, cur, vm.R)}</div>
          <div className="text-[15px] text-neutral-800">{dayS} {t.today} · {vm.S(vm.invest)} {t.investLine}</div>
        </div>
        <div className={`${cell} gap-2.5`}>
          {ag ? (
            <>
              <div className={kicker}>{t.activeGoal} · {ag.name}</div>
              <div className="flex items-baseline gap-2.5 flex-wrap"><span className="text-[64px] font-extrabold tracking-[-0.03em] leading-none">{ag.pct}</span><span className="text-[15px]">{t.of} {ag.targetS}</span></div>
              <div className="h-3 bg-neutral-300"><div className="h-full bg-accent" style={{ width: ag.pct }} /></div>
              <div className="text-sm text-neutral-800">{t.eta} {ag.eta} · {vm.S(vm.invest)}{t.perMonth} · {vm.retPct}%{t.perYear}</div>
            </>
          ) : (
            <>
              <div className={kicker}>{t.activeGoal}</div>
              <div className="text-[32px] font-extrabold tracking-[-0.02em]">{t.noGoal}</div>
              <button className={`${btnPrimary} self-start`} onClick={() => open({ type: "goal" })}>{t.newGoal}</button>
            </>
          )}
        </div>
      </div>

      {vm.goals.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-0.5 overflow-hidden border-b-2 border-text">
          {vm.goals.map((g) => (
            <div key={g.id} className={`relative shadow-[2px_0_0_var(--color-text),0_2px_0_var(--color-text),2px_2px_0_var(--color-text)] ${g.active ? "bg-accent-100" : "bg-bg hover:bg-neutral-200"}`}>
              <button onClick={() => activate(g)} aria-pressed={g.active} className="w-full text-left cursor-pointer px-6 py-5 flex flex-col gap-2">
                <div className="flex justify-between gap-2 text-sm w-full"><span className="font-extrabold">{g.name}</span><span>{g.targetS}</span></div>
                <div className="text-[32px] font-extrabold tracking-[-0.02em]">{g.pct}</div>
                <div className="h-1.5 bg-neutral-300 w-full"><div className={`h-full ${g.active ? "bg-accent" : "bg-text"}`} style={{ width: g.pct }} /></div>
                <div className="text-[13px] text-neutral-800">{t.eta} {g.eta}</div>
              </button>
              <button onClick={() => open({ type: "goal", id: g.id })} className="absolute bottom-4 right-5 text-[13px] font-extrabold text-accent-700 cursor-pointer">{t.edit}</button>
            </div>
          ))}
          <button onClick={() => open({ type: "goal" })} className="shadow-[2px_0_0_var(--color-text),0_2px_0_var(--color-text),2px_2px_0_var(--color-text)] bg-bg hover:bg-neutral-200 text-left cursor-pointer px-6 py-5 font-extrabold text-sm text-accent-700">{t.newGoal}</button>
        </div>
      )}

      {vm.classes.length > 0 && (
        <div className="px-4 py-5 wide:p-8 flex flex-col gap-5 border-b-2 border-text">
          <div className={kicker}>{t.allocation}</div>
          <div className="flex h-7 gap-0.5">{vm.classes.map((c) => <div key={c.cls} className={CLASS_COLORS[c.colorIndex]} style={{ width: formatPct(c.share) }} />)}</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-2 text-[13px]">
            {vm.classes.map((c) => (
              <button key={c.cls} onClick={() => f.setFilter(c.cls)} className="flex gap-2 items-center text-left cursor-pointer">
                <span className={`size-2.5 shrink-0 ${CLASS_COLORS[c.colorIndex]}`} /><span className="flex-1">{c.cls}</span><b>{formatPct(c.share)}</b>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 py-5 wide:p-8">
        <div className="flex justify-between items-baseline gap-3 flex-wrap mb-3">
          <div className={kicker}>{t.holdings}</div>
          <div className="text-sm"><b>{f.sumS}</b> <span className="text-neutral-800">· {f.share} {t.ofNW}</span></div>
        </div>
        {vm.rows.length ? (
          <>
            <div className="mb-4">{f.chips}</div>
            <Table vm={vm} rows={f.rows} t={t} open={open} />
          </>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <button className={btnPrimary} onClick={() => open({ type: "holding" })}>{t.addHolding}</button>
            <button className={btnOutline} onClick={() => open({ type: "bank" })}>{t.addBank}</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Holdings({ vm, t, open }: { vm: VM; t: Strings; open: Open }) {
  const f = useFilter(vm, t);
  return (
    <div className="px-4 py-5 wide:p-8 flex flex-col gap-4">
      <div className="flex justify-between items-end gap-4 flex-wrap">
        <div className="flex flex-col gap-1.5 flex-1 min-w-60">
          <div className={kicker}>{t.holdings}</div>
          <div className="text-[44px] font-extrabold tracking-[-0.03em] leading-[1.05]">{f.sumS}</div>
          <div className="text-[13px] text-neutral-800">{f.share} {t.ofNW} · {vm.anyLive ? "" : t.pricesManual + " · "}USD/IDR {Math.round(vm.R).toLocaleString("id-ID")}</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className={btnOutline} onClick={() => open({ type: "bank" })}>{t.addBank}</button>
          <button className={btnPrimary} onClick={() => open({ type: "holding" })}>{t.addHolding}</button>
        </div>
      </div>
      {f.chips}
      <Table vm={vm} rows={f.rows} t={t} open={open} detailed />
    </div>
  );
}
