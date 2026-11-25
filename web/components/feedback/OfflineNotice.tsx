'use client';

import { WifiOff } from 'lucide-react';
import { useOffline } from 'next/offline';

/**
 * One-line notice rendered above a skeleton while the segment streams.
 *
 * A slow server and a dead connection look identical (a pending Suspense
 * boundary) — the hook tells them apart so an offline user waits with a
 * reason instead of watching shimmer forever. Returns null online.
 */
export function OfflineNotice({ label }: { label: string }) {
    const isOffline = useOffline();

    if (!isOffline) {
        return null;
    }

    return (
        <p
            role="status"
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-bold text-amber-900"
        >
            <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
            Waiting for connection to load {label}… it will continue automatically.
        </p>
    );
}
