// Config construction / serialisation per CONTRACT §4, plus local-only data.
import type { Candidate, Config, Instrument, Position, PushTarget, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  risk: 0.35,
  quietHours: { start: '22:00', end: '07:30' },
  timezone: 'Europe/Berlin',
  defaultStopLossPct: 15,
  defaultTakeProfitPct: 30,
  sources: { news: true, bluesky: true, forums: true, wikipedia: true },
  digest: { daily: true, weekly: true },
};

export const PUSH_CONTACT = 'mailto:noreply@example.com';

export function emptyConfig(now = new Date()): Config {
  return {
    version: 1,
    updatedAt: now.toISOString(),
    holdings: [],
    candidates: [],
    settings: structuredClone(DEFAULT_SETTINGS),
    push: null,
  };
}

/** Strip any extra (UI-only) fields so the serialised object matches the contract exactly. */
export function pickInstrument(i: Instrument): Instrument {
  return {
    id: i.id,
    isin: i.isin ?? null,
    symbol: i.symbol,
    name: i.name,
    type: i.type,
    currency: i.currency || 'EUR',
    aliases: [...(i.aliases ?? [])],
    wikipedia: i.wikipedia ?? null,
  };
}

export function pickPosition(p: Position): Position {
  return {
    ...pickInstrument(p),
    quantity: Number(p.quantity),
    buyPrice: Number(p.buyPrice),
    buyDate: p.buyDate || null,
    stopLossPct: p.stopLossPct ?? null,
    takeProfitPct: p.takeProfitPct ?? null,
  };
}

export function pickCandidate(c: Candidate): Candidate {
  return { ...pickInstrument(c), targetPrice: c.targetPrice ?? null, note: c.note ?? '' };
}

function pickSettings(s: Partial<Settings> | undefined): Settings {
  const d = DEFAULT_SETTINGS;
  const x = s ?? {};
  return {
    risk: clamp01(typeof x.risk === 'number' ? x.risk : d.risk),
    quietHours: { start: x.quietHours?.start ?? d.quietHours.start, end: x.quietHours?.end ?? d.quietHours.end },
    timezone: x.timezone || d.timezone,
    defaultStopLossPct: num(x.defaultStopLossPct, d.defaultStopLossPct),
    defaultTakeProfitPct: num(x.defaultTakeProfitPct, d.defaultTakeProfitPct),
    sources: {
      news: x.sources?.news ?? d.sources.news,
      bluesky: x.sources?.bluesky ?? d.sources.bluesky,
      forums: x.sources?.forums ?? d.sources.forums,
      wikipedia: x.sources?.wikipedia ?? d.sources.wikipedia,
    },
    digest: { daily: x.digest?.daily ?? d.digest.daily, weekly: x.digest?.weekly ?? d.digest.weekly },
  };
}

function pickPush(p: PushTarget | null | undefined): PushTarget | null {
  if (!p) return null;
  return {
    subscription: {
      endpoint: p.subscription.endpoint,
      keys: { p256dh: p.subscription.keys.p256dh, auth: p.subscription.keys.auth },
    },
    vapidPublicKey: p.vapidPublicKey,
    vapidPrivateKey: p.vapidPrivateKey,
    contact: p.contact || PUSH_CONTACT,
  };
}

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Normalise any (possibly older / partial) config into the exact contract shape. */
export function normaliseConfig(c: Partial<Config>): Config {
  return {
    version: 1,
    updatedAt: c.updatedAt || new Date().toISOString(),
    holdings: (c.holdings ?? []).map(pickPosition),
    candidates: (c.candidates ?? []).map(pickCandidate),
    settings: pickSettings(c.settings),
    push: pickPush(c.push),
  };
}

export function serialiseConfig(c: Config): string {
  return JSON.stringify(normaliseConfig(c));
}

/** Data that only lives on this device (encrypted in IndexedDB, never synced). */
export type GitHubConn = { owner: string; repo: string; token: string };

export type LocalPrefs = {
  autoLockMin: number;
  ollamaUrl: string;
  ollamaModel: string;
};

export type LocalData = {
  config: Config;
  github: GitHubConn | null;
  prefs: LocalPrefs;
  onboarded: boolean;
  /** Local config has changes not yet written to the repo. */
  dirty: boolean;
  lastPushedAt: string | null;
  /** sha of data/config.enc as last seen (for contents API updates). */
  configSha: string | null;
};

export const DEFAULT_PREFS: LocalPrefs = {
  autoLockMin: 10,
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'qwen2.5:7b',
};

export function emptyLocal(): LocalData {
  return {
    config: emptyConfig(),
    github: null,
    prefs: { ...DEFAULT_PREFS },
    onboarded: false,
    dirty: false,
    lastPushedAt: null,
    configSha: null,
  };
}

export function normaliseLocal(x: Partial<LocalData>): LocalData {
  return {
    config: normaliseConfig(x.config ?? {}),
    github: x.github ?? null,
    prefs: { ...DEFAULT_PREFS, ...(x.prefs ?? {}) },
    onboarded: !!x.onboarded,
    dirty: !!x.dirty,
    lastPushedAt: x.lastPushedAt ?? null,
    configSha: x.configSha ?? null,
  };
}
