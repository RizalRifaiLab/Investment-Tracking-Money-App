import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { RETURN_PCT, CRYPTO_CAP, type RiskProfile } from "@nilai/core";
import { admin } from "@/lib/prices";
import { AiError, DEFAULT_RULES, claude, claudeKeyWorks, decryptKey, deepseek, encryptKey, fetchNews, keyWorks, type ChatMsg } from "@/lib/advisor";

export const maxDuration = 120;
// Users bring their own DeepSeek or Anthropic key. DEEPSEEK_API_KEY on the server is an optional shared fallback, capped per day.
const APP_KEY_DAILY_LIMIT = 30;
const R = (v: number) => "Rp " + Math.round(v).toLocaleString("id-ID");

/** The signed-in user plus a Supabase client that acts as them (RLS applies). */
async function asUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  const user = token ? (await admin().auth.getUser(token)).data.user : null;
  if (!user) return null;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return { user, db };
}

async function settingsOf(userId: string) {
  const { data } = await admin().from("advisor_settings").select("rules,model,provider,api_key_enc,key_hint,claude_key_enc,claude_key_hint").eq("user_id", userId).maybeSingle();
  return data;
}

/** Everything the advisor may know, read as the user. */
async function context(db: SupabaseClient) {
  const now = new Date(Date.now() + 7 * 3600_000); // WIB
  const monthStart = now.toISOString().slice(0, 7) + "-01";
  const [p, h, a, g, s, fx, tx] = await Promise.all([
    db.from("profiles").select("name,language,risk_profile").single(),
    db.from("holding_values").select("class,name,ticker,quantity,value_idr,change_24h,is_live,deposit_rate,maturity_date"),
    db.from("account_values").select("bank,label,currency,balance,value_idr"),
    db.from("goals").select("name,target_idr,is_active"),
    db.from("salary_settings").select("amount,payday,invest_pct").maybeSingle(),
    db.from("fx_rates").select("rate").eq("pair", "USDIDR").maybeSingle(),
    db.from("transactions").select("amount,category").gte("date", monthStart),
  ]);
  const profile = (p.data?.risk_profile ?? "Balanced") as RiskProfile;
  const holdings = h.data ?? [], accounts = a.data ?? [];
  const total = [...holdings, ...accounts].reduce((x, r) => x + Number(r.value_idr), 0);
  const pct = (v: number) => (total ? ((v / total) * 100).toFixed(1) : "0") + "%";
  const inn = (tx.data ?? []).filter((x) => x.amount > 0).reduce((x, r) => x + Number(r.amount), 0);
  const cats: Record<string, number> = {};
  for (const x of tx.data ?? []) if (x.amount < 0) cats[x.category] = (cats[x.category] ?? 0) - Number(x.amount);
  const facts = `Today: ${now.toISOString().slice(0, 10)}. USD/IDR ${Math.round(Number(fx.data?.rate) || 0)}.
Risk profile: ${profile} (crypto cap ${CRYPTO_CAP[profile] * 100}%, assumed return ${RETURN_PCT[profile]}%/yr).
Net worth: ${R(total)}.
Holdings: ${holdings.map((x) => `${x.name}${x.ticker ? " (" + x.ticker + ")" : ""} [${x.class}] ${R(Number(x.value_idr))} = ${pct(Number(x.value_idr))}${x.is_live ? `, 24h ${Number(x.change_24h).toFixed(1)}%` : ""}${x.deposit_rate ? `, ${x.deposit_rate}% p.a. matures ${x.maturity_date}` : ""}`).join("; ") || "none"}.
Cash: ${accounts.map((x) => `${x.bank} ${x.label} ${R(Number(x.value_idr))}`).join("; ") || "none"}.
Goals: ${(g.data ?? []).map((x) => `${x.name} ${R(Number(x.target_idr))}${x.is_active ? " (ACTIVE)" : ""}`).join("; ") || "none"}.
Salary: ${R(Number(s.data?.amount) || 0)} on day ${s.data?.payday ?? "-"}, invests ${Number(s.data?.invest_pct) || 0}%.
This month so far: money in ${R(inn)}, spending ${Object.entries(cats).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${R(v)}`).join(", ") || "none"}.`;
  return { facts, lang: p.data?.language === "id" ? "id" : "en", holdings };
}

// GET → chat history, settings and today's headlines for the Advisor tab.
export async function GET(req: Request) {
  const u = await asUser(req);
  if (!u) return Response.json({ error: "unauthorized" }, { status: 401 });
  const [st, msgs, hs] = await Promise.all([
    settingsOf(u.user.id),
    u.db.from("chat_messages").select("role,content,created_at").order("created_at", { ascending: false }).limit(40),
    u.db.from("holdings").select("class,name,ticker"),
  ]);
  return Response.json({
    messages: (msgs.data ?? []).reverse(),
    settings: { rules: st?.rules ?? DEFAULT_RULES, defaultRules: DEFAULT_RULES, model: st?.model ?? "deepseek-flash", provider: st?.provider ?? "deepseek",
      keyHint: st?.key_hint ?? null, claudeKeyHint: st?.claude_key_hint ?? null },
    news: await fetchNews(hs.data ?? []),
  });
}

// POST {message} → advisor reply (saved with the question).
export async function POST(req: Request) {
  const u = await asUser(req);
  if (!u) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { message } = await req.json().catch(() => ({}));
  if (typeof message !== "string" || !message.trim() || message.length > 2000) return Response.json({ error: "bad message" }, { status: 400 });

  const st = await settingsOf(u.user.id);
  const useClaude = st?.provider === "claude";
  const enc = useClaude ? st?.claude_key_enc : st?.api_key_enc;
  const ownKey = enc ? decryptKey(enc) : null;
  const apiKey = useClaude ? ownKey : ownKey ?? process.env.DEEPSEEK_API_KEY; // the shared fallback is DeepSeek only
  if (!apiKey) return Response.json({ code: "nokey" }, { status: 503 });
  if (!ownKey) {
    const since = new Date(); since.setUTCHours(-7, 0, 0, 0); // since 00:00 WIB
    const { count } = await u.db.from("chat_messages").select("id", { count: "exact", head: true }).eq("role", "user").gte("created_at", since.toISOString());
    if ((count ?? 0) >= APP_KEY_DAILY_LIMIT) return Response.json({ code: "limit" }, { status: 429 });
  }

  const [{ facts, lang, holdings }, history] = await Promise.all([
    context(u.db),
    u.db.from("chat_messages").select("role,content").order("created_at", { ascending: false }).limit(12),
  ]);
  const news = await fetchNews(holdings);
  const system = `${st?.rules ?? DEFAULT_RULES}

Always reply in ${lang === "id" ? "Bahasa Indonesia" : "English"}.
For news, use only the headlines below: name the source and date, never invent news, and say so if they don't cover the question.

MY DATA
${facts}

HEADLINES (newest first)
${news.map((n) => `- ${n.date.slice(0, 10)} ${n.source}: ${n.title}`).join("\n") || "none available"}`;
  const messages: ChatMsg[] = [{ role: "system", content: system },
    ...((history.data ?? []).reverse() as ChatMsg[]), { role: "user", content: message.trim() }];

  try {
    const reply = useClaude ? await claude(apiKey, messages) : await deepseek(apiKey, ownKey ? st!.model : "deepseek-flash", messages);
    await admin().from("chat_messages").insert([
      { user_id: u.user.id, role: "user", content: message.trim() },
      { user_id: u.user.id, role: "assistant", content: reply },
    ]);
    return Response.json({ reply });
  } catch (e) {
    if (e instanceof AiError) return Response.json({ code: e.code, error: e.message }, { status: 502 });
    return Response.json({ code: "down", error: (e as Error).message }, { status: 502 });
  }
}

// PUT {provider, apiKey: string | null} → save (after checking it works) or remove the user's own key for that provider.
export async function PUT(req: Request) {
  const u = await asUser(req);
  if (!u) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { apiKey, provider } = await req.json().catch(() => ({}));
  const isClaude = provider === "claude";
  const col = isClaude ? { enc: "claude_key_enc", hint: "claude_key_hint" } : { enc: "api_key_enc", hint: "key_hint" };
  if (apiKey === null) {
    await admin().from("advisor_settings").upsert({ user_id: u.user.id, [col.enc]: null, [col.hint]: null });
    return Response.json({ keyHint: null });
  }
  const format = isClaude ? /^sk-ant-[A-Za-z0-9_-]{20,}$/ : /^sk-[A-Za-z0-9]{16,}$/;
  if (typeof apiKey !== "string" || !format.test(apiKey.trim())) return Response.json({ code: "format" }, { status: 400 });
  if (!(await (isClaude ? claudeKeyWorks : keyWorks)(apiKey.trim()))) return Response.json({ code: "auth" }, { status: 400 });
  const keyHint = "…" + apiKey.trim().slice(-4);
  const { error } = await admin().from("advisor_settings").upsert({ user_id: u.user.id, [col.enc]: encryptKey(apiKey.trim()), [col.hint]: keyHint });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ keyHint });
}
