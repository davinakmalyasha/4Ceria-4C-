'use client';

import type { ReactNode } from 'react';

/**
 * A submit button that asks before it destroys something.
 *
 * `confirm` is browser-only, so this island exists; the surrounding form and
 * its server action stay server-side.
 */
export function ConfirmSubmit({ children, message }: { children: ReactNode; message: string }) {
    return (
        <button
            type="submit"
            onClick={(event) => {
                if (!window.confirm(message)) {
                    event.preventDefault();
                }
            }}
            className="px-3 py-1.5 rounded-lg border border-red-200 text-[10px] font-black uppercase tracking-wider text-red-600 hover:bg-red-50"
        >
            {children}
        </button>
    );
}
