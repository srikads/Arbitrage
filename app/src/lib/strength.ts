// Rough passphrase strength estimate (no dictionary, deliberately simple).
export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; bits: number };

export function passphraseStrength(p: string): Strength {
  if (!p) return { score: 0, label: 'Empty', bits: 0 };
  let pool = 0;
  if (/[a-z]/.test(p)) pool += 26;
  if (/[A-Z]/.test(p)) pool += 26;
  if (/[0-9]/.test(p)) pool += 10;
  if (/[^A-Za-z0-9]/.test(p)) pool += 33;
  const unique = new Set(p).size;
  let bits = Math.log2(Math.max(pool, 2)) * Math.min(p.length, unique * 2.5);
  const words = p.trim().split(/[\s\-_.]+/).filter((w) => w.length >= 3);
  if (words.length >= 4) bits = Math.max(bits, words.length * 11);
  if (/^(.)\1+$/.test(p) || /^(?:0123|1234|abcd|qwer|pass)/i.test(p)) bits = Math.min(bits, 10);
  const score = (bits < 35 ? 0 : bits < 50 ? 1 : bits < 65 ? 2 : bits < 80 ? 3 : 4) as Strength['score'];
  const label = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][score];
  return { score, label, bits: Math.round(bits) };
}

export const MIN_PASSPHRASE_LENGTH = 10;
