import type { ReactNode } from 'react';
import { formatIDR, titleCase } from '@/lib/format';
import { acceptDeliveryJob, updateDeliveryStatus } from './delivery-actions';

/**
 * Native delivery screens.
 *
 * `delivery-jobs` is the supplier's list (`GET /delivery-jobs`), `job-radar` is
 * the courier's pending list (`GET /logistics/available-jobs`) and
 * `my-deliveries` is the courier's assigned list (`GET /logistics/my-jobs`).
 * All three are fetched on the server; the only write here is claiming a radar
 * job, which is a server action calling the atomic accept endpoint.
 */

export interface DeliveryJobRow {
    id: number;
    quote_id?: number | null;
    order_id?: number | null;
    logistics_id?: number | null;
    status?: string | null;
    agreed_fee?: string | null;
    estimated_weight?: string | null;
    pickup_address?: string | null;
    dropoff_address?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    // Joined columns from the material quote / supplier / courier.
    delivery_address?: string | null;
    total_amount?: string | null;
    total_weight?: string | null;
    note?: string | null;
    driver_user_id?: number | null;
    driver_name?: string | null;
    driver_phone?: string | null;
    vehicle_type?: string | null;
    license_plate?: string | null;
    pickup_detail?: string | null;
    dropoff_detail?: string | null;
    pickup_lat?: string | null;
    pickup_lng?: string | null;
    dropoff_lat?: string | null;
    dropoff_lng?: string | null;
}

function statusClasses(status: string | null | undefined): string {
    switch (status) {
        case 'delivered':
            return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        case 'picked_up':
            return 'bg-sky-50 text-sky-700 border-sky-200';
        case 'accepted':
            return 'bg-indigo-50 text-indigo-700 border-indigo-200';
        case 'pending':
            return 'bg-amber-50 text-amber-700 border-amber-200';
        default:
            return 'bg-neutral-100 text-neutral-500 border-neutral-200';
    }
}

function JobBody({ job }: { job: DeliveryJobRow }) {
    return (
        <>
            <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Pickup</p>
                    <p className="mt-0.5 text-neutral-700">{job.pickup_address ?? 'Store address'}</p>
                    {job.pickup_detail && <p className="text-[10px] text-neutral-400">{job.pickup_detail}</p>}
                </div>
                <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Dropoff</p>
                    <p className="mt-0.5 text-neutral-700">
                        {job.dropoff_address ?? job.delivery_address ?? 'Job site'}
                    </p>
                    {job.dropoff_detail && <p className="text-[10px] text-neutral-400">{job.dropoff_detail}</p>}
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                <span>Fee: <span className="text-neutral-900">{formatIDR(job.agreed_fee)}</span></span>
                {job.estimated_weight && <span>Load: {job.estimated_weight}</span>}
                {job.total_weight && <span>Weight: {job.total_weight} kg</span>}
                {job.total_amount && <span>Quote: {formatIDR(job.total_amount)}</span>}
            </div>

            {job.note && (
                <p className="mt-3 text-[11px] text-neutral-600 bg-neutral-50 border border-neutral-100 rounded-lg px-3 py-2">
                    {job.note}
                </p>
            )}

            {job.driver_name && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wider text-neutral-500">
                    <span>Courier: {job.driver_name}</span>
                    {job.vehicle_type && <span>· {job.vehicle_type}</span>}
                    {job.license_plate && <span>· {job.license_plate}</span>}
                    {job.driver_phone && <span>· {job.driver_phone}</span>}
                </div>
            )}
        </>
    );
}

function JobShell({ job, children }: { job: DeliveryJobRow; children?: ReactNode }) {
    return (
        <article data-native-delivery-job={job.id} className="bg-white rounded-2xl border border-neutral-200 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                        JOB #{job.id}
                    </p>
                    <h2 className="mt-0.5 text-sm font-black text-neutral-900">
                        {job.delivery_address ?? job.dropoff_address ?? 'Delivery'}
                    </h2>
                </div>
                <span
                    className={`shrink-0 px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-wider ${statusClasses(job.status)}`}
                >
                    {titleCase(job.status)}
                </span>
            </div>
            <JobBody job={job} />
            {children}
        </article>
    );
}

function RoleNotice({ message }: { message: string }) {
    return (
        <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-8 text-sm text-neutral-500">
            {message}
        </div>
    );
}

export function DeliveryJobsPanel({
    jobs,
    role,
    error,
}: {
    jobs: DeliveryJobRow[];
    role: string;
    error?: string;
}) {
    return (
        <div data-native-panel="delivery-jobs" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">Delivery Jobs</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        Deliveries created from the quotes your store sent.
                    </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}
                </span>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>
            )}

            {role !== 'supplier' ? (
                <RoleNotice message="Delivery jobs are visible to supplier accounts only." />
            ) : jobs.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-10 text-center">
                    <h2 className="text-sm font-black text-neutral-900">No Active Deliveries</h2>
                    <p className="mt-1 text-xs text-neutral-500">
                        A delivery job appears when a quote is approved with shipping.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {jobs.map((job) => (
                        <JobShell key={job.id} job={job} />
                    ))}
                </div>
            )}
        </div>
    );
}

export function JobRadarPanel({
    jobs,
    role,
    error,
}: {
    jobs: DeliveryJobRow[];
    role: string;
    error?: string;
}) {
    return (
        <div data-native-panel="job-radar" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">Job Radar</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        Pending platform deliveries you can claim.
                    </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    {jobs.length} available
                </span>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>
            )}

            {role !== 'logistics' ? (
                <RoleNotice message="Job Radar is available to logistics accounts only." />
            ) : jobs.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-10 text-center">
                    <h2 className="text-sm font-black text-neutral-900">No Jobs Nearby</h2>
                    <p className="mt-1 text-xs text-neutral-500">
                        New platform deliveries appear here as soon as a supplier posts one.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {jobs.map((job) => (
                        <JobShell key={job.id} job={job}>
                            <form action={acceptDeliveryJob} className="mt-4">
                                <input type="hidden" name="id" value={job.id} />
                                <button
                                    type="submit"
                                    className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                                >
                                    Accept job
                                </button>
                            </form>
                        </JobShell>
                    ))}
                </div>
            )}
        </div>
    );
}

export function MyDeliveriesPanel({
    jobs,
    role,
    error,
}: {
    jobs: DeliveryJobRow[];
    role: string;
    error?: string;
}) {
    return (
        <div data-native-panel="my-deliveries" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">My Deliveries</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        Jobs assigned to you, from pickup to proof of delivery.
                    </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    {jobs.length} {jobs.length === 1 ? 'delivery' : 'deliveries'}
                </span>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>
            )}

            {role !== 'logistics' ? (
                <RoleNotice message="My Deliveries is available to logistics accounts only." />
            ) : jobs.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-10 text-center">
                    <h2 className="text-sm font-black text-neutral-900">No Active Deliveries</h2>
                    <p className="mt-1 text-xs text-neutral-500">
                        Claim a job from the radar and it appears here.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {jobs.map((job) => {
                        const nextStatus = job.status === 'accepted' ? 'picked_up' : job.status === 'picked_up' ? 'delivered' : null;

                        return (
                            <JobShell key={job.id} job={job}>
                                {nextStatus ? (
                                    <form action={updateDeliveryStatus} className="mt-4 flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3">
                                        <input type="hidden" name="job_id" value={job.id} />
                                        <input type="hidden" name="status" value={nextStatus} />
                                        <label className="block">
                                            <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                                Photo evidence (1-3)
                                            </span>
                                            <input
                                                type="file"
                                                name="photos"
                                                required
                                                multiple
                                                accept="image/jpeg,image/png,image/webp"
                                                className="mt-1 block text-xs text-neutral-600 file:mr-2 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-2 file:py-1.5 file:text-[9px] file:font-black file:uppercase file:tracking-wider file:text-white"
                                            />
                                        </label>
                                        <button
                                            type="submit"
                                            className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                                        >
                                            {nextStatus === 'picked_up' ? 'Confirm pickup' : 'Confirm delivery'}
                                        </button>
                                    </form>
                                ) : job.status === 'delivered' ? (
                                    <p className="mt-4 border-t border-neutral-100 pt-3 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                                        Delivered — evidence uploaded.
                                    </p>
                                ) : null}
                            </JobShell>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
