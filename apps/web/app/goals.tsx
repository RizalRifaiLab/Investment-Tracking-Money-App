"use client";

import { MAX_MONTHS, projectPath } from "@nilai/core";
import type { Strings } from "@/lib/i18n";
import type { Goal } from "./data";
import type { Open, viewModel } from "./portfolio";
import { btnOutline, kicker } from "./ui";

type VM = ReturnType<typeof viewModel>;
const W = 800, H = 280;
const cellShadow = "shadow-[2px_0_0_var(--color-text),0_2px_0_var(--color-text),2px_2px_0_var(--color-text)]";

export function Goals({ vm, t, profileLabel, open, activate }: { vm: VM; t: Strings; profileLabel: string; open: Open; activate: (g: Goal) => void }) {
  // Chart long enough to show every reachable goal (+6 months), between 2 and 30 years.
  const maxN = Math.min(360, Math.max(24, ...vm.goals.filter((g) => g.n < MAX_MONTHS).map((g) => g.n + 6)));
  const proj = projectPath(vm.total, maxN, vm.invest, vm.retPct);
  const PM = Math.max(proj[proj.length - 1], ...vm.goals.filter((g) => g.n <= maxN).map((g) => g.target)) * 1.05 || 1;
  const st = W / maxN, Y = (v: number) => H - (v / PM) * H;
  const line = proj.map((v, i) => (i ? "L" : "M") + (i * st).toFixed(1) + "," + Y(v).toFixed(1)).join(" ");
  const now = new Date();
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => new Date(now.getFullYear(), now.getMonth() + Math.round(maxN * f), 1).getFullYear() + (f === 0 ? t.now : ""));
  const stat = (label: string, value: string) => (
    <div className={`${cellShadow} bg-bg px-4 py-5 wide:p-8`}><div className={kicker}>{label}</div><div className="text-[28px] wide:text-4xl font-extrabold tracking-[-0.02em]">{value}</div></div>
  );

  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-0.5 overflow-hidden border-b-2 border-text">
        {stat(t.netWorth, vm.S(vm.total))}
        {stat(t.monthly, vm.S(vm.invest))}
        {stat(`${t.expReturn} · ${profileLabel}`, vm.retPct + "%")}
      </div>

      <div className="px-4 py-5 wide:p-8 border-b-2 border-text flex flex-col gap-3">
        <div className="flex justify-between items-baseline gap-3 flex-wrap">
          <div className={kicker}>{t.projection}</div>
          <div className="text-[13px] text-neutral-800">{t.assumes}{vm.retPct}%{t.perYear}, {vm.S(vm.invest)}{t.perMonth}</div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full block overflow-visible" role="img" aria-label={t.projection}>
          {vm.goals.filter((g) => g.target <= PM).map((g) => (
            <g key={g.id}>
              <line x1="0" x2={W} y1={Y(g.target)} y2={Y(g.target)} stroke="var(--color-text)" strokeWidth="1" strokeDasharray="4 4" />
              <text x="4" y={Y(g.target) - 6} fontSize="13" fontWeight="800" fill="var(--color-text)">{g.name} · {g.targetS}</text>
              <circle cx={Math.min(W, g.n * st)} cy={Y(g.target)} r="5" fill="var(--color-accent)" />
            </g>
          ))}
          <path d={`${line} L${(maxN * st).toFixed(1)},${H} L0,${H} Z`} fill="var(--color-accent-100)" />
          <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth="3" />
        </svg>
        <div className="flex justify-between text-xs text-neutral-700">{ticks.map((y, i) => <span key={i}>{y}</span>)}</div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-0.5 overflow-hidden border-b-2 border-text">
        {vm.goals.map((g) => (
          <div key={g.id} className={`${cellShadow} ${g.active ? "bg-accent-100" : "bg-bg"} p-6 flex flex-col gap-2.5`}>
            <div className="flex justify-between gap-2"><span className="font-extrabold text-lg">{g.name}</span>{g.active && <span className="text-xs font-extrabold tracking-[0.06em] uppercase text-accent-700">{t.activeGoal}</span>}</div>
            <div className="text-sm">{t.of} {g.targetS}</div>
            <div className="text-[40px] font-extrabold tracking-[-0.02em] leading-none">{g.pct}</div>
            <div className="h-2 bg-neutral-300"><div className={`h-full ${g.active ? "bg-accent" : "bg-text"}`} style={{ width: g.pct }} /></div>
            <div className="text-sm text-neutral-800">{t.eta} {g.eta} · {g.gapS}</div>
            <div className="flex gap-2 mt-1">
              {!g.active && <button className={btnOutline} onClick={() => activate(g)}>{t.setActive}</button>}
              <button className="font-extrabold text-[13px] px-1 py-2 text-accent-700 cursor-pointer" onClick={() => open({ type: "goal", id: g.id })}>{t.edit}</button>
            </div>
          </div>
        ))}
        <button onClick={() => open({ type: "goal" })} className={`${cellShadow} bg-bg hover:bg-neutral-200 text-left cursor-pointer p-6 font-extrabold text-[15px] text-accent-700`}>{t.newGoal}</button>
      </div>
    </div>
  );
}
