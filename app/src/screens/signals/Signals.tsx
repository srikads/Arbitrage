import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { TopBar } from '../../components/Layout';
import { AlertRow, EventRow } from '../../components/Rows';
import { Empty, Meter, RiskMeter, Section, SignalTag } from '../../components/ui';
import { markAlertsSeen } from '../../components/useUnseen';
import { useIsDesktop } from '../../components/useNow';
import { dateTime, money, pct, SEVERITY_LABEL, tone } from '../../lib/format';
import type { Alert, FeedEvent, Instrument, Severity } from '../../lib/types';
import { useApp, useLocal } from '../../state/AppContext';

type Filter = 'all' | Severity;
const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['critical', 'Critical'],
  ['important', 'Important'],
  ['info', 'Info'],
];

function useInstrumentLookup() {
  const local = useLocal();
  const { feed } = useApp();
  return useMemo(() => {
    const m = new Map<string, Instrument>();
    for (const i of [...local.config.holdings, ...local.config.candidates]) m.set(i.id, i);
    return (id: string | null) => (id ? (m.get(id) ?? (feed?.resolved[id] ? ({ ...feed.resolved[id], id } as unknown as Instrument) : null)) : null);
  }, [local.config, feed]);
}

export function SignalsList({ selectedId }: { selectedId?: string }) {
  const { feed } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const lookup = useInstrumentLookup();
  useEffect(() => markAlertsSeen(), [feed?.generatedAt]);
  const alerts = (feed?.alerts ?? []).filter((a) => filter === 'all' || a.severity === filter);
  const sorted = [...alerts].sort((a, b) => b.time.localeCompare(a.time));

  return (
    <div>
      <TopBar title="Signals" />
      <div className="chips filter-chips" role="group" aria-label="Filter by severity">
        {FILTERS.map(([f, label]) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {label}
          </button>
        ))}
      </div>
      {sorted.length ? (
        <ul className="rows alerts">
          {sorted.map((a) => (
            <AlertRow key={a.id} a={a} name={lookup(a.instrumentId)?.name ?? null} selected={a.id === selectedId} />
          ))}
        </ul>
      ) : (
        <Empty title={feed ? 'No alerts' : 'No signals yet'}>
          <p>{feed ? 'Nothing matches this filter. Quiet is good for long-term investors.' : 'Signals appear here after the watcher has run.'}</p>
        </Empty>
      )}
    </div>
  );
}

export function AlertDetail({ id }: { id?: string }) {
  const { feed } = useApp();
  const desktop = useIsDesktop();
  const lookup = useInstrumentLookup();
  const alert: Alert | undefined = feed?.alerts.find((a) => a.id === id);
  if (!alert) {
    return (
      <>
        <TopBar title="Alert" back={desktop ? undefined : '/signals'} />
        <Empty title={feed ? 'Alert not found' : 'Loading…'}>
          <p>{feed ? 'It may be older than the last 200 alerts kept in the feed.' : 'Fetching the latest feed.'}</p>
        </Empty>
      </>
    );
  }
  const inst = lookup(alert.instrumentId);
  const snap = alert.instrumentId ? feed?.instruments[alert.instrumentId] : undefined;
  const allEvents: FeedEvent[] = snap?.events ?? Object.values(feed?.instruments ?? {}).flatMap((s) => s.events);
  const linked = alert.eventIds.map((eid) => allEvents.find((e) => e.id === eid)).filter((e): e is FeedEvent => !!e);
  const sevTone = alert.severity === 'critical' ? 'neg' : alert.severity === 'important' ? 'warn' : 'neutral';

  return (
    <article className="detail fade-in" key={alert.id}>
      <TopBar title={SEVERITY_LABEL[alert.severity]} back={desktop ? undefined : '/signals'} />
      <div className="page alert-detail">
        <div className={`sev-line tone-${sevTone}`}>
          <span className="dot" /> {SEVERITY_LABEL[alert.severity]} · {dateTime(alert.time)}
          {alert.pushed ? <span className="faint"> · notified</span> : null}
        </div>
        <h2 className="alert-title">{alert.title}</h2>
        <p className="alert-body">{alert.body}</p>
        {alert.action || alert.confidence != null ? (
          <div className="signal-meters alert-meters">
            {alert.action ? (
              <div className="meter">
                <div className="meter-top">
                  <span className="meter-label">Suggestion</span>
                </div>
                <SignalTag action={alert.action} strong />
              </div>
            ) : null}
            {alert.confidence != null ? <Meter label="Confidence" value={alert.confidence} text={`${Math.round(alert.confidence * 100)} %`} /> : null}
            {snap ? <RiskMeter risk={snap.signal.risk} /> : null}
          </div>
        ) : null}
        {snap ? (
          <Section title="Reasoning">
            <p className="signal-reasoning">{snap.signal.reasoning}</p>
          </Section>
        ) : null}
        {inst ? (
          <Section title="Instrument">
            <ul className="rows">
              <li>
                <Link className="row" to={`/i/${encodeURIComponent(inst.id)}`}>
                  <div className="left">
                    <div className="title">{inst.name}</div>
                    <div className="sub">{inst.symbol}</div>
                  </div>
                  {snap ? (
                    <div className="right">
                      <div className="v num">{money(snap.price, snap.currency)}</div>
                      <div className={`c num ${tone(snap.changePct1d)}`}>{pct(snap.changePct1d)}</div>
                    </div>
                  ) : null}
                </Link>
              </li>
            </ul>
          </Section>
        ) : null}
        <Section title="Sources" aside={linked.length ? String(linked.length) : undefined}>
          {linked.length ? (
            <ul className="rows events">
              {linked.map((e) => (
                <EventRow key={e.id} e={e} />
              ))}
            </ul>
          ) : (
            <div className="row-empty">No linked events for this alert.</div>
          )}
        </Section>
        <p className="disclaimer">Automated research, not financial advice.</p>
      </div>
    </article>
  );
}

export function SignalsScreen({ detail }: { detail?: boolean }) {
  const desktop = useIsDesktop();
  const { id } = useParams();
  const sel = id ? decodeURIComponent(id) : undefined;
  const { feed } = useApp();
  if (!desktop) return detail ? <AlertDetail id={sel} /> : <SignalsList />;
  const first = feed?.alerts[0]?.id;
  return (
    <div className="split narrow-list">
      <div className="pane pane-list">
        <SignalsList selectedId={sel ?? first} />
      </div>
      <div className="pane pane-detail">
        {sel ?? first ? (
          <AlertDetail id={sel ?? first} />
        ) : (
          <Empty title="No alert selected" />
        )}
      </div>
    </div>
  );
}
