import Link from 'next/link';
import { formatIDR, titleCase } from '@/lib/format';

/**
 * Native dashboard panels — server components.
 *
 * `projects` and the professional directories are PORTED: their rows were
 * already fetched on the server by `DashboardView`, and these components render
 * them without mounting the synced legacy tab tree. Every other tab still
 * renders the legacy `DashboardTabs`.
 */

export function ProjectsPanel({
    rows,
    board = false,
}: {
    rows: { id: number; title?: string; status?: string; budget?: string; location?: string; city?: string }[];
    board?: boolean;
}) {
    return (
        <section>
            <div className="flex items-end justify-between gap-4 mb-5">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">{board ? 'Bidding Board' : 'Projects'}</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        {board
                            ? 'Open tenders you can bid on. Open one to review the brief and submit a proposal.'
                            : 'Every project you own or work on.'}
                    </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    {rows.length} total
                </span>
            </div>

            {rows.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-8 text-sm text-neutral-500">
                    <p className="font-black text-neutral-900">
                        {board ? 'No open tenders right now.' : 'No projects yet.'}
                    </p>
                    <p className="mt-1">
                        {board ? (
                            'New tenders appear here as owners publish them. Check back soon.'
                        ) : (
                            <>
                                A published project appears here immediately.{' '}
                                <Link href="/dashboard/post-project" className="font-bold text-neutral-900 hover:text-red-600">
                                    Post a project →
                                </Link>
                            </>
                        )}
                    </p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {rows.map((project) => {
                        const terminal = project.status === 'completed' || project.status === 'cancelled';
                        const href = board || terminal
                            ? `/projects/${project.id}/overview`
                            : `/projects/${project.id}/proposals`;
                        const cta = board ? 'View tender →' : terminal ? 'Open workspace →' : 'Review proposals →';
                        return (
                            <Link
                                key={project.id}
                                href={href}
                                className="bg-white rounded-2xl border border-neutral-200 p-5 hover:border-neutral-400 transition-colors"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <h2 className="text-sm font-black text-neutral-900 leading-snug">{project.title}</h2>
                                    {project.status && (
                                        <span className={`shrink-0 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider ${projectsStatusClasses(project.status)}`}>
                                            {titleCase(project.status)}
                                        </span>
                                    )}
                                </div>
                                <p className="mt-2 text-xs text-neutral-500">
                                    {[project.location, project.city].filter(Boolean).join(', ') || 'Location not set'}
                                </p>
                                <p className="mt-4 text-sm font-bold text-neutral-900">{formatIDR(project.budget)}</p>
                                <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                    {cta}
                                </p>
                            </Link>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

function projectsStatusClasses(status: string | null | undefined): string {
    switch (status) {
        case 'open':
            return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        case 'cancelled':
            return 'bg-neutral-100 text-neutral-500 border-neutral-200';
        case 'completed':
        case 'completed_build':
            return 'bg-sky-50 text-sky-700 border-sky-200';
        default:
            return 'bg-amber-50 text-amber-700 border-amber-200';
    }
}

export function DirectoryPanel({
    rows,
    title,
}: {
    rows: {
        id: number;
        nama?: string;
        spesialisasi?: string;
        lokasi?: string;
        pengalaman_tahun?: number;
        rate_harga?: string;
        is_verified?: boolean;
    }[];
    title: string;
}) {
    return (
        <section>
            <div className="flex items-end justify-between gap-4 mb-5">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">{title}</h1>
                    <p className="text-sm text-neutral-500 mt-1">Verified professionals available on 4Ceria.</p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    {rows.length} listed
                </span>
            </div>

            {rows.length === 0 ? (
                <div className="bg-white rounded-2xl border border-neutral-200 p-8 text-sm text-neutral-500">
                    No professionals are listed yet.
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {rows.map((professional) => (
                        <article key={professional.id} className="bg-white rounded-2xl border border-neutral-200 p-5">
                            <div className="flex items-start justify-between gap-3">
                                <h2 className="text-sm font-black text-neutral-900">{professional.nama}</h2>
                                {professional.is_verified && (
                                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600">
                                        Verified
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 text-xs text-neutral-500">{professional.lokasi}</p>
                            {professional.spesialisasi && (
                                <p className="mt-3 text-xs text-neutral-600 leading-relaxed">{professional.spesialisasi}</p>
                            )}
                            <div className="mt-4 flex items-center justify-between text-xs">
                                <span className="text-neutral-500">{professional.pengalaman_tahun ?? 0} yrs experience</span>
                                <span className="font-bold text-neutral-900">{formatIDR(professional.rate_harga)}</span>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}
