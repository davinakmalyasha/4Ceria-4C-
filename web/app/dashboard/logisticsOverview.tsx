import Link from 'next/link';
import { formatIDR, titleCase } from '@/lib/format';

/**
 * Native logistics overview.
 *
 * `GET /logistics/dashboard-stats` returns the courier's counters and the five
 * most recent jobs (their own + any pending). This replaces the last
 * role-specific legacy overview, so every dashboard tab now has a native panel.
 */

export interface LogisticsStats {
    available?: number;
    accepted?: number;
    completed?: number;
    totalEarnings?: number;
}

export interface LogisticsRecentJob {
    id: number;
    status?: string | null;
    pickup_address?: string | null;
    dropoff_address?: string | null;
    agreed_fee?: string | null;
    created_at?: string | null;
}

export function LogisticsOverviewPanel({
    name,
    stats,
    jobs,
    error,
}: {
    name?: string | null;
    stats: LogisticsStats;
    jobs: LogisticsRecentJob[];
    error?: string;
}) {
    const first = (name ?? '').trim().split(/\s+/)[0] || 'there';

    return (
        <div data-native-panel="logistics-overview" className="space-y-8">
            <div className="rounded-2xl bg-neutral-900 text-white p-6">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">Logistics</p>
                <h1 className="mt-2 text-2xl font-black">Welcome back, {first}</h1>
                <p className="mt-1 text-sm text-neutral-300">
                    Check available delivery jobs and keep your earnings moving.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                    <Link
                        href="/dashboard/job-radar"
                        className="px-4 py-2 rounded-xl bg-white text-neutral-900 text-[10px] font-black uppercase tracking-wider hover:bg-neutral-200"
                    >
                        Browse jobs
                    </Link>
                    <Link
                        href="/dashboard/my-deliveries"
                        className="px-4 py-2 rounded-xl border border-white/20 text-white text-[10px] font-black uppercase tracking-wider hover:bg-white/10"
                    >
                        My deliveries
                    </Link>
                </div>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="bg-white rounded-2xl border border-neutral-200 p-5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Available jobs</p>
                    <p className="mt-2 text-2xl font-black text-neutral-900">{stats.available ?? 0}</p>
                </div>
                <div className="bg-white rounded-2xl border border-neutral-200 p-5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Active deliveries</p>
                    <p className="mt-2 text-2xl font-black text-neutral-900">{stats.accepted ?? 0}</p>
                </div>
                <div className="bg-white rounded-2xl border border-neutral-200 p-5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Completed</p>
                    <p className="mt-2 text-2xl font-black text-neutral-900">{stats.completed ?? 0}</p>
                </div>
                <div className="bg-white rounded-2xl border border-neutral-200 p-5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Total earnings</p>
                    <p className="mt-2 text-2xl font-black text-emerald-600">{formatIDR(stats.totalEarnings ?? 0)}</p>
                </div>
            </div>

            <section>
                <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                    Recent jobs
                </h2>
                {jobs.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-8 text-sm text-neutral-500">
                        No delivery jobs yet. Check the radar for new work.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {jobs.map((job) => (
                            <article key={job.id} className="bg-white rounded-2xl border border-neutral-200 p-5">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                            Job #{job.id}
                                        </p>
                                        <p className="mt-1 text-sm font-semibold text-neutral-800">
                                            {job.pickup_address ?? 'Store'} → {job.dropoff_address ?? 'Job site'}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 text-[9px] font-black uppercase tracking-wider">
                                            {titleCase(job.status)}
                                        </span>
                                        <p className="mt-1 text-sm font-black text-neutral-900">
                                            {formatIDR(job.agreed_fee)}
                                        </p>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
