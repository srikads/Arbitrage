// DEMO DATA — fictional portfolio and feed for `?demo=1` (development only).
// Prices, events and signals are synthetic and do not describe real markets.
import { emptyConfig } from '../lib/config';
import type { Alert, Candidate, Config, Digest, Feed, FeedEvent, InstrumentSnapshot, Position, Signal } from '../lib/types';
import { SPECS, type Spec } from './specs';
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

const NEWS_SOURCES = ['tagesschau.de', 'Handelsblatt', 'finanzen.net', 'Reuters'];

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
    t -= i < 3 ? (2 + r() * 14) * 3_600_000 : (4 + r() * 22) * 86_400_000;
    const source =
      kind === 'bluesky'
        ? 'Bluesky'
        : kind === 'attention'
          ? 'Wikipedia'
          : kind === 'forum'
            ? 'wallstreet-online'
            : kind === 'price'
              ? 'Market data'
              : kind === 'earnings'
                ? 'Company release'
                : NEWS_SOURCES[Math.floor(r() * NEWS_SOURCES.length)];
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
    {
      id: 'al-1',
      time: ago(38),
      instrumentId: id('RHM.DE'),
      severity: 'critical',
      title: 'Rheinmetall −4.9% · consider trimming',
      body: 'Sharp drop on defence-budget headlines with a spike in attention. Position is oversized after a large gain.',
      action: 'consider_trim',
      confidence: 0.61,
      eventIds: evIds('RHM.DE', 3),
      pushed: true,
    },
    {
      id: 'al-2',
      time: ago(95),
      instrumentId: id('NOVC.DE'),
      severity: 'important',
      title: 'Novo Nordisk below stop-loss',
      body: 'Price is under your −15% stop level. Downtrend and negative news flow persist.',
      action: 'consider_sell',
      confidence: 0.58,
      eventIds: evIds('NOVC.DE'),
      pushed: true,
    },
    {
      id: 'al-3',
      time: ago(60 * 5),
      instrumentId: id('IFX.DE'),
      severity: 'info',
      title: 'Infineon nearing your target',
      body: 'Now about 11% above your €32 target; sentiment improving.',
      action: 'consider_buy',
      confidence: 0.57,
      eventIds: evIds('IFX.DE'),
      pushed: false,
    },
    {
      id: 'al-4',
      time: ago(60 * 26),
      instrumentId: id('ASME.DE'),
      severity: 'important',
      title: 'ASML rebounds +2.4% after export-rule worries',
      body: 'Attention elevated, sentiment mixed. No action suggested.',
      action: 'watch',
      confidence: 0.55,
      eventIds: evIds('ASME.DE'),
      pushed: true,
    },
    {
      id: 'al-5',
      time: ago(60 * 50),
      instrumentId: null,
      severity: 'info',
      title: 'Portfolio up 2.1% this week',
      body: 'Gains led by SAP and ASML; Rheinmetall and Novo Nordisk lagged.',
      action: null,
      confidence: null,
      eventIds: [],
      pushed: false,
    },
    {
      id: 'al-6',
      time: ago(60 * 75),
      instrumentId: id('MOH.DE'),
      severity: 'info',
      title: 'LVMH within 10% of target',
      body: 'Luxury demand commentary remains soft.',
      action: 'watch',
      confidence: 0.48,
      eventIds: evIds('MOH.DE'),
      pushed: false,
    },
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
