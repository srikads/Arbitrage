import { describe, expect, it } from 'vitest';
import { isValidIsin, isinCheckDigit, looksLikeIsin, normaliseIsin } from '../src/lib/isin';

describe('ISIN validation', () => {
  it.each(['US0378331005', 'DE0007164600', 'IE00B4L5Y983', 'DE000BASF111', 'NL0010273215', 'DK0062498333', 'US67066G1040', 'DE000A1EWWW0'])('accepts %s', (s) => {
    expect(isValidIsin(s)).toBe(true);
  });

  it('rejects a wrong check digit', () => {
    expect(isValidIsin('US0378331006')).toBe(false);
    expect(isValidIsin('DE0007164601')).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(isValidIsin('')).toBe(false);
    expect(isValidIsin('US037833100')).toBe(false);
    expect(isValidIsin('1S0378331005')).toBe(false);
    expect(isValidIsin('US037833100X')).toBe(false);
  });

  it('normalises spaces and case', () => {
    expect(normaliseIsin(' de 0007164600 ')).toBe('DE0007164600');
    expect(isValidIsin('de0007164600')).toBe(true);
    expect(looksLikeIsin('ie00b4l5y983')).toBe(true);
  });

  it('computes the check digit', () => {
    expect(isinCheckDigit('US037833100')).toBe(5);
    expect(isinCheckDigit('IE00B4L5Y98')).toBe(3);
  });
});
