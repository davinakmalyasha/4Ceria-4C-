'use client';

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';

/**
 * PWA lifecycle for the whole app.
 *
 * Registers the service worker, exposes the install prompt, and surfaces
 * offline / update state. Registration is production-only so a developer's
 * browser never serves a cached shell over the dev server.
 */

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type PwaValue = {
    /** A captured `beforeinstallprompt` event, when the browser offers one. */
    canInstall: boolean;
    /** True once the app runs in standalone display mode. */
    installed: boolean;
    /** iOS offers no programmable install event; the UI shows instructions. */
    needsIosInstructions: boolean;
    /** The service worker has a new build waiting to activate. */
    updateReady: boolean;
    /** The device lost network connectivity. */
    offline: boolean;
    install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
    applyUpdate: () => void;
};

const PwaContext = createContext<PwaValue | null>(null);

function isStandalone(): boolean {
    if (typeof window === 'undefined') return false;

    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    );
}

function isIos(): boolean {
    if (typeof navigator === 'undefined') return false;

    return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function PwaProvider({ children }: { children: ReactNode }) {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [installed, setInstalled] = useState(false);
    const [updateReady, setUpdateReady] = useState(false);
    const [offline, setOffline] = useState(false);

    useEffect(() => {
        setInstalled(isStandalone());
        setOffline(!navigator.onLine);

        const handlePrompt = (event: Event) => {
            event.preventDefault();
            setDeferredPrompt(event as BeforeInstallPromptEvent);
        };

        const handleInstalled = () => {
            setInstalled(true);
            setDeferredPrompt(null);
        };

        const handleOnline = () => setOffline(false);
        const handleOffline = () => setOffline(true);

        window.addEventListener('beforeinstallprompt', handlePrompt);
        window.addEventListener('appinstalled', handleInstalled);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('beforeinstallprompt', handlePrompt);
            window.removeEventListener('appinstalled', handleInstalled);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        if (
            process.env.NODE_ENV !== 'production' ||
            typeof navigator === 'undefined' ||
            !('serviceWorker' in navigator)
        ) {
            return;
        }

        let interval: ReturnType<typeof setInterval> | undefined;
        let cancelled = false;

        navigator.serviceWorker
            .register('/sw.js', { scope: '/' })
            .then((registration) => {
                if (cancelled) return;

                if (registration.waiting) {
                    setUpdateReady(true);
                }

                registration.addEventListener('updatefound', () => {
                    const worker = registration.installing;
                    if (!worker) return;

                    worker.addEventListener('statechange', () => {
                        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                            setUpdateReady(true);
                        }
                    });
                });

                // Check for a new build while a long-lived tab stays open.
                interval = setInterval(() => void registration.update(), 60 * 60 * 1000);
            })
            .catch(() => {
                // A service worker failure must never break the app.
            });

        return () => {
            cancelled = true;
            if (interval) clearInterval(interval);
        };
    }, []);

    const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
        if (!deferredPrompt) {
            return 'unavailable';
        }

        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;

        if (choice.outcome === 'accepted') {
            setInstalled(true);
            setDeferredPrompt(null);
        }

        return choice.outcome;
    }, [deferredPrompt]);

    const applyUpdate = useCallback(() => {
        void navigator.serviceWorker.getRegistration().then((registration) => {
            if (!registration?.waiting) {
                window.location.reload();
                return;
            }

            navigator.serviceWorker.addEventListener(
                'controllerchange',
                () => window.location.reload(),
                { once: true },
            );
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        });
    }, []);

    const value = useMemo<PwaValue>(
        () => ({
            canInstall: deferredPrompt !== null,
            installed,
            needsIosInstructions: !installed && isIos() && !deferredPrompt,
            updateReady,
            offline,
            install,
            applyUpdate,
        }),
        [deferredPrompt, installed, updateReady, offline, install, applyUpdate],
    );

    return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwa(): PwaValue {
    const value = useContext(PwaContext);

    if (value === null) {
        throw new Error('usePwa must be used inside <PwaProvider>');
    }

    return value;
}
