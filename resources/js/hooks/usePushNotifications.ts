import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * Browser Web Push: subscribe/unsubscribe against /push/* endpoints.
 * Re-syncs any existing subscription to the server on mount (covers
 * re-login with the same browser).
 */
export function usePushNotifications() {
    const [supported, setSupported] = useState(false);
    const [enabled, setEnabled] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setSupported(
            'serviceWorker' in navigator &&
            'PushManager' in window &&
            'Notification' in window
        );

        let cancelled = false;
        (async () => {
            if (!('serviceWorker' in navigator)) return;
            try {
                const reg = await navigator.serviceWorker.getRegistration();
                const sub = await reg?.pushManager.getSubscription();
                if (cancelled || !sub) return;
                setEnabled(true);
                try {
                    await axios.post('/push/subscribe', sub.toJSON());
                } catch {
                    // server sync is best-effort; local subscription still works
                }
            } catch {
                // ignore — feature simply stays off
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
            const perm = await Notification.requestPermission();
            if (perm !== 'granted') {
                setError('Izin notifikasi ditolak');
                return;
            }

            const reg = await navigator.serviceWorker.ready;
            let sub = await reg.pushManager.getSubscription();

            if (!sub) {
                const res = await axios.get('/push/public-key');
                const key = res.data?.public_key;
                if (!key) {
                    setError('Push belum dikonfigurasi di server');
                    return;
                }
                sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
                });
            }

            await axios.post('/push/subscribe', sub.toJSON());
            setEnabled(true);
        } catch (err) {
            const data = (err as any)?.response?.data;
            setError(data?.message || 'Gagal mengaktifkan notifikasi push');
        } finally {
            setBusy(false);
        }
    }, []);

    const disable = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            const sub = await reg?.pushManager.getSubscription();
            if (sub) {
                await axios.post('/push/unsubscribe', { endpoint: sub.endpoint });
                await sub.unsubscribe();
            }
            setEnabled(false);
        } catch (err) {
            const data = (err as any)?.response?.data;
            setError(data?.message || 'Gagal mematikan notifikasi push');
        } finally {
            setBusy(false);
        }
    }, []);

    return { supported, enabled, busy, error, enable, disable };
}
