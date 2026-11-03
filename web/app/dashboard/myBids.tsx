import Link from 'next/link';
import { formatIDR, titleCase } from '@/lib/format';

/**
 * Native "My Proposals" panel (dashboard `my-bids`).
 *
 * `GET /my-bids` returns every bid the signed-in professional submitted, each
 * with a trimmed `project` block (`id`, `title`, `status`) and its `role_type`.
 * The dashboard already fetched it on the server, so this panel only splits the
 * pipeline into proposals vs invitations and renders it — no client hook, no
 * second request.
 */

export interface MyBidRow {
    id: number;
    project_id?: number;
    role_type?: string | null;
    price?: string | null;
    price_max?: string | null;
    calculated_total?: string | null;
    fee_type?: string | null;
    proposal?: string | null;
    status?: string | null;
    is_recommended?: boolean;
    estimated_duration?: string | number | null;
    duration_unit?: string | null;
    created_at?: string | null;
    project?: { id?: number; title?: string; status?: string | null } | null;
}

function statusBadge(status: string | null | undefined): { label: string; className: string } {
    switch (status) {
        case 'accepted':
            return { label: 'Accepted', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
        case 'rejected':
            return { label: 'Rejected', className: 'bg-red-50 text-red-700 border-red-200' };
        case 'invited':
            return { label: 'Invited (Response Required)', className: 'bg-slate-50 text-slate-700 border-slate-200' };
        case 'shortlisted':
            return { label: 'Shortlisted', className: 'bg-sky-50 text-sky-700 border-sky-200' };
        case 'negotiating':
            return { label: 'Negotiating', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
        case 'contract_pending':
            return { label: 'Contract pending', className: 'bg-amber-50 text-amber-700 border-amber-200' };
        default:
            return { label: 'Pending Review', className: 'bg-amber-50 text-amber-700 border-amber-200' };
    }
}

function priceLabel(bid: MyBidRow): string {
    const priceMax = Number.parseFloat(bid.price_max ?? '0');

    if (bid.fee_type === 'percentage') {
        if (priceMax > 0) {
            return `${bid.price ?? '0'}% - ${bid.price_max}%`;
        }

        if (bid.calculated_total) {
            return formatIDR(bid.calculated_total);
        }

        return `${bid.price ?? '0'}%`;
    }

    if (priceMax > 0) {
        return `${formatIDR(bid.price)} - ${formatIDR(bid.price_max)}`;
    }

    return formatIDR(bid.price);
}

function BidCard({ bid }: { bid: MyBidRow }) {
    const badge = statusBadge(bid.status);
    const projectId = bid.project?.id ?? bid.project_id;
    const created = bid.created_at ? bid.created_at.slice(0, 10) : '';

    return (
        <article
            data-native-bid={bid.id}
            className="relative bg-white rounded-2xl border border-neutral-200 p-5 hover:border-neutral-300 transition-colors overflow-hidden"
        >
            <span className="absolute left-0 top-0 bottom-0 w-1 bg-neutral-900/10" aria-hidden />

            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-sm font-black text-neutral-900 leading-snug">
                        {projectId ? (
                            <Link href={`/projects/${projectId}`} className="hover:text-red-600">
                                {bid.project?.title ?? `Project #${projectId}`}
                            </Link>
                        ) : (
                            (bid.project?.title ?? 'Unknown project')
                        )}
                    </h3>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-neutral-400">
                        {[titleCase(bid.role_type), bid.project?.status ? titleCase(bid.project.status) : null]
                            .filter(Boolean)
                            .join(' · ')}
                    </p>
                </div>
                <span
                    className={`shrink-0 px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-wider ${badge.className}`}
                >
                    {badge.label}
                </span>
            </div>

            {bid.proposal && (
                <div className="mt-4 rounded-xl bg-neutral-50 border border-neutral-100 px-4 py-3">
                    <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Your proposal</p>
                    <p className="mt-1 text-xs leading-relaxed text-neutral-600 line-clamp-3 italic">
                        &ldquo;{bid.proposal}&rdquo;
                    </p>
                </div>
            )}

            <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                        {bid.fee_type === 'percentage' ? 'Estimated fee' : 'Offered price'}
                    </p>
                    <p className="mt-0.5 text-lg font-black text-neutral-900">{priceLabel(bid)}</p>
                </div>
                <div className="text-right text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    {bid.is_recommended && (
                        <span className="mr-2 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                            Recommended
                        </span>
                    )}
                    {bid.estimated_duration
                        ? `${bid.estimated_duration} ${bid.duration_unit ?? ''}`.trim()
                        : 'Duration not stated'}
                    {created ? ` · ${created}` : ''}
                </div>
            </div>

            {bid.status === 'invited' && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-600">
                        Response required — open the project to accept.
                    </p>
                    {projectId ? (
                        <Link
                            href={`/projects/${projectId}/interviews`}
                            className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                        >
                            Open invitation →
                        </Link>
                    ) : null}
                </div>
            )}
        </article>
    );
}

function BidSection({
    title,
    emptyTitle,
    emptyBody,
    rows,
}: {
    title: string;
    emptyTitle: string;
    emptyBody: string;
    rows: MyBidRow[];
}) {
    return (
        <section data-native-section={title}>
            <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                {title} ({rows.length})
            </h2>

            {rows.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-8">
                    <p className="text-sm font-black text-neutral-900">{emptyTitle}</p>
                    <p className="mt-1 text-xs text-neutral-500 max-w-md">{emptyBody}</p>
                </div>
            ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                    {rows.map((bid) => (
                        <BidCard key={bid.id} bid={bid} />
                    ))}
                </div>
            )}
        </section>
    );
}

export function MyBidsPanel({ bids }: { bids: MyBidRow[] }) {
    const proposals = bids.filter((bid) => bid.status !== 'invited');
    const invitations = bids.filter((bid) => bid.status === 'invited');

    return (
        <div data-native-panel="my-bids" className="space-y-8">
            <div>
                <h1 className="text-2xl font-black text-neutral-900">My Proposals</h1>
                <p className="text-sm text-neutral-500 mt-1">
                    Every bid you have submitted, and the invitations waiting for a reply.
                </p>
            </div>

            <BidSection
                title="Active proposals"
                emptyTitle="No active proposals"
                emptyBody="You have not submitted any bids yet. Explore open tenders to find your next project."
                rows={proposals}
            />

            <BidSection
                title="Invitations"
                emptyTitle="No invitations yet"
                emptyBody="You have not received any project invitations. Complete your profile to attract more clients."
                rows={invitations}
            />
        </div>
    );
}
