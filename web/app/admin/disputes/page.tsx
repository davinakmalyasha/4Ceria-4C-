import Link from 'next/link';
import { Gavel, Paperclip, Send } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatIDR, titleCase } from '@/lib/format';
import { actOnDispute, replyToDispute } from '../actions';
import { AdminPageHeader, ErrorNote, Pagination, hrefWith } from '@/components/admin/parts';
import { ConfirmSubmit } from '@/app/dashboard/confirmSubmit';
import type { DisputeRow, DisputesPayload } from '@/components/admin/types';

const STATUS_TABS = [
    { key: '', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'dismissed', label: 'Dismissed' },
    { key: 'withdrawn', label: 'Withdrawn' },
];

const STATUS_CLASS: Record<string, string> = {
    open: 'bg-red-100 text-red-600 border-red-200',
    resolved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dismissed: 'bg-slate-100 text-slate-600 border-slate-200',
    withdrawn: 'bg-amber-100 text-amber-700 border-amber-200',
};

const inputClass =
    'w-full rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-neutral-900';

export default async function AdminDisputesPage({
    searchParams,
}: {
    searchParams: Promise<{ status?: string; page?: string; dispute?: string; error?: string }>;
}) {
    const { status, page, dispute, error } = await searchParams;
    const currentPage = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);
    const selectedId = Number.parseInt(dispute ?? '', 10);

    if (Number.isInteger(selectedId) && selectedId > 0) {
        const response = await apiFetch<{ data: DisputeRow }>(`/admin/disputes/${selectedId}`);
        const row = response.data;
        const isOpen = row.status === 'open';

        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                    <Link
                        href={hrefWith('/admin/disputes', { status, page: currentPage })}
                        className="rounded-xl border border-neutral-200 bg-[#fafafa] px-3 py-2 text-[11px] font-bold text-neutral-600 hover:text-neutral-900"
                    >
                        ← Back to queue
                    </Link>
                    <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${STATUS_CLASS[row.status] ?? 'border-neutral-200 text-neutral-500'}`}
                    >
                        {row.status}
                    </span>
                </div>

                <ErrorNote error={error} />

                <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                    <div className="flex flex-wrap items-center gap-3">
                        <Gavel size={18} className="text-neutral-700" />
                        <h1 className="text-sm font-black uppercase tracking-widest text-neutral-900">
                            Dispute #{row.id} · {row.category}
                        </h1>
                        <span className="text-[11px] font-bold text-neutral-400">
                            Project: {row.project?.title ?? `#${row.project_id}`} ({row.project?.status ?? '—'})
                        </span>
                    </div>
                    <p className="mt-3 text-base font-extrabold text-neutral-900">{row.title}</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-neutral-700">{row.description}</p>
                    <div className="mt-3 flex flex-wrap gap-4 text-[11px] font-bold text-neutral-500">
                        <span>
                            Opened by {row.opened_by?.name ?? '—'}
                            {row.created_at ? ` · ${row.created_at.slice(0, 16).replace('T', ' ')}` : ''}
                        </span>
                        {row.disputed_amount != null && <span>Amount: {formatIDR(row.disputed_amount)}</span>}
                        {row.payment_type && (
                            <span>
                                Linked payment: {titleCase(row.payment_type)} #{row.payment_id}
                            </span>
                        )}
                        {row.resolution && (
                            <span>
                                Resolution: {row.resolution} by {row.resolver?.name ?? '—'}
                            </span>
                        )}
                    </div>
                    {row.resolution_notes && (
                        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                            {row.resolution_notes}
                        </p>
                    )}
                </div>

                <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Thread</h2>
                    <div className="space-y-3">
                        {(row.messages ?? []).length === 0 && (
                            <p className="text-xs italic text-neutral-400">No messages yet.</p>
                        )}
                        {(row.messages ?? []).map((message) => (
                            <div key={message.id} className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-black text-neutral-900">
                                        {message.user?.name ?? 'User'}
                                    </span>
                                    <span className="text-[10px] text-neutral-400">
                                        {message.created_at ? message.created_at.slice(0, 16).replace('T', ' ') : ''}
                                    </span>
                                </div>
                                <p className="mt-1 whitespace-pre-line text-sm text-neutral-700">{message.body}</p>
                                {message.evidence_path && (
                                    <a
                                        href={`/admin/evidence/${row.id}/${message.id}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mt-2 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-900"
                                    >
                                        <Paperclip size={11} /> {message.evidence_original_name ?? 'Evidence'}
                                    </a>
                                )}
                            </div>
                        ))}
                    </div>

                    {isOpen && (
                        <form action={replyToDispute} className="flex items-center gap-2 border-t border-neutral-100 pt-3">
                            <input type="hidden" name="dispute_id" value={row.id} />
                            <input
                                name="body"
                                required
                                maxLength={5000}
                                placeholder="Write an arbitration reply…"
                                className="flex-1 rounded-xl border border-neutral-200 px-4 py-2.5 text-xs outline-none focus:border-neutral-900"
                            />
                            <button
                                type="submit"
                                className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-950 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-neutral-900"
                            >
                                <Send size={12} /> Reply
                            </button>
                        </form>
                    )}
                </div>

                {isOpen && (
                    <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6">
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                            Arbitration actions
                        </h2>

                        <div className="grid gap-4 md:grid-cols-2">
                            <form action={actOnDispute} className="space-y-2 rounded-xl border border-neutral-100 p-4">
                                <input type="hidden" name="dispute_id" value={row.id} />
                                <input type="hidden" name="action" value="dismiss" />
                                <p className="text-xs font-black text-neutral-800">Dismiss</p>
                                <input name="notes" placeholder="Notes (optional)…" className={inputClass} />
                                <ConfirmSubmit message="Dismiss this dispute? Payments will be unfrozen and nothing moves.">
                                    Dismiss &amp; unfreeze
                                </ConfirmSubmit>
                            </form>

                            <form action={actOnDispute} className="space-y-2 rounded-xl border border-neutral-100 p-4">
                                <input type="hidden" name="dispute_id" value={row.id} />
                                <input type="hidden" name="action" value="release_payment" />
                                <p className="text-xs font-black text-neutral-800">Release payment</p>
                                {!row.payment_type && (
                                    <p className="text-[11px] font-bold text-amber-600">
                                        No linked payment on this dispute.
                                    </p>
                                )}
                                <input name="notes" placeholder="Notes (optional)…" className={inputClass} />
                                <ConfirmSubmit message="Release the linked payment (budget check, ledger, activation)?">
                                    Release &amp; mark paid
                                </ConfirmSubmit>
                            </form>

                            <form action={actOnDispute} className="space-y-2 rounded-xl border border-neutral-100 p-4">
                                <input type="hidden" name="dispute_id" value={row.id} />
                                <input type="hidden" name="action" value="record_refund" />
                                <p className="text-xs font-black text-neutral-800">Record refund</p>
                                <input
                                    name="amount"
                                    type="number"
                                    min={0}
                                    step="any"
                                    placeholder="Refund amount (Rp)"
                                    className={inputClass}
                                />
                                <input name="notes" placeholder="Notes (optional)…" className={inputClass} />
                                <ConfirmSubmit message="Record this refund in the budget ledger?">
                                    Record refund
                                </ConfirmSubmit>
                            </form>

                            <form
                                action={actOnDispute}
                                className="space-y-2 rounded-xl border border-red-100 bg-red-50/40 p-4"
                            >
                                <input type="hidden" name="dispute_id" value={row.id} />
                                <input type="hidden" name="action" value="terminate_project" />
                                <p className="text-xs font-black text-red-700">Terminate project</p>
                                <input name="notes" placeholder="Notes (optional)…" className={inputClass} />
                                <ConfirmSubmit message="Force-terminate this project? This cannot be undone.">
                                    Force terminate
                                </ConfirmSubmit>
                            </form>

                            <form
                                action={actOnDispute}
                                className="space-y-2 rounded-xl border border-neutral-100 p-4 md:col-span-2"
                            >
                                <input type="hidden" name="dispute_id" value={row.id} />
                                <input type="hidden" name="action" value="custom" />
                                <p className="text-xs font-black text-neutral-800">Custom resolution</p>
                                <textarea
                                    name="notes"
                                    required
                                    rows={2}
                                    maxLength={5000}
                                    placeholder="Resolution notes (required)…"
                                    className={inputClass}
                                />
                                <ConfirmSubmit message="Close this dispute with the custom resolution notes?">
                                    Close with custom resolution
                                </ConfirmSubmit>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    const payload = await apiFetch<DisputesPayload>(
        `/admin/disputes?page=${currentPage}${status ? `&status=${encodeURIComponent(status)}` : ''}`,
    );
    const rows = payload.data?.data ?? [];

    return (
        <div className="space-y-6">
            <AdminPageHeader
                title="Dispute center"
                description={`Arbitration queue · ${payload.open_count ?? 0} open dispute(s).`}
            />

            <ErrorNote error={error} />

            <div className="flex flex-wrap gap-2">
                {STATUS_TABS.map((tab) => {
                    const active = (status ?? '') === tab.key;

                    return (
                        <Link
                            key={tab.key || 'all'}
                            href={hrefWith('/admin/disputes', { status: tab.key })}
                            className={
                                active
                                    ? 'rounded-xl bg-neutral-950 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white'
                                    : 'rounded-xl border border-neutral-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-wider text-neutral-500 hover:text-neutral-900'
                            }
                        >
                            {tab.label}
                        </Link>
                    );
                })}
            </div>

            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                <table className="w-full border-collapse text-left">
                    <thead>
                        <tr className="border-b border-neutral-100 bg-neutral-50 text-[10px] font-black uppercase tracking-wider text-neutral-400">
                            <th className="px-6 py-3.5">Dispute</th>
                            <th className="px-6 py-3.5">Project</th>
                            <th className="px-6 py-3.5">Opened by</th>
                            <th className="px-6 py-3.5">Amount</th>
                            <th className="px-6 py-3.5">Status</th>
                            <th className="px-6 py-3.5 text-right">Opened</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 text-xs">
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center italic text-neutral-400">
                                    No disputes in this queue.
                                </td>
                            </tr>
                        ) : (
                            rows.map((row) => (
                                <tr key={row.id} className="hover:bg-neutral-50/50">
                                    <td className="px-6 py-4">
                                        <Link
                                            href={hrefWith('/admin/disputes', {
                                                dispute: row.id,
                                                status,
                                                page: currentPage,
                                            })}
                                            className="font-extrabold text-neutral-900 hover:text-red-600"
                                        >
                                            #{row.id} · {row.title}
                                        </Link>
                                        <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                                            {row.category}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-neutral-700">
                                        {row.project?.title ?? `#${row.project_id}`}
                                    </td>
                                    <td className="px-6 py-4 text-neutral-700">{row.opened_by?.name ?? '—'}</td>
                                    <td className="px-6 py-4 font-bold text-neutral-900">
                                        {row.disputed_amount != null ? formatIDR(row.disputed_amount) : '—'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span
                                            className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${STATUS_CLASS[row.status] ?? 'border-neutral-200 text-neutral-500'}`}
                                        >
                                            {row.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right text-neutral-500">
                                        {row.created_at ? row.created_at.slice(0, 10) : '—'}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                <Pagination
                    base="/admin/disputes"
                    page={payload.data?.current_page ?? 1}
                    lastPage={payload.data?.last_page ?? 1}
                    total={payload.data?.total ?? 0}
                    from={payload.data?.from}
                    to={payload.data?.to}
                    params={{ status }}
                />
            </div>
        </div>
    );
}
