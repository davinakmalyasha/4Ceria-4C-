import Link from 'next/link';
import { BadgeCheck, FileText } from 'lucide-react';
import { formatIDR } from '@/lib/format';
import { submitBid } from '@/app/dashboard/bid-actions';
import { SubmitButton } from '@/app/dashboard/SubmitButton';

export interface MyProjectBid {
    id: number;
    status?: string | null;
    role_type?: string | null;
    price?: string | null;
    proposal?: string | null;
}

/**
 * The professional's proposal card on the project overview.
 *
 * Owners never see it. A professional without a bid gets the form; one with a
 * bid gets the current status and a link to the interview room.
 */
export function BidForm({
    projectId,
    bid,
    canBid,
    error,
    submitted,
}: {
    projectId: number;
    bid?: MyProjectBid | null;
    canBid: boolean;
    error?: string;
    submitted?: boolean;
}) {
    if (!canBid) return null;

    if (bid) {
        return (
            <section className="rounded-2xl border border-neutral-200 bg-white p-6">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-neutral-400">
                        <FileText className="h-4 w-4" /> Your proposal
                    </h2>
                    <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-neutral-600">
                        {(bid.status ?? 'pending').replaceAll('_', ' ')}
                    </span>
                </div>
                {bid.price && (
                    <p className="mt-4 text-2xl font-black tracking-tight text-neutral-900">
                        {formatIDR(bid.price)}
                    </p>
                )}
                {bid.proposal && (
                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-neutral-600">
                        {bid.proposal}
                    </p>
                )}
                <Link
                    href={`/projects/${projectId}/interviews`}
                    className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-neutral-800"
                >
                    Open interview room →
                </Link>
            </section>
        );
    }

    return (
        <section className="rounded-2xl border border-neutral-200 bg-white p-6">
            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-neutral-400">
                <BadgeCheck className="h-4 w-4 text-[#FD1D1D]" /> Submit a proposal
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-neutral-500">
                State the price, the time you need and what you will deliver. The owner sees this
                alongside every other bid.
            </p>

            {submitted && (
                <div role="status" className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    Proposal sent. The owner will review it and may invite you to an interview.
                </div>
            )}
            {error && (
                <div role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <form action={submitBid} className="mt-5 space-y-4">
                <input type="hidden" name="project_id" value={projectId} />

                <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                            Price (Rp)
                        </span>
                        <input
                            name="price"
                            inputMode="decimal"
                            required
                            placeholder="25000000"
                            className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none transition focus:border-[#FD1D1D]"
                        />
                    </label>
                    <label className="block">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                            Duration
                        </span>
                        <input
                            name="estimated_duration"
                            type="number"
                            min={1}
                            defaultValue={4}
                            required
                            className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none transition focus:border-[#FD1D1D]"
                        />
                    </label>
                    <label className="block">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                            Unit
                        </span>
                        <select
                            name="duration_unit"
                            defaultValue="weeks"
                            className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#FD1D1D]"
                        >
                            <option value="days">days</option>
                            <option value="weeks">weeks</option>
                            <option value="months">months</option>
                        </select>
                    </label>
                </div>

                <input type="hidden" name="fee_type" value="fixed" />

                <label className="block">
                    <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                        Proposal
                    </span>
                    <textarea
                        name="proposal"
                        required
                        rows={5}
                        maxLength={2000}
                        placeholder="Scope, deliverables, assumptions and what you need from the owner…"
                        className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm leading-relaxed outline-none transition focus:border-[#FD1D1D]"
                    />
                </label>

                <SubmitButton
                    pendingLabel="Sending proposal…"
                    className="rounded-xl bg-neutral-900 px-5 py-3 text-sm font-bold text-white hover:bg-neutral-800"
                >
                    Submit proposal
                </SubmitButton>
            </form>
        </section>
    );
}
