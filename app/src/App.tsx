import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router';
import { Shell } from './components/Layout';
import { InstallHint } from './components/InstallHint';
import { AddInstrumentScreen } from './screens/add/AddInstrument';
import { AskScreen } from './screens/Ask';
import { DigestScreen } from './screens/Digest';
import { InstrumentDetail } from './screens/instrument/InstrumentDetail';
import { Onboarding } from './screens/onboarding/Onboarding';
import { UnlockScreen } from './screens/onboarding/Unlock';
import { PortfolioScreen } from './screens/portfolio/Portfolio';
import { SettingsScreen } from './screens/settings/Settings';
import { SignalsScreen } from './screens/signals/Signals';
import { useApp } from './state/AppContext';
import { useAutoLock } from './state/useAutoLock';

/** Handles notification clicks forwarded by the service worker to an open window. */
function NotificationBridge() {
  const nav = useNavigate();
  const { refresh, phase } = useApp();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const on = (e: MessageEvent) => {
      const d = e.data as { type?: string; alertId?: string | null };
      if (d?.type !== 'open-alert') return;
      if (phase === 'ready') void refresh();
      nav(d.alertId ? `/alert/${encodeURIComponent(d.alertId)}` : '/signals');
    };
    navigator.serviceWorker.addEventListener('message', on);
    return () => navigator.serviceWorker.removeEventListener('message', on);
  }, [nav, refresh, phase]);
  return null;
}

function Gate() {
  const { phase, local, lock, demo } = useApp();
  useAutoLock(local?.prefs.autoLockMin ?? 0, phase === 'ready' && !demo, lock);
  if (phase === 'boot') return <div className="boot" aria-busy="true" />;
  if (phase === 'locked') return <UnlockScreen />;
  if (phase === 'welcome' || (phase === 'ready' && local && !local.onboarded)) return <Onboarding />;
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<PortfolioScreen />} />
        <Route path="i/:id" element={<PortfolioScreen detail={(id) => <InstrumentDetail id={id} />} />} />
        <Route path="add" element={<PortfolioScreen detail={() => <AddInstrumentScreen />} />} />
        <Route path="signals" element={<SignalsScreen />} />
        <Route path="alert/:id" element={<SignalsScreen detail />} />
        <Route path="digest" element={<DigestScreen />} />
        <Route path="digest/:id" element={<DigestScreen detail />} />
        <Route path="ask" element={<AskScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <HashRouter>
      <NotificationBridge />
      <Gate />
      <InstallHint />
    </HashRouter>
  );
}
