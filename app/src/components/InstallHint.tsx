import { useEffect, useState } from 'react';

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const KEY = 'arb.installDismissed';

/** Android/Chromium install prompt hint. Hidden once installed or dismissed. */
export function InstallHint() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault();
      try {
        if (localStorage.getItem(KEY)) return;
      } catch {
        /* ignore */
      }
      setEvt(e as BIPEvent);
    };
    window.addEventListener('beforeinstallprompt', on);
    const installed = () => setEvt(null);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', on);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  if (!evt) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
    setEvt(null);
  };
  return (
    <div className="install-hint fade-in" role="dialog" aria-label="Install app">
      <span>Install Arbitrage for notifications and offline access.</span>
      <button
        type="button"
        className="btn small"
        onClick={() => {
          void evt.prompt();
          void evt.userChoice.finally(() => setEvt(null));
        }}
      >
        Install
      </button>
      <button type="button" className="btn ghost small" onClick={dismiss} aria-label="Dismiss">
        Not now
      </button>
    </div>
  );
}
