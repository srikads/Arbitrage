import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { IconPlus, IconRefresh } from '../../components/Icons';
import { TopBar } from '../../components/Layout';
import { HoldingRow, WatchRow } from '../../components/Rows';
import { Section } from '../../components/ui';
import { useIsDesktop } from '../../components/useNow';
import { portfolio, snapshotFor } from '../../lib/portfolio';
import { useApp, useLocal } from '../../state/AppContext';
import { FeedNotice } from './FeedNotice';
import { PortfolioAside } from './PortfolioAside';
import { PortfolioHero } from './PortfolioHero';

export function PortfolioList({ selectedId }: { selectedId?: string }) {
  const local = useLocal();
  const { feed, feedStatus, refresh } = useApp();
  const [metric, setMetric] = useState<'total' | 'day'>('total');
  const cfg = local.config;
  const { views, totals } = useMemo(() => portfolio(cfg.holdings, feed, cfg.settings), [cfg.holdings, cfg.settings, feed]);
  const sorted = useMemo(() => [...views].sort((a, b) => b.value - a.value), [views]);
  const loading = feedStatus === 'loading';

  return (
    <div className="portfolio">
      <TopBar
        title="Portfolio"
        actions={
          <>
            <button type="button" className="icon-btn" aria-label="Refresh" onClick={() => void refresh()} disabled={loading}>
              <IconRefresh className={loading ? 'spin' : undefined} />
            </button>
            <Link to="/add" className="icon-btn" aria-label="Add instrument">
              <IconPlus />
            </Link>
          </>
        }
      />
      <PortfolioHero totals={totals} holdings={cfg.holdings} feed={feed} />
      <FeedNotice />

      <Section
        title={`Holdings · ${views.length}`}
        aside={
          views.length ? (
            <div className="mini-toggle" role="group" aria-label="Change shown">
              <button type="button" aria-pressed={metric === 'total'} onClick={() => setMetric('total')}>
                Total
              </button>
              <button type="button" aria-pressed={metric === 'day'} onClick={() => setMetric('day')}>
                Today
              </button>
            </div>
          ) : null
        }
      >
        {sorted.length ? (
          <ul className="rows wide">
            {sorted.map((v) => (
              <HoldingRow
                key={v.pos.id}
                v={v}
                metric={metric}
                selected={v.pos.id === selectedId}
                share={totals.value && v.valueBase != null ? (v.valueBase / totals.value) * 100 : undefined}
              />
            ))}
          </ul>
        ) : (
          <div className="row-empty">
            No holdings yet. <Link to="/add">Add your first position</Link> — quantities and prices stay encrypted on this device and in your repo.
          </div>
        )}
      </Section>

      <Section title={`Watching · ${cfg.candidates.length}`} aside={<Link to="/add?as=watch">Add</Link>}>
        {cfg.candidates.length ? (
          <ul className="rows">
            {cfg.candidates.map((c) => (
              <WatchRow key={c.id} c={c} snap={snapshotFor(feed, c.id)} selected={c.id === selectedId} />
            ))}
          </ul>
        ) : (
          <div className="row-empty">Add instruments you consider buying; you will get a signal when they reach your target.</div>
        )}
      </Section>
      <p className="disclaimer">Signals are automated research, not financial advice. This app never connects to your bank or broker.</p>
    </div>
  );
}

/** Portfolio list with an optional detail pane (desktop) or full-screen detail (mobile). */
export function PortfolioScreen({ detail }: { detail?: (id?: string) => ReactNode }) {
  const desktop = useIsDesktop();
  const { id } = useParams();
  const selectedId = id ? decodeURIComponent(id) : undefined;
  if (!desktop) return detail ? <>{detail(selectedId)}</> : <PortfolioList />;
  return (
    <div className="split">
      <div className="pane pane-list">
        <PortfolioList selectedId={selectedId} />
      </div>
      <div className="pane pane-detail">{detail ? detail(selectedId) : <PortfolioAside />}</div>
    </div>
  );
}
