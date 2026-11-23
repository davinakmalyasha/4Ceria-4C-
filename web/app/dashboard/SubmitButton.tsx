'use client';

import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

export function SubmitButton({
    children,
    pendingLabel = 'Working…',
    className,
}: {
    children: ReactNode;
    pendingLabel?: string;
    className?: string;
}) {
    const { pending } = useFormStatus();

    return (
        <button
            type="submit"
            disabled={pending}
            className={`inline-flex items-center justify-center gap-2 transition disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ''}`}
        >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {pending ? pendingLabel : children}
        </button>
    );
}
