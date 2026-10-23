import { describe, expect, it } from 'vitest';
import { fillOrders, parseOrders, positionsOf, valueOf } from './paper';

const px = { 'BTC-USD': 1_000_000_000, VOO: 10_000_000 };

describe('fillOrders', () => {
  it('sells before buying, charges fees and never spends more than the cash', () => {
    const r = fillOrders(1_000_000, { VOO: 2 }, [
      { symbol: 'BTC-USD', side: 'buy', amount_idr: 50_000_000, reason: 'trend up' },
      { symbol: 'VOO', side: 'sell', amount_idr: 10_000_000, reason: 'trim' },
    ], px);
    expect(r.fills.map((f) => f.side)).toEqual(['sell', 'buy']);
    expect(r.positions.VOO).toBeCloseTo(1);
    expect(r.cash).toBeGreaterThanOrEqual(0);
    expect(r.cash).toBeLessThan(1);
    expect(r.fills[1].qty * px['BTC-USD'] + r.fills[1].fee_idr).toBeCloseTo(1_000_000 + 10_000_000 * 0.998);
  });
  it('rejects unknown symbols, shorting and dust; selling nearly all sells all', () => {
    const r = fillOrders(0, { VOO: 1 }, [
      { symbol: 'PEPE-USD', side: 'buy', amount_idr: 1e6, reason: '' },
      { symbol: 'BTC-USD', side: 'sell', amount_idr: 1e6, reason: '' },
      { symbol: 'VOO', side: 'sell', amount_idr: 9_950_000, reason: '' },
    ], { ...px, 'PEPE-USD': 1 });
    expect(r.rejected).toEqual(['BTC-USD: nothing to sell', 'PEPE-USD: not tradable']); // sells are handled first
    expect(r.positions).toEqual({});
    expect(r.cash).toBeCloseTo(10_000_000 * 0.998);
  });
});

describe('positionsOf / valueOf', () => {
  it('nets buys and sells and drops closed positions', () => {
    const p = positionsOf([{ symbol: 'VOO', side: 'buy', qty: '2' }, { symbol: 'VOO', side: 'sell', qty: 2 }, { symbol: 'BTC-USD', side: 'buy', qty: 0.5 }]);
    expect(p).toEqual({ 'BTC-USD': 0.5 });
    expect(valueOf(p, px)).toBe(500_000_000);
  });
});

describe('parseOrders', () => {
  it('reads JSON inside prose or fences and drops bad orders', () => {
    const r = parseOrders('Here:\n```json\n{"note":"Calm","orders":[{"symbol":"btc-usd","side":"buy","amount_idr":"5000000","reason":"DCA"},{"symbol":"VOO","side":"hold","amount_idr":1}]}\n```');
    expect(r).toEqual({ note: 'Calm', orders: [{ symbol: 'BTC-USD', side: 'buy', amount_idr: 5_000_000, reason: 'DCA' }] });
    expect(() => parseOrders('no json')).toThrow();
    const short = parseOrders('{"orders":[{"symbol":"BMRI","side":"buy","amount_idr":1},{"symbol":"btc","side":"buy","amount_idr":1},{"symbol":"DOGE","side":"buy","amount_idr":1}]}');
    expect(short.orders.map((o) => o.symbol)).toEqual(['BMRI.JK', 'BTC-USD', 'DOGE']);
  });
});
