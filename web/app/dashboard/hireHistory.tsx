import { titleCase } from '@/lib/format';

/**
 * Native "Hire History" panel (dashboard `hire-history`).
 *
 * `GET /hire-history` returns the professionals the signed-in owner has hired,
 * each with the project title and the hire date. The dashboard already fetched
 * it on the server; this panel renders it without the legacy tab tree.
 */

export interface HireRow {
    id: number;
    user_id?: number | null;
    name?: string | null;
    role?: string | null;
    project_title?: string | null;
    phone?: string | null;
    avatar?: string | null;
    hired_at?: string | null;
}

function initial(name: string | null | undefined): string {
    return (name ?? '?').trim().charAt(0).toUpperCase() || '?';
}

export function HireHistoryPanel({ rows }: { rows: HireRow[] }) {
    return (
        <div data-native-panel="hire-history">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">Hire History</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        The professionals you have hired, and the project each one worked on.
                    </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    {rows.length} {rows.length === 1 ? 'professional' : 'professionals'}
                </span>
            </div>

            {rows.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-8">
                    <p className="text-sm font-black text-neutral-900">No Hired Professionals Yet</p>
                    <p className="mt-1 text-xs text-neutral-500 max-w-md">
                        Shortlist a proposal and sign the contract — the professional appears here once
                        hired.
                    </p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {rows.map((row) => (
                        <article key={row.id} className="bg-white rounded-2xl border border-neutral-200 p-5">
                            <div className="flex items-start gap-3">
                                <span
                                    className="h-10 w-10 shrink-0 rounded-full bg-neutral-900 text-white text-xs font-black flex items-center justify-center overflow-hidden"
                                    aria-hidden
                                >
                                    {row.avatar ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={row.avatar} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                        initial(row.name)
                                    )}
                                </span>
                                <div className="min-w-0">
                                    <h2 className="text-sm font-black text-neutral-900 truncate">
                                        {row.name ?? 'Professional'}
                                    </h2>
                                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mt-0.5">
                                        {titleCase(row.role)}
                                    </p>
                                </div>
                            </div>

                            <p className="mt-4 text-xs font-semibold text-neutral-700 leading-snug">
                                {row.project_title ?? 'Project not recorded'}
                            </p>

                            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                <span>{row.phone ?? 'No phone'}</span>
                                <span>{row.hired_at ? row.hired_at.slice(0, 10) : ''}</span>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}
