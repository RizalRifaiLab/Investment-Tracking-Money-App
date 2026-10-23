import { describe, expect, it } from 'vitest';
import { newsQueries, parseRss } from './news';

const xml = `<rss><channel><title>x</title>
<item><title>Bitcoin tops $90k as ETFs pull in &amp; hold - Bloomberg.com</title><link>https://news.google.com/a</link>
<pubDate>Fri, 23 Oct 2026 08:00:00 GMT</pubDate><source url="https://www.bloomberg.com">Bloomberg.com</source></item>
<item><title><![CDATA[Switzerland approves spot Bitcoin ETF]]></title><link>https://cointelegraph.com/b</link><pubDate>bad</pubDate></item>
<item><title></title><link>https://x</link></item>
</channel></rss>`;

describe('parseRss', () => {
  it('reads items, strips the Google source suffix, decodes entities and CDATA', () => {
    expect(parseRss(xml, 'Cointelegraph')).toEqual([
      { title: 'Bitcoin tops $90k as ETFs pull in & hold', link: 'https://news.google.com/a', source: 'Bloomberg.com', date: '2026-10-23T08:00:00.000Z' },
      { title: 'Switzerland approves spot Bitcoin ETF', link: 'https://cointelegraph.com/b', source: 'Cointelegraph', date: '' },
    ]);
  });
});

describe('newsQueries', () => {
  it('builds queries from holdings, skipping stablecoins', () => {
    const q = newsQueries([
      { class: 'Crypto', name: 'Bitcoin', ticker: 'BTC' }, { class: 'Crypto', name: 'Tether', ticker: 'USDT' },
      { class: 'ETF', name: 'Vanguard', ticker: 'VOO' }, { class: 'IDX stocks', name: 'BCA', ticker: 'BBCA' },
    ]).map((x) => x.q);
    expect(q[0]).toBe('("Bitcoin") crypto when:2d');
    expect(q).toContain('(VOO) stock when:2d');
    expect(q).toContain('(IHSG OR BBCA) when:2d');
    expect(q.some((x) => x.includes('site:bloomberg.com'))).toBe(true);
  });
});
