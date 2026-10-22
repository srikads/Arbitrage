import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext';

const KEY = 'arb.alertsSeenAt';

function readSeen(): number {
  try {
    return Number(localStorage.getItem(KEY) || 0);
  } catch {
    return 0;
  }
}

export function markAlertsSeen(): void {
  try {
    localStorage.setItem(KEY, String(Date.now()));
    window.dispatchEvent(new Event('arb-seen'));
  } catch {
    /* ignore */
  }
}

/** Count of alerts newer than the last visit to the Signals screen. */
export function useUnseenAlerts(): number {
  const { feed } = useApp();
  const [seen, setSeen] = useState(readSeen);
  useEffect(() => {
    const on = () => setSeen(readSeen());
    window.addEventListener('arb-seen', on);
    return () => window.removeEventListener('arb-seen', on);
  }, []);
  return (feed?.alerts ?? []).filter((a) => Date.parse(a.time) > seen && a.severity !== 'info').length;
}
