// Loads the offline instrument universe (`instruments.json`, emitted at build time).
import type { Instrument } from './types';
import { buildIndex, type SearchIndex } from './search';

let cache: Promise<{ list: Instrument[]; index: SearchIndex }> | null = null;

function valid(x: unknown): x is Instrument {
  const i = x as Instrument;
  return !!i && typeof i.id === 'string' && typeof i.symbol === 'string' && typeof i.name === 'string';
}

export function loadInstruments(): Promise<{ list: Instrument[]; index: SearchIndex }> {
  if (!cache) {
    cache = fetch('./instruments.json')
      .then((r) => {
        if (!r.ok) throw new Error(`instruments.json: HTTP ${r.status}`);
        return r.json() as Promise<unknown>;
      })
      .then((raw) => {
        const list = (Array.isArray(raw) ? raw : []).filter(valid).map((i) => ({
          ...i,
          isin: i.isin ?? null,
          aliases: Array.isArray(i.aliases) ? i.aliases : [],
          wikipedia: i.wikipedia ?? null,
          currency: i.currency || 'EUR',
          type: i.type === 'etf' ? 'etf' : 'stock',
        })) as Instrument[];
        return { list, index: buildIndex(list) };
      })
      .catch((e: unknown) => {
        cache = null;
        throw e;
      });
  }
  return cache;
}
