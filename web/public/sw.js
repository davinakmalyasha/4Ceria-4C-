/*
 * 4Ceria service worker.
 *
 * Scope of the cache is deliberately small: the offline shell and immutable
 * build assets. Authenticated HTML and every /api response stay network-only,
 * so a shared device cannot serve one account's page to the next person.
 */

const VERSION = '4ceria-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const OFFLINE_URL = '/offline';

const SHELL = [
    OFFLINE_URL,
    '/manifest.webmanifest',
    '/assets/Logo4C.png',
    '/pwa-192x192.png',
    '/pwa-512x512.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(SHELL_CACHE)
            .then((cache) => cache.addAll(SHELL))
            .then(() => {
                // A first install has nothing to wait behind; an update keeps
                // waiting until the page asks for it.
                if (!self.registration.active) {
                    return self.skipWaiting();
                }
                return undefined;
            }),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key.startsWith('4ceria-') && key !== SHELL_CACHE && key !== ASSET_CACHE)
                        .map((key) => caches.delete(key)),
                ),
            )
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        void self.skipWaiting();
    }
});

const ASSET_DESTINATIONS = new Set(['style', 'script', 'font', 'image']);

function isAsset(request, url) {
    // Uploaded files are user content; caching them would leave an avatar or a
    // receipt on a shared device after logout.
    if (url.pathname.startsWith('/storage/')) return false;

    if (url.pathname.startsWith('/_next/static/')) return true;
    if (url.pathname.startsWith('/assets/')) return true;
    if (url.pathname === '/manifest.webmanifest' || url.pathname === '/favicon.ico') return true;
    if (url.pathname.startsWith('/pwa-') || url.pathname.startsWith('/apple-touch')) return true;

    return ASSET_DESTINATIONS.has(request.destination);
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(ASSET_CACHE);
    const cached = await cache.match(request);

    const network = fetch(request)
        .then((response) => {
            if (response.ok && response.type === 'basic') {
                void cache.put(request, response.clone());
            }
            return response;
        })
        .catch(() => cached);

    return cached ?? network;
}

self.addEventListener('fetch', (event) => {
    const request = event.request;

    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // Money, identity and user data are never cached.
    if (url.pathname.startsWith('/api/')) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(async () => {
                const cache = await caches.open(SHELL_CACHE);
                return (await cache.match(OFFLINE_URL)) ?? Response.error();
            }),
        );
        return;
    }

    if (isAsset(request, url)) {
        event.respondWith(staleWhileRevalidate(request));
    }
});

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

    const raw = (event.notification.data && event.notification.data.url) || '/dashboard';
    // A push payload is untrusted: only same-origin paths may be opened.
    const url = typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';

    event.waitUntil(
        (async () => {
            const clientList = await self.clients.matchAll({
                type: 'window',
                includeUncontrolled: true,
            });

            for (const client of clientList) {
                if ('focus' in client) {
                    await client.navigate(url);
                    return client.focus();
                }
            }

            return self.clients.openWindow(url);
        })(),
    );
});

// A browser can rotate a push subscription without the page being open. The
// new endpoint is posted to the BFF, which still has the session cookie.
self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil(
        (async () => {
            try {
                const response = await fetch('/api/push/public-key');
                if (!response.ok) return;

                const body = await response.json();
                if (!body.public_key) return;

                const padding = '='.repeat((4 - (body.public_key.length % 4)) % 4);
                const base64 = (body.public_key + padding).replace(/-/g, '+').replace(/_/g, '/');
                const raw = atob(base64);
                const key = new Uint8Array(raw.length);

                for (let i = 0; i < raw.length; i += 1) key[i] = raw.charCodeAt(i);

                const subscription = await self.registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: key,
                });

                await fetch('/api/push/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(subscription.toJSON()),
                });
            } catch {
                // The page will re-sync on its next visit.
            }
        })(),
    );
});
