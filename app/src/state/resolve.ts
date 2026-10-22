// Apply Feed.resolved (watcher-resolved data for user-added ISINs) to the config.
import type { Config, Feed, Instrument } from '../lib/types';

function patch<T extends Instrument>(i: T, r: Feed['resolved'][string] | undefined): T {
  if (!r) return i;
  const needsSymbol = !i.symbol && !!r.symbol;
  const needsName = (!i.name || i.name === i.isin || i.name === i.id) && !!r.name;
  if (!needsSymbol && !needsName) return i;
  return {
    ...i,
    symbol: needsSymbol ? r.symbol : i.symbol,
    name: needsName ? r.name : i.name,
    currency: needsSymbol && r.currency ? r.currency : i.currency,
  };
}

export function applyResolved(config: Config, feed: Feed): Config {
  const res = feed.resolved ?? {};
  if (Object.keys(res).length === 0) return config;
  let changed = false;
  const holdings = config.holdings.map((h) => {
    const n = patch(h, res[h.id]);
    if (n !== h) changed = true;
    return n;
  });
  const candidates = config.candidates.map((c) => {
    const n = patch(c, res[c.id]);
    if (n !== c) changed = true;
    return n;
  });
  return changed ? { ...config, holdings, candidates } : config;
}
