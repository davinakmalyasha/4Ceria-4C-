import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { formatIDR } from '@/lib/format';
import { toggleHouseSuspend } from '../actions';
import { AdminPageHeader, ErrorNote, Pagination } from '@/components/admin/parts';
import type { AdminHouseRow, Paginated } from '@/components/admin/types';

const inputClass =
    'rounded-xl border border-neutral-200 bg-[#fafafa] px-3.5 py-2 text-xs font-semibold text-neutral-700 outline-none focus:border-neutral-900 focus:bg-white';

export default async function AdminHousesPage({
    searchParams,
}: {
    searchParams: Promise<{ search?: string; page?: string; error?: string }>;
}) {
    const { search, page, error } = await searchParams;
    const currentPage = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);
    const params = new URLSearchParams({ page: String(currentPage) });

    if (search) params.set('search', search);

    const houses = await apiFetch<Paginated<AdminHouseRow>>(`/admin/houses?${params.toString()}`);

    return (
        <div className="space-y-6">
            <AdminPageHeader
                title="Properties moderation"
                description="Audit uploaded listings and suspend items that violate community standards."
            >
                <form method="get" action="/admin/houses" className="flex flex-wrap items-center gap-2">
                    <input
                        type="search"
                        name="search"
                        defaultValue={search ?? ''}
                        placeholder="Search by property or owner…"
                        className={`${inputClass} w-full sm:w-64`}
                    />
                    <button
                        type="submit"
                        className="rounded-xl bg-neutral-900 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-neutral-700"
                    >
                        Search
                    </button>
                    <Link
                        href="/admin/houses"
                        className="text-[10px] font-black uppercase tracking-wider text-neutral-400 hover:text-neutral-900"
                    >
                        Reset
                    </Link>
                </form>
            </AdminPageHeader>

            <ErrorNote error={error} />

            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead>
                            <tr className="border-b border-neutral-100 bg-neutral-50 text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                <th className="px-6 py-3.5">Property listing</th>
                                <th className="px-6 py-3.5">Owner</th>
                                <th className="px-6 py-3.5">Location</th>
                                <th className="px-6 py-3.5">Price</th>
                                <th className="px-6 py-3.5">Status</th>
                                <th className="px-6 py-3.5 text-right">Moderation</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 text-xs">
                            {(houses.data ?? []).length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center italic text-neutral-400">
                                        No property listings match these filters.
                                    </td>
                                </tr>
                            ) : (
                                (houses.data ?? []).map((house) => (
                                    <tr key={house.id} className="hover:bg-neutral-50/50">
                                        <td className="px-6 py-4">
                                            <div className="font-extrabold text-neutral-900">
                                                {house.name ?? `Listing #${house.id}`}
                                            </div>
                                            <div className="mt-0.5 text-[10px] font-semibold text-neutral-400">
                                                #{house.id}
                                                {house.created_at ? ` · ${house.created_at.slice(0, 10)}` : ''}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-neutral-700">{house.user?.name ?? '—'}</td>
                                        <td className="px-6 py-4 text-neutral-700">
                                            {[house.street_name, house.kab_kota].filter(Boolean).join(', ') || '—'}
                                        </td>
                                        <td className="px-6 py-4 font-bold text-neutral-900">
                                            {formatIDR(house.price)}
                                        </td>
                                        <td className="px-6 py-4">
                                            {house.is_suspended ? (
                                                <span className="inline-flex rounded-lg bg-neutral-950 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white">
                                                    Suspended
                                                </span>
                                            ) : (
                                                <span className="inline-flex rounded-lg border border-neutral-200 bg-neutral-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-neutral-800">
                                                    Active
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <form action={toggleHouseSuspend}>
                                                <input type="hidden" name="house_id" value={house.id} />
                                                <button
                                                    type="submit"
                                                    className={`rounded-xl px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${
                                                        house.is_suspended
                                                            ? 'border border-neutral-300 bg-neutral-100 text-neutral-800'
                                                            : 'bg-neutral-950 text-white hover:bg-neutral-900'
                                                    }`}
                                                >
                                                    {house.is_suspended ? 'Reactivate listing' : 'Suspend listing'}
                                                </button>
                                            </form>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <Pagination
                    base="/admin/houses"
                    page={houses.current_page}
                    lastPage={houses.last_page}
                    total={houses.total}
                    from={houses.from}
                    to={houses.to}
                    params={{ search }}
                />
            </div>
        </div>
    );
}
