'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';

type Toast = {
    id: number;
    message: string;
    tone: ToastTone;
};

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => {});

let nextId = 1;

/**
 * Visible feedback for client-side actions that otherwise succeed silently.
 *
 * Server Actions answer with a page refresh and a banner; `fetch` calls from
 * Client Components (mark-read, copy link, subscribe) answer with nothing.
 * `notify('Link copied')` closes that gap: auto-dismissing, announced to
 * assistive tech, never blocking.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

    const dismiss = useCallback((id: number) => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
        const timer = timers.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timers.current.delete(id);
        }
    }, []);

    const notify = useCallback(
        (message: string, tone: ToastTone = 'success') => {
            const id = nextId++;
            setToasts((current) => [...current.slice(-2), { id, message, tone }]);
            timers.current.set(
                id,
                setTimeout(() => dismiss(id), 5000),
            );
        },
        [dismiss],
    );

    return (
        <ToastContext.Provider value={notify}>
            {children}
            <div aria-live="off" className="pointer-events-none fixed bottom-6 right-4 z-[260] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        role={toast.tone === 'error' ? 'alert' : 'status'}
                        className="pointer-events-auto flex items-start gap-2 rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-white shadow-2xl"
                    >
                        {toast.tone === 'error' ? (
                            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
                        ) : toast.tone === 'info' ? (
                            <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
                        ) : (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                        )}
                        <p className="min-w-0 flex-1 text-xs font-bold leading-relaxed">{toast.message}</p>
                        <button
                            type="button"
                            onClick={() => dismiss(toast.id)}
                            aria-label="Dismiss notification"
                            className="shrink-0 rounded-lg p-0.5 text-neutral-400 transition hover:text-white"
                        >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    return useContext(ToastContext);
}
