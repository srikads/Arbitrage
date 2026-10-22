// Offline instrument search: fast, typo-tolerant-ish ranking over name,
// aliases, ISIN and symbol. Pure functions so it can be unit-tested.
import type { Instrument } from './types';

type Indexed = {
  inst: Instrument;
  name: string;
  words: string[];
  aliases: string[];
  symbol: string;
  symbolBase: string;
  isin: string;
};

export type SearchIndex = Indexed[];

const fold = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9.& ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function buildIndex(list: Instrument[]): SearchIndex {
  return list.map((inst) => {
    const name = fold(inst.name);
    const symbol = inst.symbol.toLowerCase();
    return {
      inst,
      name,
      words: name.split(' '),
      aliases: inst.aliases.map(fold),
      symbol,
      symbolBase: symbol.split('.')[0],
      isin: (inst.isin ?? '').toLowerCase(),
    };
  });
}

/** Is `q` a subsequence of `s`? Used as a weak fuzzy fallback. */
function subsequence(q: string, s: string): boolean {
  let i = 0;
  for (let j = 0; j < s.length && i < q.length; j++) if (s[j] === q[i]) i++;
  return i === q.length;
}

/** Levenshtein distance capped at `max` (early exit). */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function scoreToken(t: string, e: Indexed): number {
  if (e.isin && t === e.isin) return 1000;
  if (t === e.symbol || t === e.symbolBase) return 900;
  if (e.name === t) return 850;
  if (e.aliases.includes(t)) return 800;
  if (e.name.startsWith(t)) return 700;
  if (e.words.some((w) => w.startsWith(t))) return 600;
  if (e.aliases.some((a) => a.startsWith(t) || a.split(' ').some((w) => w.startsWith(t)))) return 550;
  if (t.length >= 3 && e.symbolBase.startsWith(t)) return 500;
  if (t.length >= 4 && e.isin.startsWith(t)) return 480;
  if (t.length >= 3 && e.name.includes(t)) return 400;
  if (t.length >= 4 && e.words.some((w) => editDistance(t, w.slice(0, t.length + 1), 1) <= 1)) return 250;
  if (t.length >= 3 && subsequence(t, e.name)) return 100;
  return 0;
}

export function search(index: SearchIndex, query: string, limit = 30): Instrument[] {
  const q = fold(query);
  if (!q) return [];
  const tokens = q.split(' ').filter(Boolean);
  const scored: { e: Indexed; s: number }[] = [];
  for (const e of index) {
    let total = 0;
    let ok = true;
    for (const t of tokens) {
      const s = scoreToken(t, e);
      if (s === 0) {
        ok = false;
        break;
      }
      total += s;
    }
    if (!ok) continue;
    // Prefer shorter names (more exact) and stocks slightly over ETFs on ties.
    total -= Math.min(e.name.length, 60) * 0.5;
    scored.push({ e, s: total });
  }
  scored.sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name));
  return scored.slice(0, limit).map((x) => x.e.inst);
}
