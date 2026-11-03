import Link from 'next/link';
import { assetUrl } from '@/lib/assets';
import { formatIDR, titleCase } from '@/lib/format';
import { respondToInvitation } from './overview-actions';
import { FirmBrowsePanel, FirmOwnerWorkspace } from './firmWorkspace';
import type { FirmBrowseRow, FirmJob } from './firmWorkspace';
import { CoverImage } from '@/components/CoverImage';

/**
 * Native firms cluster.
 *
 * `my-firm` (the architect/contractor owner) reads
 * `GET /firm-members/profile/{ownerId}`; `my-firms` (specialists) reads
 * `GET /firm-members/my-firms` plus the pending `/firm-members/invitations`.
 * Both are server-rendered; the full roster/job/portfolio tools stay the synced
 * hub below the summary until their write endpoints are ported.
 */

export interface FirmOwnerCard {
    id?: number;
    name?: string | null;
    username?: string | null;
    role_type?: string | null;
    pic?: string | null;
    no_telp?: string | null;
}

export interface FirmMembership {
    id: number;
    role_in_firm?: string | null;
    status?: string | null;
    invited_at?: string | null;
    accepted_at?: string | null;
    firm_owner?: FirmOwnerCard | null;
}

export interface FirmProfilePayload {
    owner?: FirmOwnerCard | null;
    firm_name?: string | null;
    firm_slogan?: string | null;
    firm_banner_url?: string | null;
    firm_description?: string | null;
    firm_is_hiring?: boolean;
    firm_needed_roles?: (string | FirmJob)[] | null;
    stats?: {
        experience_years?: number;
        base_rate?: number;
        average_rating?: number;
        review_count?: number;
        active_members_count?: number;
    } | null;
    roster?: unknown[] | null;
    portfolios?: unknown[] | null;
}

function FirmAvatar({ owner }: { owner?: FirmOwnerCard | null }) {
    const image = assetUrl(owner?.pic);
    return (
        <span className="h-11 w-11 shrink-0 rounded-xl bg-neutral-900 text-white text-sm font-black flex items-center justify-center overflow-hidden">
            {image ? (
                <CoverImage src={image} alt="" className="h-full" />
            ) : (
                (owner?.name ?? '?').trim().charAt(0).toUpperCase()
            )}
        </span>
    );
}

export function FirmProfilePanel({ profile, error }: { profile: FirmProfilePayload | null; error?: string }) {
    if (!profile) {
        return (
            <div data-native-panel="my-firm" className="space-y-6">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">My Firm</h1>
                    <p className="text-sm text-neutral-500 mt-1">Firm profiles are available to architects and contractors.</p>
                </div>
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-8 text-sm text-neutral-500">
                    This account does not own a firm. Register an architect or contractor account to create one.
                </div>
            </div>
        );
    }

    const banner = assetUrl(profile.firm_banner_url);
    const stats = profile.stats ?? {};
    const neededRoles = (profile.firm_needed_roles ?? [])
        .map((entry) => (typeof entry === 'string' ? entry : entry.title ?? entry.role ?? ''))
        .filter((entry) => entry !== '');

    return (
        <div data-native-panel="my-firm" className="space-y-6">
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
                {banner ? (
                    <CoverImage src={banner} alt="" className="h-40" />
                ) : (
                    <div className="h-24 w-full bg-neutral-100" />
                )}

                <div className="p-6">
                    <div className="flex flex-wrap items-start gap-4">
                        <FirmAvatar owner={profile.owner} />
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-3">
                                <h1 className="text-2xl font-black text-neutral-900">
                                    {profile.firm_name ?? 'My Firm'}
                                </h1>
                                <span className="px-2.5 py-1 rounded-full bg-neutral-900 text-white text-[9px] font-black uppercase tracking-wider">
                                    {titleCase(profile.owner?.role_type)}
                                </span>
                                <span
                                    className={
                                        profile.firm_is_hiring
                                            ? 'px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-wider'
                                            : 'px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-500 text-[9px] font-black uppercase tracking-wider'
                                    }
                                >
                                    {profile.firm_is_hiring ? 'Hiring' : 'Not hiring'}
                                </span>
                            </div>
                            <p className="mt-1 text-sm text-neutral-500">
                                {profile.firm_slogan ?? '@' + (profile.owner?.username ?? '')}
                            </p>
                            {profile.firm_description && (
                                <p className="mt-3 text-sm leading-relaxed text-neutral-600 whitespace-pre-line">
                                    {profile.firm_description}
                                </p>
                            )}
                        </div>
                    </div>

                    {neededRoles.length > 0 && (
                        <p className="mt-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">
                            Needed roles: {neededRoles.map(titleCase).join(' · ')}
                        </p>
                    )}

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <div className="rounded-xl bg-neutral-50 border border-neutral-100 px-4 py-3">
                            <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Experience</p>
                            <p className="mt-1 text-sm font-black text-neutral-900">{stats.experience_years ?? 0} yrs</p>
                        </div>
                        <div className="rounded-xl bg-neutral-50 border border-neutral-100 px-4 py-3">
                            <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Base rate</p>
                            <p className="mt-1 text-sm font-black text-neutral-900">{formatIDR(stats.base_rate)}</p>
                        </div>
                        <div className="rounded-xl bg-neutral-50 border border-neutral-100 px-4 py-3">
                            <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Rating</p>
                            <p className="mt-1 text-sm font-black text-neutral-900">
                                {stats.average_rating ? `★ ${stats.average_rating}` : 'No reviews'}
                            </p>
                        </div>
                        <div className="rounded-xl bg-neutral-50 border border-neutral-100 px-4 py-3">
                            <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Members</p>
                            <p className="mt-1 text-sm font-black text-neutral-900">{stats.active_members_count ?? 0}</p>
                        </div>
                        <Link
                            href="/dashboard/my-firms"
                            className="rounded-xl bg-neutral-900 text-white px-4 py-3 text-[10px] font-black uppercase tracking-wider flex items-center justify-center hover:bg-neutral-700"
                        >
                            Firm list →
                        </Link>
                    </div>
                </div>
            </div>

            <FirmOwnerWorkspace profile={profile} error={error} />
        </div>
    );
}

export function FirmListPanel({
    memberships,
    invitations,
    browseFirms,
    viewedFirm,
    viewedFirmId,
    query,
    error,
}: {
    memberships: FirmMembership[];
    invitations: FirmMembership[];
    browseFirms: FirmBrowseRow[];
    viewedFirm?: FirmProfilePayload | null;
    viewedFirmId?: number | null;
    query?: string;
    error?: string;
}) {
    return (
        <div data-native-panel="my-firms" className="space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">My Firms</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        Squads you belong to, and invitations waiting for an answer.
                    </p>
                </div>
                <Link
                    href="/dashboard/explore"
                    className="px-3 py-1.5 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                >
                    Find squads
                </Link>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>
            )}

            <section>
                <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                    Active memberships · {memberships.length}
                </h2>
                {memberships.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-8 text-sm text-neutral-500">
                        You have not joined a firm yet. Browse squads and request to join one.
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {memberships.map((membership) => (
                            <article key={membership.id} className="bg-white rounded-2xl border border-neutral-200 p-5">
                                <div className="flex items-start gap-3">
                                    <FirmAvatar owner={membership.firm_owner} />
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-black text-neutral-900 truncate">
                                            {membership.firm_owner?.name ?? 'Firm'}
                                        </h3>
                                        <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mt-0.5">
                                            {titleCase(membership.firm_owner?.role_type)}
                                        </p>
                                    </div>
                                </div>
                                <p className="mt-3 text-xs text-neutral-600">
                                    Role:{' '}
                                    <span className="font-bold text-neutral-800">
                                        {titleCase(membership.role_in_firm)}
                                    </span>
                                </p>
                                {membership.firm_owner?.no_telp && (
                                    <p className="mt-1 text-[11px] text-neutral-500">
                                        {membership.firm_owner.no_telp}
                                    </p>
                                )}
                                <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                    Active{membership.accepted_at ? ` · ${membership.accepted_at.slice(0, 10)}` : ''}
                                </p>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <section>
                <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                    Invitations · {invitations.length}
                </h2>
                {invitations.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-8 text-sm text-neutral-500">
                        No pending invitations.
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {invitations.map((invitation) => (
                            <article key={invitation.id} className="bg-white rounded-2xl border border-neutral-200 p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3 min-w-0">
                                        <FirmAvatar owner={invitation.firm_owner} />
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-black text-neutral-900 truncate">
                                                {invitation.firm_owner?.name ?? 'Firm'}
                                            </h3>
                                            <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mt-0.5">
                                                {titleCase(invitation.role_in_firm)}
                                            </p>
                                        </div>
                                    </div>
                                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[9px] font-black uppercase tracking-wider">
                                        Invited
                                    </span>
                                </div>

                                <div className="mt-4 flex gap-2">
                                    <form action={respondToInvitation}>
                                        <input type="hidden" name="id" value={invitation.id} />
                                        <button
                                            type="submit"
                                            name="action"
                                            value="accept"
                                            className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                                        >
                                            Accept
                                        </button>
                                    </form>
                                    <form action={respondToInvitation}>
                                        <input type="hidden" name="id" value={invitation.id} />
                                        <button
                                            type="submit"
                                            name="action"
                                            value="decline"
                                            className="px-3 py-1.5 rounded-lg border border-neutral-200 text-[10px] font-black uppercase tracking-wider text-neutral-500 hover:text-neutral-900"
                                        >
                                            Decline
                                        </button>
                                    </form>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <FirmBrowsePanel
                firms={browseFirms}
                viewedFirm={viewedFirm}
                viewedFirmId={viewedFirmId}
                query={query}
            />
        </div>
    );
}

