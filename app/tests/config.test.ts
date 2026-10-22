import { describe, expect, it } from 'vitest';
import { emptyConfig, normaliseConfig, serialiseConfig } from '../src/lib/config';
import type { Config } from '../src/lib/types';

const keys = (o: object) => Object.keys(o).sort();

describe('Config serialisation (CONTRACT §4)', () => {
  const cfg: Config = {
    ...emptyConfig(new Date('2026-10-22T10:00:00Z')),
    holdings: [
      {
        id: 'DE0007164600',
        isin: 'DE0007164600',
        symbol: 'SAP.DE',
        name: 'SAP',
        type: 'stock',
        currency: 'EUR',
        aliases: ['SAP SE'],
        wikipedia: 'SAP',
        quantity: 10,
        buyPrice: 150.5,
        buyDate: '2024-01-02',
        stopLossPct: null,
        takeProfitPct: 40,
        // UI-only junk must not leak into the synced config
        ...({ selected: true } as object),
      },
    ],
    candidates: [{ id: 'IE00B4L5Y983', isin: 'IE00B4L5Y983', symbol: 'EUNL.DE', name: 'MSCI World', type: 'etf', currency: 'EUR', aliases: [], wikipedia: null, targetPrice: null, note: '' }],
    push: {
      subscription: { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } },
      vapidPublicKey: 'pub',
      vapidPrivateKey: 'priv',
      contact: 'mailto:noreply@example.com',
    },
  };

  it('has exactly the contract keys', () => {
    const out = JSON.parse(serialiseConfig(cfg)) as Config;
    expect(keys(out)).toEqual(['candidates', 'holdings', 'push', 'settings', 'updatedAt', 'version']);
    expect(out.version).toBe(1);
    expect(keys(out.holdings[0])).toEqual(
      ['aliases', 'buyDate', 'buyPrice', 'currency', 'id', 'isin', 'name', 'quantity', 'stopLossPct', 'symbol', 'takeProfitPct', 'type', 'wikipedia'].sort(),
    );
    expect(keys(out.candidates[0])).toEqual(['aliases', 'currency', 'id', 'isin', 'name', 'note', 'symbol', 'targetPrice', 'type', 'wikipedia'].sort());
    expect(keys(out.settings)).toEqual(['defaultStopLossPct', 'defaultTakeProfitPct', 'digest', 'quietHours', 'risk', 'sources', 'timezone']);
    expect(keys(out.settings.sources)).toEqual(['bluesky', 'forums', 'news', 'wikipedia']);
    expect(keys(out.settings.digest)).toEqual(['daily', 'weekly']);
    expect(keys(out.settings.quietHours)).toEqual(['end', 'start']);
    expect(keys(out.push!)).toEqual(['contact', 'subscription', 'vapidPrivateKey', 'vapidPublicKey']);
    expect(keys(out.push!.subscription)).toEqual(['endpoint', 'keys']);
    expect(keys(out.push!.subscription.keys)).toEqual(['auth', 'p256dh']);
  });

  it('has the documented defaults and types', () => {
    const s = emptyConfig().settings;
    expect(s).toEqual({
      risk: expect.any(Number),
      quietHours: { start: '22:00', end: '07:30' },
      timezone: 'Europe/Berlin',
      defaultStopLossPct: 15,
      defaultTakeProfitPct: 30,
      sources: { news: true, bluesky: true, forums: true, wikipedia: true },
      digest: { daily: true, weekly: true },
    });
    expect(s.risk).toBeGreaterThanOrEqual(0);
    expect(s.risk).toBeLessThanOrEqual(1);
    expect(emptyConfig().push).toBeNull();
  });

  it('normalises partial input and clamps risk', () => {
    const n = normaliseConfig({ settings: { risk: 3 } as Config['settings'] });
    expect(n.settings.risk).toBe(1);
    expect(n.holdings).toEqual([]);
    expect(n.push).toBeNull();
    expect(typeof n.updatedAt).toBe('string');
  });
});
