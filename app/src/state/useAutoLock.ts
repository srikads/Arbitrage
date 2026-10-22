import { useEffect, useRef } from 'react';

/** Lock after `minutes` of inactivity (0 = never). Also checks on returning to the tab. */
export function useAutoLock(minutes: number, active: boolean, lock: () => void): void {
  const last = useRef(Date.now());
  useEffect(() => {
    if (!active || minutes <= 0) return;
    last.current = Date.now();
    const limit = minutes * 60_000;
    const bump = () => {
      last.current = Date.now();
    };
    const check = () => {
      if (Date.now() - last.current > limit) lock();
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') check();
      else bump();
    };
    const evs = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    document.addEventListener('visibilitychange', onVis);
    const t = window.setInterval(check, 15_000);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(t);
    };
  }, [minutes, active, lock]);
}
