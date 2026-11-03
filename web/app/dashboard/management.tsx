import Link from 'next/link';
import { assetUrl } from '@/lib/assets';
import { formatIDR, titleCase } from '@/lib/format';
import { CoverImage } from '@/components/CoverImage';

/**
 * Native "Management" panel.
 *
 * The legacy tab rendered `ProfessionalProjects` from the dashboard's
 * `/projects?all=true` payload. That payload already carries images, milestones
 * and the budget, so this panel needs no extra request: it renders the
 * professional's active project grid with delivery progress.
 */

export interface ManagementMilestone {
    id: number;
    is_completed?: boolean | null;
    approval_status?: string | null;
}

export interface ManagementProject {
    id: number;
    title?: string | null;
    description?: string | null;
    status?: string | null;
    type?: string | null;
    location?: string | null;
    budget?: string | null;
    images?: { id?: number; url?: string | null; path?: string | null }[] | null;
    milestones?: ManagementMilestone[] | null;
}

function statusClasses(status: string | null | undefined): string {
    switch (status) {
        case 'completed':
        case 'completed_build':
            return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        case 'cancelled':
            return 'bg-neutral-100 text-neutral-500 border-neutral-200';
        case 'open':
            return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        default:
            return 'bg-amber-50 text-amber-700 border-amber-200';
    }
}

export function ManagementPanel({ projects }: { projects: ManagementProject[] }) {
    return (
        <div data-native-panel="management" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">Project Management</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        Projects your proposals were accepted into, with their delivery progress.
                    </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    {projects.length} {projects.length === 1 ? 'project' : 'projects'}
                </span>
            </div>

            {projects.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-10 text-center">
                    <h2 className="text-sm font-black text-neutral-900">No Active Projects Yet</h2>
                    <p className="mt-1 text-xs text-neutral-500 max-w-md mx-auto">
                        Once your proposals are accepted by clients they appear here. Keep bidding on the
                        Bidding Board.
                    </p>
                    <Link
                        href="/dashboard/explore"
                        className="mt-5 inline-flex px-4 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                    >
                        Browse tenders
                    </Link>
                </div>
            ) : (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                    {projects.map((project) => {
                        const cover = assetUrl(project.images?.[0]?.url ?? project.images?.[0]?.path ?? null);
                        const milestones = project.milestones ?? [];
                        const done = milestones.filter(
                            (milestone) => milestone.is_completed || milestone.approval_status === 'approved',
                        ).length;
                        const progress = milestones.length === 0 ? 0 : Math.round((done / milestones.length) * 100);
                        const location = (project.location ?? '').split(',')[0];

                        return (
                            <article
                                key={project.id}
                                data-native-management-project={project.id}
                                className="bg-white rounded-2xl border border-neutral-200 overflow-hidden flex flex-col"
                            >
                                {cover ? (
                                    <CoverImage src={cover} alt="" className="h-40" />
                                ) : (
                                    <div className="h-40 w-full bg-neutral-100 flex items-center justify-center text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                        No photo
                                    </div>
                                )}

                                <div className="p-5 flex-1 flex flex-col">
                                    <div className="flex items-start justify-between gap-3">
                                        <h2 className="text-sm font-black text-neutral-900 leading-snug">
                                            {project.title ?? `Project #${project.id}`}
                                        </h2>
                                        <span
                                            className={`shrink-0 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider ${statusClasses(project.status)}`}
                                        >
                                            {titleCase(project.status)}
                                        </span>
                                    </div>

                                    <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                        {[titleCase(project.type), location].filter(Boolean).join(' · ')}
                                    </p>

                                    {project.description && (
                                        <p className="mt-3 text-xs leading-relaxed text-neutral-600 line-clamp-2">
                                            {project.description}
                                        </p>
                                    )}

                                    {milestones.length > 0 && (
                                        <div className="mt-4">
                                            <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                                <span>Progress</span>
                                                <span className={progress === 100 ? 'text-emerald-600' : 'text-red-600'}>
                                                    {done}/{milestones.length}
                                                </span>
                                            </div>
                                            <div className="mt-1.5 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${progress === 100 ? 'bg-emerald-500' : 'bg-red-500'}`}
                                                    style={{ width: `${progress}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className="mt-auto pt-4 flex items-end justify-between gap-3">
                                        <div>
                                            <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                                Budget
                                            </p>
                                            <p className="mt-0.5 text-base font-black text-neutral-900">
                                                {formatIDR(project.budget)}
                                            </p>
                                        </div>
                                        <Link
                                            href={`/projects/${project.id}`}
                                            className="px-3 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                                        >
                                            Open →
                                        </Link>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
