import Link from 'next/link';
import { formatIDR, titleCase } from '@/lib/format';
import { respondToInvitation } from './overview-actions';
import type { MyBidRow } from './myBids';

/**
 * Native dashboard overview.
 *
 * The legacy OverviewContent mounted a client hook that fired the dashboard's
 * whole request set on mount. Here the page already awaited `/projects`,
 * `/projects?feed`, `/my-bids`|`/hire-history` and (for specialists) the firm
 * invitations, so this panel is pure markup — the first paint is the numbers.
 */

export interface OverviewUser {
    id: number;
    name?: string | null;
    role_type?: string | null;
    pic?: string | null;
}

export interface OverviewProject {
    id: number;
    title?: string | null;
    status?: string | null;
    budget?: string | null;
    city?: string | null;
    location?: string | null;
    bids_arsitek_count?: number | null;
    bids_kontraktor_count?: number | null;
    bids_notaris_count?: number | null;
    bids_interior_count?: number | null;
}

export interface FirmInvitation {
    id: number;
    role_in_firm?: string | null;
    invited_at?: string | null;
    firm_owner?: {
        id?: number;
        name?: string | null;
        role_type?: string | null;
        pic?: string | null;
        no_telp?: string | null;
    } | null;
}

export const SPECIALIST_ROLES = new Set([
    'structural',
    'mep',
    'interior',
    'kontraktor',
    'civil',
    'mechanical',
    'electrical',
    'plumbing',
    'roofing',
    'finishing',
]);

function firstName(name: string | null | undefined): string {
    return (name ?? '').trim().split(/\s+/)[0] || 'there';
}

function statusClasses(status: string | null | undefined): string {
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

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
    return (
        <div className="bg-white rounded-2xl border border-neutral-200 p-5">
            <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{label}</p>
            <p className="mt-2 text-2xl font-black text-neutral-900">{value}</p>
            {hint && <p className="mt-1 text-[11px] font-semibold text-neutral-400">{hint}</p>}
        </div>
    );
}

function QuickAction({ href, label, description }: { href: string; label: string; description: string }) {
    return (
        <Link
            href={href}
            className="group bg-white rounded-2xl border border-neutral-200 p-5 hover:border-neutral-900 transition-colors"
        >
            <p className="text-sm font-black text-neutral-900 group-hover:text-red-600">{label} →</p>
            <p className="mt-1 text-xs text-neutral-500 leading-relaxed">{description}</p>
        </Link>
    );
}

export function FirmInvitationsPanel({ invitations }: { invitations: FirmInvitation[] }) {
    if (invitations.length === 0) {
        return null;
    }

    const groups = new Map<number, FirmInvitation[]>();
    for (const invitation of invitations) {
        const ownerId = invitation.firm_owner?.id ?? 0;
        const rows = groups.get(ownerId) ?? [];
        rows.push(invitation);
        groups.set(ownerId, rows);
    }

    return (
        <section data-native-section="firm-invitations" className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
                <h2 className="text-sm font-black text-slate-900">Offered Capabilities &amp; Roles</h2>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    {invitations.length} {invitations.length === 1 ? 'invitation' : 'invitations'}
                </span>
            </div>

            <div className="space-y-4">
                {[...groups.entries()].map(([ownerId, rows]) => {
                    const owner = rows[0]?.firm_owner;
                    return (
                        <article key={ownerId} className="bg-white rounded-xl border border-slate-200 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="h-10 w-10 shrink-0 rounded-full bg-slate-900 text-white text-xs font-black flex items-center justify-center overflow-hidden">
                                        {owner?.pic ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={owner.pic} alt="" className="h-full w-full object-cover" />
                                        ) : (
                                            (owner?.name ?? '?').trim().charAt(0).toUpperCase()
                                        )}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-sm font-black text-slate-900 truncate">
                                            {owner?.name ?? 'Firm owner'}
                                        </p>
                                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                            {titleCase(owner?.role_type)}
                                            {owner?.no_telp ? ` · ${owner.no_telp}` : ''}
                                        </p>
                                    </div>
                                </div>
                                <span className="shrink-0 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[9px] font-black uppercase tracking-wider">
                                    Invited
                                </span>
                            </div>

                            <p className="mt-3 text-xs text-slate-600">
                                Offered role{rows.length === 1 ? '' : 's'}:{' '}
                                <span className="font-bold text-slate-800">
                                    {rows.map((row) => titleCase(row.role_in_firm)).filter(Boolean).join(' · ')}
                                </span>
                            </p>

                            <div className="mt-3 flex flex-wrap gap-2">
                                {rows.map((row) => (
                                    <form key={row.id} action={respondToInvitation} className="flex gap-2">
                                        <input type="hidden" name="id" value={row.id} />
                                        <button
                                            type="submit"
                                            name="action"
                                            value="accept"
                                            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-slate-700"
                                        >
                                            Accept {titleCase(row.role_in_firm)}
                                        </button>
                                        <button
                                            type="submit"
                                            name="action"
                                            value="decline"
                                            className="px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-900"
                                        >
                                            Decline
                                        </button>
                                    </form>
                                ))}
                            </div>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}

export function OverviewPanel({
    user,
    projects,
    projectFeed,
    myBids,
    hiredProfessionals,
    invitations,
    error,
}: {
    user: OverviewUser;
    projects: OverviewProject[];
    projectFeed: OverviewProject[];
    myBids: MyBidRow[];
    hiredProfessionals: { id: number }[];
    invitations: FirmInvitation[];
    error?: string;
}) {
    const isOwner = user.role_type === 'user';
    const isSpecialist = SPECIALIST_ROLES.has(user.role_type ?? '');

    const bidsReceived = projects.reduce(
        (sum, project) =>
            sum +
            (project.bids_arsitek_count ?? 0) +
            (project.bids_kontraktor_count ?? 0) +
            (project.bids_notaris_count ?? 0) +
            (project.bids_interior_count ?? 0),
        0,
    );
    const pipeline = myBids.filter((bid) =>
        ['shortlisted', 'invited', 'negotiating', 'contract_pending'].includes(bid.status ?? ''),
    ).length;

    return (
        <div data-native-panel="overview" className="space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">
                        Welcome back, {firstName(user.name)}
                    </h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        {isOwner
                            ? 'Your projects, the tenders you posted and the professionals you hired.'
                            : 'Your bids, the open tenders and the projects you work on.'}
                    </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-white border border-neutral-200 text-[10px] font-black uppercase tracking-wider text-neutral-500">
                    {titleCase(user.role_type)}
                </span>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>
            )}

            {isSpecialist && <FirmInvitationsPanel invitations={invitations} />}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {isOwner ? (
                    <>
                        <Stat label="Active projects" value={projects.length} hint="Owned or in progress" />
                        <Stat label="Open tenders" value={projectFeed.length} hint="Published for bidding" />
                        <Stat label="Bids received" value={bidsReceived} hint="Across all your projects" />
                        <Stat label="Hired professionals" value={hiredProfessionals.length} hint="In your hire history" />
                    </>
                ) : (
                    <>
                        <Stat label="My bids" value={myBids.length} hint="Submitted proposals" />
                        <Stat label="In pipeline" value={pipeline} hint="Shortlisted, invited or negotiating" />
                        <Stat label="Open tenders" value={projectFeed.length} hint="Accepting proposals" />
                        <Stat label="Projects" value={projects.length} hint="You are part of" />
                    </>
                )}
            </div>

            <section>
                <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">Quick actions</h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {isOwner ? (
                        <>
                            <QuickAction href="/dashboard/post-project" label="Post a project" description="Publish a brief and open it for bids." />
                            <QuickAction href="/dashboard/explore" label="Browse tenders" description="See the projects accepting proposals." />
                            <QuickAction href="/dashboard/projects" label="My projects" description="Open the workspace for each project." />
                            <QuickAction href="/dashboard/hire-history" label="Hire history" description="Every professional you have hired." />
                        </>
                    ) : (
                        <>
                            <QuickAction href="/dashboard/explore" label="Browse tenders" description="Find your next project." />
                            <QuickAction href="/dashboard/my-bids" label="My bids" description="Track every proposal you submitted." />
                            <QuickAction href="/dashboard/my-firms" label="My firms" description="The firms you belong to." />
                            <QuickAction href="/dashboard/profile" label="My profile" description="Keep your public profile complete." />
                        </>
                    )}
                </div>
            </section>

            <section>
                <div className="flex items-baseline justify-between gap-3 mb-3">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Your projects</h2>
                    <Link href="/dashboard/projects" className="text-[10px] font-black uppercase tracking-wider text-neutral-500 hover:text-neutral-900">
                        View all →
                    </Link>
                </div>

                {projects.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-8 text-sm text-neutral-500">
                        No projects yet. {isOwner ? 'Publish a brief to open it for bids.' : 'Bid on an open tender to get started.'}
                    </div>
                ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                        {projects.slice(0, 6).map((project) => (
                            <Link
                                key={project.id}
                                href={`/projects/${project.id}`}
                                className="bg-white rounded-2xl border border-neutral-200 p-5 hover:border-neutral-400 transition-colors"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <h3 className="text-sm font-black text-neutral-900 leading-snug">{project.title}</h3>
                                    <span className={`shrink-0 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider ${statusClasses(project.status)}`}>
                                        {titleCase(project.status)}
                                    </span>
                                </div>
                                <p className="mt-2 text-xs text-neutral-500">
                                    {[project.location, project.city].filter(Boolean).join(', ') || 'Location not set'}
                                </p>
                                <p className="mt-3 text-sm font-bold text-neutral-900">{formatIDR(project.budget)}</p>
                            </Link>
                        ))}
                    </div>
                )}
            </section>

            <section>
                <div className="flex items-baseline justify-between gap-3 mb-3">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Open tenders</h2>
                    <Link href="/dashboard/explore" className="text-[10px] font-black uppercase tracking-wider text-neutral-500 hover:text-neutral-900">
                        Browse →
                    </Link>
                </div>

                {projectFeed.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-8 text-sm text-neutral-500">
                        No tenders are open for bids right now.
                    </div>
                ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                        {projectFeed.slice(0, 6).map((project) => (
                            <article key={project.id} className="bg-white rounded-2xl border border-neutral-200 p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <h3 className="text-sm font-black text-neutral-900 leading-snug">{project.title}</h3>
                                    <span className="shrink-0 px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] font-black uppercase tracking-wider">
                                        Open for bids
                                    </span>
                                </div>
                                <p className="mt-2 text-xs text-neutral-500">
                                    {[project.location, project.city].filter(Boolean).join(', ') || 'Location not set'}
                                </p>
                                <p className="mt-3 text-sm font-bold text-neutral-900">{formatIDR(project.budget)}</p>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
