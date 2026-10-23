"use client";

import { useEffect, useRef, useState } from "react";
import { formatChange } from "@nilai/core";
import type { Lang, Strings } from "@/lib/i18n";
import type { Data } from "./data";
import { kicker } from "./ui";

type Watch = { tv: string; ticker: string; name: string; priceS: string; chg: number | null; live: boolean };

/** TradingView advanced chart widget (free embed, attribution shown under the watchlist). */
function TvChart({ symbol, lang }: { symbol: string; lang: Lang }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
    const sc = document.createElement("script");
    sc.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    sc.async = true;
    sc.text = JSON.stringify({
      autosize: true, symbol, interval: "D", timezone: "Asia/Jakarta", theme: "light", style: "1",
      locale: lang === "id" ? "id_ID" : "en", allow_symbol_change: true, hide_side_toolbar: true, calendar: false,
      backgroundColor: "rgba(243,242,242,1)", gridColor: "rgba(32,30,29,0.06)",
    });
    el.appendChild(sc);
    return () => { el.innerHTML = ""; };
  }, [symbol, lang]);
  return <div ref={ref} className="tradingview-widget-container flex-1 min-h-0 wide:flex-none wide:h-[620px] w-full" />;
}

export function Markets({ data, t, lang, refresh, refreshing }: { data: Data; t: Strings; lang: Lang; refresh: () => void; refreshing: boolean }) {
  const fmt = (p: number, ccy: string) => (ccy === "USD" ? "$" + p.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "Rp " + Math.round(p).toLocaleString("id-ID"));
  const fromHoldings: Watch[] = data.holdings.filter((h) => h.tv_symbol).map((h) => ({
    tv: h.tv_symbol!, ticker: h.ticker || h.name, name: h.name, priceS: fmt(Number(h.price), h.price_currency),
    chg: h.is_live ? Number(h.change_24h) : null, live: h.is_live,
  }));
  const fixed: Watch[] = [
    { tv: "FX_IDC:USDIDR", ticker: "USD/IDR", name: t.rupiahRate, priceS: Math.round(data.usdIdr).toLocaleString("id-ID"), chg: null, live: true },
    { tv: "IDX:COMPOSITE", ticker: "IHSG", name: "IDX Composite", priceS: "—", chg: null, live: false },
    { tv: "SP:SPX", ticker: "S&P 500", name: t.usIndex, priceS: "—", chg: null, live: false },
  ];
  const seen = new Set<string>();
  const watch = [...fromHoldings, ...fixed].filter((w) => !seen.has(w.tv) && seen.add(w.tv));
  const [sym, setSym] = useState(watch[0].tv);
  const current = watch.find((w) => w.tv === sym);
  // Narrow screens: the chart opens as a full-screen sheet instead of sitting under the list.
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    if (!sheet) return;
    const kd = (e: KeyboardEvent) => { if (e.key === "Escape") setSheet(false); };
    window.addEventListener("keydown", kd);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", kd); document.body.style.overflow = ""; };
  }, [sheet]);

  return (
    <div className="grid wide:grid-cols-[340px_1fr] gap-0.5 bg-text border-b-2 border-text">
      <div className="bg-bg flex flex-col">
        <div className="px-6 pt-5 pb-3 flex justify-between items-baseline">
          <div className={kicker}>{t.watch}</div>
          <button onClick={refresh} disabled={refreshing} className="font-extrabold text-[13px] text-accent-700 cursor-pointer">{refreshing ? t.updating : t.refresh}</button>
        </div>
        {watch.map((w) => (
          <button key={w.tv} onClick={() => { setSym(w.tv); setSheet(true); }} aria-pressed={w.tv === sym}
            className={`grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-6 py-3 border-t border-divider text-left cursor-pointer hover:bg-neutral-200 ${w.tv === sym ? "bg-accent-100" : ""}`}>
            <b className="text-sm">{w.ticker}</b><b className="text-sm text-right">{w.priceS}</b>
            <span className="text-xs text-neutral-700">{w.name}</span>
            <span className={`text-xs text-right ${w.chg != null && w.chg < 0 ? "text-accent-700" : "text-neutral-700"}`}>
              {w.chg == null ? (w.live ? t.live : "") : formatChange(w.chg) + " · live"}
            </span>
          </button>
        ))}
        <div className="px-6 py-4 text-xs text-neutral-700 border-t-2 border-text">
          {t.mkNote} <a href="https://www.tradingview.com/" target="_blank" rel="noopener nofollow">TradingView</a>
        </div>
      </div>
      <div role={sheet ? "dialog" : undefined} aria-modal={sheet || undefined} aria-label={current?.ticker ?? sym}
        className={`${sheet ? "fixed inset-0 z-50 flex" : "hidden"} wide:static wide:z-auto wide:flex bg-bg flex-col min-w-0`}>
        <div className="px-6 py-4 border-b-2 border-text flex justify-between items-center gap-3">
          <b className="text-xl">{current?.ticker ?? sym}</b>
          <span className="flex items-center gap-3">
            <span className="text-xs text-neutral-700">{[current?.priceS !== "—" && current?.priceS, "TradingView"].filter(Boolean).join(" · ")}</span>
            <button onClick={() => setSheet(false)} aria-label={t.cancel} className="wide:hidden size-11 -mr-3 text-lg cursor-pointer">✕</button>
          </span>
        </div>
        {/* remount when the sheet opens: the widget sizes itself on load and was hidden until now */}
        <TvChart key={String(sheet)} symbol={sym} lang={lang} />
      </div>
    </div>
  );
}
