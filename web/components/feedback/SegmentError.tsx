'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useOffline } from 'next/offline';

/**
 * Fallback for a route-segment error boundary.
 *
 * One component backs every segment `error.tsx` so a failed panel reads the
 * same everywhere: what broke (the segment title), what to do (retry, safe
 * against double submit), and — when the framework knows the network is the
 * cause — say so instead of implying a bug. Server failures arrive redacted
 * with only a digest; only provably-local messages are quoted.
 */
export function SegmentError({
    title,
    error,
    retry,
}: {
    title: string;
    error: unknown;
    retry: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    const isOffline = useOffline();
    const digest =
        error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
    const message =
        error instanceof Error && (error.message.startsWith('NEXT_') || digest === undefined)
            ? error.message
            : null;

    return (
        <div className="p-6" role="alert">
            <div className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-red-700">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    {title} failed to load
                </p>
                <p className="mt-2 text-sm leading-relaxed text-red-900">
                    {isOffline
                        ? 'You appear to be offline. Reconnect and try again — pending requests retry automatically.'
                        : (message ?? 'An unexpected error interrupted this section.')}
                </p>
                {digest && !isOffline ? (
                    <p className="mt-1 font-mono text-xs text-red-700">Reference {digest}</p>
                ) : null}
                <button
                    type="button"
                    onClick={retry}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-neutral-800"
                >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Try again
                </button>
            </div>
        </div>
    );
}
