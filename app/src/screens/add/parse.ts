/** Parse a user-entered number, accepting both "1.234,56" and "1,234.56" styles. */
export function parseNum(input: string): number | null {
  let s = input.trim().replace(/\s|'|’/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = s.replace(',', '.');
  }
  if (!/^-?\d*\.?\d+$/.test(s) && !/^-?\d+\.?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
