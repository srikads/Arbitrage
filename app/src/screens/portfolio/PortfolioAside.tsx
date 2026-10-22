import { useMemo } from 'react';
import { Link } from 'react-router';
import { AlertRow } from '../../components/Rows';
import { Empty, Section, SignalTag } from '../../components/ui';
import { dateShort, pct } from '../../lib/format';
import { portfolio } from '../../lib/portfolio';
import { useApp, useLocal } from '../../state/AppContext';

/** Desktop right pane when no instrument is selected: allocation, signals, calendar. */
export function PortfolioAside() {
  const local = useLocal();
  const { feed } = useApp();
  const cfg = local.config;
  const { views, totals } = useMemo(() => portfolio(cfg.holdings, feed, cfg.settings), [cfg, feed]);
  const nameOf = (id: string | null) => (id ? [...cfg.holdings, ...cfg.candidates].find((i) => i.id === id)?.name ?? null : null);

  const alloc = [...views].sort((a, b) => b.value - a.value);
  const etf = views.filter((v) => v.pos.type === 'etf').reduce((s, v) => s + v.value, 0);
  const actionable = [...cfg.holdings, ...cfg.candidates]
    .map((i) => ({ i, s: feed?.instruments[i.id]?.signal }))
    .filter((x) => x.s && x.s.action !== 'hold')
    .sort((a, b) => (b.s!.confidence ?? 0) - (a.s!.confidence ?? 0));
  const earnings = [...cfg.holdings, ...cfg.candidates]
    .map((i) => ({ i, d: feed?.instruments[i.id]?.nextEarnings }))
    .filter((x): x is { i: (typeof x)['i']; d: string } => !!x.d && x.d >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.d.localeCompare(b.d))
    .slice(0, 6);

  if (!views.length && !cfg.candidates.length) {
    return (
      <Empty title="Select an instrument">
        <p>Add holdings to see allocation, signals and upcoming events here.</p>
      </Empty>
    );
  }

  return (
    <div className="aside-pane fade-in">
      <div className="topbar">
        <div className="topbar-title">
          <h1>Overview</h1>
        </div>
      </div>
      <Section title="Needs attention">
        {actionable.length ? (
          <ul className="rows">
            {actionable.slice(0, 6).map(({ i, s }) => (
              <li key={i.id}>
                <Link to={`/i/${encodeURIComponent(i.id)}`} className="row compact">
                  <div className="left">
                    <div className="title">{i.name}</div>
                    <div className="sub">{s!.headline}</div>
                  </div>
                  <div className="right">
                    <SignalTag action={s!.action} strong />
                    <div className="c faint num">{Math.round(s!.confidence * 100)} % confidence</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="row-empty">Nothing needs your attention right now.</div>
        )}
      </Section>

      <Section title="Allocation" aside={totals.value ? <span className="num">{pct((etf / totals.value) * 100, 0, false)} in ETFs</span> : null}>
        <ul className="alloc">
          {alloc.map((v) => {
            const share = totals.value ? (v.value / totals.value) * 100 : 0;
            return (
              <li key={v.pos.id}>
                <span className="alloc-name">{v.pos.name}</span>
                <span className="alloc-bar" aria-hidden="true">
                  <span style={{ width: `${Math.max(1, share)}%` }} />
                </span>
                <span className="alloc-val num">{pct(share, 1, false)}</span>
              </li>
            );
          })}
        </ul>
      </Section>

      {earnings.length ? (
        <Section title="Upcoming earnings">
          <ul className="rows">
            {earnings.map(({ i, d }) => (
              <li key={i.id}>
                <Link to={`/i/${encodeURIComponent(i.id)}`} className="row compact">
                  <div className="left">
                    <div className="title">{i.name}</div>
                  </div>
                  <div className="right num muted">{dateShort(d)}</div>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {feed?.alerts.length ? (
        <Section title="Latest alerts" aside={<Link to="/signals">All</Link>}>
          <ul className="rows">
            {feed.alerts.slice(0, 3).map((a) => (
              <AlertRow key={a.id} a={a} name={nameOf(a.instrumentId)} />
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
