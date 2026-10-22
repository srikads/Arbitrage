// DEMO DATA — fictional portfolio and feed for `?demo=1` (development only).
// Prices, events and signals are synthetic and do not describe real markets.
import { emptyConfig } from '../lib/config';
import type { Alert, Candidate, Config, Digest, Feed, FeedEvent, InstrumentSnapshot, Position, Signal, SignalAction } from '../lib/types';
import fixture from '../../fixtures/instruments.dev.json';
import type { Instrument } from '../lib/types';

const ALL = fixture as Instrument[];
const bySymbol = (s: string): Instrument => {
  const i = ALL.find((x) => x.symbol === s);
  if (!i) throw new Error(`demo: unknown ${s}`);
  return i;
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
}

type Spec = {
  sym: string;
  price: number;
  chg: number;
  vol: number;
  drift: number;
  action: SignalAction;
  conf: number;
  risk: Signal['risk'];
  score: number;
  headline: string;
  reasoning: string;
  rsi: number;
  dd: number;
  earnings: string | null;
};

const SPECS: Spec[] = [
  { sym: 'SAP.DE', price: 231.85, chg: 1.42, vol: 0.017, drift: 0.0007, action: 'hold', conf: 0.72, risk: 'low', score: 0.34, headline: 'Cloud backlog keeps growing; trend intact', reasoning: 'Price sits comfortably above the 50- and 200-day averages and news flow after the quarterly update was constructive. Crowd chatter is upbeat but not euphoric. Nothing here argues for acting on a long-term position.', rsi: 61, dd: -6.8, earnings: '2027-01-27' },
  { sym: 'SIE.DE', price: 228.4, chg: -0.62, vol: 0.015, drift: 0.0005, action: 'hold', conf: 0.66, risk: 'low', score: 0.18, headline: 'Steady orders, mild profit-taking today', reasoning: 'A small pullback on a quiet news day. Industrial order intake commentary remains positive and the stock is well inside its normal range. Holding is consistent with your conservative profile.', rsi: 54, dd: -4.1, earnings: '2026-11-13' },
  { sym: 'ALV.DE', price: 352.1, chg: 0.31, vol: 0.011, drift: 0.0004, action: 'hold', conf: 0.7, risk: 'low', score: 0.22, headline: 'Defensive compounder, dividend outlook unchanged', reasoning: 'Low volatility and stable sentiment. No unusual attention or news. The position is already up strongly from your entry; a trailing review in a few months is enough.', rsi: 58, dd: -2.3, earnings: '2026-11-07' },
  { sym: 'EUNL.DE', price: 104.62, chg: 0.48, vol: 0.009, drift: 0.0004, action: 'hold', conf: 0.8, risk: 'low', score: 0.2, headline: 'Broad market drift higher', reasoning: 'Diversified core holding tracking global equities. No action needed; keep regular contributions if that is your plan.', rsi: 57, dd: -1.9, earnings: null },
  { sym: 'VWCE.DE', price: 139.08, chg: 0.41, vol: 0.009, drift: 0.0004, action: 'hold', conf: 0.8, risk: 'low', score: 0.19, headline: 'Broad market drift higher', reasoning: 'Global all-cap exposure moving with the market. Nothing specific to react to.', rsi: 56, dd: -2.0, earnings: null },
  { sym: 'RHM.DE', price: 1718.5, chg: -4.85, vol: 0.028, drift: 0.0016, action: 'consider_trim', conf: 0.61, risk: 'high', score: -0.28, headline: 'Sharp drop on defence-budget headlines after a huge run', reasoning: 'The position has more than doubled and now makes up an outsized share of your portfolio. Today’s drop came with a spike in attention and negative crowd sentiment. Trimming part of the gain would bring risk back in line with a conservative profile; the long-term thesis is not broken.', rsi: 38, dd: -17.4, earnings: '2026-11-06' },
  { sym: 'ASME.DE', price: 781.2, chg: 2.35, vol: 0.022, drift: 0.0006, action: 'watch', conf: 0.55, risk: 'medium', score: 0.12, headline: 'Rebound after export-rule worries; volatile', reasoning: 'Shares recovered part of last week’s loss as export restriction fears eased. Sentiment is mixed and attention is elevated, so expect swings. Worth watching, no action suggested.', rsi: 49, dd: -15.2, earnings: '2027-01-21' },
  { sym: 'NOVC.DE', price: 45.92, chg: -2.1, vol: 0.024, drift: -0.0009, action: 'consider_sell', conf: 0.58, risk: 'high', score: -0.52, headline: 'Below your stop-loss level; downtrend persists', reasoning: 'The price is now about 50% below your average buy price and well under the 200-day average. News on competition in weight-loss drugs keeps sentiment negative. Your stop-loss rule has triggered — review whether the original thesis still holds before deciding.', rsi: 33, dd: -58.6, earnings: '2026-11-05' },
  { sym: 'IFX.DE', price: 35.84, chg: 1.12, vol: 0.022, drift: 0.0003, action: 'consider_buy', conf: 0.57, risk: 'medium', score: 0.31, headline: 'Approaching your target; sentiment improving', reasoning: 'The price is about 11% above your target. Chip demand commentary turned more positive this week and attention is rising. If it reaches your target, buying in steps would fit a conservative approach.', rsi: 52, dd: -12.5, earnings: '2026-11-11' },
  { sym: 'AIR.DE', price: 198.36, chg: 0.74, vol: 0.016, drift: 0.0005, action: 'watch', conf: 0.5, risk: 'medium', score: 0.1, headline: 'Delivery targets reiterated', reasoning: 'Stable. Still well above your target price, so nothing to do yet.', rsi: 55, dd: -5.3, earnings: '2027-02-19' },
  { sym: 'MOH.DE', price: 612.4, chg: -1.36, vol: 0.019, drift: -0.0001, action: 'watch', conf: 0.48, risk: 'medium', score: -0.08, headline: 'Luxury demand soft, near your target', reasoning: 'Weak demand commentary from Asia keeps pressure on the sector. The price is within 10% of your target; watching for stabilisation.', rsi: 44, dd: -21.7, earnings: '2027-01-28' },
];

const HOLD: [string, number, number, string][] = [
  ['SAP.DE', 25, 168.4, '2023-03-14'],
  ['SIE.DE', 40, 151.2, '2022-11-02'],
  ['ALV.DE', 15, 214.5, '2022-06-20'],
  ['EUNL.DE', 120, 76.3, '2021-09-08'],
  ['VWCE.DE', 60, 101.8, '2022-02-15'],
  ['RHM.DE', 6, 690.0, '2024-01-10'],
  ['ASME.DE', 6, 642.0, '2024-04-22'],
  ['NOVC.DE', 30, 92.4, '2024-05-30'],
];
const WATCH: [string, number, string][] = [
  ['IFX.DE', 32, 'Add on weakness, AI power chips'],
  ['AIR.DE', 160, ''],
  ['MOH.DE', 560, 'Quality at a discount?'],
];

function isWeekend(d: Date) {
  const w = d.getUTCDay();
  return w === 0 || w === 6;
}

function dailyHistory(spec: Spec, seed: number, end: Date): [string, number][] {
  const r = rng(seed);
  const days: string[] = [];
  const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (days.length < 1260) {
    if (!isWeekend(d)) days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  days.reverse();
  const out: [string, number][] = [];
  let p = spec.price;
  const vals: number[] = [];
  for (let i = days.length - 1; i >= 0; i--) {
    vals.push(p);
    p = p / Math.exp(spec.drift + spec.vol * gauss(r));
  }
  vals.reverse();
  // Last close = previous day's close implied by today's change.
  vals[vals.length - 1] = spec.price;
  vals[vals.length - 2] = spec.price / (1 + spec.chg / 100);
  for (let i = 0; i < days.length; i++) out.push([days[i], Math.round(vals[i] * 100) / 100]);
  return out;
}

function intradayHistory(spec: Spec, seed: number, daily: [string, number][]): [string, number][] {
  const r = rng(seed + 99);
  const out: [string, number][] = [];
  const last5 = daily.slice(-5);
  for (let k = 0; k < last5.length; k++) {
    const [day, close] = last5[k];
    const open = k === 0 ? daily[daily.length - 6][1] : last5[k - 1][1];
    const bars = 34;
    let p = open;
    for (let b = 0; b <= bars; b++) {
      const target = open + ((close - open) * b) / bars;
      p = target + (p - target) * 0.6 + target * spec.vol * 0.18 * gauss(r);
      if (b === bars) p = close;
      const minutes = 7 * 60 + b * 15; // 07:00Z ≈ 09:00 Berlin
      const t = new Date(`${day}T00:00:00Z`);
      t.setUTCMinutes(minutes);
      out.push([t.toISOString(), Math.round(p * 100) / 100]);
    }
  }
  return out;
}

const SOURCES = ['tagesschau.de', 'Handelsblatt', 'Bluesky', 'wallstreet-online', 'Wikipedia', 'finanzen.net', 'Reuters'];

function eventsFor(spec: Spec, name: string, seed: number, now: number): FeedEvent[] {
  const r = rng(seed + 7);
  const neg = spec.score < -0.2;
  const titles: [FeedEvent['kind'], string, number][] = [
    ['news', `${name}: analysts ${neg ? 'cut' : 'raise'} price targets after update`, neg ? -0.5 : 0.5],
    ['bluesky', `Crowd chatter on ${name} ${neg ? 'turns sour' : 'picks up'}`, neg ? -0.4 : 0.35],
    ['attention', `Wikipedia page views for ${name} 3.1× above normal`, 0],
    ['forum', `Forum thread: “${neg ? 'Time to get out?' : 'Still a buy here?'}”`, neg ? -0.3 : 0.2],
    ['news', `${name} reaffirms full-year guidance`, 0.3],
    ['price', `${name} moved ${spec.chg > 0 ? '+' : ''}${spec.chg.toFixed(1)}% in the first hour`, spec.chg > 0 ? 0.3 : -0.3],
    ['earnings', `${name} quarterly results`, 0.1],
    ['news', `Sector outlook: ${neg ? 'pressure on margins' : 'demand recovering'}`, neg ? -0.35 : 0.25],
  ];
  const out: FeedEvent[] = [];
  let t = now - 40 * 60_000;
  for (let i = 0; i < titles.length; i++) {
    const [kind, title, s] = titles[i];
    t -= (6 + r() * 120) * 3_600_000 * (i < 3 ? 0.15 : 1.4);
    const source = kind === 'bluesky' ? 'Bluesky' : kind === 'attention' ? 'Wikipedia' : kind === 'forum' ? 'wallstreet-online' : kind === 'price' ? 'Market data' : SOURCES[Math.floor(r() * 3) * 2 % SOURCES.length];
    out.push({
      id: `ev-${spec.sym}-${i}`,
      time: new Date(t).toISOString(),
      kind,
      title,
      summary: 'Demo event text for illustration. In real use this is a short extract from the source.',
      url: kind === 'price' || kind === 'attention' ? null : `https://example.com/demo/${spec.sym.toLowerCase()}/${i}`,
      source,
      sentiment: Math.max(-1, Math.min(1, s + (r() - 0.5) * 0.2)),
      impact: i < 2 ? 'high' : i < 5 ? 'medium' : 'low',
    });
  }
  return out;
}

function signalFor(spec: Spec, at: string): Signal {
  const f = (name: string, value: number, weight: number, note: string) => ({ name, value, weight, note });
  return {
    action: spec.action,
    confidence: spec.conf,
    risk: spec.risk,
    score: spec.score,
    horizon: spec.risk === 'high' ? 'days' : 'weeks',
    headline: spec.headline,
    reasoning: spec.reasoning,
    factors: [
      f('Price trend', Math.max(-1, Math.min(1, spec.score * 1.4)), 0.25, 'vs. 50/200-day averages'),
      f('News sentiment', spec.score * 0.9 + 0.05, 0.25, '14-day weighted'),
      f('Crowd sentiment', spec.score * 1.2, 0.15, 'Bluesky + forums'),
      f('Attention', spec.risk === 'high' ? -0.45 : 0.05, 0.1, 'page views vs. normal'),
      f('Momentum (RSI)', (spec.rsi - 50) / 30, 0.15, `RSI ${spec.rsi}`),
      f('Position risk', spec.action === 'consider_trim' || spec.action === 'consider_sell' ? -0.7 : 0.2, 0.1, 'concentration & stop distance'),
    ],
    updatedAt: at,
  };
}

export function demoData(now = new Date()): { config: Config; feed: Feed } {
  const nowMs = now.getTime();
  const generatedAt = new Date(nowMs - 7 * 60_000).toISOString();
  const instruments: Record<string, InstrumentSnapshot> = {};
  SPECS.forEach((spec, n) => {
    const inst = bySymbol(spec.sym);
    const daily = dailyHistory(spec, 1000 + n * 17, now);
    const p = spec.price;
    instruments[inst.id] = {
      id: inst.id,
      price: p,
      currency: 'EUR',
      changePct1d: spec.chg,
      asOf: generatedAt,
      history: { daily, intraday: intradayHistory(spec, 1000 + n * 17, daily) },
      technicals: {
        rsi14: spec.rsi,
        sma50: Math.round(p * (1 - spec.score * 0.04) * 100) / 100,
        sma200: Math.round(p * (1 - spec.score * 0.12) * 100) / 100,
        volumeZ: spec.risk === 'high' ? 2.4 : 0.3,
        drawdownFrom52wHighPct: spec.dd,
        move1hPct: spec.chg / 2,
      },
      nextEarnings: spec.earnings,
      signal: signalFor(spec, generatedAt),
      events: eventsFor(spec, inst.name, n, nowMs),
    };
  });

  const config = emptyConfig(now);
  config.holdings = HOLD.map(([s, q, b, d]): Position => ({ ...bySymbol(s), quantity: q, buyPrice: b, buyDate: d, stopLossPct: null, takeProfitPct: null }));
  config.holdings[5].takeProfitPct = 100;
  config.candidates = WATCH.map(([s, t, note]): Candidate => ({ ...bySymbol(s), targetPrice: t, note }));

  const id = (s: string) => bySymbol(s).id;
  const ago = (min: number) => new Date(nowMs - min * 60_000).toISOString();
  const evIds = (s: string, k = 2) => instruments[id(s)].events.slice(0, k).map((e) => e.id);
  const alerts: Alert[] = [
    { id: 'al-1', time: ago(38), instrumentId: id('RHM.DE'), severity: 'critical', title: 'Rheinmetall −4.9% · consider trimming', body: 'Sharp drop on defence-budget headlines with a spike in attention. Position is oversized after a large gain.', action: 'consider_trim', confidence: 0.61, eventIds: evIds('RHM.DE', 3), pushed: true },
    { id: 'al-2', time: ago(95), instrumentId: id('NOVC.DE'), severity: 'important', title: 'Novo Nordisk below stop-loss', body: 'Price is under your −15% stop level. Downtrend and negative news flow persist.', action: 'consider_sell', confidence: 0.58, eventIds: evIds('NOVC.DE'), pushed: true },
    { id: 'al-3', time: ago(60 * 5), instrumentId: id('IFX.DE'), severity: 'info', title: 'Infineon nearing your target', body: 'Now about 11% above your €32 target; sentiment improving.', action: 'consider_buy', confidence: 0.57, eventIds: evIds('IFX.DE'), pushed: false },
    { id: 'al-4', time: ago(60 * 26), instrumentId: id('ASME.DE'), severity: 'important', title: 'ASML rebounds +2.4% after export-rule worries', body: 'Attention elevated, sentiment mixed. No action suggested.', action: 'watch', confidence: 0.55, eventIds: evIds('ASME.DE'), pushed: true },
    { id: 'al-5', time: ago(60 * 50), instrumentId: null, severity: 'info', title: 'Portfolio up 2.1% this week', body: 'Gains led by SAP and ASML; Rheinmetall and Novo Nordisk lagged.', action: null, confidence: null, eventIds: [], pushed: false },
    { id: 'al-6', time: ago(60 * 75), instrumentId: id('MOH.DE'), severity: 'info', title: 'LVMH within 10% of target', body: 'Luxury demand commentary remains soft.', action: 'watch', confidence: 0.48, eventIds: evIds('MOH.DE'), pushed: false },
  ];

  const digests: Digest[] = [
    {
      id: 'dg-1',
      time: ago(60 * 9),
      kind: 'daily',
      title: 'Daily digest',
      markdown: `## Summary\nYour portfolio closed **+0.6%** yesterday. Broad ETFs drifted higher; **Rheinmetall** is the main risk to watch today.\n\n## What moved\n- **SAP** +1.4% — cloud backlog commentary well received.\n- **Rheinmetall** −4.9% — defence-budget headlines; attention 3× normal.\n- **Novo Nordisk** −2.1% — below your stop-loss level.\n\n## Signals\n| Instrument | Signal | Confidence |\n|---|---|---|\n| Rheinmetall | Consider trimming | 61% |\n| Novo Nordisk | Consider selling | 58% |\n| Infineon | Consider buying | 57% |\n\n> Demo data. Signals are not financial advice.`,
    },
    {
      id: 'dg-2',
      time: ago(60 * 24 * 3),
      kind: 'weekly',
      title: 'Weekly review',
      markdown: `## Week in brief\nA calm week for broad markets. Your ETFs gained about **1%**; single stocks were mixed.\n\n## Upcoming\n- Novo Nordisk results on **5 Nov**\n- Rheinmetall results on **6 Nov**\n- Allianz results on **7 Nov**\n\n## Crowd & attention\nAttention spiked for *Rheinmetall* and *ASML*; both saw heated forum threads. Nothing unusual for your other holdings.`,
    },
    {
      id: 'dg-3',
      time: ago(60 * 24 * 10),
      kind: 'daily',
      title: 'Daily digest',
      markdown: `## Summary\nQuiet day. No alerts.\n\n- Siemens order intake commentary positive.\n- MSCI World ETF at a new high.`,
    },
  ];

  const feed: Feed = {
    version: 1,
    generatedAt,
    run: { mode: 'light', llm: null, durationSec: 41 },
    market: { isOpen: true, note: 'Demo market data' },
    instruments,
    alerts,
    digests,
    resolved: {},
  };
  return { config, feed };
}
