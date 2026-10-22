import { createClient } from "@supabase/supabase-js";
import { analyseMonth } from "@/lib/ai";
import { admin } from "@/lib/prices";

export const maxDuration = 120;

// POST {month: 'YYYY-MM', lang} → 3 AI insights for that month, saved in cashflow_insights.
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  const user = token ? (await admin().auth.getUser(token)).data.user : null;
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { month, lang } = await req.json();
  if (!/^\d{4}-\d{2}$/.test(month) || !["en", "id"].includes(lang)) return Response.json({ error: "bad request" }, { status: 400 });

  // Read as the user so RLS limits everything to their own rows.
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const [y, m] = month.split("-").map(Number);
  const iso = (yy: number, mm: number) => new Date(Date.UTC(yy, mm - 1, 1)).toISOString().slice(0, 10);
  const [tx, acc, fx] = await Promise.all([
    // this month plus the two before, for comparison
    db.from("transactions").select("date,amount,category,description,account_id").gte("date", iso(y, m - 2)).lt("date", iso(y, m + 1)),
    db.from("accounts").select("id,currency"),
    db.from("fx_rates").select("rate").eq("pair", "USDIDR").maybeSingle(),
  ]);
  if (tx.error || acc.error) return Response.json({ error: (tx.error ?? acc.error)!.message }, { status: 500 });
  const usd = new Set(acc.data.filter((a) => a.currency === "USD").map((a) => a.id));
  const rate = Number(fx.data?.rate) || 16250;

  type Month = { in: number; out: number; cats: Record<string, number>; big: { d: string; v: number }[] };
  const byMonth = new Map<string, Month>();
  for (const x of tx.data) {
    const k = x.date.slice(0, 7);
    const b = byMonth.get(k) ?? { in: 0, out: 0, cats: {}, big: [] };
    const v = Number(x.amount) * (usd.has(x.account_id) ? rate : 1);
    if (v >= 0) b.in += v;
    else { b.out -= v; b.cats[x.category] = (b.cats[x.category] ?? 0) - v; b.big.push({ d: x.description, v: -v }); }
    byMonth.set(k, b);
  }
  const cur = byMonth.get(month);
  if (!cur) return Response.json({ error: "empty" }, { status: 404 });
  const R = (v: number) => "Rp " + Math.round(v).toLocaleString("id-ID");
  const summary = [...byMonth.entries()].sort().map(([k, b]) =>
    `${k}${k === month ? " (THIS MONTH)" : ""}: in ${R(b.in)}, out ${R(b.out)}, net ${R(b.in - b.out)}; spending by category: `
    + Object.entries(b.cats).sort((a, c) => c[1] - a[1]).map(([c, v]) => `${c} ${R(v)}`).join(", ")).join("\n")
    + "\nLargest payments this month: " + cur.big.sort((a, b) => b.v - a.v).slice(0, 10).map((x) => `${x.d} ${R(x.v)}`).join("; ");

  try {
    const items = await analyseMonth(summary, lang);
    const { error } = await db.from("cashflow_insights").upsert({ user_id: user.id, month: month + "-01", language: lang, items, created_at: new Date().toISOString() });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ items });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
