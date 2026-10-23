"use client";

import { useEffect, type ReactNode } from "react";
import type { Strings } from "@/lib/i18n";

// Ink-bordered segmented control used for IDR/USD, EN/ID and risk profile.
export function Segmented({ options, value, onChange, className = "", pad = "px-2.5 py-1.5" }: {
  options: [string, string][]; value: string; onChange: (v: string) => void; className?: string; pad?: string;
}) {
  return (
    <div className={`flex border-2 border-text ${className}`} role="group">
      {options.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}
          className={`font-extrabold text-xs cursor-pointer ${pad} ${v === value ? "bg-text text-bg" : "text-text"}`}>{label}</button>
      ))}
    </div>
  );
}

export const kicker = "text-xs font-extrabold uppercase tracking-[0.08em]";
export const btnPrimary = "bg-accent hover:bg-accent-600 text-bg font-extrabold text-sm px-3.5 py-2.5 text-left cursor-pointer disabled:opacity-60";
export const btnOutline = "border-2 border-text hover:bg-neutral-200 font-extrabold text-sm px-3 py-2 text-left cursor-pointer";

/** Chip row (class, currency, filters). */
export function Chips<V extends string>({ label, options, value, onChange }: {
  label?: string; options: { v: V; name: ReactNode }[]; value: V; onChange: (v: V) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-xs text-neutral-800">{label}</span>}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.v} type="button" aria-pressed={o.v === value} onClick={() => onChange(o.v)}
            className={`font-extrabold text-[13px] px-3 py-[7px] border-2 border-text cursor-pointer text-left ${o.v === value ? "bg-text text-bg" : ""}`}>{o.name}</button>
        ))}
      </div>
    </div>
  );
}

export function Field({ label, ...p }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-neutral-800">{label}</span>
      <input className="w-full min-h-11 px-3 py-2 text-[15px] border-2 border-text bg-bg text-text" {...p} />
    </label>
  );
}

/** Modal shell from the prototype: ink backdrop, 2px border, header ✕, footer Delete / Cancel / Save. */
export function Modal({ t, title, width = 560, onClose, onSave, onDelete, busy, error, note, saveLabel, children }: {
  t: Strings; title: string; width?: number; onClose: () => void; onSave: () => void; onDelete?: () => void;
  busy?: boolean; error?: string; note?: string; saveLabel?: string; children: ReactNode;
}) {
  useEffect(() => {
    const kd = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", kd);
    return () => window.removeEventListener("keydown", kd);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-text/50 flex items-start justify-center px-4 py-[6vh] overflow-auto" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }}
        className="w-full bg-bg border-2 border-text shadow-lg" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); onSave(); }}>
        <div className="flex justify-between items-center px-6 py-4 border-b-2 border-text">
          <b className="text-xl">{title}</b>
          <button type="button" onClick={onClose} aria-label={t.cancel} className="size-11 text-lg text-right cursor-pointer">✕</button>
        </div>
        <div className="p-6 flex flex-col gap-4">
          {children}
          {note && <div className="text-[13px] text-neutral-800">{note}</div>}
          <div className="text-sm font-semibold text-accent-700" role="alert">{error}</div>
        </div>
        <div className="flex gap-2 px-6 py-4 border-t-2 border-text items-center">
          {onDelete && <button type="button" onClick={onDelete} disabled={busy} className="font-extrabold text-sm px-1 py-2.5 text-accent-700 cursor-pointer">{t.del}</button>}
          <span className="flex-1" />
          <button type="button" onClick={onClose} className={btnOutline}>{t.cancel}</button>
          <button disabled={busy} className={btnPrimary}>{saveLabel ?? t.save}</button>
        </div>
      </form>
    </div>
  );
}

/** Nilai wordmark. shortcut: placeholder mark (rising bars) until a logo concept is approved, then swap the SVG. */
export function Logo({ size = 22, onAccent = false }: { size?: number; onAccent?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-extrabold tracking-[-0.03em] leading-none" style={{ fontSize: size }}>
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <rect x="1" y="14" width="6" height="9" fill="currentColor" />
        <rect x="9" y="8" width="6" height="15" fill="currentColor" />
        <rect x="17" y="1" width="6" height="22" fill={onAccent ? "currentColor" : "var(--color-accent)"} />
      </svg>
      Nilai
    </span>
  );
}
