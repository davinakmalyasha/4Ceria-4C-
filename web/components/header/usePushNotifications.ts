'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Browser Web Push, ported from the synced `usePushNotifications`.
 *
 * The Next app has no PWA build step, so the hook registers `public/sw.js`
 * itself and talks to the BFF (`/api/push/*`), which attaches the httpOnly
 * token. The subscription object is exactly what the API expects; a failed
 * server sync leaves the local subscription working, as before.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    const output = new Uint8Array(raw.length);

    for (let index = 0; index < raw.length; ++index) {
        output[index] = raw.charCodeAt(index);
    }

    return output;
}

async function postJson(url: string, body: unknown): Promise<Response> {
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

export function usePushNotifications() {
    const [supported, setSupported] = useState(false);
    const [enabled, setEnabled] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const ok =
            'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

        setSupported(ok);

        if (!ok) {
            return;
        }

        let cancelled = false;

        (async () => {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                const subscription = await registration.pushManager.getSubscription();

                if (cancelled || !subscription) {
                    return;
                }

                setEnabled(true);

                // Best-effort re-sync: the local subscription still works even
                // if the server cannot be told about it right now.
                try {
                    await postJson('/api/push/subscribe', subscription.toJSON());
                } catch {
                    // ignore
                }
            } catch {
                // The feature simply stays off.
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const enable = useCallback(async () => {
        setBusy(true);
        setError(null);

        try {
            const permission = await Notification.requestPermission();

            if (permission !== 'granted') {
                setError('Notification permission was denied.');
                return;
            }

            const registration = await navigator.serviceWorker.ready;
            let subscription = await registration.pushManager.getSubscription();

            if (!subscription) {
                const keyResponse = await fetch('/api/push/public-key');

                if (!keyResponse.ok) {
                    setError('Push is not configured on the server.');
                    return;
                }

                const keyBody = (await keyResponse.json()) as { public_key?: string };

                if (!keyBody.public_key) {
                    setError('Push is not configured on the server.');
                    return;
                }

                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(keyBody.public_key) as BufferSource,
                });
            }

            const response = await postJson('/api/push/subscribe', subscription.toJSON());

            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { message?: string } | null;
                setError(body?.message ?? 'Push could not be enabled.');
                return;
            }

            setEnabled(true);
        } catch {
            setError('Push could not be enabled.');
        } finally {
            setBusy(false);
        }
    }, []);

    const disable = useCallback(async () => {
        setBusy(true);
        setError(null);

        try {
            const registration = await navigator.serviceWorker.getRegistration();
            const subscription = await registration?.pushManager.getSubscription();

            if (subscription) {
                await postJson('/api/push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => undefined);
                await subscription.unsubscribe();
            }

            setEnabled(false);
        } catch {
            setError('Push could not be disabled.');
        } finally {
            setBusy(false);
        }
    }, []);

    return { supported, enabled, busy, error, enable, disable };
}
