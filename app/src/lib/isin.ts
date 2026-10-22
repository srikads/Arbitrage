// ISIN validation (ISO 6166): 2-letter country, 9 alphanumerics, Luhn check digit.

export function normaliseIsin(s: string): string {
  return s.replace(/\s+/g, '').toUpperCase();
}

export function isinCheckDigit(first11: string): number {
  const digits = first11
    .toUpperCase()
    .split('')
    .map((c) => (c >= 'A' && c <= 'Z' ? String(c.charCodeAt(0) - 55) : c))
    .join('');
  let sum = 0;
  let dbl = true; // rightmost digit of the expanded string is doubled
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidIsin(input: string): boolean {
  const s = normaliseIsin(input);
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(s)) return false;
  return isinCheckDigit(s.slice(0, 11)) === Number(s[11]);
}

export function looksLikeIsin(input: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(normaliseIsin(input));
}
