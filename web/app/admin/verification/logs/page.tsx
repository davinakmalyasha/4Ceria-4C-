import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { AdminPageHeader, Pagination } from '@/components/admin/parts';
import type { HistoryRow, Paginated } from '@/components/admin/types';

function badge(status: string) {
    return status === 'verified' ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">
            <Check size={10} strokeWidth={3} /> Verified
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 rounded-full border border-red-100 bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-red-700">
            <X size={10} strokeWidth={3} /> Rejected
        </span>
    );
}

export default async function AdminVerificationLogsPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string }>;
}) {
    const { page } = await searchParams;
    const currentPage = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);
    const history = await apiFetch<Paginated<HistoryRow>>(`/admin/professionals/history?page=${currentPage}`);

    return (
        <div className="space-y-6">
            <AdminPageHeader
                title="Verification history"
                description="Every approved or rejected professional profile, newest first."
            >
                <Link
                    href="/admin/verification"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-wider text-neutral-800 hover:bg-neutral-50"
                >
                    ← Back to queue
                </Link>
            </AdminPageHeader>

            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                <table className="w-full border-collapse text-left">
                    <thead>
                        <tr className="border-b border-neutral-100 bg-neutral-50 text-[10px] font-black uppercase tracking-wider text-neutral-400">
                            <th className="px-6 py-3.5">Professional / store</th>
                            <th className="px-6 py-3.5">Role</th>
                            <th className="px-6 py-3.5">Status</th>
                            <th className="px-6 py-3.5">Details / reason</th>
                            <th className="px-6 py-3.5 text-right">Moderated at</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 text-xs">
                        {(history.data ?? []).length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center italic text-neutral-400">
                                    No verification history recorded yet.
                                </td>
                            </tr>
                        ) : (
                            (history.data ?? []).map((row, index) => {
                                const initials = (row.name ?? '?')
                                    .split(' ')
                                    .filter(Boolean)
                                    .map((part) => part[0])
                                    .join('')
                                    .toUpperCase()
                                    .slice(0, 2);

                                return (
                                    <tr key={`${row.type}-${row.id}-${index}`} className="hover:bg-neutral-50/50">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-600">
                                                    {initials}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-neutral-900">{row.name}</p>
                                                    <p className="text-[11px] text-neutral-500">{row.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-semibold text-neutral-700">{row.role_label}</td>
                                        <td className="px-6 py-4">{badge(row.status)}</td>
                                        <td className="px-6 py-4">
                                            {row.status === 'rejected' ? (
                                                <span className="text-xs font-semibold italic text-red-600">
                                                    &ldquo;{row.rejection_reason || 'No reason provided.'}&rdquo;
                                                </span>
                                            ) : (
                                                <span className="text-xs font-medium text-neutral-400">
                                                    Account verified successfully
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right text-neutral-500">
                                            {row.audited_at ? row.audited_at.slice(0, 16).replace('T', ' ') : '—'}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>

                <Pagination
                    base="/admin/verification/logs"
                    page={history.current_page}
                    lastPage={history.last_page}
                    total={history.total}
                    from={history.from}
                    to={history.to}
                    params={{}}
                />
            </div>
        </div>
    );
}
