import { describe, expect, it } from 'vitest';
import { parseBlocks, safeHref } from '../src/lib/markdown';
import { parseNum } from '../src/screens/add/parse';
import { applyResolved } from '../src/state/resolve';
import { emptyConfig } from '../src/lib/config';
import type { Feed } from '../src/lib/types';
import { b64ToBytes, bytesToB64 } from '../src/lib/b64';

describe('helpers', () => {
  it('parses European and English number formats', () => {
    expect(parseNum('1.234,56')).toBe(1234.56);
    expect(parseNum('1,234.56')).toBe(1234.56);
    expect(parseNum('12,5')).toBe(12.5);
    expect(parseNum('abc')).toBeNull();
    expect(parseNum('')).toBeNull();
  });

  it('markdown: only http(s) links, block parsing', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('https://example.com/x')).toBe('https://example.com/x');
    const b = parseBlocks('## Title\n\nPara *x*\n\n- a\n- b\n\n| A | B |\n|---|---|\n| 1 | 2 |');
    expect(b.map((x) => x.t)).toEqual(['h', 'p', 'ul', 'table']);
  });

  it('base64 round trip', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253]);
    expect(Array.from(b64ToBytes(bytesToB64(bytes)))).toEqual(Array.from(bytes));
    expect(bytesToB64(new TextEncoder().encode('hi'))).toBe('aGk=');
  });

  it('applies Feed.resolved to manually added ISINs', () => {
    const cfg = emptyConfig();
    cfg.holdings.push({ id: 'DE0007164600', isin: 'DE0007164600', symbol: '', name: 'DE0007164600', type: 'stock', currency: 'EUR', aliases: [], wikipedia: null, quantity: 1, buyPrice: 1, buyDate: null, stopLossPct: null, takeProfitPct: null });
    const feed = { resolved: { DE0007164600: { symbol: 'SAP.DE', name: 'SAP', currency: 'EUR' } } } as unknown as Feed;
    const out = applyResolved(cfg, feed);
    expect(out.holdings[0]).toMatchObject({ symbol: 'SAP.DE', name: 'SAP' });
    expect(applyResolved(out, feed)).toBe(out);
  });
});
