import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { IconTrash } from '../../components/Icons';
import { TopBar } from '../../components/Layout';
import { EventRow } from '../../components/Rows';
import { Empty, Section } from '../../components/ui';
import { useIsDesktop } from '../../components/useNow';
import { positionView } from '../../lib/portfolio';
import { useApp, useLocal } from '../../state/AppContext';
import { InstrumentChart } from './InstrumentChart';
import { PositionBlock, WatchBlock } from './PositionBlock';
import { SignalBlock, TechnicalsRow } from './SignalBlock';

export function InstrumentDetail({ id }: { id?: string }) {
  const local = useLocal();
  const { feed, updateConfig } = useApp();
  const nav = useNavigate();
  const desktop = useIsDesktop();
  const [hl, setHl] = useState<string | null>(null);
  const cfg = local.config;
  const holding = cfg.holdings.find((h) => h.id === id);
  const cand = cfg.candidates.find((c) => c.id === id);
  const inst = holding ?? cand;
  const snap = id ? (feed?.instruments[id] ?? null) : null;
  const view = useMemo(() => (holding ? positionView(holding, snap, cfg.settings) : null), [holding, snap, cfg.settings]);

  if (!inst) {
    return (
      <>
        <TopBar title="Instrument" back={desktop ? undefined : '/'} />
        <Empty title="Not in your portfolio">
          <p>This instrument is neither a holding nor on your watch list.</p>
        </Empty>
      </>
    );
  }

  const remove = () => {
    const what = holding ? 'holding' : 'watch list entry';
    if (!window.confirm(`Remove ${inst.name} (${what})? This only changes your records in this app.`)) return;
    updateConfig((c) => ({
      ...c,
      holdings: c.holdings.filter((h) => h.id !== inst.id),
      candidates: c.candidates.filter((x) => x.id !== inst.id),
    }));
    nav('/');
  };

  const onEvent = (eid: string) => {
    setHl(eid);
    document.getElementById(`ev-${eid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => setHl(null), 2200);
  };

  const ident = [inst.symbol, inst.isin, inst.type === 'etf' ? 'ETF' : 'Stock'].filter(Boolean).join(' · ');

  return (
    <article className="detail fade-in" key={inst.id}>
      <TopBar
        title={inst.name}
        sub={ident}
        back={desktop ? undefined : '/'}
        actions={
          <button type="button" className="icon-btn" aria-label={`Remove ${inst.name}`} onClick={remove}>
            <IconTrash />
          </button>
        }
      />
      {snap ? (
        <InstrumentChart snap={snap} currency={snap.currency || inst.currency} onEvent={onEvent} />
      ) : (
        <div className="feed-notice">
          <p className="notice">
            No market data for this instrument yet. {inst.symbol ? 'It will appear after the next watcher run.' : 'The watcher will try to resolve the ISIN on its next run.'}
          </p>
        </div>
      )}

      <div className="detail-body">
        {snap ? <SignalBlock signal={snap.signal} /> : null}
        {holding && view ? (
          <PositionBlock
            key={`${holding.id}:${holding.quantity}:${holding.buyPrice}`}
            v={view}
            settings={cfg.settings}
            onSave={(p) => updateConfig((c) => ({ ...c, holdings: c.holdings.map((h) => (h.id === p.id ? p : h)) }))}
          />
        ) : null}
        {cand ? (
          <WatchBlock
            key={cand.id}
            c={cand}
            snap={snap}
            onSave={(n) => updateConfig((c) => ({ ...c, candidates: c.candidates.map((x) => (x.id === n.id ? n : x)) }))}
          />
        ) : null}
        {snap ? <TechnicalsRow snap={snap} currency={snap.currency || inst.currency} /> : null}
        {snap ? (
          <Section title="Events & sources" aside={`${snap.events.length}`}>
            {snap.events.length ? (
              <ul className="rows events">
                {snap.events.map((e) => (
                  <EventRow key={e.id} e={e} highlight={e.id === hl} />
                ))}
              </ul>
            ) : (
              <div className="row-empty">No recent news, crowd or attention events.</div>
            )}
          </Section>
        ) : null}
        <div className="detail-foot">
          <button type="button" className="btn danger small" onClick={remove}>
            <IconTrash /> Remove {holding ? 'holding' : 'from watch list'}
          </button>
        </div>
      </div>
    </article>
  );
}
