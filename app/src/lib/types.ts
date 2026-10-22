// Types mirrored 1:1 from docs/CONTRACT.md. Keep in sync with the contract.

export type Envelope = {
  v: 1;
  alg: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  iter: number;
  salt: string;
  iv: string;
  ct: string;
};

export type InstrumentType = 'stock' | 'etf';

export type Instrument = {
  id: string;
  isin: string | null;
  symbol: string;
  name: string;
  type: InstrumentType;
  currency: string;
  aliases: string[];
  wikipedia: string | null;
};

export type Position = Instrument & {
  quantity: number;
  buyPrice: number;
  buyDate: string | null;
  stopLossPct: number | null;
  takeProfitPct: number | null;
};

export type Candidate = Instrument & {
  targetPrice: number | null;
  note: string;
};

export type Settings = {
  risk: number;
  quietHours: { start: string; end: string };
  timezone: string;
  defaultStopLossPct: number;
  defaultTakeProfitPct: number;
  sources: { news: boolean; bluesky: boolean; forums: boolean; wikipedia: boolean };
  digest: { daily: boolean; weekly: boolean };
};

export type PushTarget = {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  vapidPublicKey: string;
  vapidPrivateKey: string;
  contact: string;
};

export type Config = {
  version: 1;
  updatedAt: string;
  holdings: Position[];
  candidates: Candidate[];
  settings: Settings;
  push: PushTarget | null;
};

export type SignalAction =
  | 'hold'
  | 'watch'
  | 'consider_trim'
  | 'consider_sell'
  | 'consider_buy'
  | 'consider_add';

export type Factor = { name: string; value: number; weight: number; note: string };

export type Signal = {
  action: SignalAction;
  confidence: number;
  risk: 'low' | 'medium' | 'high';
  score: number;
  horizon: 'hours' | 'days' | 'weeks' | 'months';
  headline: string;
  reasoning: string;
  factors: Factor[];
  updatedAt: string;
};

export type EventKind = 'news' | 'bluesky' | 'forum' | 'attention' | 'price' | 'earnings';

export type FeedEvent = {
  id: string;
  time: string;
  kind: EventKind;
  title: string;
  summary: string;
  url: string | null;
  source: string;
  sentiment: number;
  impact: 'low' | 'medium' | 'high';
};

export type Technicals = {
  rsi14: number | null;
  sma50: number | null;
  sma200: number | null;
  volumeZ: number | null;
  drawdownFrom52wHighPct: number | null;
  move1hPct: number | null;
};

export type InstrumentSnapshot = {
  id: string;
  price: number | null;
  currency: string;
  changePct1d: number | null;
  asOf: string | null;
  history: { daily: [string, number][]; intraday: [string, number][] };
  technicals: Technicals;
  nextEarnings: string | null;
  signal: Signal;
  events: FeedEvent[];
};

export type Severity = 'info' | 'important' | 'critical';

export type Alert = {
  id: string;
  time: string;
  instrumentId: string | null;
  severity: Severity;
  title: string;
  body: string;
  action: SignalAction | null;
  confidence: number | null;
  eventIds: string[];
  pushed: boolean;
};

export type Digest = {
  id: string;
  time: string;
  kind: 'daily' | 'weekly';
  title: string;
  markdown: string;
};

export type Feed = {
  version: 1;
  generatedAt: string;
  run: { mode: 'light' | 'deep' | 'digest'; llm: string | null; durationSec: number };
  market: { isOpen: boolean; note: string };
  instruments: Record<string, InstrumentSnapshot>;
  alerts: Alert[];
  digests: Digest[];
  resolved: Record<string, { symbol: string; name: string; currency: string }>;
};

export type PushPayload = {
  title: string;
  body: string;
  alertId: string;
  instrumentId: string | null;
  severity: Severity;
};
