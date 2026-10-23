import type { AssetClass } from './constants';

export type NewsItem = { title: string; link: string; source: string; date: string };

const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
const tag = (xml: string, name: string) => decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? '');

/** RSS 2.0 items (Google News, Cointelegraph…). Google appends " - Source" to titles; split it off. */
export function parseRss(xml: string, fallbackSource = ''): NewsItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    let title = tag(it, 'title');
    const source = tag(it, 'source') || fallbackSource;
    if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3));
    const d = new Date(tag(it, 'pubDate'));
    return { title, link: tag(it, 'link'), source, date: isNaN(+d) ? '' : d.toISOString() };
  }).filter((x) => x.title && x.link);
}

/** Google News search queries for what the user holds (crypto first, the user's focus). */
export function newsQueries(holdings: { class: AssetClass; name: string; ticker: string }[]) {
  const pick = (cls: AssetClass[], f: (h: { name: string; ticker: string }) => string) =>
    [...new Set(holdings.filter((h) => cls.includes(h.class) && !/^USD[TC]$/i.test(h.ticker)).map(f))].slice(0, 6);
  const crypto = pick(['Crypto'], (h) => `"${h.name}"`);
  const us = pick(['US stocks', 'ETF'], (h) => h.ticker);
  const idx = pick(['IDX stocks'], (h) => h.ticker);
  return [
    { q: `${crypto.length ? '(' + crypto.join(' OR ') + ') ' : ''}crypto when:2d`, lang: 'en' as const },
    { q: 'crypto OR bitcoin site:bloomberg.com when:3d', lang: 'en' as const },
    ...(us.length ? [{ q: `(${us.join(' OR ')}) stock when:2d`, lang: 'en' as const }] : []),
    { q: `(IHSG${idx.length ? ' OR ' + idx.join(' OR ') : ''}) when:2d`, lang: 'id' as const },
  ];
}
