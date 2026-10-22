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
