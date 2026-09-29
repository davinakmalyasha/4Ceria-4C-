// ServiceWorker globals (self, PushEvent) require lib.webworker, which is
// deliberately NOT merged into the DOM TypeScript program - doing so makes
// every `window` reference in the SPA an error. The file is type-checked on
// its own; the main program skips it so the typecheck ratchet never regresses
// because of this file.
//
// TODO(phase 3): move the service worker onto a dedicated tsconfig.worker.json
// with a webworker lib, type it properly, and drop this suppression.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: any;

// Injected by vite-plugin-pwa (injectManifest strategy).
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

// Ported from the previous generateSW runtimeCaching config.
registerRoute(
    ({ url }: { url: URL }) => url.origin === 'https://fonts.googleapis.com',
    new CacheFirst({
        cacheName: 'google-fonts-stylesheets',
        plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 })],
    })
);

registerRoute(
    ({ url }: { url: URL }) => url.origin === 'https://fonts.gstatic.com',
    new CacheFirst({
        cacheName: 'google-fonts-webfonts',
        plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 })],
    })
);

// --- Web Push ---------------------------------------------------------------

self.addEventListener('push', (event: any) => {
    // Push payloads are authored by us, but a malformed body must not take the
    // whole handler down — fall back to the plain-text form.
    let data: any;
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = { body: event.data ? event.data.text() : '' };
    }

    const title = data.title || '4Ceria';
    event.waitUntil(
        self.registration.showNotification(title, {
            body: data.body || '',
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            data: { url: data.url || '/dashboard' },
            tag: data.notification_id ? `n-${data.notification_id}` : undefined,
        })
    );
});

self.addEventListener('notificationclick', (event: any) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/dashboard';

    event.waitUntil(
        (async () => {
            const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            for (const client of clientList) {
                if ('focus' in client) {
                    client.navigate(url);
                    return client.focus();
                }
            }
            return self.clients.openWindow(url);
        })()
    );
});
