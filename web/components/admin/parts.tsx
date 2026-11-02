import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Small server-safe building blocks shared by the admin screens.
 *
 * Filters and pagination are REAL URLs (`?page=`, `?search=`), so the pages
 * stay server components, the back button works and a queue view is
 * bookmarkable.
 */

export function ErrorNote({ error }: { error?: string }) {
    if (!error) {
        return null;
    }

    return (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>
    );
}

export function AdminPageHeader({
    title,
    description,
    children,
}: {
    title: string;
    description: string;
    children?: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-4 border-b border-neutral-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <h1 className="text-sm font-bold uppercase tracking-widest text-neutral-900">{title}</h1>
                <p className="mt-0.5 text-[11px] font-semibold text-neutral-400">{description}</p>
            </div>
            {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
        </div>
    );
}

export function hrefWith(
    base: string,
    params: Record<string, string | number | undefined | null>,
): string {
    const search = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') {
            continue;
        }

        search.set(key, String(value));
    }

    const query = search.toString();

    return query ? `${base}?${query}` : base;
}

export function Pagination({
    base,
    page,
    lastPage,
    total,
    from,
    to,
    params,
}: {
    base: string;
    page: number;
    lastPage: number;
    total: number;
    from?: number | null;
    to?: number | null;
    params: Record<string, string | number | undefined | null>;
}) {
    if (total === 0) {
        return null;
    }

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-6 py-4 text-[11px] font-semibold text-neutral-500">
            <p>
                Showing {from ?? 0}–{to ?? 0} of {total}
            </p>
            <div className="flex items-center gap-2">
                {page > 1 ? (
                    <Link
                        href={hrefWith(base, { ...params, page: page - 1 })}
                        className="rounded-lg border border-neutral-200 px-3 py-1.5 font-bold uppercase tracking-wider hover:text-neutral-900"
                    >
                        ← Previous
                    </Link>
                ) : (
                    <span className="rounded-lg border border-neutral-100 px-3 py-1.5 text-neutral-300">← Previous</span>
                )}
                <span className="px-2 font-black text-neutral-700">
                    {page} / {lastPage}
                </span>
                {page < lastPage ? (
                    <Link
                        href={hrefWith(base, { ...params, page: page + 1 })}
                        className="rounded-lg border border-neutral-200 px-3 py-1.5 font-bold uppercase tracking-wider hover:text-neutral-900"
                    >
                        Next →
                    </Link>
                ) : (
                    <span className="rounded-lg border border-neutral-100 px-3 py-1.5 text-neutral-300">Next →</span>
                )}
            </div>
        </div>
    );
}

export function StatusPill({ status, active }: { status: string; active?: boolean }) {
    const tone = active
        ? 'bg-neutral-100 text-neutral-700 border-neutral-200'
        : 'bg-red-50 text-red-600 border-red-200';

    return (
        <span className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${tone}`}>
            {status}
        </span>
    );
}
