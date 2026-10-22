// Portfolio maths: values, P&L, day change and value history of the current
// holdings. Pure functions; all percentages are in percent units (1.5 = 1.5%).
import type { Candidate, Feed, InstrumentSnapshot, Position, Settings } from './types';

export type PositionView = {
  pos: Position;
  snap: InstrumentSnapshot | null;
  price: number | null;
  currency: string;
  /** Market value in the instrument's currency; falls back to cost basis when no price is known. */
  value: number;
  /** EUR per unit of `currency` (from the feed), or null when no rate is known yet. */
  fx: number | null;
  /** `value` converted to the base currency, or null without a rate. */
  valueBase: number | null;
  cost: number;
  pnl: number | null;
  pnlPct: number | null;
  dayChange: number | null;
  dayPct: number | null;
  stopLevel: number;
  takeLevel: number;
};

export type PortfolioTotals = {
  value: number;
  cost: number;
  pnl: number;
  pnlPct: number | null;
  dayChange: number;
  dayPct: number | null;
  pricedCount: number;
  count: number;
  /** Positions whose currency has no exchange rate yet; excluded from totals. */
  excluded: PositionView[];
};

export const BASE_CURRENCY = 'EUR';

/** EUR value of one unit of `currency`; minor units such as GBp are already divided in the feed's rates. */
export function rateFor(currency: string, fx: Record<string, number> | undefined, base = BASE_CURRENCY): number | null {
  if (currency === base) return 1;
  const r = fx?.[currency];
  return typeof r === 'number' && Number.isFinite(r) && r > 0 ? r : null;
}

export function positionView(
  pos: Position,
  snap: InstrumentSnapshot | null | undefined,
  settings: Settings,
  fxRates?: Record<string, number>,
): PositionView {
  const s = snap ?? null;
  const price = s?.price ?? null;
  const cost = pos.quantity * pos.buyPrice;
  const value = price != null ? pos.quantity * price : cost;
  const pnl = price != null ? value - cost : null;
  const pnlPct = pnl != null && cost > 0 ? (pnl / cost) * 100 : null;
  const chg = s?.changePct1d ?? null;
  const dayChange = price != null && chg != null ? value - value / (1 + chg / 100) : null;
  const sl = pos.stopLossPct ?? settings.defaultStopLossPct;
  const tp = pos.takeProfitPct ?? settings.defaultTakeProfitPct;
  const currency = s?.currency || pos.currency || BASE_CURRENCY;
  const fx = rateFor(currency, fxRates);
  return {
    pos,
    snap: s,
    price,
    currency,
    value,
    fx,
    valueBase: fx != null ? value * fx : null,
    cost,
    pnl,
    pnlPct,
    dayChange,
    dayPct: chg,
    stopLevel: pos.buyPrice * (1 - sl / 100),
    takeLevel: pos.buyPrice * (1 + tp / 100),
  };
}

/**
 * Totals in the base currency. Foreign positions are converted at the latest
 * rate (cost basis included, so P&L ignores historical FX moves).
 */
export function portfolioTotals(all: PositionView[]): PortfolioTotals {
  const views = all.filter((v) => v.fx != null);
  const excluded = all.filter((v) => v.fx == null);
  let value = 0;
  let cost = 0;
  let dayChange = 0;
  let prevValue = 0;
  let pricedCount = 0;
  for (const v of views) {
    const fx = v.fx as number;
    value += v.value * fx;
    cost += v.cost * fx;
    if (v.price != null) pricedCount++;
    if (v.dayChange != null) {
      dayChange += v.dayChange * fx;
      prevValue += (v.value - v.dayChange) * fx;
    } else {
      prevValue += v.value * fx;
    }
  }
  const pnl = value - cost;
  return {
    value,
    cost,
    pnl,
    pnlPct: cost > 0 ? (pnl / cost) * 100 : null,
    dayChange,
    dayPct: prevValue > 0 ? (dayChange / prevValue) * 100 : null,
    pricedCount,
    count: views.length,
    excluded,
  };
}

export function snapshotFor(feed: Feed | null, id: string): InstrumentSnapshot | null {
  return feed?.instruments[id] ?? null;
}

export function portfolio(holdings: Position[], feed: Feed | null, settings: Settings) {
  const views = holdings.map((h) => positionView(h, snapshotFor(feed, h.id), settings, feed?.fx));
  return { views, totals: portfolioTotals(views) };
}

/** Distance of the current price to the candidate's target, in % (negative = above target needs a drop). */
export function distanceToTarget(c: Candidate, price: number | null): number | null {
  if (c.targetPrice == null || price == null || price <= 0) return null;
  return ((c.targetPrice - price) / price) * 100;
}

export type Point = [time: string, value: number];

/**
 * Sum quantity × price across series aligned by time key with forward-fill.
 * The series starts at the first time all included instruments have a value,
 * so the line is the value of the *current* holdings (not a reconstructed
 * historical portfolio). Instruments without any history are skipped.
 */
export function combineSeries(series: { qty: number; points: Point[] }[]): Point[] {
  const usable = series.filter((s) => s.points.length > 0 && s.qty > 0);
  if (usable.length === 0) return [];
  const sorted = usable.map((s) => ({ qty: s.qty, points: [...s.points].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) }));
  const start = sorted.reduce((m, s) => (s.points[0][0] > m ? s.points[0][0] : m), sorted[0].points[0][0]);
  const times = new Set<string>();
  for (const s of sorted) for (const [t] of s.points) if (t >= start) times.add(t);
  const allTimes = [...times].sort();
  const idx = sorted.map(() => 0);
  const last = sorted.map(() => NaN);
  const out: Point[] = [];
  for (const t of allTimes) {
    let total = 0;
    for (let k = 0; k < sorted.length; k++) {
      const pts = sorted[k].points;
      while (idx[k] < pts.length && pts[idx[k]][0] <= t) {
        last[k] = pts[idx[k]][1];
        idx[k]++;
      }
      total += sorted[k].qty * last[k];
    }
    if (Number.isFinite(total)) out.push([t, total]);
  }
  return out;
}

/** Value history in the base currency; foreign series use the latest rate throughout. */
export function portfolioHistory(holdings: Position[], feed: Feed | null, kind: 'daily' | 'intraday'): Point[] {
  if (!feed) return [];
  return combineSeries(
    holdings
      .map((h) => ({ h, fx: rateFor(feed.instruments[h.id]?.currency || h.currency || BASE_CURRENCY, feed.fx) }))
      .filter((x): x is { h: Position; fx: number } => x.fx != null)
      .map(({ h, fx }) => ({ qty: h.quantity * fx, points: normaliseSeries(feed.instruments[h.id]?.history[kind] ?? [], kind) })),
  );
}

/** Make time keys comparable as strings: dates stay YYYY-MM-DD, ISO times become UTC `...Z`. */
export function normaliseSeries(points: [string, number][], kind: 'daily' | 'intraday'): Point[] {
  const out: Point[] = [];
  for (const [t, v] of points) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (kind === 'daily') out.push([t.slice(0, 10), v]);
    else {
      const ms = Date.parse(t);
      if (!Number.isNaN(ms)) out.push([new Date(ms).toISOString(), v]);
    }
  }
  return out;
}

export type Range = '1D' | '1W' | '1M' | '6M' | '1Y' | 'Max';
export const RANGES: Range[] = ['1D', '1W', '1M', '6M', '1Y', 'Max'];

const DAY = 86_400_000;

/** Slice a combined series to a time range; intraday for 1D/1W, daily otherwise. */
export function sliceRange(daily: Point[], intraday: Point[], range: Range): { points: Point[]; intraday: boolean } {
  if (range === '1D' || range === '1W') {
    if (intraday.length === 0) return { points: daily.slice(-(range === '1D' ? 2 : 6)), intraday: false };
    if (range === '1W') return { points: intraday, intraday: true };
    const lastDay = intraday[intraday.length - 1][0].slice(0, 10);
    return { points: intraday.filter(([t]) => t.slice(0, 10) === lastDay), intraday: true };
  }
  if (range === 'Max' || daily.length === 0) return { points: daily, intraday: false };
  const days = range === '1M' ? 31 : range === '6M' ? 183 : 366;
  const end = Date.parse(daily[daily.length - 1][0]);
  const from = new Date(end - days * DAY).toISOString().slice(0, 10);
  return { points: daily.filter(([t]) => t >= from), intraday: false };
}

export function rangeChange(points: Point[]): { abs: number; pct: number | null } | null {
  if (points.length < 2) return null;
  const a = points[0][1];
  const b = points[points.length - 1][1];
  return { abs: b - a, pct: a !== 0 ? ((b - a) / a) * 100 : null };
}
