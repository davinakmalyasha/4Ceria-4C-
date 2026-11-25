'use client';

import { OfflineNotice } from '@/components/feedback/OfflineNotice';

/**
 * House detail fallback: cover + facts skeleton.
 */
export default function HouseDetailLoading() {
    return (
        <div className="p-6" aria-busy="true" aria-label="Loading house">
            <OfflineNotice label="this house" />
            <div className="h-64 w-full rounded-2xl bg-neutral-200 animate-pulse sm:h-80" />
            <div className="mt-4 h-7 w-72 max-w-full rounded bg-neutral-200 animate-pulse" />
            <div className="mt-2 h-4 w-48 rounded bg-neutral-200 animate-pulse" />
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-5">
                        <div className="h-3 w-20 rounded bg-neutral-200 animate-pulse" />
                        <div className="mt-3 h-6 w-24 rounded bg-neutral-200 animate-pulse" />
                    </div>
                ))}
            </div>
        </div>
    );
}
