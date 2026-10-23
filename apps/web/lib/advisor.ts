import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { newsQueries, parseRss, trendLine, trendOf, type AssetClass, type NewsItem } from "@nilai/core";
import { yahooHistory } from "./prices";

// ---------- own API keys: AES-256-GCM with a server secret (AI_KEY_SECRET, 64 hex chars) ----------
const secret = () => Buffer.from(process.env.AI_KEY_SECRET ?? "", "hex");
export function encryptKey(plain: string): string {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", secret(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
export function decryptKey(stored: string): string {
  const [iv, tag, enc] = stored.split(".").map((s) => Buffer.from(s, "base64"));
  const d = createDecipheriv("aes-256-gcm", secret(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

// ---------- news: Google News (incl. Bloomberg headlines) + Cointelegraph RSS, cached 15 min per query ----------
const cache = new Map<string, { at: number; items: NewsItem[] }>();
async function feed(url: string, source = ""): Promise<NewsItem[]> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.items;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Nilai)" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    const items = r.ok ? parseRss(await r.text(), source).slice(0, 15) : [];
    cache.set(url, { at: Date.now(), items });
    return items;
  } catch { return hit?.items ?? []; }
}
export async function fetchNews(holdings: { class: AssetClass; name: string; ticker: string }[]): Promise<NewsItem[]> {
  const urls = newsQueries(holdings).map(({ q, lang }) => lang === "id"
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=id&gl=ID&ceid=ID:id`
    : `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`);
  const lists = await Promise.all([...urls.map((u) => feed(u)), feed("https://cointelegraph.com/rss", "Cointelegraph")]);
  const seen = new Set<string>();
  return lists.flat().filter((n) => !seen.has(n.title) && seen.add(n.title))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
}

// ---------- market condition: the markets on the TradingView tab, read from Yahoo daily closes, cached 15 min ----------
const MARKETS: [string, string][] = [["^JKSE", "IHSG (IDX Composite)"], ["^GSPC", "S&P 500"], ["^IXIC", "Nasdaq"], ["GC=F", "Gold (USD/oz)"], ["BTC-USD", "Bitcoin (USD)"], ["IDR=X", "USD/IDR"]];
let marketCache: { at: number; key: string; text: string } | null = null;
export async function marketCondition(holdings: { provider: string | null; provider_symbol: string | null; class: AssetClass; ticker: string; name: string }[]): Promise<string> {
  // holdings priced by Yahoo use their own symbol; crypto majors trade on Yahoo as TICKER-USD
  const own: [string, string][] = holdings.flatMap((h): [string, string][] =>
    h.provider === "yahoo" && h.provider_symbol ? [[h.provider_symbol, h.name]]
    : h.class === "Crypto" && h.ticker && !/^USD/.test(h.ticker) ? [[`${h.ticker.toUpperCase()}-USD`, h.name]] : []);
  const list = [...MARKETS, ...own].filter(([s], i, a) => a.findIndex(([x]) => x === s) === i);
  const key = list.map(([s]) => s).join();
  if (marketCache && marketCache.key === key && Date.now() - marketCache.at < 15 * 60_000) return marketCache.text;
  const hist = await yahooHistory(list.map(([s]) => s));
  const text = list.flatMap(([s, name]) => { const t = hist[s] && trendOf(hist[s]); return t ? [trendLine(name, t)] : []; }).join("\n");
  marketCache = { at: Date.now(), key, text };
  return text;
}

// ---------- DeepSeek (OpenAI-compatible chat completions) ----------
export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };
export class AiError extends Error { constructor(public code: "auth" | "balance" | "rate" | "down", msg: string) { super(msg); } }

export async function deepseek(apiKey: string, model: string, messages: ChatMsg[]): Promise<string> {
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, max_tokens: 2000, stream: false }), signal: AbortSignal.timeout(110_000),
  });
  if (r.status === 401) throw new AiError("auth", "DeepSeek rejected the API key.");
  if (r.status === 402) throw new AiError("balance", "The DeepSeek account has no balance left.");
  if (r.status === 429) throw new AiError("rate", "DeepSeek is rate-limiting; try again in a minute.");
  if (!r.ok) throw new AiError("down", `DeepSeek error ${r.status}.`);
  const j = await r.json();
  return String(j.choices?.[0]?.message?.content ?? "").trim();
}

/** Cheap validity check for a key the user pastes in. */
export async function keyWorks(apiKey: string) {
  const r = await fetch("https://api.deepseek.com/models", { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10_000) });
  return r.ok;
}

// ---------- Claude (user's own Anthropic key) ----------
export const CLAUDE_MODEL = "claude-opus-5-5";

export async function claude(apiKey: string, messages: ChatMsg[]): Promise<string> {
  const client = new Anthropic({ apiKey, timeout: 110_000, maxRetries: 1 });
  try {
    const r = await client.beta.messages.create({
      model: CLAUDE_MODEL, max_tokens: 16000,
      output_config: { effort: "low" }, // short chat answers; thinking stays adaptive
      // on a safety decline the API reroutes to a suitable model inside the same call
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      system: messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n"),
      messages: messages.filter((m) => m.role !== "system") as Anthropic.Beta.BetaMessageParam[],
    });
    if (r.stop_reason === "refusal") throw new AiError("down", "Claude declined to answer this question.");
    return r.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new AiError("auth", "Anthropic rejected the API key.");
    if (e instanceof Anthropic.RateLimitError) throw new AiError("rate", "Claude is rate-limiting; try again in a minute.");
    if (e instanceof Anthropic.APIError) throw new AiError("down", `Claude error ${e.status ?? ""}: ${e.message}`);
    throw e;
  }
}

export async function claudeKeyWorks(apiKey: string) {
  try { await new Anthropic({ apiKey, timeout: 10_000, maxRetries: 0 }).models.retrieve(CLAUDE_MODEL); return true; }
  catch { return false; }
}

export const DEFAULT_RULES = `You are the advisor inside Nilai, a personal investment tracker for an Indonesian investor.
- Be concise (under 170 words), specific and practical.
- Write IDR amounts like "Rp 25 jt" or "Rp 1,2 M".
- Tailor everything to my age, risk profile and goals. When asked to review my portfolio, check each holding against my age and time horizon (e.g. how much should sit in growth assets vs. safe ones), name what is over- or under-weight and what to change.
- When asked about the market, read the MARKET CONDITION trends (returns, position vs. 50/200-day averages) and say plainly whether each market is in an uptrend, downtrend or sideways, and what that means for my holdings. No price predictions.
- When asked what to read, recommend 3–5 real, well-known books that fit my age and situation, one line each on why.
- Favour long-term, diversified, low-cost choices available to Indonesians: IDX stocks, reksa dana, SBN/ORI/SBR, deposito, gold, US ETFs via brokers, crypto via OJK-registered exchanges.
- Plain text, no markdown headings; short dashed lines are fine.
- End trade suggestions with a one-line reminder that this is not licensed financial advice.`;
