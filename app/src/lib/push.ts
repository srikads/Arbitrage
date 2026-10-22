// Web Push subscription management (CONTRACT §4 PushTarget).
import { PUSH_CONTACT } from './config';
import type { PushTarget } from './types';
import { generateVapidKeys, vapidPublicKeyBytes } from './vapid';

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function swRegistration(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) throw new Error('Service workers are not available in this browser.');
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Service worker not active yet (install the app or reload).')), 8000)),
  ]);
  return reg;
}

/** Ask permission, generate a fresh VAPID pair and subscribe. */
export async function enablePush(existing: PushTarget | null): Promise<PushTarget> {
  if (!pushSupported()) throw new Error('Push notifications are not supported here. On iOS, add the app to the home screen first.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notification permission was not granted.');
  const reg = await swRegistration();
  const keys = existing ? { publicKey: existing.vapidPublicKey, privateKey: existing.vapidPrivateKey } : await generateVapidKeys();
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    const current = sub.options.applicationServerKey;
    const want = vapidPublicKeyBytes(keys.publicKey);
    const same = current && new Uint8Array(current).every((b, i) => b === want[i]) && current.byteLength === want.length;
    if (!same) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidPublicKeyBytes(keys.publicKey) });
  }
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Push subscription is incomplete.');
  return {
    subscription: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
    vapidPublicKey: keys.publicKey,
    vapidPrivateKey: keys.privateKey,
    contact: PUSH_CONTACT,
  };
}

export async function disablePush(): Promise<void> {
  try {
    const reg = await swRegistration();
    const sub = await reg.pushManager.getSubscription();
    await sub?.unsubscribe();
  } catch {
    /* nothing to unsubscribe */
  }
}

export async function testNotification(): Promise<void> {
  if (!('Notification' in window)) throw new Error('Notifications are not supported here.');
  if (Notification.permission !== 'granted') {
    const p = await Notification.requestPermission();
    if (p !== 'granted') throw new Error('Notification permission was not granted.');
  }
  const reg = await swRegistration();
  await reg.showNotification('Arbitrage · test', {
    body: 'Notifications work on this device.',
    icon: './icons/icon-192.png',
    badge: './icons/badge-72.png',
    tag: 'arb-test',
    data: { alertId: null },
  });
}
