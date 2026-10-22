import { useState } from 'react';
import { disablePush, enablePush, pushSupported, testNotification } from '../../lib/push';
import { useApp, useLocal } from '../../state/AppContext';

export function useNotificationControls() {
  const local = useLocal();
  const { updateConfig, demo } = useApp();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const enabled = !!local.config.push;

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ tone: 'ok', text: await fn() });
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return {
    enabled,
    busy,
    msg,
    supported: pushSupported(),
    enable: () =>
      run(async () => {
        if (demo) throw new Error('Not available in demo mode.');
        const target = await enablePush(local.config.push);
        updateConfig((c) => ({ ...c, push: target }));
        return 'Notifications enabled. The watcher will use this subscription after the next sync.';
      }),
    disable: () =>
      run(async () => {
        await disablePush();
        updateConfig((c) => ({ ...c, push: null }));
        return 'Notifications disabled.';
      }),
    test: () =>
      run(async () => {
        await testNotification();
        return 'Test notification sent to this device.';
      }),
  };
}
