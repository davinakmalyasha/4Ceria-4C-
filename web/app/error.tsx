'use client';

import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function RootError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-20">
            <div className="w-full max-w-md text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/pwa-192x192.png" alt="" className="mx-auto h-16 w-16 rounded-2xl" />
                <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Something went wrong
                </div>
                <h1 className="mt-5 text-3xl font-black tracking-tight text-neutral-900">
                    This page could not finish loading.
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-neutral-500">
                    The error was recorded{error.digest ? ` as ${error.digest}` : ''}. Retrying is safe
                    — no form has been submitted twice.
                </p>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                    <button
                        type="button"
                        onClick={reset}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-neutral-800"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Try again
                    </button>
                    <Link
                        href="/"
                        className="rounded-xl border border-neutral-200 bg-white px-5 py-3 text-sm font-bold text-neutral-700 transition hover:border-neutral-300"
                    >
                        Back to home
                    </Link>
                </div>
            </div>
        </main>
    );
}
