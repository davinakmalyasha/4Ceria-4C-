'use client';

import { useEffect, useState } from 'react';
import { Download, RefreshCw, Share, X } from 'lucide-react';
import { usePwa } from './PwaProvider';

const DISMISS_KEY = '4ceria.pwa.install.dismissed';

/**
 * The install / update / offline surfaces.
 *
 * The install card is dismissible and remembered per browser. iOS has no
 * `beforeinstallprompt`, so it shows the Share-sheet instructions instead of a
 * button that cannot work.
 */
export function PwaStatus() {
    const { canInstall, installed, needsIosInstructions, updateReady, install, applyUpdate } =
        usePwa();
    const [dismissed, setDismissed] = useState(true);
    const [showIosHelp, setShowIosHelp] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        try {
            setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1');
        } catch {
            setDismissed(false);
        }
    }, []);

    // Offer installation only after the visitor has seen the product, not on
    // the first paint of a cold landing page.
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => setReady(true), 3500);

        return () => window.clearTimeout(timer);
    }, []);

    const dismiss = () => {
        setDismissed(true);

        try {
            window.localStorage.setItem(DISMISS_KEY, '1');
        } catch {
            // Storage can be unavailable in private mode; the card simply
            // reappears on the next visit.
        }
    };

    const handleInstall = async () => {
        if (needsIosInstructions) {
            setShowIosHelp(true);
            return;
        }

        setBusy(true);
        const outcome = await install();
        setBusy(false);

        if (outcome === 'accepted' || outcome === 'unavailable') {
            dismiss();
        }
    };

    if (updateReady) {
        return (
            <div className="fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-200 flex justify-center px-4">
                <div className="flex items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-white shadow-2xl">
                    <RefreshCw className="h-4 w-4 shrink-0 text-[#FD1D1D]" />
                    <p className="text-xs font-bold">A new version of 4Ceria is ready.</p>
                    <button
                        type="button"
                        onClick={applyUpdate}
                        className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-black text-neutral-900 transition hover:bg-neutral-200"
                    >
                        Refresh
                    </button>
                </div>
            </div>
        );
    }

    // Connectivity has its own surface now: <OfflineBanner /> in the root
    // layout reads the framework signal (`useOffline()`), which also fires
    // when a request fails behind a lying `navigator.onLine`. A second toast
    // here would double-announce the same outage.
    if (installed || dismissed || !ready || (!canInstall && !needsIosInstructions)) {
        return null;
    }

    return (
        <div className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-200 sm:inset-x-auto sm:left-6 sm:max-w-sm">
            <div className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
                <div className="flex items-start gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="/pwa-192x192.png"
                        alt=""
                        width={44}
                        height={44}
                        className="h-11 w-11 shrink-0 rounded-xl"
                    />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-neutral-900">Install 4Ceria</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
                            Full-screen access, faster loads and push notifications, without an app
                            store.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={dismiss}
                        aria-label="Dismiss install prompt"
                        className="-mr-1 -mt-1 rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {showIosHelp && (
                    <div className="mt-3 rounded-xl bg-neutral-50 p-3 text-[11px] leading-relaxed text-neutral-600">
                        <p className="flex items-center gap-1.5 font-bold text-neutral-900">
                            <Share className="h-3.5 w-3.5" /> Add to Home Screen
                        </p>
                        <p className="mt-1">
                            Tap the Share button in Safari, then choose <b>Add to Home Screen</b>.
                        </p>
                    </div>
                )}

                <div className="mt-3 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void handleInstall()}
                        disabled={busy}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-neutral-900 px-3 py-2 text-xs font-black text-white transition hover:bg-neutral-800 disabled:opacity-60"
                    >
                        <Download className="h-3.5 w-3.5" />
                        {busy ? 'Opening…' : needsIosInstructions ? 'How to install' : 'Install app'}
                    </button>
                    <button
                        type="button"
                        onClick={dismiss}
                        className="rounded-xl px-3 py-2 text-xs font-bold text-neutral-500 transition hover:bg-neutral-100"
                    >
                        Not now
                    </button>
                </div>
            </div>
        </div>
    );
}
