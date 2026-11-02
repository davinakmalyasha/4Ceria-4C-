import Link from 'next/link';
import { Briefcase, Clock, Home, Users } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { changeUserRole, toggleUserSuspend } from './actions';
import { AdminPageHeader, ErrorNote, Pagination } from '@/components/admin/parts';
import type { AdminStats, AdminUserRow, Paginated } from '@/components/admin/types';

const ROLE_OPTIONS = [
    { value: 'user', label: 'Client' },
    { value: 'arsitek', label: 'Architect' },
    { value: 'kontraktor', label: 'Contractor' },
    { value: 'admin', label: 'System Admin' },
    { value: 'notaris', label: 'Notary' },
    { value: 'interior', label: 'Interior' },
    { value: 'project_manager', label: 'Project Manager' },
    { value: 'structural', label: 'Structural' },
    { value: 'mep', label: 'MEP' },
    { value: 'supplier', label: 'Supplier' },
    { value: 'logistics', label: 'Logistics' },
    { value: 'civil', label: 'Civil' },
    { value: 'mechanical', label: 'Mechanical' },
    { value: 'electrical', label: 'Electrical' },
    { value: 'plumbing', label: 'Plumbing' },
    { value: 'roofing', label: 'Roofing' },
    { value: 'finishing', label: 'Finishing' },
];

const inputClass =
    'rounded-xl border border-neutral-200 bg-[#fafafa] px-3.5 py-2 text-xs font-semibold text-neutral-700 outline-none focus:border-neutral-900 focus:bg-white';

export default async function AdminPage({
    searchParams,
}: {
    searchParams: Promise<{ search?: string; role?: string; page?: string; sort?: string; error?: string }>;
}) {
    const { search, role, page, sort, error } = await searchParams;
    const currentPage = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);
    const params = new URLSearchParams({ page: String(currentPage) });

    if (search) params.set('search', search);
    if (role) params.set('role', role);

    const [stats, users] = await Promise.all([
        apiFetch<AdminStats>('/admin/stats'),
        apiFetch<Paginated<AdminUserRow>>(`/admin/users?${params.toString()}`),
    ]);

    const rows = [...(users.data ?? [])].sort((a, b) =>
        sort === 'desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name),
    );

    const cards = [
        { title: 'Total registered users', value: stats.total_users, Icon: Users, alert: false },
        { title: 'Properties listed', value: stats.total_houses, Icon: Home, alert: false },
        { title: 'Active operations', value: stats.active_projects, Icon: Briefcase, alert: false },
        {
            title: 'Pending credentials verification',
            value: stats.pending_verifications,
            Icon: Clock,
            alert: (stats.pending_verifications ?? 0) > 0,
        },
    ];

    return (
        <div className="space-y-8">
            <AdminPageHeader
                title="Admin Dashboard"
                description="Platform counts, the role breakdown and the user directory."
            />

            <ErrorNote error={error} />

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                {cards.map((card) => (
                    <div
                        key={card.title}
                        className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-6"
                    >
                        <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                {card.title}
                            </p>
                            <div className="flex items-center gap-2">
                                <h3 className="text-3xl font-black tracking-tight text-neutral-900">{card.value}</h3>
                                {card.alert && <span className="h-2 w-2 rounded-full bg-neutral-950" />}
                            </div>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-100 bg-neutral-50 text-neutral-800">
                            <card.Icon size={20} />
                        </div>
                    </div>
                ))}
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                <h4 className="mb-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    Platform role breakdown
                </h4>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
                    {Object.entries(stats.role_distribution ?? {}).map(([key, count]) => (
                        <div key={key} className="rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-center">
                            <p className="truncate text-[9px] font-bold uppercase tracking-widest text-neutral-400">
                                {key.replace('_', ' ')}
                            </p>
                            <p className="mt-1 text-xl font-extrabold text-neutral-900">{count}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                <div className="flex flex-col gap-4 border-b border-neutral-100 p-6 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-900">
                            Platform user directory
                        </h3>
                        <p className="mt-0.5 text-[11px] font-semibold text-neutral-400">
                            Audit, suspend or change the role of any account.
                        </p>
                    </div>

                    <form method="get" action="/admin" className="flex flex-wrap items-center gap-2">
                        <input
                            type="search"
                            name="search"
                            defaultValue={search ?? ''}
                            placeholder="Search user…"
                            className={`${inputClass} w-full sm:w-52`}
                        />
                        <select name="role" defaultValue={role ?? ''} className={inputClass}>
                            <option value="">All roles</option>
                            {ROLE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                        <select name="sort" defaultValue={sort ?? 'asc'} className={inputClass}>
                            <option value="asc">A – Z</option>
                            <option value="desc">Z – A</option>
                        </select>
                        <button
                            type="submit"
                            className="rounded-xl bg-neutral-900 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-neutral-700"
                        >
                            Apply
                        </button>
                        <Link
                            href="/admin"
                            className="text-[10px] font-black uppercase tracking-wider text-neutral-400 hover:text-neutral-900"
                        >
                            Reset
                        </Link>
                    </form>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead>
                            <tr className="border-b border-neutral-100 bg-neutral-50 text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                <th className="px-6 py-3.5">Account info</th>
                                <th className="px-6 py-3.5">Assigned role</th>
                                <th className="px-6 py-3.5">Status</th>
                                <th className="px-6 py-3.5 text-right">Moderator controls</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 text-xs">
                            {rows.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center italic text-neutral-400">
                                        No user records match these filters.
                                    </td>
                                </tr>
                            ) : (
                                rows.map((row) => (
                                    <tr key={row.id} className="hover:bg-neutral-50/50">
                                        <td className="px-6 py-4">
                                            <div className="font-extrabold text-neutral-900">{row.name}</div>
                                            <div className="mt-0.5 text-[10px] font-semibold text-neutral-400">
                                                @{row.username} · {row.email}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <form action={changeUserRole} className="flex items-center gap-2">
                                                <input type="hidden" name="user_id" value={row.id} />
                                                <select
                                                    name="role_type"
                                                    defaultValue={row.role_type}
                                                    className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-bold text-neutral-700 outline-none focus:border-neutral-900"
                                                >
                                                    {ROLE_OPTIONS.map((option) => (
                                                        <option key={option.value} value={option.value}>
                                                            {option.label}
                                                        </option>
                                                    ))}
                                                </select>
                                                <button
                                                    type="submit"
                                                    className="rounded-lg border border-neutral-200 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-neutral-600 hover:text-neutral-900"
                                                >
                                                    Save
                                                </button>
                                            </form>
                                        </td>
                                        <td className="px-6 py-4">
                                            {row.is_suspended ? (
                                                <span className="inline-flex items-center gap-1 rounded-lg bg-neutral-950 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white">
                                                    Suspended
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-neutral-800">
                                                    Active
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <form action={toggleUserSuspend}>
                                                <input type="hidden" name="user_id" value={row.id} />
                                                <button
                                                    type="submit"
                                                    className={`rounded-xl px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${
                                                        row.is_suspended
                                                            ? 'border border-neutral-300 bg-neutral-100 text-neutral-800'
                                                            : 'bg-neutral-950 text-white hover:bg-neutral-900'
                                                    }`}
                                                >
                                                    {row.is_suspended ? 'Reactivate account' : 'Suspend account'}
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
                    base="/admin"
                    page={users.current_page}
                    lastPage={users.last_page}
                    total={users.total}
                    from={users.from}
                    to={users.to}
                    params={{ search, role, sort }}
                />
            </div>
        </div>
    );
}
