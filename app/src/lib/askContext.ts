// Builds the compact JSON context handed to the local model in "Ask".
import type { Config, Feed } from './types';
import { portfolio } from './portfolio';

const r2 = (v: number | null | undefined) => (v == null ? null : Math.round(v * 100) / 100);

export function buildAskContext(config: Config, feed: Feed | null, now = new Date()): string {
  const { views, totals } = portfolio(config.holdings, feed, config.settings);
  const since = now.getTime() - 14 * 86_400_000;
  const inst = (id: string) => feed?.instruments[id];
  const evs = (id: string) =>
    (inst(id)?.events ?? [])
      .filter((e) => Date.parse(e.time) >= since)
      .slice(0, 6)
      .map((e) => ({ t: e.time.slice(0, 16), kind: e.kind, src: e.source, title: e.title, sent: r2(e.sentiment), impact: e.impact }));
  const sig = (id: string) => {
    const s = inst(id)?.signal;
    return s ? { action: s.action, conf: r2(s.confidence), risk: s.risk, headline: s.headline, reasoning: s.reasoning } : null;
  };
  const ctx = {
    asOf: feed?.generatedAt ?? null,
    market: feed?.market ?? null,
    riskProfile: config.settings.risk < 0.5 ? 'conservative' : 'balanced',
    totals: { value: r2(totals.value), pnl: r2(totals.pnl), pnlPct: r2(totals.pnlPct), dayPct: r2(totals.dayPct) },
    holdings: views.map((v) => ({
      name: v.pos.name,
      symbol: v.pos.symbol,
      qty: v.pos.quantity,
      buy: v.pos.buyPrice,
      price: r2(v.price),
      pnlPct: r2(v.pnlPct),
      dayPct: r2(v.dayPct),
      rsi: r2(inst(v.pos.id)?.technicals.rsi14),
      drawdownPct: r2(inst(v.pos.id)?.technicals.drawdownFrom52wHighPct),
      nextEarnings: inst(v.pos.id)?.nextEarnings ?? null,
      signal: sig(v.pos.id),
      events: evs(v.pos.id),
    })),
    watching: config.candidates.map((c) => ({
      name: c.name,
      symbol: c.symbol,
      price: r2(inst(c.id)?.price),
      target: c.targetPrice,
      dayPct: r2(inst(c.id)?.changePct1d),
      signal: sig(c.id),
      events: evs(c.id).slice(0, 3),
    })),
    recentAlerts: (feed?.alerts ?? []).slice(0, 10).map((a) => ({ t: a.time.slice(0, 16), sev: a.severity, title: a.title, body: a.body })),
  };
  return JSON.stringify(ctx);
}

export function systemPrompt(contextJson: string): string {
  return [
    'You are a careful, plain-spoken personal investment research helper for a long-term investor holding European stocks and ETFs.',
    'Answer using the JSON portfolio context below (prices, signals, recent news and crowd events). Cite the events you rely on by source and date.',
    'If the context does not contain the answer, say so. Never invent prices or news. Keep answers short and concrete.',
    'You do not give personalised financial advice; frame suggestions as considerations, and mention uncertainty.',
    '',
    'CONTEXT:',
    contextJson,
  ].join('\n');
}
