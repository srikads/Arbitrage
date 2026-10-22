import { Link } from 'react-router';
import { ACTION_LABEL, dateTime, money, num, pct, SEVERITY_LABEL, timeAgo, tone } from '../lib/format';
import type { PositionView } from '../lib/portfolio';
import type { Alert, Candidate, FeedEvent, InstrumentSnapshot } from '../lib/types';
import { distanceToTarget } from '../lib/portfolio';
import { safeHref } from '../lib/markdown';
import { Avatar, SentimentDot, SignalTag } from './ui';
import { IconExternal } from './Icons';

const shortLabel = (a: InstrumentSnapshot['signal']['action']) =>
  (a === 'watch' ? 'Watch' : ACTION_LABEL[a]).replace('Consider ', '').replace(/^./, (c) => c.toUpperCase());

export function HoldingRow({ v, selected, share, metric = 'total' }: { v: PositionView; selected?: boolean; share?: number; metric?: 'total' | 'day' }) {
  const m = metric === 'day' ? v.dayPct : v.pnlPct;
  const p = v.pos;
  const sig = v.snap?.signal;
  return (
    <li>
      <Link to={`/i/${encodeURIComponent(p.id)}`} className={`row${selected ? ' selected' : ''}`} aria-current={selected ? 'true' : undefined}>
        <Avatar symbol={p.symbol} name={p.name} />
        <div className="left">
          <div className="title">{p.name}</div>
          <div className="sub">
            <span className="num">
              {num(p.quantity, 4)} · {p.symbol || p.isin}
            </span>
            {sig && sig.action !== 'hold' ? (
              <>
                <span className="sep">·</span>
                <SignalTag action={sig.action} label={shortLabel(sig.action)} />
              </>
            ) : null}
          </div>
        </div>
        <div className="cols desktop-only">
          <span className={tone(metric === 'day' ? v.pnlPct : v.dayPct)}>{pct(metric === 'day' ? v.pnlPct : v.dayPct)}</span>
          <span className="muted">{share != null ? pct(share, 1, false) : ''}</span>
        </div>
        <div className="right">
          <div className="v">{money(v.value, p.currency)}</div>
          <div className={`c ${tone(m)}`}>{v.price == null ? <span className="faint">no price yet</span> : pct(m)}</div>
        </div>
      </Link>
    </li>
  );
}

export function WatchRow({ c, snap, selected }: { c: Candidate; snap: InstrumentSnapshot | null; selected?: boolean }) {
  const price = snap?.price ?? null;
  const dist = distanceToTarget(c, price);
  const sig = snap?.signal;
  return (
    <li>
      <Link to={`/i/${encodeURIComponent(c.id)}`} className={`row${selected ? ' selected' : ''}`} aria-current={selected ? 'true' : undefined}>
        <Avatar symbol={c.symbol} name={c.name} />
        <div className="left">
          <div className="title">{c.name}</div>
          <div className="sub">
            {c.targetPrice != null ? (
              <span className="num">
                Target {money(c.targetPrice, c.currency)}
                {dist != null ? <span className="faint"> ({pct(dist, 1)})</span> : null}
              </span>
            ) : (
              <span>{c.symbol || c.isin}</span>
            )}
            {sig && sig.action !== 'hold' ? (
              <>
                <span className="sep">·</span>
                <SignalTag action={sig.action} label={shortLabel(sig.action)} />
              </>
            ) : null}
          </div>
        </div>
        <div className="right">
          <div className="v">{money(price, snap?.currency ?? c.currency)}</div>
          <div className={`c ${tone(snap?.changePct1d)}`}>{pct(snap?.changePct1d)}</div>
        </div>
      </Link>
    </li>
  );
}

const SEV_TONE: Record<Alert['severity'], string> = { info: 'neutral', important: 'warn', critical: 'neg' };

export function AlertRow({ a, name, selected }: { a: Alert; name: string | null; selected?: boolean }) {
  return (
    <li>
      <Link to={`/alert/${encodeURIComponent(a.id)}`} className={`row alert-row${selected ? ' selected' : ''}`} aria-current={selected ? 'true' : undefined}>
        <span className={`sev-bar tone-${SEV_TONE[a.severity]}`} aria-label={SEVERITY_LABEL[a.severity]} />
        <div className="left">
          <div className="title">{a.title}</div>
          <div className="sub">
            <span>{name ?? 'Portfolio'}</span>
            <span className="sep">·</span>
            <span>{timeAgo(a.time)}</span>
            {a.action ? (
              <>
                <span className="sep">·</span>
                <SignalTag action={a.action} />
              </>
            ) : null}
          </div>
          <p className="row-body">{a.body}</p>
        </div>
      </Link>
    </li>
  );
}

const KIND_LABEL: Record<FeedEvent['kind'], string> = {
  news: 'News',
  bluesky: 'Bluesky',
  forum: 'Forum',
  attention: 'Attention',
  price: 'Price',
  earnings: 'Earnings',
};

export function EventRow({ e, highlight }: { e: FeedEvent; highlight?: boolean }) {
  const href = e.url ? safeHref(e.url) : null;
  const inner = (
    <>
      <SentimentDot value={e.sentiment} />
      <div className="left">
        <div className="ev-title">{e.title}</div>
        <div className="sub">
          <span>{e.source}</span>
          {KIND_LABEL[e.kind].toLowerCase() !== e.source.toLowerCase() ? (
            <>
              <span className="sep">·</span>
              <span>{KIND_LABEL[e.kind]}</span>
            </>
          ) : null}
          <span className="sep">·</span>
          <time dateTime={e.time} title={dateTime(e.time)}>
            {timeAgo(e.time)}
          </time>
          {e.impact === 'high' ? (
            <>
              <span className="sep">·</span>
              <span className="impact">High impact</span>
            </>
          ) : null}
        </div>
      </div>
      {href ? <IconExternal className="ev-ext" width={15} height={15} /> : null}
    </>
  );
  return (
    <li id={`ev-${e.id}`} className={highlight ? 'ev-hl' : undefined}>
      {href ? (
        <a className="row ev-row" href={href} target="_blank" rel="noopener noreferrer" title={e.summary || e.title}>
          {inner}
        </a>
      ) : (
        <div className="row ev-row" title={e.summary || undefined}>
          {inner}
        </div>
      )}
    </li>
  );
}
