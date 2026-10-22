import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/lib/config';
import { combineSeries, distanceToTarget, portfolio, portfolioHistory, positionView, rangeChange, sliceRange } from '../src/lib/portfolio';
import type { Feed, InstrumentSnapshot, Position } from '../src/lib/types';

const inst = { isin: null, type: 'stock' as const, currency: 'EUR', aliases: [], wikipedia: null };
const pos = (id: string, quantity: number, buyPrice: number, extra: Partial<Position> = {}): Position => ({
  ...inst,
  id,
  symbol: id,
  name: id,
  quantity,
  buyPrice,
  buyDate: null,
  stopLossPct: null,
  takeProfitPct: null,
  ...extra,
});
const snap = (id: string, price: number | null, chg: number | null, daily: [string, number][] = [], intraday: [string, number][] = []): InstrumentSnapshot => ({
  id,
  price,
  currency: 'EUR',
  changePct1d: chg,
  asOf: null,
  history: { daily, intraday },
  technicals: { rsi14: null, sma50: null, sma200: null, volumeZ: null, drawdownFrom52wHighPct: null, move1hPct: null },
  nextEarnings: null,
  signal: { action: 'hold', confidence: 0.5, risk: 'low', score: 0, horizon: 'weeks', headline: '', reasoning: '', factors: [], updatedAt: '' },
  events: [],
});
const feed = (instruments: InstrumentSnapshot[]): Feed => ({
  version: 1,
  generatedAt: '2026-10-22T10:00:00Z',
  run: { mode: 'light', llm: null, durationSec: 1 },
  market: { isOpen: true, note: '' },
  instruments: Object.fromEntries(instruments.map((s) => [s.id, s])),
  alerts: [],
  digests: [],
  resolved: {},
});

describe('portfolio value and P&L', () => {
  it('computes value, P&L and day change per position', () => {
    const v = positionView(pos('A', 10, 100), snap('A', 110, 10), DEFAULT_SETTINGS);
    expect(v.value).toBe(1100);
    expect(v.cost).toBe(1000);
    expect(v.pnl).toBe(100);
    expect(v.pnlPct).toBeCloseTo(10);
    expect(v.dayChange).toBeCloseTo(100); // 1100 - 1100/1.1
    expect(v.stopLevel).toBeCloseTo(85); // default 15 %
    expect(v.takeLevel).toBeCloseTo(130); // default 30 %
  });

  it('uses per-position stop-loss / take-profit when set', () => {
    const v = positionView(pos('A', 1, 200, { stopLossPct: 10, takeProfitPct: 50 }), null, DEFAULT_SETTINGS);
    expect(v.stopLevel).toBeCloseTo(180);
    expect(v.takeLevel).toBeCloseTo(300);
  });

  it('falls back to cost basis without a price', () => {
    const v = positionView(pos('A', 2, 50), null, DEFAULT_SETTINGS);
    expect(v.value).toBe(100);
    expect(v.pnl).toBeNull();
    expect(v.dayChange).toBeNull();
  });

  it('aggregates totals', () => {
    const f = feed([snap('A', 110, 10), snap('B', 45, -10)]);
    const { totals } = portfolio([pos('A', 10, 100), pos('B', 20, 50)], f, DEFAULT_SETTINGS);
    expect(totals.value).toBe(1100 + 900);
    expect(totals.cost).toBe(1000 + 1000);
    expect(totals.pnl).toBe(0);
    expect(totals.pnlPct).toBe(0);
    // previous values: 1000 + 1000 → day change = 2000 - 2000 = 0
    expect(totals.dayChange).toBeCloseTo(0);
    expect(totals.dayPct).toBeCloseTo(0);
    expect(totals.pricedCount).toBe(2);
  });

  it('excludes positions in other currencies from totals', () => {
    const f = feed([snap('A', 110, 0), { ...snap('U', 50, 0), currency: 'USD' }]);
    const { totals } = portfolio([pos('A', 1, 100), pos('U', 1, 40, { currency: 'USD' })], f, DEFAULT_SETTINGS);
    expect(totals.value).toBe(110);
    expect(totals.excluded.map((v) => v.pos.id)).toEqual(['U']);
  });

  it('computes distance to target', () => {
    const c = { ...inst, id: 'C', symbol: 'C', name: 'C', targetPrice: 90, note: '' };
    expect(distanceToTarget(c, 100)).toBeCloseTo(-10);
    expect(distanceToTarget({ ...c, targetPrice: null }, 100)).toBeNull();
  });
});

describe('portfolio history', () => {
  it('sums quantity × price with forward fill, starting when all series have data', () => {
    const out = combineSeries([
      {
        qty: 2,
        points: [
          ['2026-01-01', 10],
          ['2026-01-02', 11],
          ['2026-01-05', 12],
        ],
      },
      {
        qty: 1,
        points: [
          ['2026-01-02', 100],
          ['2026-01-03', 101],
        ],
      },
    ]);
    expect(out).toEqual([
      ['2026-01-02', 122],
      ['2026-01-03', 123],
      ['2026-01-05', 125],
    ]);
  });

  it('skips instruments without history and normalises intraday times', () => {
    const f = feed([
      snap(
        'A',
        1,
        0,
        [],
        [
          ['2026-10-22T09:00:00+02:00', 10],
          ['2026-10-22T09:15:00+02:00', 11],
        ],
      ),
      snap(
        'B',
        1,
        0,
        [],
        [
          ['2026-10-22T07:00:00Z', 5],
          ['2026-10-22T07:15:00Z', 6],
        ],
      ),
      snap('C', 1, 0, [], []),
    ]);
    const h = portfolioHistory([pos('A', 1, 1), pos('B', 2, 1), pos('C', 5, 1)], f, 'intraday');
    expect(h).toEqual([
      ['2026-10-22T07:00:00.000Z', 20],
      ['2026-10-22T07:15:00.000Z', 23],
    ]);
  });

  it('slices ranges and reports range change', () => {
    const daily: [string, number][] = [];
    for (let d = 0; d < 400; d++) daily.push([new Date(Date.UTC(2025, 0, 1) + d * 86400000).toISOString().slice(0, 10), 100 + d]);
    const m1 = sliceRange(daily, [], '1M');
    expect(m1.intraday).toBe(false);
    expect(m1.points.length).toBe(32);
    expect(sliceRange(daily, [], 'Max').points.length).toBe(400);
    const ch = rangeChange(m1.points)!;
    expect(ch.abs).toBe(31);
    const intr: [string, number][] = [
      ['2026-10-21T08:00:00.000Z', 1],
      ['2026-10-22T08:00:00.000Z', 2],
      ['2026-10-22T08:15:00.000Z', 3],
    ];
    expect(sliceRange(daily, intr, '1D').points).toHaveLength(2);
    expect(sliceRange(daily, intr, '1W').points).toHaveLength(3);
  });
});
