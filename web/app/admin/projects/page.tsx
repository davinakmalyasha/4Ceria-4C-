import Link from 'next/link';
import { Download } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatIDR } from '@/lib/format';
import { forceTerminateProject } from '../actions';
import { AdminPageHeader, ErrorNote, Pagination } from '@/components/admin/parts';
import { ConfirmSubmit } from '@/app/dashboard/confirmSubmit';
import type { AdminProjectRow, Paginated } from '@/components/admin/types';

const inputClass =
    'rounded-xl border border-neutral-200 bg-[#fafafa] px-3.5 py-2 text-xs font-semibold text-neutral-700 outline-none focus:border-neutral-900 focus:bg-white';

export default async function AdminProjectsPage({
    searchParams,
}: {
    searchParams: Promise<{ search?: string; page?: string; error?: string }>;
}) {
    const { search, page, error } = await searchParams;
    const currentPage = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);
    const params = new URLSearchParams({ page: String(currentPage) });

    if (search) params.set('search', search);

    const projects = await apiFetch<Paginated<AdminProjectRow>>(`/admin/projects?${params.toString()}`);
    const exportHref = `/api/admin/projects/export${search ? `?search=${encodeURIComponent(search)}` : ''}`;

    return (
        <div className="space-y-6">
            <AdminPageHeader
                title="Projects audit"
                description="Every project on the platform, with its participants and lifecycle state."
            >
                <form method="get" action="/admin/projects" className="flex flex-wrap items-center gap-2">
                    <input
                        type="search"
                        name="search"
                        defaultValue={search ?? ''}
                        placeholder="Search by project or owner…"
                        className={`${inputClass} w-full sm:w-64`}
                    />
                    <button
                        type="submit"
                        className="rounded-xl bg-neutral-900 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-neutral-700"
                    >
                        Search
                    </button>
                    <a
                        href={exportHref}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-neutral-700 hover:text-neutral-900"
                    >
                        <Download size={12} /> Export CSV
                    </a>
                    <Link
                        href="/admin/projects"
                        className="text-[10px] font-black uppercase tracking-wider text-neutral-400 hover:text-neutral-900"
                    >
                        Reset
                    </Link>
                </form>
            </AdminPageHeader>

            <ErrorNote error={error} />

            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead>
                            <tr className="border-b border-neutral-100 bg-neutral-50 text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                <th className="px-6 py-3.5">Project</th>
                                <th className="px-6 py-3.5">Owner</th>
                                <th className="px-6 py-3.5">Participants</th>
                                <th className="px-6 py-3.5">Bids</th>
                                <th className="px-6 py-3.5">Freeze</th>
                                <th className="px-6 py-3.5">Money</th>
                                <th className="px-6 py-3.5">Budget</th>
                                <th className="px-6 py-3.5">Status</th>
                                <th className="px-6 py-3.5 text-right">Moderation</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 text-xs">
                            {(projects.data ?? []).length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center italic text-neutral-400">
                                        No projects match these filters.
                                    </td>
                                </tr>
                            ) : (
                                (projects.data ?? []).map((project) => (
                                    <tr key={project.id} className="hover:bg-neutral-50/50">
                                        <td className="px-6 py-4">
                                            <Link
                                                href={`/projects/${project.id}`}
                                                className="font-extrabold text-neutral-900 hover:text-red-600"
                                            >
                                                {project.title ?? `Project #${project.id}`}
                                            </Link>
                                            <div className="mt-0.5 text-[10px] font-semibold text-neutral-400">
                                                #{project.id}
                                                {project.created_at ? ` · ${project.created_at.slice(0, 10)}` : ''}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-neutral-700">{project.user?.name ?? '—'}</td>
                                        <td className="px-6 py-4 text-neutral-600">
                                            <p>Architect: {project.arsitek?.nama ?? '—'}</p>
                                            <p>Contractor: {project.kontraktor?.nama_perusahaan ?? '—'}</p>
                                        </td>
                                        <td className="px-6 py-4 text-neutral-700">
                                            <p className="font-bold text-neutral-900">{project.bid_count ?? 0} total</p>
                                            <p className="mt-0.5 text-[10px] font-semibold text-neutral-400">
                                                {(project.pending_bid_count ?? 0) > 0 ? (
                                                    <span className="text-amber-600">
                                                        {project.pending_bid_count} awaiting triage
                                                    </span>
                                                ) : (
                                                    'queue clear'
                                                )}
                                            </p>
                                        </td>
                                        <td className="px-6 py-4">
                                            {project.open_dispute ? (
                                                <span className="inline-flex rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-red-700">
                                                    Frozen · #{project.open_dispute.id}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-300">
                                                    No freeze
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-neutral-700">
                                            <p className="font-bold text-neutral-900">
                                                {formatIDR(project.paid_total)}
                                            </p>
                                            <p className="mt-0.5 text-[10px] font-semibold text-neutral-400">
                                                paid out
                                                {(project.refunded_total != null && String(project.refunded_total) !== '0' && String(project.refunded_total) !== '0.00') && (
                                                    <> · refunded {formatIDR(project.refunded_total)}</>
                                                )}
                                            </p>
                                        </td>
                                        <td className="px-6 py-4 font-bold text-neutral-900">
                                            {formatIDR(project.budget)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex rounded-lg border border-neutral-200 bg-neutral-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-neutral-700">
                                                {project.status ?? 'unknown'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {project.status === 'cancelled' || project.status === 'completed' ? (
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-300">
                                                    Terminal
                                                </span>
                                            ) : (
                                                <form action={forceTerminateProject}>
                                                    <input type="hidden" name="project_id" value={project.id} />
                                                    <ConfirmSubmit
                                                        message={`Force-terminate "${project.title ?? project.id}"? This cannot be undone.`}
                                                    >
                                                        Force terminate
                                                    </ConfirmSubmit>
                                                </form>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <Pagination
                    base="/admin/projects"
                    page={projects.current_page}
                    lastPage={projects.last_page}
                    total={projects.total}
                    from={projects.from}
                    to={projects.to}
                    params={{ search }}
                />
            </div>
        </div>
    );
}
