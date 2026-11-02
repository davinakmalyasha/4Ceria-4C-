import Link from 'next/link';
import { FileText, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { titleCase } from '@/lib/format';
import { reviewProfessional } from '../actions';
import { AdminPageHeader, ErrorNote, hrefWith } from '@/components/admin/parts';
import type { ProfessionalsPayload, ProfessionalRow } from '@/components/admin/types';

const TABS: { key: string; label: string; dataKey: keyof ProfessionalsPayload }[] = [
    { key: 'arsitek', label: 'Architects', dataKey: 'arsiteks' },
    { key: 'kontraktor', label: 'Contractors', dataKey: 'kontraktors' },
    { key: 'civil', label: 'Civil', dataKey: 'civil_contractors' },
    { key: 'mechanical', label: 'Mechanical', dataKey: 'mechanical_contractors' },
    { key: 'electrical', label: 'Electrical', dataKey: 'electrical_contractors' },
    { key: 'plumbing', label: 'Plumbing', dataKey: 'plumbing_contractors' },
    { key: 'roofing', label: 'Roofing', dataKey: 'roofing_contractors' },
    { key: 'finishing', label: 'Finishing', dataKey: 'finishing_contractors' },
    { key: 'project_manager', label: 'PMs', dataKey: 'project_managers' },
    { key: 'notaris', label: 'Notaries', dataKey: 'notaries' },
    { key: 'interior', label: 'Designers', dataKey: 'interiors' },
    { key: 'structural', label: 'Structural', dataKey: 'structural_engineers' },
    { key: 'mep', label: 'MEP', dataKey: 'mep_engineers' },
    { key: 'supplier', label: 'Suppliers', dataKey: 'suppliers' },
    { key: 'logistics', label: 'Logistics', dataKey: 'logistics' },
];

const DOCUMENTS: { field: keyof ProfessionalRow; label: string }[] = [
    { field: 'foto', label: 'Profile photo / logo' },
    { field: 'file_portofolio', label: 'Portfolio document' },
    { field: 'file_sertifikat', label: 'Certificate / license' },
    { field: 'npwp', label: 'NPWP tax document' },
    { field: 'siup', label: 'SIUP business permit' },
];

const inputClass =
    'w-full rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-neutral-900';

function displayName(row: ProfessionalRow): string {
    return (
        row.nama_perusahaan ??
        row.store_name ??
        row.company_name ??
        row.nama ??
        row.user?.name ??
        `Profile #${row.id}`
    );
}

export default async function AdminVerificationPage({
    searchParams,
}: {
    searchParams: Promise<{ type?: string; error?: string }>;
}) {
    const { type, error } = await searchParams;
    const activeKey = TABS.some((tab) => tab.key === type) ? (type as string) : 'arsitek';
    const activeTab = TABS.find((tab) => tab.key === activeKey) ?? TABS[0];
    const professionals = await apiFetch<ProfessionalsPayload>('/admin/professionals');
    const rows = professionals[activeTab.dataKey] ?? [];

    return (
        <div className="space-y-6">
            <AdminPageHeader
                title="Credentials verification"
                description="Inspect uploaded certificates, NPWP tax IDs and SIUP permits, then approve or reject the profile."
            >
                <Link
                    href="/admin/verification/logs"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-wider text-neutral-800 hover:bg-neutral-50"
                >
                    <FileText size={12} /> History logs
                </Link>
            </AdminPageHeader>

            <ErrorNote error={error} />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8">
                {TABS.map((tab) => {
                    const count = (professionals[tab.dataKey] ?? []).length;
                    const active = tab.key === activeKey;

                    return (
                        <Link
                            key={tab.key}
                            href={hrefWith('/admin/verification', { type: tab.key })}
                            className={`flex min-h-[92px] flex-col items-center justify-between rounded-2xl border p-4 transition-all ${
                                active
                                    ? 'border-neutral-950 bg-neutral-950 text-white shadow-md'
                                    : 'border-neutral-200/60 bg-[#fafafa] text-neutral-500 hover:border-neutral-300'
                            }`}
                        >
                            <ShieldCheck size={18} className={active ? 'text-white' : 'text-neutral-400'} />
                            <span className="mt-2.5 text-center text-[10px] font-black uppercase leading-none tracking-wider">
                                {tab.label}
                            </span>
                            <span
                                className={`mt-2 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-tighter ${
                                    count > 0
                                        ? active
                                            ? 'border-white bg-white text-neutral-950'
                                            : 'border-red-100 bg-red-50 text-red-600'
                                        : active
                                          ? 'bg-neutral-800 text-neutral-400'
                                          : 'bg-neutral-100 text-neutral-400'
                                }`}
                            >
                                {count > 0 ? `${count} pending` : '0'}
                            </span>
                        </Link>
                    );
                })}
            </div>

            {rows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-10 text-center text-sm text-neutral-500">
                    No pending {activeTab.label.toLowerCase()} applications.
                </div>
            ) : (
                <div className="space-y-4">
                    {rows.map((row) => (
                        <article
                            key={`${activeTab.key}-${row.id}`}
                            data-native-verification-profile={row.id}
                            className="rounded-2xl border border-neutral-200 bg-white p-5"
                        >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-sm font-black text-neutral-900">{displayName(row)}</h2>
                                    <p className="mt-0.5 text-[11px] font-semibold text-neutral-500">
                                        {row.user?.name ?? '—'} · {row.user?.email ?? '—'}
                                    </p>
                                    <p className="mt-0.5 text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                        {[
                                            titleCase(row.entity_type ?? 'individual'),
                                            row.no_telp ?? row.no_telepon,
                                            row.vehicle_type,
                                            row.license_plate,
                                        ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </p>
                                </div>
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-amber-700">
                                    {titleCase(row.verification_status ?? 'pending')}
                                </span>
                            </div>

                            {(row.company_name || row.company_license || row.identity_number || row.npwp_number || row.siup_number) && (
                                <dl className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
                                    {row.company_name && (
                                        <div className="flex justify-between gap-2 rounded-lg bg-neutral-50 px-3 py-2">
                                            <dt className="text-neutral-500">Company</dt>
                                            <dd className="font-semibold text-neutral-800">{row.company_name}</dd>
                                        </div>
                                    )}
                                    {row.company_license && (
                                        <div className="flex justify-between gap-2 rounded-lg bg-neutral-50 px-3 py-2">
                                            <dt className="text-neutral-500">Company license</dt>
                                            <dd className="font-semibold text-neutral-800">{row.company_license}</dd>
                                        </div>
                                    )}
                                    {row.identity_number && (
                                        <div className="flex justify-between gap-2 rounded-lg bg-neutral-50 px-3 py-2">
                                            <dt className="text-neutral-500">Identity number</dt>
                                            <dd className="font-semibold text-neutral-800">{row.identity_number}</dd>
                                        </div>
                                    )}
                                    {row.npwp_number && (
                                        <div className="flex justify-between gap-2 rounded-lg bg-neutral-50 px-3 py-2">
                                            <dt className="text-neutral-500">NPWP number</dt>
                                            <dd className="font-semibold text-neutral-800">{row.npwp_number}</dd>
                                        </div>
                                    )}
                                    {row.siup_number && (
                                        <div className="flex justify-between gap-2 rounded-lg bg-neutral-50 px-3 py-2">
                                            <dt className="text-neutral-500">SIUP number</dt>
                                            <dd className="font-semibold text-neutral-800">{row.siup_number}</dd>
                                        </div>
                                    )}
                                </dl>
                            )}

                            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                                {DOCUMENTS.map((document) => {
                                    const path = row[document.field] as string | null | undefined;

                                    if (!path) {
                                        return (
                                            <div
                                                key={document.field}
                                                className="rounded-xl border border-dashed border-neutral-200 px-3 py-2 text-[10px] font-semibold text-neutral-300"
                                            >
                                                {document.label}: not uploaded
                                            </div>
                                        );
                                    }

                                    return (
                                        <a
                                            key={document.field}
                                            href={`/admin/documents/${activeTab.key}/${row.id}/${document.field}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-neutral-700 hover:border-neutral-400 hover:text-neutral-900"
                                        >
                                            {document.label} →
                                        </a>
                                    );
                                })}
                            </div>

                            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-neutral-100 pt-4">
                                <form action={reviewProfessional}>
                                    <input type="hidden" name="profile_id" value={row.id} />
                                    <input type="hidden" name="type" value={activeTab.key} />
                                    <input type="hidden" name="status" value="verified" />
                                    <button
                                        type="submit"
                                        className="rounded-xl bg-emerald-600 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-emerald-500"
                                    >
                                        Approve profile
                                    </button>
                                </form>

                                <details className="grow">
                                    <summary className="cursor-pointer rounded-xl border border-red-200 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-red-600 hover:bg-red-50">
                                        Reject profile
                                    </summary>
                                    <form action={reviewProfessional} className="mt-2 flex flex-wrap items-end gap-2">
                                        <input type="hidden" name="profile_id" value={row.id} />
                                        <input type="hidden" name="type" value={activeTab.key} />
                                        <input type="hidden" name="status" value="rejected" />
                                        <label className="grow">
                                            <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                                Rejection reason
                                            </span>
                                            <input
                                                name="reason"
                                                required
                                                maxLength={1000}
                                                placeholder="What is wrong with the submitted documents?"
                                                className={`mt-1 ${inputClass}`}
                                            />
                                        </label>
                                        <button
                                            type="submit"
                                            className="rounded-xl bg-red-600 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-red-500"
                                        >
                                            Confirm rejection
                                        </button>
                                    </form>
                                </details>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}
