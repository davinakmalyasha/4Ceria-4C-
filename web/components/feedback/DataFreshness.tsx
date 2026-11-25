'use client';

import { useEffect, useState } from 'react';
import { useOffline } from 'next/offline';

/**
 * "Updated HH:MM" caption for data-driven screens.
 *
 * Server data has no age on it, so a list rendered an hour ago looks exactly
 * like a fresh one. This stamps the last moment the client (re)synced —
 * mount plus every offline→online transition, which is also when the banner
 * revalidates. One line, no polling.
 */
export function DataFreshness() {
    const isOffline = useOffline();
    const [at, setAt] = useState(() => new Date());

    useEffect(() => {
        if (!isOffline) {
            setAt(new Date());
        }
    }, [isOffline]);

    const time = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            {isOffline ? `Offline — showing data from ${time}` : `Data updated ${time}`}
        </p>
    );
}
