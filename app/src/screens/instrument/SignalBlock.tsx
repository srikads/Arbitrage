import { FactorBars, Meter, RiskMeter, Section, SignalTag } from '../../components/ui';
import { ACTION_TONE, dateShort, fixed, money, pct, timeAgo } from '../../lib/format';
import type { InstrumentSnapshot, Signal } from '../../lib/types';

const HORIZON: Record<Signal['horizon'], string> = { hours: 'Hours', days: 'Days', weeks: 'Weeks', months: 'Months' };

export function SignalBlock({ signal }: { signal: Signal }) {
  const t = ACTION_TONE[signal.action];
  return (
    <Section title="Signal" aside={`Updated ${timeAgo(signal.updatedAt)}`}>
      <div className="signal-block">
        <div className="signal-head">
          <SignalTag action={signal.action} strong />
          <h3 className="signal-headline">{signal.headline}</h3>
        </div>
        <div className="signal-meters">
          <Meter label="Confidence" value={signal.confidence} text={`${Math.round(signal.confidence * 100)} %`} tone={t === 'neutral' ? 'neutral' : t} />
          <RiskMeter risk={signal.risk} />
          <div className="meter">
            <div className="meter-top">
              <span className="meter-label">Horizon</span>
              <span className="meter-text">{HORIZON[signal.horizon]}</span>
            </div>
            <div className="horizon-steps" aria-hidden="true">
              {(['hours', 'days', 'weeks', 'months'] as const).map((h) => (
                <span key={h} className={h === signal.horizon ? 'on' : ''} />
              ))}
            </div>
          </div>
        </div>
        <p className="signal-reasoning">{signal.reasoning}</p>
        {signal.factors.length ? (
          <div className="factors-wrap">
            <div className="sublabel">
              What drives this signal{' '}
              <span className="faint">
                · score {signal.score > 0 ? '+' : ''}
                {fixed(signal.score, 2)}
              </span>
            </div>
            <FactorBars factors={signal.factors} />
          </div>
        ) : null}
      </div>
    </Section>
  );
}

export function TechnicalsRow({ snap, currency }: { snap: InstrumentSnapshot; currency: string }) {
  const t = snap.technicals;
  const price = snap.price;
  const vs = (sma: number | null) => (sma != null && price != null ? ((price - sma) / sma) * 100 : null);
  const items: [string, string, string?][] = [
    [
      'RSI 14',
      t.rsi14 != null ? fixed(t.rsi14, 0) : '–',
      t.rsi14 != null ? (t.rsi14 >= 70 ? 'overbought' : t.rsi14 <= 30 ? 'oversold' : 'neutral') : undefined,
    ],
    ['SMA 50', money(t.sma50, currency), vs(t.sma50) != null ? `price ${pct(vs(t.sma50), 1)}` : undefined],
    ['SMA 200', money(t.sma200, currency), vs(t.sma200) != null ? `price ${pct(vs(t.sma200), 1)}` : undefined],
    ['From 52w high', pct(t.drawdownFrom52wHighPct, 1), undefined],
    ['Volume', t.volumeZ != null ? `${t.volumeZ > 0 ? '+' : ''}${fixed(t.volumeZ, 1)} σ` : '–', 'vs. 20-day mean'],
    ['Next earnings', snap.nextEarnings ? dateShort(snap.nextEarnings) : '–', undefined],
  ];
  return (
    <Section title="Technicals">
      <dl className="kv-grid">
        {items.map(([k, v, s]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="num">{v}</dd>
            {s ? <dd className="kv-sub">{s}</dd> : null}
          </div>
        ))}
      </dl>
    </Section>
  );
}
