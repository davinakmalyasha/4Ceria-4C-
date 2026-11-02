/*
 * The push service worker for the Next app.
 *
 * The Vite build shipped `resources/js/sw.ts` through the PWA plugin; the Next
 * app has no workbox build step, so this is the same two handlers without the
 * precache machinery. Registering it makes `usePushNotifications` able to
 * subscribe and makes a delivered push open the dashboard.
 */
self.addEventListener('push', (event) => {
    let payload = {};

    try {
        payload = event.data ? event.data.json() : {};
    } catch {
        payload = { body: event.data ? event.data.text() : '' };
    }

    const title = payload.title || '4Ceria';

    event.waitUntil(
        self.registration.showNotification(title, {
            body: payload.body || '',
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            data: { url: payload.url || '/dashboard' },
            tag: payload.notification_id ? `n-${payload.notification_id}` : undefined,
        }),
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const url = (event.notification.data && event.notification.data.url) || '/dashboard';

    event.waitUntil(
        (async () => {
            const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

            for (const client of clients) {
                if ('focus' in client) {
                    await client.navigate(url);
                    return client.focus();
                }
            }

            return self.clients.openWindow(url);
        })(),
    );
});
