import Link from 'next/link';
import { assetUrl } from '@/lib/assets';
import { formatIDR, titleCase } from '@/lib/format';
import { ConfirmSubmit } from './confirmSubmit';
import {
    cancelFirmInvitation,
    deletePortfolio,
    removeFirmMember,
    requestJoinFirm,
    respondFirmMember,
    savePortfolio,
    updateFirmProfile,
} from './firm-actions';
import type { FirmMembership, FirmProfilePayload } from './firms';
import { CoverImage } from '@/components/CoverImage';

/**
 * Native firm workspace.
 *
 * Replaces the synced `FirmSquadProfile` and `SpecialistFirmHub`. The owner's
 * screen renders the editable squad profile (text, banner/logo, recruitment
 * postings), the roster with its accept/decline/cancel/remove decisions, and
 * portfolio CRUD. The specialist's screen renders the firm directory, a
 * read-only firm profile and the request-to-join form. Every write is a server
 * action against the same endpoints the legacy hubs called.
 */

export interface FirmJob {
    id?: string;
    role?: string;
    title?: string;
    description?: string;
    budget?: string;
    duration?: string;
}

export interface PortfolioRow {
    id: number;
    user_id?: number;
    role_type?: string | null;
    title?: string | null;
    description?: string | null;
    duration?: string | null;
    client_review?: string | null;
    image_path?: string | null;
    created_at?: string | null;
}

export interface FirmMemberUser {
    id: number;
    name?: string | null;
    role_type?: string | null;
    pic?: string | null;
    no_telp?: string | null;
    verification_status?: string | null;
    rate_harga?: number | string | null;
    pengalaman_tahun?: number | null;
    deskripsi?: string | null;
    lokasi?: string | null;
}

export interface FirmMemberRow {
    id: number;
    firm_owner_id?: number;
    member_user_id?: number;
    role_in_firm?: string | null;
    status?: string | null;
    invited_at?: string | null;
    accepted_at?: string | null;
    requested_at?: string | null;
    member?: FirmMemberUser | null;
}

export interface FirmBrowseRow {
    id: number;
    name?: string | null;
    role_type?: string | null;
    pic?: string | null;
    firm_name?: string | null;
    firm_slogan?: string | null;
    firm_banner_url?: string | null;
    firm_description?: string | null;
    firm_is_hiring?: boolean;
    firm_needed_roles?: (string | FirmJob)[] | null;
    currentUserMembershipStatus?: string | null;
}

const inputClass =
    'mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-neutral-900';

const fileClass =
    'mt-1 block text-xs text-neutral-600 file:mr-2 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-2 file:py-1.5 file:text-[9px] file:font-black file:uppercase file:tracking-wider file:text-white';

function normalizeRoles(roles: (string | FirmJob)[] | null | undefined): {
    tags: string[];
    jobs: FirmJob[];
} {
    const tags: string[] = [];
    const jobs: FirmJob[] = [];

    for (const entry of roles ?? []) {
        if (typeof entry === 'string') {
            tags.push(entry);
        } else if (entry && typeof entry === 'object') {
            jobs.push(entry);
        }
    }

    return { tags, jobs };
}

function FirmAvatar({ name, pic, size = 'h-11 w-11' }: { name?: string | null; pic?: string | null; size?: string }) {
    const image = assetUrl(pic);

    return (
        <span
            className={`${size} shrink-0 rounded-xl bg-neutral-900 text-white text-sm font-black flex items-center justify-center overflow-hidden`}
        >
            {image ? (
                <CoverImage src={image} alt="" className="h-full" />
            ) : (
                (name ?? '?').trim().charAt(0).toUpperCase()
            )}
        </span>
    );
}

function ErrorNote({ error }: { error?: string }) {
    if (!error) {
        return null;
    }

    return <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>;
}

function MemberCard({
    row,
    action,
}: {
    row: FirmMemberRow;
    action: 'request' | 'active' | 'invited';
}) {
    const member = row.member;
    const role = titleCase(row.role_in_firm);

    return (
        <article data-native-firm-member={row.id} className="bg-white rounded-2xl border border-neutral-200 p-4">
            <div className="flex items-start gap-3">
                <FirmAvatar name={member?.name} pic={member?.pic} size="h-10 w-10" />
                <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-black text-neutral-900 truncate">{member?.name ?? 'Member'}</h3>
                    <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400 mt-0.5">
                        {[role, titleCase(member?.role_type)].filter(Boolean).join(' · ')}
                    </p>
                    {member?.lokasi && <p className="mt-1 text-[11px] text-neutral-500">{member.lokasi}</p>}
                    {member?.no_telp && <p className="text-[11px] text-neutral-400">{member.no_telp}</p>}
                </div>
                {member?.verification_status === 'verified' && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-wider">
                        Verified
                    </span>
                )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                <span>{formatIDR(member?.rate_harga ?? 0)}</span>
                <span>{member?.pengalaman_tahun ?? 0} yrs</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
                {action === 'request' ? (
                    <>
                        <form action={respondFirmMember}>
                            <input type="hidden" name="membership_id" value={row.id} />
                            <input type="hidden" name="action" value="accept" />
                            <button
                                type="submit"
                                className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                            >
                                Accept
                            </button>
                        </form>
                        <form action={respondFirmMember}>
                            <input type="hidden" name="membership_id" value={row.id} />
                            <input type="hidden" name="action" value="decline" />
                            <button
                                type="submit"
                                className="px-3 py-1.5 rounded-lg border border-red-200 text-[10px] font-black uppercase tracking-wider text-red-600 hover:bg-red-50"
                            >
                                Decline
                            </button>
                        </form>
                    </>
                ) : action === 'active' ? (
                    <form action={removeFirmMember}>
                        <input type="hidden" name="membership_id" value={row.id} />
                        <ConfirmSubmit message={`Remove ${member?.name ?? 'this member'} from the squad?`}>
                            Remove from squad
                        </ConfirmSubmit>
                    </form>
                ) : (
                    <form action={cancelFirmInvitation}>
                        <input type="hidden" name="membership_id" value={row.id} />
                        <button
                            type="submit"
                            className="px-3 py-1.5 rounded-lg border border-neutral-200 text-[10px] font-black uppercase tracking-wider text-neutral-600 hover:text-neutral-900"
                        >
                            Cancel invitation
                        </button>
                    </form>
                )}
            </div>
        </article>
    );
}

function RosterColumn({
    title,
    rows,
    action,
    empty,
}: {
    title: string;
    rows: FirmMemberRow[];
    action: 'request' | 'active' | 'invited';
    empty: string;
}) {
    return (
        <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                {title} · {rows.length}
            </h3>
            {rows.length === 0 ? (
                <p className="text-xs text-neutral-500">{empty}</p>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {rows.map((row) => (
                        <MemberCard key={row.id} row={row} action={action} />
                    ))}
                </div>
            )}
        </section>
    );
}

function PortfolioCard({ portfolio, editable }: { portfolio: PortfolioRow; editable: boolean }) {
    const image = assetUrl(portfolio.image_path);

    return (
        <article className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
            {image ? (
                <CoverImage src={image} alt="" className="h-32" />
            ) : (
                <div className="h-32 w-full bg-neutral-100" />
            )}
            <div className="p-4">
                <h3 className="text-sm font-black text-neutral-900">{portfolio.title ?? 'Portfolio project'}</h3>
                <p className="mt-1 text-xs leading-relaxed text-neutral-600 line-clamp-3">{portfolio.description}</p>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    {portfolio.duration ?? 'Duration not stated'}
                </p>
                {portfolio.client_review && (
                    <p className="mt-2 text-[11px] italic text-neutral-500">&ldquo;{portfolio.client_review}&rdquo;</p>
                )}

                {editable && (
                    <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
                        <details>
                            <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-neutral-500 hover:text-neutral-900">
                                Edit project
                            </summary>
                            <form action={savePortfolio} className="mt-2 space-y-2">
                                <input type="hidden" name="portfolio_id" value={portfolio.id} />
                                <input name="title" required defaultValue={portfolio.title ?? ''} className={inputClass} />
                                <textarea name="description" required rows={2} defaultValue={portfolio.description ?? ''} className={inputClass} />
                                <input name="duration" defaultValue={portfolio.duration ?? ''} placeholder="Duration" className={inputClass} />
                                <input name="client_review" defaultValue={portfolio.client_review ?? ''} placeholder="Client review" className={inputClass} />
                                <input type="file" name="image" accept="image/jpeg,image/png,image/webp" className={fileClass} />
                                <button
                                    type="submit"
                                    className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                                >
                                    Save project
                                </button>
                            </form>
                        </details>

                        <form action={deletePortfolio}>
                            <input type="hidden" name="portfolio_id" value={portfolio.id} />
                            <ConfirmSubmit message="Delete this portfolio project?">Delete project</ConfirmSubmit>
                        </form>
                    </div>
                )}
            </div>
        </article>
    );
}

export function FirmOwnerWorkspace({ profile, error }: { profile: FirmProfilePayload; error?: string }) {
    const owner = profile.owner;
    const stats = profile.stats ?? {};
    const roster = (profile.roster ?? []) as FirmMemberRow[];
    const portfolios = (profile.portfolios ?? []) as PortfolioRow[];
    const { tags, jobs } = normalizeRoles(profile.firm_needed_roles);

    const requested = roster.filter((row) => row.status === 'requested');
    const active = roster.filter((row) => row.status === 'active');
    const invited = roster.filter((row) => row.status === 'invited');

    return (
        <div className="space-y-8">
            <ErrorNote error={error} />

            <section className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
                <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Squad profile</h2>

                <form action={updateFirmProfile} className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                            <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Firm name</span>
                            <input name="firm_name" defaultValue={profile.firm_name ?? ''} maxLength={100} className={inputClass} />
                        </label>
                        <label className="block">
                            <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Slogan</span>
                            <input name="firm_slogan" defaultValue={profile.firm_slogan ?? ''} maxLength={150} className={inputClass} />
                        </label>
                        <label className="block">
                            <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Base rate (Rp)</span>
                            <input name="base_rate" defaultValue={stats.base_rate ?? ''} inputMode="decimal" className={inputClass} />
                        </label>
                        <label className="block">
                            <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Experience (years)</span>
                            <input name="experience_years" defaultValue={stats.experience_years ?? ''} inputMode="numeric" className={inputClass} />
                        </label>
                        <label className="block sm:col-span-2">
                            <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Description</span>
                            <textarea name="firm_description" rows={3} defaultValue={profile.firm_description ?? ''} maxLength={1000} className={inputClass} />
                        </label>
                        <label className="block">
                            <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Banner</span>
                            <input type="file" name="firm_banner" accept="image/jpeg,image/png,image/webp" className={fileClass} />
                        </label>
                        <label className="block">
                            <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Logo</span>
                            <input type="file" name="firm_logo" accept="image/jpeg,image/png,image/webp" className={fileClass} />
                        </label>
                    </div>

                    <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-4 space-y-3">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                                Recruitment &amp; job board
                            </p>
                            <p className="mt-1 text-[11px] text-neutral-500">
                                A posting appears on your public firm card. Clear its title or tick Remove to delete it.
                            </p>
                        </div>

                        {tags.map((tag, index) => (
                            <input key={`tag-${index}`} type="hidden" name="role_tag" value={tag} />
                        ))}

                        {tags.length > 0 && (
                            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                Role tags: {tags.map(titleCase).join(' · ')}
                            </p>
                        )}

                        {[...jobs, { id: '', role: '', title: '', description: '', budget: '', duration: '' }].map(
                            (job, index) => (
                                <div key={`job-${job.id}-${index}`} className="rounded-xl border border-neutral-200 bg-white p-3 space-y-2">
                                    <input type="hidden" name="job_id" value={job.id ?? ''} />
                                    <div className="grid gap-2 sm:grid-cols-3">
                                        <input name="job_role" defaultValue={job.role ?? ''} placeholder="Target role" className={inputClass} />
                                        <input name="job_title" defaultValue={job.title ?? ''} placeholder="Job title" className={inputClass} />
                                        <input name="job_budget" defaultValue={job.budget ?? ''} placeholder="Budget" className={inputClass} />
                                        <input name="job_duration" defaultValue={job.duration ?? ''} placeholder="Duration" className={inputClass} />
                                        <input name="job_description" defaultValue={job.description ?? ''} placeholder="Scope of work" className={`${inputClass} sm:col-span-2`} />
                                    </div>
                                    {job.id && (
                                        <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                                            <input type="checkbox" name="delete_job_id" value={job.id} />
                                            Remove this posting
                                        </label>
                                    )}
                                </div>
                            ),
                        )}
                    </div>

                    <div className="flex justify-end">
                        <button
                            type="submit"
                            className="px-5 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                        >
                            Save firm profile
                        </button>
                    </div>
                </form>
            </section>

            <RosterColumn
                title="Join requests"
                rows={requested}
                action="request"
                empty="No specialist is waiting for an answer."
            />
            <RosterColumn title="Squad roster" rows={active} action="active" empty="No active members yet." />
            <RosterColumn
                title="Invitations sent"
                rows={invited}
                action="invited"
                empty="No outstanding invitations."
            />

            <section>
                <div className="flex items-baseline justify-between gap-3 mb-3">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                        Portfolio · {portfolios.length}
                    </h2>
                </div>

                {portfolios.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-6 text-sm text-neutral-500">
                        No portfolio projects yet.
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {portfolios.map((portfolio) => (
                            <PortfolioCard key={portfolio.id} portfolio={portfolio} editable />
                        ))}
                    </div>
                )}

                <details className="mt-4 bg-white rounded-2xl border border-neutral-200 p-5">
                    <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:text-neutral-900">
                        Add portfolio project
                    </summary>
                    <form action={savePortfolio} className="mt-4 grid gap-3 sm:grid-cols-2">
                        <input type="hidden" name="role_type" value={owner?.role_type ?? 'arsitek'} />
                        <label className="block sm:col-span-2">
                            <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Title</span>
                            <input name="title" required maxLength={255} className={inputClass} />
                        </label>
                        <label className="block sm:col-span-2">
                            <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Description</span>
                            <textarea name="description" required rows={3} className={inputClass} />
                        </label>
                        <label className="block">
                            <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Duration</span>
                            <input name="duration" className={inputClass} />
                        </label>
                        <label className="block">
                            <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Client review</span>
                            <input name="client_review" className={inputClass} />
                        </label>
                        <label className="block sm:col-span-2">
                            <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Cover image</span>
                            <input type="file" name="image" accept="image/jpeg,image/png,image/webp" className={fileClass} />
                        </label>
                        <div className="sm:col-span-2 flex justify-end">
                            <button
                                type="submit"
                                className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                            >
                                Add project
                            </button>
                        </div>
                    </form>
                </details>
            </section>
        </div>
    );
}

function FirmReadOnlyProfile({ firm, ownerId }: { firm: FirmProfilePayload; ownerId: number }) {
    const roster = ((firm.roster ?? []) as FirmMemberRow[]).filter((row) => row.status === 'active');
    const portfolios = (firm.portfolios ?? []) as PortfolioRow[];
    const stats = firm.stats ?? {};
    const banner = assetUrl(firm.firm_banner_url);

    return (
        <section data-native-firm-profile={ownerId} className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
            {banner ? (
                <CoverImage src={banner} alt="" className="h-36" />
            ) : (
                <div className="h-20 w-full bg-neutral-100" />
            )}
            <div className="p-5 space-y-4">
                <div className="flex flex-wrap items-start gap-4">
                    <FirmAvatar name={firm.owner?.name} pic={firm.owner?.pic} />
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-xl font-black text-neutral-900">{firm.firm_name ?? firm.owner?.name}</h2>
                            <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 text-[9px] font-black uppercase tracking-wider">
                                {titleCase(firm.owner?.role_type)}
                            </span>
                            {firm.firm_is_hiring && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-wider">
                                    Hiring
                                </span>
                            )}
                        </div>
                        <p className="mt-1 text-sm text-neutral-500">{firm.firm_slogan ?? `@${firm.owner?.username ?? ''}`}</p>
                        {firm.firm_description && (
                            <p className="mt-2 text-sm leading-relaxed text-neutral-600 whitespace-pre-line">
                                {firm.firm_description}
                            </p>
                        )}
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
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
                        <p className="mt-1 text-sm font-black text-neutral-900">{stats.active_members_count ?? roster.length}</p>
                    </div>
                </div>

                <div>
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">
                        Squad roster · {roster.length}
                    </h3>
                    {roster.length === 0 ? (
                        <p className="text-xs text-neutral-500">No active members yet.</p>
                    ) : (
                        <ul className="space-y-2">
                            {roster.map((row) => (
                                <li key={row.id} className="flex items-center gap-3 rounded-xl border border-neutral-100 px-3 py-2">
                                    <FirmAvatar name={row.member?.name} pic={row.member?.pic} size="h-8 w-8" />
                                    <div className="min-w-0">
                                        <p className="text-xs font-black text-neutral-900 truncate">{row.member?.name}</p>
                                        <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                            {titleCase(row.role_in_firm)}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {portfolios.length > 0 && (
                    <div>
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">
                            Portfolio · {portfolios.length}
                        </h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {portfolios.slice(0, 4).map((portfolio) => (
                                <PortfolioCard key={portfolio.id} portfolio={portfolio} editable={false} />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}

function membershipBadge(status?: string | null): string | null {
    switch (status) {
        case 'active':
            return 'Member';
        case 'requested':
            return 'Request sent';
        case 'invited':
            return 'Invited';
        default:
            return null;
    }
}

export function FirmBrowsePanel({
    firms,
    viewedFirm,
    viewedFirmId,
    query,
    error,
}: {
    firms: FirmBrowseRow[];
    viewedFirm?: FirmProfilePayload | null;
    viewedFirmId?: number | null;
    query?: string;
    error?: string;
}) {
    return (
        <div className="space-y-8">
            <ErrorNote error={error} />

            {viewedFirm && viewedFirmId ? (
                <div className="space-y-3">
                    <Link
                        href="/dashboard/my-firms"
                        className="inline-flex text-[10px] font-black uppercase tracking-wider text-neutral-500 hover:text-neutral-900"
                    >
                        ← Back to firms
                    </Link>
                    <FirmReadOnlyProfile firm={viewedFirm} ownerId={viewedFirmId} />
                    <section className="bg-white rounded-2xl border border-neutral-200 p-5">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                            Request to join
                        </h3>
                        <form action={requestJoinFirm} className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="firm_owner_id" value={viewedFirmId} />
                            <label className="block">
                                <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Role</span>
                                <input name="role_in_firm" required placeholder="structural" className={`${inputClass} w-48`} />
                            </label>
                            <button
                                type="submit"
                                className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                            >
                                Send join request
                            </button>
                        </form>
                    </section>
                </div>
            ) : null}

            <section>
                <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                        Browse firms · {firms.length}
                    </h2>
                    <form method="get" action="/dashboard/my-firms" className="flex items-center gap-2">
                        <input
                            type="search"
                            name="q"
                            defaultValue={query ?? ''}
                            placeholder="Search by name or firm code"
                            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800 outline-none focus:border-neutral-900"
                        />
                        <button
                            type="submit"
                            className="px-3 py-2 rounded-xl border border-neutral-200 text-[10px] font-black uppercase tracking-wider text-neutral-600 hover:text-neutral-900"
                        >
                            Search
                        </button>
                    </form>
                </div>

                {firms.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-8 text-sm text-neutral-500">
                        No firms match this search. Hiring firms appear here by default.
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {firms.map((firm) => {
                            const { tags, jobs } = normalizeRoles(firm.firm_needed_roles);
                            const offered = [
                                ...tags,
                                ...jobs.map((job) => job.role ?? '').filter((role) => role !== ''),
                            ];
                            const badge = membershipBadge(firm.currentUserMembershipStatus);

                            return (
                                <article key={firm.id} data-native-firm={firm.id} className="bg-white rounded-2xl border border-neutral-200 p-5">
                                    <div className="flex items-start gap-3">
                                        <FirmAvatar name={firm.firm_name ?? firm.name} pic={firm.pic} size="h-10 w-10" />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <h3 className="text-sm font-black text-neutral-900 truncate">
                                                    {firm.firm_name ?? firm.name ?? `Firm #${firm.id}`}
                                                </h3>
                                                {badge && (
                                                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-wider">
                                                        {badge}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mt-0.5">
                                                {titleCase(firm.role_type)}
                                            </p>
                                        </div>
                                    </div>

                                    {(firm.firm_slogan || firm.firm_description) && (
                                        <p className="mt-3 text-xs leading-relaxed text-neutral-600 line-clamp-3">
                                            {firm.firm_slogan ?? firm.firm_description}
                                        </p>
                                    )}

                                    {jobs.length > 0 && (
                                        <ul className="mt-2 space-y-1">
                                            {jobs.map((job, index) => (
                                                <li
                                                    key={`${firm.id}-job-${index}`}
                                                    className="text-[11px] font-semibold text-neutral-600"
                                                >
                                                    {job.title}
                                                    {job.budget ? ` · ${job.budget}` : ''}
                                                    {job.duration ? ` · ${job.duration}` : ''}
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    {offered.length > 0 && (
                                        <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                            Seeking: {offered.map(titleCase).join(' · ')}
                                        </p>
                                    )}

                                    <Link
                                        href={`/dashboard/my-firms?firm=${firm.id}`}
                                        className="mt-3 inline-flex text-[10px] font-black uppercase tracking-wider text-neutral-900 hover:text-red-600"
                                    >
                                        View profile →
                                    </Link>

                                    {!badge && (
                                        <form action={requestJoinFirm} className="mt-3 flex items-end gap-2 border-t border-neutral-100 pt-3">
                                            <input type="hidden" name="firm_owner_id" value={firm.id} />
                                            <input
                                                name="role_in_firm"
                                                required
                                                list={`roles-${firm.id}`}
                                                placeholder="Role"
                                                className={`${inputClass} w-full`}
                                            />
                                            <datalist id={`roles-${firm.id}`}>
                                                {offered.map((role) => (
                                                    <option key={role} value={role} />
                                                ))}
                                            </datalist>
                                            <button
                                                type="submit"
                                                className="shrink-0 px-3 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                                            >
                                                Request
                                            </button>
                                        </form>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
