import type { ReactNode } from 'react';
import { ACTION_LABEL, ACTION_TONE, sentimentTone } from '../lib/format';
import type { Signal, SignalAction } from '../lib/types';

export function SignalTag({ action, strong, label }: { action: SignalAction | null | undefined; strong?: boolean; label?: string }) {
  if (!action) return null;
  return (
    <span className={`sig tone-${ACTION_TONE[action]}${strong ? ' strong' : ''}`}>
      <span className="dot" aria-hidden="true" />
      {label ?? ACTION_LABEL[action]}
    </span>
  );
}

export function SentimentDot({ value, title }: { value: number; title?: string }) {
  const t = sentimentTone(value);
  const label = title ?? (t === 'pos' ? 'Positive' : t === 'neg' ? 'Negative' : 'Neutral');
  return <span className={`dot tone-${t}`} role="img" aria-label={`${label} sentiment`} title={`${label} (${value.toFixed(2)})`} />;
}

export function Section({ title, aside, children, id }: { title: string; aside?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="section" id={id} aria-labelledby={id ? `${id}-h` : undefined}>
      <div className="section-head">
        <h2 id={id ? `${id}-h` : undefined}>{title}</h2>
        {aside ? <div className="aside">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Avatar({ symbol, name }: { symbol: string; name: string }) {
  const base = (symbol || name).split('.')[0].replace(/[^A-Za-z0-9]/g, '');
  return (
    <span className="mono-avatar" aria-hidden="true">
      {base.slice(0, 3).toUpperCase() || '?'}
    </span>
  );
}

/** Thin segmented meter, 0..1. */
export function Meter({ value, label, tone = 'neutral', text }: { value: number; label: string; tone?: 'pos' | 'neg' | 'warn' | 'neutral'; text: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <div className="meter-top">
        <span className="meter-label">{label}</span>
        <span className="meter-text num">{text}</span>
      </div>
      <div className={`meter-track tone-${tone}`}>
        <div className="meter-fill" style={{ width: `${v * 100}%` }} />
      </div>
    </div>
  );
}

export function RiskMeter({ risk }: { risk: Signal['risk'] }) {
  const n = risk === 'low' ? 1 : risk === 'medium' ? 2 : 3;
  const tone = risk === 'low' ? 'pos' : risk === 'medium' ? 'warn' : 'neg';
  return (
    <div className="meter" role="meter" aria-label="Risk" aria-valuemin={1} aria-valuemax={3} aria-valuenow={n} aria-valuetext={risk}>
      <div className="meter-top">
        <span className="meter-label">Risk</span>
        <span className="meter-text">{risk[0].toUpperCase() + risk.slice(1)}</span>
      </div>
      <div className={`meter-steps tone-${tone}`}>
        {[1, 2, 3].map((i) => (
          <span key={i} className={i <= n ? 'on' : ''} />
        ))}
      </div>
    </div>
  );
}

export function FactorBars({ factors }: { factors: Signal['factors'] }) {
  if (!factors.length) return null;
  return (
    <ul className="factors">
      {factors.map((f) => {
        const v = Math.max(-1, Math.min(1, f.value));
        const tone = v > 0.1 ? 'pos' : v < -0.1 ? 'neg' : 'neutral';
        return (
          <li key={f.name}>
            <div className="factor-name">
              <span>{f.name}</span>
              {f.note ? <span className="faint"> · {f.note}</span> : null}
            </div>
            <div className={`factor-bar tone-${tone}`} aria-label={`${f.name}: ${v.toFixed(2)}`} role="img">
              <span className="axis" />
              <span className="fill" style={v >= 0 ? { left: '50%', width: `${v * 50}%` } : { right: '50%', width: `${-v * 50}%` }} />
            </div>
            <div className="factor-val num">{(v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2)}</div>
          </li>
        );
      })}
    </ul>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <span className="switch">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
    </span>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {error ? <span className="hint error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty fade-in">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
