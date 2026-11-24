import type { Metadata } from 'next';
import Link from 'next/link';
import { WifiOff } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Offline',
    robots: { index: false, follow: false },
};

export default function OfflinePage() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-24 text-neutral-900">
            <div className="w-full max-w-md text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/pwa-192x192.png"
                    alt="4Ceria"
                    width={72}
                    height={72}
                    className="mx-auto h-18 w-18 rounded-2xl shadow-lg shadow-red-500/20"
                />
                <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-amber-800">
                    <WifiOff className="h-3.5 w-3.5" />
                    You are offline
                </div>
                <h1 className="mt-6 text-3xl font-black tracking-tight">The workspace is out of reach.</h1>
                <p className="mt-3 text-sm leading-relaxed text-neutral-500">
                    4Ceria needs a connection for live project, escrow and marketplace data. Reconnect
                    and try again. Forms are not sent while offline — please keep this page open and
                    resubmit once you are back online.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                    <Link
                        href="/"
                        className="w-full rounded-xl bg-neutral-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-neutral-800 sm:w-auto"
                    >
                        Try again
                    </Link>
                    <Link
                        href="/help"
                        className="w-full rounded-xl border border-neutral-200 bg-white px-5 py-3 text-sm font-bold text-neutral-700 transition hover:border-neutral-300 sm:w-auto"
                    >
                        Open help center
                    </Link>
                </div>
            </div>
        </main>
    );
}
