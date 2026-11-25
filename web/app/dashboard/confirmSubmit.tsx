'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * A submit button that asks before it destroys something.
 *
 * A native `window.confirm` blocks the page, traps no focus, and announces
 * nothing to assistive tech. This modal keeps the same call-site API
 * (`message` + `children`) but renders an `alertdialog`: focus moves in,
 * Escape and the backdrop cancel, and confirming submits the enclosing form
 * exactly once. It also disables itself while the form's server action is
 * pending, so a double click cannot post the same money or deletion twice.
 */
export function ConfirmSubmit({
    children,
    message,
    tone = 'danger',
}: {
    children: ReactNode;
    message: string;
    tone?: 'danger' | 'primary';
}) {
    const { pending } = useFormStatus();
    const [open, setOpen] = useState(false);
    const formRef = useRef<HTMLFormElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const wasOpen = useRef(false);
    const titleId = useId();
    const bodyId = useId();

    useEffect(() => {
        if (wasOpen.current && !open) {
            triggerRef.current?.focus();
        }
        wasOpen.current = open;
    }, [open ]);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open ]);

    const className =
        tone === 'primary'
            ? 'px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700'
            : 'px-3 py-1.5 rounded-lg border border-red-200 text-[10px] font-black uppercase tracking-wider text-red-600 hover:bg-red-50';

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                disabled={pending}
                onClick={(event) => {
                    formRef.current = event.currentTarget.closest('form');
                    setOpen(true);
                }}
                className={`${className} transition disabled:cursor-not-allowed disabled:opacity-50`}
            >
                {pending ? 'Working…' : children}
            </button>
            {open ? (
                <div
                    className="fixed inset-0 z-300 flex items-center justify-center bg-neutral-950/50 p-4"
                    onClick={() => setOpen(false)}
                >
                    <div
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        aria-describedby={bodyId}
                        className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <p className="flex items-center gap-2 text-sm font-black text-neutral-900">
                            <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden="true" />
                            <span id={titleId}>Please confirm</span>
                        </p>
                        <p id={bodyId} className="mt-2 text-sm leading-relaxed text-neutral-600">
                            {message}
                        </p>
                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                autoFocus
                                onClick={() => setOpen(false)}
                                className="rounded-xl border border-neutral-200 px-4 py-2 text-xs font-black text-neutral-700 transition hover:border-neutral-300"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setOpen(false);
                                    formRef.current?.requestSubmit();
                                }}
                                className={`rounded-xl px-4 py-2 text-xs font-black text-white transition ${
                                    tone === 'primary'
                                        ? 'bg-neutral-900 hover:bg-neutral-700'
                                        : 'bg-red-600 hover:bg-red-700'
                                }`}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
