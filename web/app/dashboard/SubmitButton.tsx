'use client';

import { useFormStatus } from 'react-dom';
import { useOffline } from 'next/offline';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

export function SubmitButton({
    children,
    pendingLabel = 'Working…',
    offlineLabel = 'Waiting for connection…',
    className,
}: {
    children: ReactNode;
    pendingLabel?: string;
    offlineLabel?: string;
    className?: string;
}) {
    const { pending } = useFormStatus();
    // With `experimental.useOffline`, a Server Action issued offline stays
    // pending and replays on reconnect. Name that state on the button so it
    // reads as "queued" instead of frozen.
    const isOffline = useOffline();
    const label = pending ? (isOffline ? offlineLabel : pendingLabel) : children;

    return (
        <button
            type="submit"
            disabled={pending}
            className={`inline-flex items-center justify-center gap-2 transition disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ''}`}
        >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {label}
        </button>
    );
}
