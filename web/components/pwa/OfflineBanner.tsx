'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { WifiOff } from 'lucide-react';
import { useOffline } from 'next/offline';

/**
 * Connectivity banner for every route.
 *
 * `useOffline()` is the framework signal (browser event OR a failed
 * navigation/prefetch/Server Action, with HEAD polling until the origin
 * answers), which is strictly more reliable than `navigator.onLine` — the
 * latter still reports `true` on WiFi with no upstream internet. While the
 * flag is on, blocked framework requests stay pending and replay on
 * reconnect; this banner is the visible half of that contract, rendered from
 * the root layout so no route needs its own copy.
 */
export function OfflineBanner() {
    const isOffline = useOffline();
    const router = useRouter();
    const wasOffline = useRef(false);

    // The framework replays queued actions on reconnect, but already-rendered
    // server data stays as it was. One refresh revalidates every visible list
    // so the user never acts on a pre-outage snapshot.
    useEffect(() => {
        if (wasOffline.current && !isOffline) {
            router.refresh();
        }
        wasOffline.current = isOffline;
    }, [isOffline, router]);

    if (!isOffline) {
        return null;
    }

    return (
        <div
            role="status"
            className="fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-200 flex justify-center px-4"
        >
            <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-amber-900 shadow-xl">
                <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
                <p className="text-xs font-bold">
                    You are offline. Pending requests will retry once you are back online.
                </p>
            </div>
        </div>
    );
}
