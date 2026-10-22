/// <reference lib="webworker" />
// Service worker: precaches the app shell (offline), shows Web Push
// notifications (CONTRACT §7) and opens the alert on click.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

self.addEventListener('message', (event) => {
  if (event.data && (event.data as { type?: string }).type === 'SKIP_WAITING') void self.skipWaiting();
});

type PushPayload = {
  title?: string;
  body?: string;
  alertId?: string | null;
  instrumentId?: string | null;
  severity?: 'info' | 'important' | 'critical';
};

self.addEventListener('push', (event) => {
  let data: PushPayload = {};
  try {
    data = (event.data?.json() as PushPayload) ?? {};
  } catch {
    data = { title: 'Arbitrage', body: event.data?.text() ?? '' };
  }
  const title = data.title || 'Arbitrage';
  const options: NotificationOptions & { renotify?: boolean } = {
    body: data.body ?? '',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-72.png',
    tag: data.alertId ? `alert-${data.alertId}` : undefined,
    requireInteraction: data.severity === 'critical',
    data: { alertId: data.alertId ?? null, instrumentId: data.instrumentId ?? null },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = (event.notification.data ?? {}) as { alertId?: string | null };
  const hash = d.alertId ? `#/alert/${encodeURIComponent(d.alertId)}` : '#/signals';
  const target = new URL(`./${hash}`, self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if (c.url.startsWith(self.registration.scope)) {
          await c.focus();
          c.postMessage({ type: 'open-alert', alertId: d.alertId ?? null });
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
