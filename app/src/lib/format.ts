import type { Severity, SignalAction } from './types';

const LOCALE = undefined; // user's locale

const moneyFmt = new Map<string, Intl.NumberFormat>();
export function money(v: number | null | undefined, currency = 'EUR', digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '–';
  // London quotes in pence (GBp / GBX) — not the same as GBP.
  if (currency === 'GBp' || currency === 'GBX') return `${fixed(v, digits)} p`;
  const k = `${currency}:${digits}`;
  let f = moneyFmt.get(k);
  if (!f) {
    try {
      f = new Intl.NumberFormat(LOCALE, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
    } catch {
      f = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }
    moneyFmt.set(k, f);
  }
  return f.format(v);
}

export function signedMoney(v: number | null | undefined, currency = 'EUR'): string {
  if (v == null || !Number.isFinite(v)) return '–';
  const s = money(Math.abs(v), currency);
  return (v > 0 ? '+' : v < 0 ? '−' : '') + s;
}

export function num(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '–';
  return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(v);
}

export function fixed(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '–';
  return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

export function pct(v: number | null | undefined, digits = 2, signed = true): string {
  if (v == null || !Number.isFinite(v)) return '–';
  const s = fixed(Math.abs(v), digits) + ' %';
  if (!signed) return (v < 0 ? '−' : '') + s;
  return (v > 0 ? '+' : v < 0 ? '−' : '') + s;
}

export function tone(v: number | null | undefined): 'up' | 'down' | 'flat' {
  if (v == null || !Number.isFinite(v) || Math.abs(v) < 1e-9) return 'flat';
  return v > 0 ? 'up' : 'down';
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '–';
  const s = Math.round((now - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} d ago`;
  return dateShort(iso);
}

export function dateShort(iso: string): string {
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso);
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function dateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function timeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
}

export const ACTION_LABEL: Record<SignalAction, string> = {
  hold: 'Hold',
  watch: 'Watch closely',
  consider_trim: 'Consider trimming',
  consider_sell: 'Consider selling',
  consider_buy: 'Consider buying',
  consider_add: 'Consider adding',
};

export type ActionTone = 'pos' | 'neg' | 'warn' | 'neutral';
export const ACTION_TONE: Record<SignalAction, ActionTone> = {
  hold: 'neutral',
  watch: 'warn',
  consider_trim: 'warn',
  consider_sell: 'neg',
  consider_buy: 'pos',
  consider_add: 'pos',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  info: 'Info',
  important: 'Important',
  critical: 'Critical',
};

export function sentimentTone(s: number): 'pos' | 'neg' | 'neutral' {
  if (s >= 0.2) return 'pos';
  if (s <= -0.2) return 'neg';
  return 'neutral';
}

/** Local estimate of whether the main European exchange session (09:00–17:30 Berlin, Mon–Fri) is open. */
export function marketOpenNow(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const wd = get('weekday');
  if (wd === 'Sat' || wd === 'Sun') return false;
  const mins = Number(get('hour')) * 60 + Number(get('minute'));
  return mins >= 9 * 60 && mins < 17 * 60 + 30;
}
