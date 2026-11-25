'use client';

import { OfflineNotice } from '@/components/feedback/OfflineNotice';

/**
 * Admin segment fallback: the shell (layout) stays interactive while the
 * table streams in.
 */
export default function AdminLoading() {
    return (
        <div className="p-6" aria-busy="true" aria-label="Loading admin section">
            <OfflineNotice label="this section" />
            <div className="h-7 w-56 rounded bg-neutral-200 animate-pulse" />
            <div className="mt-2 h-4 w-80 max-w-full rounded bg-neutral-200 animate-pulse" />
            <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                <div className="border-b border-neutral-100 px-6 py-4">
                    <div className="h-3 w-32 rounded bg-neutral-200 animate-pulse" />
                </div>
                {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-4 border-t border-neutral-100 px-6 py-4 first:border-t-0">
                        <div className="h-9 w-9 shrink-0 rounded-full bg-neutral-200 animate-pulse" />
                        <div className="flex-1 space-y-2">
                            <div className="h-3 w-2/3 rounded bg-neutral-200 animate-pulse" />
                            <div className="h-3 w-1/3 rounded bg-neutral-200 animate-pulse" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
