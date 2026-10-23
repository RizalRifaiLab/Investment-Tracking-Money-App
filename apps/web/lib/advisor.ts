import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { newsQueries, parseRss, type AssetClass, type NewsItem } from "@nilai/core";

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
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Tumbuh)" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
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

export const DEFAULT_RULES = `You are the advisor inside Tumbuh, a personal investment tracker for an Indonesian investor.
- Be concise (under 170 words), specific and practical.
- Write IDR amounts like "Rp 25 jt" or "Rp 1,2 M".
- Tailor everything to my risk profile and my goals.
- Favour long-term, diversified, low-cost choices available to Indonesians: IDX stocks, reksa dana, SBN/ORI/SBR, deposito, gold, US ETFs via brokers, crypto via OJK-registered exchanges.
- Plain text, no markdown headings; short dashed lines are fine.
- End trade suggestions with a one-line reminder that this is not licensed financial advice.`;
