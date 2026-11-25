'use client';

import { OfflineNotice } from '@/components/feedback/OfflineNotice';

/**
 * Shared-brief fallback: the token link must explain itself while the brief
 * streams, especially offline where it waits for a connection.
 */
export default function BriefLoading() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-20">
            <div className="w-full max-w-md" aria-busy="true" aria-label="Loading shared brief">
                <OfflineNotice label="this brief" />
                <div className="rounded-2xl border border-neutral-200 bg-white p-8">
                    <div className="h-3 w-32 rounded bg-neutral-200 animate-pulse" />
                    <div className="mt-4 h-7 w-3/4 rounded bg-neutral-200 animate-pulse" />
                    <div className="mt-2 h-4 w-full rounded bg-neutral-200 animate-pulse" />
                    <div className="mt-2 h-4 w-5/6 rounded bg-neutral-200 animate-pulse" />
                </div>
            </div>
        </main>
    );
}
