import { describe, expect, it } from 'vitest';
import { buildPortfolio, instrumentMeta, type AccountValue, type HoldingValue } from './portfolio';

const h = (o: Partial<HoldingValue>): HoldingValue => ({
  id: 'h', class: 'Crypto', name: 'Bitcoin', ticker: 'BTC', quantity: 1, manual_price: 1, price_currency: 'USD',
  provider: null, provider_symbol: null, tv_symbol: null, deposit_rate: null, maturity_date: null,
  price: 1, change_24h: 0, is_live: false, value_idr: 0, ...o,
});
const acc: AccountValue = { id: 'b', bank: 'Jenius', label: 'USD account', currency: 'USD', balance: 150, value_idr: 2_437_500 };

describe('buildPortfolio', () => {
  const p = buildPortfolio([
    h({ id: 'btc', quantity: 0.05, price: 108000, value_idr: 87_750_000, change_24h: 2, is_live: true, provider: 'coingecko' }),
    h({ id: 'bbca', class: 'IDX stocks', name: 'BCA', ticker: 'BBCA', quantity: 2000, price: 9350, price_currency: 'IDR', value_idr: 18_700_000 }),
    h({ id: 'dep', class: 'Deposito', name: 'Jago', ticker: '', quantity: 1, price: 50e6, price_currency: 'IDR', value_idr: 50e6, deposit_rate: 6, change_24h: 0 }),
  ], [acc]);

  it('sums holdings and cash', () => {
    expect(p.total).toBe(87_750_000 + 18_700_000 + 50e6 + 2_437_500);
    expect(p.cash).toBe(2_437_500);
  });
  it('day change weights by value', () => expect(p.day).toBeCloseTo(1_755_000));
  it('formats per class', () => {
    const by = Object.fromEntries(p.rows.map((r) => [r.id, r]));
    expect(by.btc.qtyS).toBe('0.05 BTC');
    expect(by.btc.src).toBe('Live · CoinGecko');
    expect(by.bbca.qtyS).toBe('20 lot');
    expect(by.bbca.priceS).toBe('Rp 9.350');
    expect(by.dep.ticker).toBe('6% p.a.');
    expect(by.b.qtyS).toBe('$150');
    expect(by.b.cls).toBe('Cash');
  });
  it('allocation follows CLASS_ORDER, skips empty, shares add to 1', () => {
    expect(p.classes.map((c) => c.cls)).toEqual(['Crypto', 'Deposito', 'IDX stocks', 'Cash']);
    expect(p.classes.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1);
  });
  it('empty portfolio', () => {
    const e = buildPortfolio([], []);
    expect(e.total).toBe(0);
    expect(e.classes).toEqual([]);
  });
});

describe('instrumentMeta', () => {
  it('maps providers', () => {
    expect(instrumentMeta('Crypto', 'btc')).toEqual({ provider: 'coingecko', provider_symbol: 'bitcoin', tv_symbol: 'BINANCE:BTCUSDT' });
    expect(instrumentMeta('Crypto', 'PEPE').provider).toBeNull();
    expect(instrumentMeta('IDX stocks', 'bbca')).toEqual({ provider: 'yahoo', provider_symbol: 'BBCA.JK', tv_symbol: 'IDX:BBCA' });
    expect(instrumentMeta('ETF', 'voo').provider_symbol).toBe('VOO');
    expect(instrumentMeta('Gold', '').tv_symbol).toBe('OANDA:XAUUSD');
    expect(instrumentMeta('Reksa dana', 'X').provider).toBeNull();
  });
});
