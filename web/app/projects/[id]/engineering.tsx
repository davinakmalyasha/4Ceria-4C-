import { formatIDR, titleCase } from '@/lib/format';
import { requestEngineering, verifyEngineering } from './engineering-actions';
import { bidPriceLabel, type BidRow, type BidsPayload, type ProjectPayload } from './panels';

/**
 * Native engineering hub.
 *
 * Structural and MEP proposals come from `/projects/{id}/bids`; the specialist
 * request/verify forms write through `engineering-actions.ts`. Verification is
 * owner/PM only and flips the project's `requires_*` flag on approval.
 */

export interface EngineeringRequest {
    id: number;
    project_id?: number | null;
    type?: string | null;
    role_type?: string | null;
    title?: string | null;
    description?: string | null;
    amount?: string | null;
    status?: string | null;
    created_at?: string | null;
}

function requestStatusClasses(status: string | null | undefined): string {
    switch (status) {
        case 'authorized':
        case 'approved_unpaid':
        case 'approved':
            return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        case 'rejected':
            return 'bg-red-50 text-red-700 border-red-200';
        case 'pending_approval':
            return 'bg-amber-50 text-amber-700 border-amber-200';
        default:
            return 'bg-neutral-100 text-neutral-500 border-neutral-200';
    }
}

function BidCard({ bid }: { bid: BidRow }) {
    const name = bid.bidder?.name ?? bid.bidder?.user?.name ?? `Bid #${bid.id}`;

    return (
        <article className="bg-white rounded-2xl border border-neutral-200 p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-black text-neutral-900">{name}</h3>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                        {[bid.bidder?.spesialisasi ?? bid.bidder?.specialization, bid.bidder?.location ?? bid.bidder?.lokasi]
                            .filter(Boolean)
                            .join(' · ') || 'Engineering specialist'}
                    </p>
                </div>
                <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-neutral-100 text-neutral-600">
                    {titleCase(bid.status)}
                </span>
            </div>

            <div className="mt-4 flex items-baseline justify-between gap-3">
                <p className="text-lg font-black text-neutral-900">{bidPriceLabel(bid)}</p>
                {bid.is_recommended && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-wider">
                        Recommended
                    </span>
                )}
            </div>
            <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                {titleCase(bid.fee_type ?? 'fixed')}
            </p>

            {bid.proposal && (
                <p className="mt-3 text-xs leading-relaxed text-neutral-600 line-clamp-3">{bid.proposal}</p>
            )}

            <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex justify-between">
                    <dt className="text-neutral-500">License</dt>
                    <dd className="font-semibold text-neutral-700">{bid.license_number ?? '—'}</dd>
                </div>
                <div className="flex justify-between">
                    <dt className="text-neutral-500">Experience</dt>
                    <dd className="font-semibold text-neutral-700">
                        {bid.experience_years != null ? `${bid.experience_years} yrs` : '—'}
                    </dd>
                </div>
            </dl>

            {bid.technical_notes && (
                <p className="mt-3 text-[11px] text-neutral-500 bg-neutral-50 rounded-lg px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-[9px] text-neutral-400">Technical:</span>{' '}
                    {bid.technical_notes}
                </p>
            )}
            {bid.interview_notes && (
                <p className="mt-2 text-[11px] text-neutral-500 bg-neutral-50 rounded-lg px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-[9px] text-neutral-400">Interview:</span>{' '}
                    {bid.interview_notes}
                </p>
            )}

            <div className="mt-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                <span>
                    {bid.estimated_duration
                        ? `${bid.estimated_duration} ${bid.duration_unit ?? ''}`.trim()
                        : 'Duration not stated'}
                </span>
                <span>{bid.bidder?.average_rating ? `★ ${bid.bidder.average_rating}` : ''}</span>
            </div>
        </article>
    );
}

function EngineeringSection({
    title,
    assignedLabel,
    emptyLabel,
    assigned,
    bids,
}: {
    title: string;
    assignedLabel: string;
    emptyLabel: string;
    assigned: boolean;
    bids: BidRow[];
}) {
    return (
        <div>
            <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                    {title} · {bids.length}
                </h2>
                <span
                    className={
                        assigned
                            ? 'px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-wider'
                            : 'px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 text-[9px] font-black uppercase tracking-wider'
                    }
                >
                    {assigned ? 'Hired Specialist' : assignedLabel}
                </span>
            </div>

            {bids.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-6 text-sm text-neutral-500">
                    <p className="font-black text-neutral-900">{emptyLabel}</p>
                    <p className="mt-1">
                        Specialists appear here once they bid. Ask the lead professional to
                        request you first — the request creates the roster row that unlocks
                        recommending.
                    </p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {bids.map((bid) => (
                        <BidCard key={bid.id} bid={bid} />
                    ))}
                </div>
            )}
        </div>
    );
}

export function EngineeringPanel({
    projectId,
    project,
    bids,
    requests,
    canVerify,
    error,
}: {
    projectId: number;
    project: ProjectPayload;
    bids: BidsPayload;
    requests: EngineeringRequest[];
    canVerify: boolean;
    error?: string;
}) {
    const structural = (bids.bids_structural as BidRow[] | undefined) ?? [];
    const mep = (bids.bids_mep as BidRow[] | undefined) ?? [];
    const recommended = [...structural, ...mep].filter((bid) => bid.is_recommended).length;

    return (
        <section className="space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">Engineering Hub</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        Structural and MEP specialist proposals, requests and recommendations.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1 rounded-full bg-white border border-neutral-200 text-[10px] font-black uppercase tracking-wider text-neutral-500">
                        Structural: {structural.length}
                    </span>
                    <span className="px-3 py-1 rounded-full bg-white border border-neutral-200 text-[10px] font-black uppercase tracking-wider text-neutral-500">
                        MEP: {mep.length}
                    </span>
                    {recommended > 0 && (
                        <a
                            href="#recommended-specialists"
                            className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-100"
                        >
                            {recommended} recommended →
                        </a>
                    )}
                </div>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>
            )}

            <section className="bg-white rounded-2xl border border-neutral-200 p-5">
                <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                    Request a specialist
                </h2>
                <form action={requestEngineering} className="grid gap-3 sm:grid-cols-4">
                    <input type="hidden" name="project_id" value={projectId} />
                    <label className="block">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Role</span>
                        <select
                            name="role_type"
                            defaultValue="structural"
                            className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-neutral-900"
                        >
                            <option value="structural">Structural</option>
                            <option value="mep">MEP</option>
                            <option value="interior">Interior</option>
                        </select>
                    </label>
                    <label className="block sm:col-span-2">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                            Scope description
                        </span>
                        <input
                            name="description"
                            required
                            className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-neutral-900"
                        />
                    </label>
                    <label className="block">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                            Suggested fee
                        </span>
                        <input
                            name="suggested_fee"
                            inputMode="decimal"
                            className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-neutral-900"
                        />
                    </label>
                    <div className="sm:col-span-4 flex justify-end">
                        <button
                            type="submit"
                            className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                        >
                            Submit request
                        </button>
                    </div>
                </form>
            </section>

            <section>
                <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                    Specialist requests · {requests.length}
                </h2>
                {requests.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-6 text-sm text-neutral-500">
                        No specialist requests yet.
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {requests.map((request) => (
                            <article
                                key={request.id}
                                data-native-engineering-request={request.id}
                                className="bg-white rounded-2xl border border-neutral-200 p-5"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-black text-neutral-900">
                                            {request.title ?? `Request #${request.id}`}
                                        </h3>
                                        <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mt-0.5">
                                            {titleCase(request.role_type)}
                                        </p>
                                    </div>
                                    <span
                                        className={`shrink-0 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider ${requestStatusClasses(request.status)}`}
                                    >
                                        {titleCase(request.status)}
                                    </span>
                                </div>

                                {request.description && (
                                    <p className="mt-2 text-xs leading-relaxed text-neutral-600">{request.description}</p>
                                )}

                                <p className="mt-3 text-sm font-bold text-neutral-900">{formatIDR(request.amount)}</p>

                                {canVerify && request.status === 'pending_approval' && (
                                    <div className="mt-4 flex gap-2">
                                        <form action={verifyEngineering}>
                                            <input type="hidden" name="project_id" value={projectId} />
                                            <input type="hidden" name="addendum_id" value={request.id} />
                                            <input type="hidden" name="status" value="approved" />
                                            <button
                                                type="submit"
                                                className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                                            >
                                                Approve
                                            </button>
                                        </form>
                                        <form action={verifyEngineering}>
                                            <input type="hidden" name="project_id" value={projectId} />
                                            <input type="hidden" name="addendum_id" value={request.id} />
                                            <input type="hidden" name="status" value="rejected" />
                                            <button
                                                type="submit"
                                                className="px-3 py-1.5 rounded-lg border border-red-200 text-[10px] font-black uppercase tracking-wider text-red-600 hover:bg-red-50"
                                            >
                                                Reject
                                            </button>
                                        </form>
                                    </div>
                                )}
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <div className="space-y-8" id="recommended-specialists">
                <EngineeringSection
                    title="Structural Engineering"
                    assignedLabel="No structural specialist hired yet"
                    emptyLabel="No structural bids yet."
                    assigned={Boolean((project as { structural_id?: number | null }).structural_id)}
                    bids={structural}
                />
                <EngineeringSection
                    title="MEP Engineering"
                    assignedLabel="No MEP specialist hired yet"
                    emptyLabel="No MEP bids yet."
                    assigned={Boolean((project as { mep_id?: number | null }).mep_id)}
                    bids={mep}
                />
            </div>
        </section>
    );
}
