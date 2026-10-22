import { NavLink, Outlet, useNavigate } from 'react-router';
import type { ReactNode } from 'react';
import { useApp } from '../state/AppContext';
import { IconAsk, IconBack, IconDigest, IconLock, IconPortfolio, IconSettings, IconSignals, Monogram } from './Icons';
import { SyncIndicator } from './SyncIndicator';
import { useUnseenAlerts } from './useUnseen';

const NAV = [
  { to: '/', label: 'Portfolio', icon: IconPortfolio, end: true },
  { to: '/signals', label: 'Signals', icon: IconSignals },
  { to: '/digest', label: 'Digest', icon: IconDigest },
  { to: '/ask', label: 'Ask', icon: IconAsk },
  { to: '/settings', label: 'Settings', icon: IconSettings },
];

export function Shell() {
  const { lock, demo } = useApp();
  const unseen = useUnseenAlerts();
  return (
    <>
      {demo ? (
        <div className="demo-banner" role="status">
          Demo mode · fictional data
        </div>
      ) : null}
      <div className="shell">
        <aside className="sidebar" aria-label="Main">
          <div className="brand">
            <Monogram size={26} />
            Arbitrage
          </div>
          <nav>
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>
                <n.icon />
                {n.label}
                {n.to === '/signals' && unseen > 0 ? <span className="badge-dot" aria-label={`${unseen} new`} /> : null}
              </NavLink>
            ))}
          </nav>
          <div className="foot">
            <SyncIndicator />
            {!demo ? (
              <button type="button" className="lock-btn" onClick={lock}>
                <IconLock width={15} height={15} /> Lock
              </button>
            ) : null}
          </div>
        </aside>
        <main className="main" id="main">
          <Outlet />
        </main>
        <nav className="tabbar" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <n.icon />
              {n.label}
              {n.to === '/signals' && unseen > 0 ? <span className="badge-dot" aria-label={`${unseen} new`} /> : null}
            </NavLink>
          ))}
        </nav>
      </div>
    </>
  );
}

export function TopBar({
  title,
  back,
  actions,
  line,
  sub,
}: {
  title: ReactNode;
  back?: string | boolean;
  actions?: ReactNode;
  line?: boolean;
  sub?: ReactNode;
}) {
  const nav = useNavigate();
  return (
    <header className={`topbar${line ? ' has-line' : ''}${back ? ' with-back' : ''}`}>
      {back ? (
        <button
          type="button"
          className="icon-btn back-btn"
          aria-label="Back"
          onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}
        >
          <IconBack />
        </button>
      ) : null}
      <div className="topbar-title">
        <h1>{title}</h1>
        {sub ? <div className="topbar-sub">{sub}</div> : null}
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </header>
  );
}
