import Link from 'next/link';
import type { ReactNode } from 'react';
import { PROJECT_TABS, type ProjectTab } from './tabs';
import { formatIDR, titleCase } from '@/lib/format';

/**
 * Native server-rendered project panels.
 *
 * The first two panels (overview, budget) are PORTED: they fetch on the server
 * and render markup, so the content is in the first response. The remaining
 * tabs still mount the synced legacy workspace (`ProjectDetailPage`); each one
 * moves here as it is rewritten.
 */

export interface ProjectPayload {
    id: number;
    title?: string;
    description?: string;
    status?: string;
    budget?: string;
    location?: string;
    city?: string;
    project_category?: string;
    deadline?: string | null;
    needed_phases?: string[];
    completed_phases?: string[];
    owner?: { id: number; name: string } | null;
    project_manager?: { id: number; nama?: string } | null;
    milestones?: { id: number; title: string; approval_status?: string | null; is_completed?: boolean }[];
    legal_detail?: string | null;
    legal_requirements?: string[];
    pbg_verified_at?: string | null;
    slf_verified_at?: string | null;
    legal_handover_submitted_at?: string | null;
    legal_handover_notes?: string | null;
    notaris?: { id?: number; nama?: string } | null;
    budget_summary?: {
        total?: number;
        paid?: number;
        committed?: number;
        available?: number;
        percent_used?: number;
        currency?: string;
    } | null;
}

export interface BudgetPayload {
    project_budget?: string;
    transactions?: {
        id: number;
        transaction_type?: string;
        amount?: string;
        title?: string;
        transaction_date?: string;
    }[];
    payment_termins?: {
        id: number;
        label?: string;
        role_type?: string;
        percentage?: string;
        amount?: string;
        status?: string;
    }[];
    addendums?: {
        id: number;
        title?: string;
        amount?: string;
        status?: string;
    }[];
}

export function ProjectShell({
    project,
    activeTab,
    children,
}: {
    project: ProjectPayload;
    activeTab: ProjectTab;
    children: ReactNode;
}) {
    return (
        <div className="min-h-screen bg-neutral-100">
            <header className="bg-white border-b border-neutral-200">
                <div className="max-w-6xl mx-auto px-4 sm:px-8 py-5">
                    <Link href="/dashboard/projects" className="text-xs font-bold text-neutral-500 hover:text-neutral-900">
                        ← Projects
                    </Link>
                    <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h1 className="text-2xl font-black text-neutral-900">{project.title ?? `Project #${project.id}`}</h1>
                            <p className="text-sm text-neutral-500 mt-1">
                                {[project.location, project.city].filter(Boolean).join(', ')}
                                {project.project_category ? ` · ${titleCase(project.project_category)}` : ''}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            {project.status && (
                                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-50 text-red-600">
                                    {titleCase(project.status)}
                                </span>
                            )}
                            {project.budget && (
                                <span className="text-sm font-bold text-neutral-900">{formatIDR(project.budget)}</span>
                            )}
                        </div>
                    </div>
                    <nav className="mt-4 flex flex-wrap gap-1" aria-label="Project panels">
                        {PROJECT_TABS.map((tab) => (
                            <Link
                                key={tab}
                                href={`/projects/${project.id}/${tab}`}
                                aria-current={tab === activeTab ? 'page' : undefined}
                                className={
                                    tab === activeTab
                                        ? 'px-3 py-1.5 rounded-lg text-xs font-bold bg-neutral-900 text-white'
                                        : 'px-3 py-1.5 rounded-lg text-xs font-bold text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
                                }
                            >
                                {titleCase(tab)}
                            </Link>
                        ))}
                    </nav>
                </div>
            </header>
            <main className="max-w-6xl mx-auto px-4 sm:px-8 py-8">{children}</main>
        </div>
    );
}

export function OverviewPanel({ project }: { project: ProjectPayload }) {
    const summary = project.budget_summary;

    return (
        <div className="grid gap-5 lg:grid-cols-3">
            <section className="lg:col-span-2 bg-white rounded-2xl border border-neutral-200 p-6">
                <h2 className="text-sm font-black uppercase tracking-wider text-neutral-400">Brief</h2>
                <p className="mt-3 text-sm leading-relaxed text-neutral-700 whitespace-pre-line">
                    {project.description || 'No brief has been written yet.'}
                </p>

                <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <dt className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Owner</dt>
                        <dd className="mt-1 font-semibold text-neutral-800">{project.owner?.name ?? '—'}</dd>
                    </div>
                    <div>
                        <dt className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Project manager</dt>
                        <dd className="mt-1 font-semibold text-neutral-800">{project.project_manager?.nama ?? 'Not assigned'}</dd>
                    </div>
                    <div>
                        <dt className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Deadline</dt>
                        <dd className="mt-1 font-semibold text-neutral-800">{project.deadline ? project.deadline.slice(0, 10) : '—'}</dd>
                    </div>
                    <div>
                        <dt className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Phases</dt>
                        <dd className="mt-1 font-semibold text-neutral-800">
                            {(project.needed_phases ?? []).map(titleCase).join(' · ') || '—'}
                        </dd>
                    </div>
                </dl>
            </section>

            <aside className="space-y-5">
                <section className="bg-white rounded-2xl border border-neutral-200 p-6">
                    <h2 className="text-sm font-black uppercase tracking-wider text-neutral-400">Escrow</h2>
                    {summary ? (
                        <dl className="mt-3 space-y-2 text-sm">
                            <div className="flex justify-between"><dt className="text-neutral-500">Total</dt><dd className="font-bold">{formatIDR(summary.total)}</dd></div>
                            <div className="flex justify-between"><dt className="text-neutral-500">Paid</dt><dd className="font-bold">{formatIDR(summary.paid)}</dd></div>
                            <div className="flex justify-between"><dt className="text-neutral-500">Committed</dt><dd className="font-bold">{formatIDR(summary.committed)}</dd></div>
                            <div className="flex justify-between"><dt className="text-neutral-500">Available</dt><dd className="font-black text-neutral-900">{formatIDR(summary.available)}</dd></div>
                        </dl>
                    ) : (
                        <p className="mt-3 text-sm text-neutral-500">Budget summary unavailable for this viewer.</p>
                    )}
                </section>

                <section className="bg-white rounded-2xl border border-neutral-200 p-6">
                    <h2 className="text-sm font-black uppercase tracking-wider text-neutral-400">Milestones</h2>
                    {(project.milestones ?? []).length === 0 ? (
                        <p className="mt-3 text-sm text-neutral-500">No milestones yet.</p>
                    ) : (
                        <ul className="mt-3 space-y-2 text-sm">
                            {(project.milestones ?? []).map((milestone) => (
                                <li key={milestone.id} className="flex items-start justify-between gap-3">
                                    <span className="font-semibold text-neutral-800">{milestone.title}</span>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                        {milestone.is_completed ? 'Done' : milestone.approval_status ?? 'Open'}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </aside>
        </div>
    );
}

export function BudgetPanel({ project, budget }: { project: ProjectPayload; budget: BudgetPayload }) {
    const termins = budget.payment_termins ?? [];

    return (
        <div className="space-y-5">
            <section className="grid gap-4 sm:grid-cols-3">
                <div className="bg-white rounded-2xl border border-neutral-200 p-5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Project budget</p>
                    <p className="mt-2 text-2xl font-black text-neutral-900">{formatIDR(budget.project_budget ?? project.budget)}</p>
                </div>
                <div className="bg-white rounded-2xl border border-neutral-200 p-5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Committed</p>
                    <p className="mt-2 text-2xl font-black text-neutral-900">{formatIDR(project.budget_summary?.committed)}</p>
                </div>
                <div className="bg-white rounded-2xl border border-neutral-200 p-5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Available</p>
                    <p className="mt-2 text-2xl font-black text-emerald-600">{formatIDR(project.budget_summary?.available)}</p>
                </div>
            </section>

            <section className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-neutral-100">
                    <h2 className="text-sm font-black uppercase tracking-wider text-neutral-400">Payment stages</h2>
                </div>
                {termins.length === 0 ? (
                    <p className="px-6 py-6 text-sm text-neutral-500">No payment stages have been drafted yet.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                <th className="text-left px-6 py-3">Stage</th>
                                <th className="text-left px-6 py-3">Role</th>
                                <th className="text-right px-6 py-3">Share</th>
                                <th className="text-right px-6 py-3">Amount</th>
                                <th className="text-right px-6 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {termins.map((termin) => (
                                <tr key={termin.id} className="border-t border-neutral-100">
                                    <td className="px-6 py-3 font-semibold text-neutral-800">{termin.label}</td>
                                    <td className="px-6 py-3 text-neutral-500">{titleCase(termin.role_type)}</td>
                                    <td className="px-6 py-3 text-right">{termin.percentage}%</td>
                                    <td className="px-6 py-3 text-right font-bold">{formatIDR(termin.amount)}</td>
                                    <td className="px-6 py-3 text-right text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                        {titleCase(termin.status)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>

            <section className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-neutral-100">
                    <h2 className="text-sm font-black uppercase tracking-wider text-neutral-400">Ledger</h2>
                </div>
                {(budget.transactions ?? []).length === 0 ? (
                    <p className="px-6 py-6 text-sm text-neutral-500">No ledger movements recorded.</p>
                ) : (
                    <ul className="divide-y divide-neutral-100">
                        {(budget.transactions ?? []).map((transaction) => (
                            <li key={transaction.id} className="px-6 py-3 flex items-center justify-between gap-4 text-sm">
                                <span className="font-semibold text-neutral-800">{transaction.title}</span>
                                <span className="text-neutral-500">{titleCase(transaction.transaction_type)}</span>
                                <span className="font-bold">{formatIDR(transaction.amount)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

export interface BidRow {
    id: number;
    price?: string;
    calculated_total?: string | null;
    fee_type?: string | null;
    proposal?: string | null;
    status?: string | null;
    estimated_duration?: number | string | null;
    duration_unit?: string | null;
    is_recommended?: boolean;
    interview_notes?: string | null;
    technical_notes?: string | null;
    license_number?: string | null;
    experience_years?: number | null;
    structural_id?: number | null;
    mep_id?: number | null;
    arsitek_id?: number | null;
    kontraktor_id?: number | null;
    notaris_id?: number | null;
    interior_id?: number | null;
    pm_id?: number | null;
    bidder?: {
        id?: number;
        name?: string;
        foto?: string | null;
        location?: string;
        lokasi?: string;
        spesialisasi?: string;
        specialization?: string;
        average_rating?: number;
        review_count?: number;
        user?: { id?: number; name?: string };
    } | null;
}

export interface BidsPayload extends ProjectPayload {
    bids_arsitek?: BidRow[];
    bids_kontraktor?: BidRow[];
    bids_notaris?: BidRow[];
    bids_interior?: BidRow[];
    bids_structural?: BidRow[];
    bids_mep?: BidRow[];
    bids_project_manager?: BidRow[];
}

const BID_ROLES: { key: keyof BidsPayload; label: string }[] = [
    { key: 'bids_arsitek', label: 'Architects' },
    { key: 'bids_kontraktor', label: 'Contractors' },
    { key: 'bids_notaris', label: 'Notaries' },
    { key: 'bids_interior', label: 'Interior designers' },
    { key: 'bids_structural', label: 'Structural engineers' },
    { key: 'bids_mep', label: 'MEP engineers' },
    { key: 'bids_project_manager', label: 'Project managers' },
];

function BidCard({ bid }: { bid: BidRow }) {
    const name = bid.bidder?.name ?? bid.bidder?.user?.name ?? `Bid #${bid.id}`;
    const specialization = bid.bidder?.spesialisasi ?? bid.bidder?.specialization;
    const location = bid.bidder?.location ?? bid.bidder?.lokasi;

    return (
        <article className="bg-white rounded-2xl border border-neutral-200 p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-black text-neutral-900">{name}</h3>
                    <p className="text-xs text-neutral-500 mt-0.5">
                        {[specialization, location].filter(Boolean).join(' · ') || 'Professional'}
                    </p>
                </div>
                <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-neutral-100 text-neutral-600">
                    {titleCase(bid.status)}
                </span>
            </div>

            <div className="mt-4 flex items-baseline justify-between gap-3">
                <p className="text-lg font-black text-neutral-900">{formatIDR(bid.calculated_total ?? bid.price)}</p>
                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    {titleCase(bid.fee_type ?? 'fixed')}
                </p>
            </div>

            {bid.proposal && (
                <p className="mt-3 text-xs leading-relaxed text-neutral-600 line-clamp-4">{bid.proposal}</p>
            )}

            <div className="mt-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                <span>
                    {bid.estimated_duration ? `${bid.estimated_duration} ${bid.duration_unit ?? ''}`.trim() : 'Duration not stated'}
                </span>
                {typeof bid.bidder?.average_rating === 'number' && bid.bidder.average_rating > 0 && (
                    <span>★ {bid.bidder.average_rating} ({bid.bidder.review_count ?? 0})</span>
                )}
            </div>
        </article>
    );
}

export function ProposalsPanel({ bids }: { bids: BidsPayload }) {
    const groups = BID_ROLES.map((role) => ({
        label: role.label,
        rows: (bids[role.key] as BidRow[] | undefined) ?? [],
    })).filter((group) => group.rows.length > 0);
    const total = groups.reduce((sum, group) => sum + group.rows.length, 0);

    return (
        <section>
            <div className="flex items-end justify-between gap-4 mb-5">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">Proposals</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        Every bid submitted to this project, grouped by the role it is for.
                    </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{total} bids</span>
            </div>

            {total === 0 ? (
                <div className="bg-white rounded-2xl border border-neutral-200 p-8 text-sm text-neutral-500">
                    No proposals have been submitted yet.
                </div>
            ) : (
                <div className="space-y-8">
                    {groups.map((group) => (
                        <div key={group.label}>
                            <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                                {group.label} · {group.rows.length}
                            </h2>
                            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                {group.rows.map((bid) => (
                                    <BidCard key={bid.id} bid={bid} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

export interface MilestoneRow {
    id: number;
    title?: string;
    type?: string | null;
    description?: string | null;
    content?: unknown;
    review_note?: string | null;
    review_status?: string | null;
    image?: string | null;
    sort_order?: number | null;
    start_date?: string | null;
    due_date?: string | null;
    is_completed?: boolean;
    approval_status?: string | null;
    revision_notes?: string | null;
    phase_context?: string | null;
    progress_attachment?: string | null;
    lead_pro_verified_at?: string | null;
    pm_verified_at?: string | null;
    created_at?: string | null;
}

const PHASE_BID_ROLES: Record<string, { key: keyof BidsPayload; label: string }> = {
    design: { key: 'bids_arsitek', label: 'Architects' },
    build: { key: 'bids_kontraktor', label: 'Contractors' },
    legal: { key: 'bids_notaris', label: 'Notaries' },
    interior: { key: 'bids_interior', label: 'Interior designers' },
    management: { key: 'bids_project_manager', label: 'Project managers' },
    structural: { key: 'bids_structural', label: 'Structural engineers' },
    mep: { key: 'bids_mep', label: 'MEP engineers' },
};

function milestoneDone(milestone: MilestoneRow): boolean {
    return Boolean(milestone.is_completed) || milestone.approval_status === 'approved';
}

export function ProcessPanel({
    project,
    milestones,
    bids,
}: {
    project: ProjectPayload;
    milestones: MilestoneRow[];
    bids: BidsPayload | null;
}) {
    const ordered = [...milestones].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id,
    );

    const groups = new Map<string, MilestoneRow[]>();
    for (const milestone of ordered) {
        const phase = milestone.phase_context || milestone.type || 'other';
        const rows = groups.get(phase) ?? [];
        rows.push(milestone);
        groups.set(phase, rows);
    }

    const completed = ordered.filter(milestoneDone).length;
    const progress = ordered.length === 0 ? 0 : Math.round((completed / ordered.length) * 100);
    const neededPhases = project.needed_phases ?? [];

    return (
        <section>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">Process</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        The delivery milestones for each phase, and the proposals that feed them.
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Progress</p>
                    <p className="text-xl font-black text-neutral-900">
                        {progress}% <span className="text-xs font-bold text-neutral-400">({completed}/{ordered.length})</span>
                    </p>
                </div>
            </div>

            {neededPhases.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                    {neededPhases.map((phase) => (
                        <span
                            key={phase}
                            className="px-3 py-1 rounded-full bg-white border border-neutral-200 text-[10px] font-black uppercase tracking-wider text-neutral-500"
                        >
                            {titleCase(phase)}
                        </span>
                    ))}
                </div>
            )}

            {bids && (
                <div className="flex flex-wrap gap-2 mb-8">
                    {Object.entries(PHASE_BID_ROLES).map(([phase, role]) => {
                        const rows = (bids[role.key] as BidRow[] | undefined) ?? [];
                        if (rows.length === 0) {
                            return null;
                        }
                        return (
                            <span
                                key={phase}
                                className="px-3 py-1 rounded-full bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider"
                            >
                                {role.label}: {rows.length} {rows.length === 1 ? 'bid' : 'bids'}
                            </span>
                        );
                    })}
                </div>
            )}

            {ordered.length === 0 ? (
                <div className="bg-white rounded-2xl border border-neutral-200 p-8 text-sm text-neutral-500">
                    No milestones have been drafted yet. The hired professionals and the PM build this
                    schedule as the project advances.
                </div>
            ) : (
                <div className="space-y-8">
                    {[...groups.entries()].map(([phase, rows]) => {
                        const done = rows.filter(milestoneDone).length;
                        return (
                            <div key={phase}>
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                                        {titleCase(phase)} · {rows.length}
                                    </h2>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                        {done}/{rows.length} done
                                    </span>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                    {rows.map((milestone) => (
                                        <article key={milestone.id} className="bg-white rounded-2xl border border-neutral-200 p-5">
                                            <div className="flex items-start justify-between gap-3">
                                                <h3 className="text-sm font-black text-neutral-900 leading-snug">
                                                    {milestone.title}
                                                </h3>
                                                <span
                                                    className={
                                                        milestoneDone(milestone)
                                                            ? 'shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600'
                                                            : 'shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-neutral-100 text-neutral-500'
                                                    }
                                                >
                                                    {milestone.is_completed
                                                        ? 'Completed'
                                                        : titleCase(milestone.approval_status ?? milestone.review_status ?? 'Pending')}
                                                </span>
                                            </div>
                                            {milestone.description && (
                                                <p className="mt-2 text-xs leading-relaxed text-neutral-600 line-clamp-3">
                                                    {milestone.description}
                                                </p>
                                            )}
                                            <div className="mt-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                                <span>{titleCase(milestone.type ?? 'Milestone')}</span>
                                                <span>
                                                    {milestone.due_date
                                                        ? `Due ${milestone.due_date.slice(0, 10)}`
                                                        : milestone.start_date
                                                          ? `From ${milestone.start_date.slice(0, 10)}`
                                                          : 'No date'}
                                                </span>
                                            </div>
                                            {milestone.review_note && (
                                                <p className="mt-3 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                                                    {milestone.review_note}
                                                </p>
                                            )}
                                        </article>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
