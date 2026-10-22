import { formatLong } from "@nilai/core";

// Placeholder until the auth + dashboard screens land.
export default function Home() {
  return (
    <main className="min-h-screen grid md:grid-cols-[1.1fr_1fr]">
      <section className="bg-accent text-bg p-7 md:p-14 flex flex-col justify-between gap-8">
        <div className="font-extrabold text-2xl tracking-[-0.02em]">Nilai</div>
        <div className="font-extrabold text-4xl md:text-[64px] leading-[1.02] tracking-[-0.03em] max-w-[640px]">
          Every rupiah, counted toward the goal you set.
        </div>
        <div className="text-sm font-semibold">IDR · USD · Crypto · Saham · ETF · Deposito · Reksa dana · Emas</div>
      </section>
      <section className="p-7 md:p-14 flex flex-col justify-center gap-5">
        <div className="text-xs font-extrabold uppercase tracking-[0.08em]">Scaffold</div>
        <div className="text-[44px] font-extrabold tracking-[-0.03em]">{formatLong(392_320_000, "IDR", 16250)}</div>
      </section>
    </main>
  );
}
