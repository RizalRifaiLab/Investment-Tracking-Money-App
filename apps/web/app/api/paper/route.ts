import { PAPER_BENCHMARK, PAPER_FEE, PAPER_UNIVERSE, fillOrders, parseOrders, positionsOf, valueOf } from "@nilai/core";
import { AiError, fetchNews, trendText, userAi } from "@/lib/advisor";
import { admin, userFromRequest, yahoo } from "@/lib/prices";

export const maxDuration = 300;
const RUN_COOLDOWN_MS = 60 * 60_000; // manual runs spend the user's AI credits
const CRON_GAP_MS = 20 * 3600_000;
const START_AMOUNTS = [10_000_000, 100_000_000, 1_000_000_000];
const SYMS = Object.keys(PAPER_UNIVERSE);
const R = (v: number) => "Rp " + Math.round(v).toLocaleString("id-ID");

/** Live prices for the whole universe, in their own currency and in IDR. */
async function marketPrices() {
  const [quotes, fx] = await Promise.all([yahoo(SYMS), admin().from("fx_rates").select("rate").eq("pair", "USDIDR").single()]);
  const usdIdr = Number(fx.data?.rate);
  const idr: Record<string, number> = {};
  for (const [s, q] of Object.entries(quotes)) if (q.currency === "IDR" || (q.currency === "USD" && usdIdr > 0)) idr[s] = q.price * (q.currency === "USD" ? usdIdr : 1);
  return { quotes, idr, usdIdr };
}

async function stateOf(userId: string) {
  const db = admin();
  const [a, tr, runs] = await Promise.all([
    db.from("paper_accounts").select("start_idr,cash_idr,benchmark,last_run_at,created_at").eq("user_id", userId).maybeSingle(),
    db.from("paper_trades").select("created_at,symbol,side,qty,price,currency,usd_idr,fee_idr,reason").eq("user_id", userId).order("created_at"),
    db.from("paper_runs").select("created_at,note,value_idr,bench_idr").eq("user_id", userId).order("created_at"),
  ]);
  return { account: a.data, trades: tr.data ?? [], runs: runs.data ?? [] };
}

/** One AI decision: read the market, place orders, record the result. */
async function run(userId: string): Promise<{ code?: string; error?: string; fills?: number }> {
  const db = admin();
  const { account, trades } = await stateOf(userId);
  if (!account) return { code: "noaccount" };
  const ai = await userAi(userId);
  if (!ai.ownKey) return { code: "nokey" }; // the shared key is for chat only
  const { quotes, idr, usdIdr } = await marketPrices();
  const pos = positionsOf(trades), bench = account.benchmark as Record<string, number>;
  if ([...Object.keys(pos), ...Object.keys(bench)].some((s) => !idr[s])) return { code: "prices" }; // a missing price would value a position at 0
  const cash = Number(account.cash_idr), start = Number(account.start_idr);
  const value = cash + valueOf(pos, idr), benchV = valueOf(bench, idr);
  const pct = (v: number) => ((v / start - 1) * 100).toFixed(1) + "%";

  const [market, news, prof] = await Promise.all([
    trendText(SYMS.map((s) => [s, PAPER_UNIVERSE[s].name])),
    fetchNews(SYMS.map((s) => ({ class: PAPER_UNIVERSE[s].class, name: PAPER_UNIVERSE[s].name, ticker: s.replace(/-USD$|\.JK$/, "") }))),
    db.from("profiles").select("language").eq("user_id", userId).single(),
  ]);
  const system = `You run a PAPER-TRADING experiment: fake IDR, real prices. The goal is to beat a buy-and-hold benchmark (${Object.entries(PAPER_BENCHMARK).map(([s, w]) => `${w * 100}% ${s}`).join(", ")}, bought on day one) after fees. You are called about once a day.
Rules: trade only symbols from UNIVERSE; long only, no leverage, no shorting; every trade costs ${PAPER_FEE * 100}%, so avoid needless trading; holding cash or doing nothing is allowed. At most 6 orders. Base decisions on MARKET and HEADLINES; never invent prices or news.
Reply with JSON only, no other text: {"note":"<2-4 sentences: what you see and your plan>","orders":[{"symbol":"BTC-USD","side":"buy","amount_idr":5000000,"reason":"<one sentence>"}]}
Write note and reasons in ${prof.data?.language === "id" ? "Bahasa Indonesia" : "English"}.`;
  const user = `Today ${new Date().toISOString().slice(0, 10)}. USD/IDR ${Math.round(usdIdr)}.
Cash: ${R(cash)}. Portfolio: ${R(value)} (${pct(value)} since start at ${R(start)}). Benchmark: ${R(benchV)} (${pct(benchV)}).
Positions: ${Object.entries(pos).map(([s, q]) => `${s} ${q.toPrecision(6)} units = ${R(q * idr[s])} (${((q * idr[s] / value) * 100).toFixed(1)}%)`).join("; ") || "none"}.
Your last trades: ${trades.slice(-10).map((t) => `${t.created_at.slice(0, 10)} ${t.side} ${t.symbol} (${t.reason})`).join("; ") || "none"}.

UNIVERSE (symbol: name, price)
${SYMS.filter((s) => idr[s]).map((s) => `${s}: ${PAPER_UNIVERSE[s].name}, ${R(idr[s])}`).join("\n")}

MARKET (daily closes)
${market || "unavailable"}

HEADLINES (newest first)
${news.map((n) => `- ${n.date.slice(0, 10)} ${n.source}: ${n.title}`).join("\n") || "none"}`;

  let parsed;
  for (let attempt = 1; !parsed; attempt++) {
    let reply = "";
    try {
      reply = await ai.ask([{ role: "system", content: system }, { role: "user", content: user }], true);
      parsed = parseOrders(reply);
    } catch (e) {
      if (e instanceof AiError) return { code: e.code, error: e.message };
      if (!(e instanceof SyntaxError)) return { error: (e as Error).message }; // timeout, network: show the real cause
      console.error("paper lab: unreadable AI reply", attempt, reply.slice(0, 300));
      if (attempt === 2) return { code: "badreply" };
    }
  }

  const r = fillOrders(cash, pos, parsed.orders, idr);
  if (r.fills.length) {
    const { error } = await db.from("paper_trades").insert(r.fills.map((f) => {
      const q = quotes[f.symbol];
      return { user_id: userId, symbol: f.symbol, side: f.side, qty: f.qty, price: q.price, currency: q.currency, usd_idr: q.currency === "USD" ? usdIdr : 1, fee_idr: f.fee_idr, reason: f.reason };
    }));
    if (error) return { error: error.message };
  }
  const note = parsed.note + (r.rejected.length ? `\n(${r.rejected.join("; ")})` : "");
  const [u, w] = await Promise.all([
    db.from("paper_accounts").update({ cash_idr: r.cash, last_run_at: new Date().toISOString() }).eq("user_id", userId),
    db.from("paper_runs").insert({ user_id: userId, note, value_idr: r.cash + valueOf(r.positions, idr), bench_idr: benchV }),
  ]);
  const err = u.error ?? w.error;
  return err ? { error: err.message } : { fills: r.fills.length };
}

// GET → the lab: account, positions at live prices, runs and trades.
export async function GET(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { account, trades, runs } = await stateOf(user.id);
  if (!account) return Response.json({ account: null, amounts: START_AMOUNTS });
  const { idr } = await marketPrices();
  const pos = positionsOf(trades), bench = account.benchmark as Record<string, number>;
  return Response.json({
    account, runs, trades: trades.slice(-100).reverse(),
    positions: Object.entries(pos).map(([symbol, qty]) => ({ symbol, name: PAPER_UNIVERSE[symbol]?.name ?? symbol, qty, price_idr: idr[symbol] ?? null })),
    benchValue: Object.keys(bench).every((s) => idr[s]) ? valueOf(bench, idr) : null,
  });
}

// POST {action: "start", amount} | {action: "run"} | {action: "reset"}; pg_cron calls it with CRON_SECRET to run every lab once a day.
export async function POST(req: Request) {
  if (process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`) {
    const { data } = await admin().from("paper_accounts").select("user_id,last_run_at");
    const due = (data ?? []).filter((a) => !a.last_run_at || Date.now() - new Date(a.last_run_at).getTime() > CRON_GAP_MS);
    const results = [];
    for (const a of due) results.push(await run(a.user_id).catch((e: Error) => ({ error: e.message })));
    return Response.json({ ran: due.length, results });
  }

  const user = await userFromRequest(req);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { action, amount } = await req.json().catch(() => ({}));
  const db = admin();

  if (action === "reset") {
    const rs = await Promise.all([db.from("paper_trades").delete().eq("user_id", user.id), db.from("paper_runs").delete().eq("user_id", user.id)]);
    const err = rs.find((x) => x.error)?.error ?? (await db.from("paper_accounts").delete().eq("user_id", user.id)).error;
    return err ? Response.json({ error: err.message }, { status: 500 }) : Response.json({ ok: true });
  }

  if (action === "start") {
    if (!START_AMOUNTS.includes(amount)) return Response.json({ error: "bad amount" }, { status: 400 });
    const { idr } = await marketPrices();
    if (Object.keys(PAPER_BENCHMARK).some((s) => !idr[s])) return Response.json({ code: "prices" }, { status: 503 });
    const benchmark = Object.fromEntries(Object.entries(PAPER_BENCHMARK).map(([s, w]) => [s, (amount * w * (1 - PAPER_FEE)) / idr[s]]));
    const { error } = await db.from("paper_accounts").insert({ user_id: user.id, start_idr: amount, cash_idr: amount, benchmark });
    return error ? Response.json({ error: error.message }, { status: 409 }) : Response.json({ ok: true });
  }

  if (action === "run") {
    const { data: a } = await db.from("paper_accounts").select("last_run_at").eq("user_id", user.id).maybeSingle();
    if (a?.last_run_at && Date.now() - new Date(a.last_run_at).getTime() < RUN_COOLDOWN_MS) return Response.json({ code: "cooldown" }, { status: 429 });
    const r = await run(user.id);
    return Response.json(r, { status: r.code || r.error ? 502 : 200 });
  }
  return Response.json({ error: "bad action" }, { status: 400 });
}
