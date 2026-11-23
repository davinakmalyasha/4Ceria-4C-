'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * A submit button that asks before it destroys something.
 *
 * It also disables itself while the form's server action is pending, so a
 * double click cannot post the same money or deletion twice.
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
    const className =
        tone === 'primary'
            ? 'px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700'
            : 'px-3 py-1.5 rounded-lg border border-red-200 text-[10px] font-black uppercase tracking-wider text-red-600 hover:bg-red-50';

    return (
        <button
            type="submit"
            disabled={pending}
            onClick={(event) => {
                if (!window.confirm(message)) {
                    event.preventDefault();
                }
            }}
            className={`${className} transition disabled:cursor-not-allowed disabled:opacity-50`}
        >
            {pending ? 'Working…' : children}
        </button>
    );
}
