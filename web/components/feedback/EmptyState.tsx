import type { ReactNode } from 'react';
import Link from 'next/link';
/**
 * The single no-data screen for the whole app.
 *
 * Matches the established visual language (dashed card, black title, gray
 * body) so an empty list reads as intentional, not broken. Every rendered
 * array gets one: a title naming what is missing, one line saying how it
 * gets filled, and — when the user can fill it themselves — an action.
 */
export function EmptyState({
    title,
    body,
    actionHref,
    actionLabel,
    icon,
}: {
    title: string;
    body: string;
    actionHref?: string;
    actionLabel?: string;
    icon?: ReactNode;
}) {
    return (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-8 text-center sm:p-10">
            {icon ? <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-500">{icon}</div> : null}
            <p className="text-sm font-black text-neutral-900">{title}</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-neutral-500">{body}</p>
            {actionHref && actionLabel ? (
                <Link
                    href={actionHref}
                    className="mt-4 inline-block rounded-xl bg-neutral-900 px-4 py-2 text-xs font-black text-white transition hover:bg-neutral-800"
                >
                    {actionLabel}
                </Link>
            ) : null}
        </div>
    );
}

/**
 * Empty state for table bodies: a full-width row with a title and a hint,
 * instead of a one-line italic aside that reads as missing data.
 */
export function TableEmpty({
    colSpan,
    title,
    hint,
}: {
    colSpan: number;
    title: string;
    hint?: string;
}) {
    return (
        <tr>
            <td colSpan={colSpan} className="px-6 py-12 text-center">
                <p className="text-sm font-black text-neutral-900">{title}</p>
                {hint ? <p className="mx-auto mt-1 max-w-md text-xs text-neutral-500">{hint}</p> : null}
            </td>
        </tr>
    );
}
