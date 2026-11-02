import { formatIDR, titleCase } from '@/lib/format';
import { ConfirmSubmit } from '@/app/dashboard/confirmSubmit';
import { acceptBid, declineBid, recommendSpecialist, shortlistBid } from './interviews-actions';
import type { BidRow, BidsPayload, ProjectPayload } from './panels';

/**
 * Native interviews panel with the hiring decisions.
 *
 * IMPORTANT PAYLOAD SHAPE: a bid entry does NOT carry `arsitek_id` (or
 * `kontraktor_id`, `structural_id`, …). The professional PROFILE id is
 * `bidder.id`; `bidder.user.id` is the user. The first version of this panel
 * read the missing columns, which made a filled role look unfilled and then
 * hid the accepted candidate entirely. Role identity now comes from which
 * `bids_*` array the row arrived in.
 */

const ACTIVE_STATUSES = new Set(['shortlisted', 'invited', 'negotiating', 'contract_pending']);
const SHORTLISTABLE = new Set(['pending', 'reviewed', 'invited', 'negotiating']);

export interface SubProfessionalRow {
    id: number;
    user_id?: number | null;
    sub_role?: string | null;
    status?: string | null;
    suggested_fee?: string | null;
    lead_pro_notes?: string | null;
}

interface Candidate {
    bid: BidRow;
    bidType: string;
    roleLabel: string;
}

function candidates(project: ProjectPayload, bids: BidsPayload): Candidate[] {
    const roles: {
        bidType: string;
        label: string;
        rows: BidRow[];
        selected?: number | null;
    }[] = [
        {
            bidType: 'arsitek',
            label: 'Architect',
            rows: (bids.bids_arsitek as BidRow[] | undefined) ?? [],
            selected: (project as { selected_arsitek_id?: number | null }).selected_arsitek_id,
        },
        {
            bidType: 'kontraktor',
            label: 'Contractor',
            rows: (bids.bids_kontraktor as BidRow[] | undefined) ?? [],
            selected: (project as { selected_kontraktor_id?: number | null }).selected_kontraktor_id,
        },
        {
            bidType: 'notaris',
            label: 'Notary',
            rows: (bids.bids_notaris as BidRow[] | undefined) ?? [],
            selected: (project as { selected_notaris_id?: number | null }).selected_notaris_id,
        },
        {
            bidType: 'interior',
            label: 'Interior Designer',
            rows: (bids.bids_interior as BidRow[] | undefined) ?? [],
            selected: (project as { selected_interior_id?: number | null }).selected_interior_id,
        },
        {
            bidType: 'project_manager',
            label: 'Project Manager',
            rows: (bids.bids_project_manager as BidRow[] | undefined) ?? [],
            selected: (project as { pm_id?: number | null }).pm_id,
        },
        {
            bidType: 'structural',
            label: 'Structural Engineer',
            rows: (bids.bids_structural as BidRow[] | undefined) ?? [],
            selected: (project as { structural_id?: number | null }).structural_id,
        },
        {
            bidType: 'mep',
            label: 'MEP Specialist',
            rows: (bids.bids_mep as BidRow[] | undefined) ?? [],
            selected: (project as { mep_id?: number | null }).mep_id,
        },
    ];

    const out: Candidate[] = [];
    for (const role of roles) {
        for (const bid of role.rows) {
            if (!ACTIVE_STATUSES.has(bid.status ?? '')) {
                continue;
            }

            // `bidder.id` is the professional PROFILE id (the bid entry does
            // not expose `arsitek_id`/`structural_id`).
            const profile = bid.bidder?.id;
            const selected = role.selected;
            if (selected != null && Number(selected) !== Number(profile)) {
                continue;
            }

            out.push({ bid, bidType: role.bidType, roleLabel: role.label });
        }
    }

    return out;
}

export function InterviewsPanel({
    projectId,
    project,
    bids,
    canManage,
    canShortlistSpecialist,
    subs,
    error,
}: {
    projectId: number;
    project: ProjectPayload;
    bids: BidsPayload;
    viewerRole: string;
    canManage: boolean;
    canShortlistSpecialist: boolean;
    subs: SubProfessionalRow[];
    error?: string;
}) {
    const rows = candidates(project, bids);

    return (
        <section className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">Interviews</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        Candidates who moved past the open bidding stage. Shortlisted, invited and
                        negotiating proposals meet here.
                    </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    {rows.length} {rows.length === 1 ? 'candidate' : 'candidates'}
                </span>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>
            )}

            {rows.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-8 text-sm text-neutral-500">
                    No candidates in the interview stage yet. Shortlisting a proposal moves it here.
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {rows.map(({ bid, bidType, roleLabel }) => {
                        const isEngineering = bidType === 'structural' || bidType === 'mep';
                        const isPmBid = bidType === 'project_manager';
                        const status = bid.status ?? '';
                        const mayShortlist =
                            !isPmBid &&
                            SHORTLISTABLE.has(status) &&
                            (canManage || (isEngineering && canShortlistSpecialist));
                        const mayDecide = canManage;
                        const sub = isEngineering
                            ? subs.find(
                                  (candidate) =>
                                      candidate.user_id === bid.bidder?.user?.id &&
                                      candidate.sub_role === bidType,
                              )
                            : undefined;
                        const mayRecommend =
                            Boolean(sub) &&
                            sub?.status !== 'recommended' &&
                            isEngineering &&
                            (canManage || canShortlistSpecialist);

                        return (
                            <article
                                key={`${bidType}-${bid.id}`}
                                data-native-candidate={bid.id}
                                className="bg-white rounded-2xl border border-neutral-200 p-5 flex flex-col"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-black text-neutral-900">
                                            {bid.bidder?.name ?? bid.bidder?.user?.name ?? `Bid #${bid.id}`}
                                        </h3>
                                        <p className="text-[11px] text-neutral-500 mt-0.5">{roleLabel}</p>
                                    </div>
                                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-neutral-100 text-neutral-600">
                                        {titleCase(bid.status)}
                                    </span>
                                </div>

                                <div className="mt-4 flex items-baseline justify-between gap-3">
                                    <p className="text-lg font-black text-neutral-900">
                                        {formatIDR(bid.calculated_total ?? bid.price)}
                                    </p>
                                    {bid.is_recommended && (
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-wider">
                                            Recommended
                                        </span>
                                    )}
                                </div>

                                {bid.proposal && (
                                    <p className="mt-3 text-xs leading-relaxed text-neutral-600 line-clamp-3">
                                        {bid.proposal}
                                    </p>
                                )}

                                {bid.interview_notes && (
                                    <p className="mt-3 text-[11px] text-neutral-500 bg-neutral-50 rounded-lg px-3 py-2">
                                        <span className="font-black uppercase tracking-wider text-[9px] text-neutral-400">
                                            Interview:
                                        </span>{' '}
                                        {bid.interview_notes}
                                    </p>
                                )}

                                <div className="mt-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                    <span>
                                        {bid.estimated_duration
                                            ? `${bid.estimated_duration} ${bid.duration_unit ?? ''}`.trim()
                                            : 'Duration not stated'}
                                    </span>
                                    <span>{bid.bidder?.location ?? bid.bidder?.lokasi ?? ''}</span>
                                </div>

                                {(mayShortlist || mayDecide || mayRecommend) && (
                                    <div className="mt-auto pt-4 border-t border-neutral-100 space-y-2">
                                        <div className="flex flex-wrap gap-2">
                                            {mayShortlist && (
                                                <form action={shortlistBid}>
                                                    <input type="hidden" name="project_id" value={projectId} />
                                                    <input type="hidden" name="bid_id" value={bid.id} />
                                                    <input type="hidden" name="bid_type" value={bidType} />
                                                    <button
                                                        type="submit"
                                                        className="px-3 py-1.5 rounded-lg border border-neutral-200 text-[10px] font-black uppercase tracking-wider text-neutral-600 hover:text-neutral-900"
                                                    >
                                                        Shortlist
                                                    </button>
                                                </form>
                                            )}

                                            {mayDecide && status === 'shortlisted' && (
                                                <form action={acceptBid}>
                                                    <input type="hidden" name="project_id" value={projectId} />
                                                    <input type="hidden" name="bid_id" value={bid.id} />
                                                    <input type="hidden" name="bid_type" value={bidType} />
                                                    <ConfirmSubmit message="Hire this professional? This creates the contract for signature.">
                                                        Accept
                                                    </ConfirmSubmit>
                                                </form>
                                            )}

                                            {mayDecide && (status === 'pending' || status === 'shortlisted') && (
                                                <form action={declineBid}>
                                                    <input type="hidden" name="project_id" value={projectId} />
                                                    <input type="hidden" name="bid_id" value={bid.id} />
                                                    <input type="hidden" name="bid_type" value={bidType} />
                                                    <ConfirmSubmit message="Decline this professional?">
                                                        Decline
                                                    </ConfirmSubmit>
                                                </form>
                                            )}
                                        </div>

                                        {mayRecommend && sub && (
                                            <form action={recommendSpecialist} className="flex flex-wrap items-end gap-2 pt-1">
                                                <input type="hidden" name="project_id" value={projectId} />
                                                <input type="hidden" name="sub_id" value={sub.id} />
                                                <label className="block">
                                                    <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                                        Fee
                                                    </span>
                                                    <input
                                                        name="suggested_fee"
                                                        required
                                                        defaultValue={String(bid.calculated_total ?? bid.price ?? '0')}
                                                        inputMode="decimal"
                                                        className="mt-1 block w-28 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs text-neutral-800 outline-none focus:border-neutral-900"
                                                    />
                                                </label>
                                                <input
                                                    name="lead_pro_notes"
                                                    required
                                                    maxLength={2000}
                                                    placeholder="Recommendation notes"
                                                    className="rounded-lg border border-neutral-200 px-2 py-1.5 text-xs text-neutral-800 outline-none focus:border-neutral-900"
                                                />
                                                <button
                                                    type="submit"
                                                    className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                                                >
                                                    Recommend
                                                </button>
                                            </form>
                                        )}
                                    </div>
                                )}
                            </article>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
