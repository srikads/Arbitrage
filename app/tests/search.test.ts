import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/instruments.dev.json';
import { buildIndex, search } from '../src/lib/search';
import type { Instrument } from '../src/lib/types';

const index = buildIndex(fixture as Instrument[]);
const names = (q: string, n = 3) => search(index, q, n).map((i) => i.name);

describe('instrument search ranking', () => {
  it('ranks exact symbol matches first', () => {
    expect(names('sap')[0]).toBe('SAP');
    expect(names('EUNL')[0]).toBe('iShares Core MSCI World UCITS ETF');
    expect(names('sie.de')[0]).toBe('Siemens');
  });

  it('matches by ISIN', () => {
    expect(names('DE0007236101')[0]).toBe('Siemens');
    expect(names('ie00b4l5y983')[0]).toBe('iShares Core MSCI World UCITS ETF');
  });

  it('prefers the shorter exact name over longer prefixes', () => {
    expect(names('siemens', 2)).toEqual(['Siemens', 'Siemens Energy']);
  });

  it('matches aliases and multi-word queries', () => {
    expect(names('telekom')[0]).toBe('Deutsche Telekom');
    expect(names('muenchener')[0]).toBe('Munich Re');
    const world = names('msci world', 5);
    expect(world).toContain('iShares Core MSCI World UCITS ETF');
    expect(world).toContain('Xtrackers MSCI World UCITS ETF 1C');
  });

  it('is accent- and typo-tolerant', () => {
    expect(names('nestle')[0]).toBe('Nestlé');
    expect(names('rheinmetal')[0]).toBe('Rheinmetall');
    expect(names('infineom')[0]).toBe('Infineon Technologies');
  });

  it('returns nothing for empty or unrelated queries', () => {
    expect(search(index, '   ')).toEqual([]);
    expect(search(index, 'zzzzqqq')).toEqual([]);
  });
});
