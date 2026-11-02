'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Native verification submission form.
 *
 * Mirrors the legacy multipart payload (`entity_type`, company/identity fields
 * and the three document slots) and posts to the BFF, which attaches the
 * httpOnly token server-side. A successful submission moves the profile to
 * PENDING, so the route is refreshed to re-render the status card.
 */

const inputClass =
    'w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-semibold text-xs focus:border-neutral-900';

const fileClass =
    'block w-full text-xs text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-[10px] file:font-black file:uppercase file:tracking-wider file:text-white';

export function VerificationForm({
    name,
    email,
    username,
    initialEntityType,
    initialCompanyName,
    initialCompanyLicense,
    initialIdentityNumber,
    initialNpwpNumber,
    initialSiupNumber,
}: {
    name: string;
    email: string;
    username: string;
    initialEntityType: 'individual' | 'company';
    initialCompanyName: string;
    initialCompanyLicense: string;
    initialIdentityNumber: string;
    initialNpwpNumber: string;
    initialSiupNumber: string;
}) {
    const router = useRouter();
    const [entityType, setEntityType] = useState<'individual' | 'company'>(initialEntityType);
    const [companyName, setCompanyName] = useState(initialCompanyName);
    const [companyLicense, setCompanyLicense] = useState(initialCompanyLicense);
    const [identityNumber, setIdentityNumber] = useState(initialIdentityNumber);
    const [npwpNumber, setNpwpNumber] = useState(initialNpwpNumber);
    const [siupNumber, setSiupNumber] = useState(initialSiupNumber);
    const [foto, setFoto] = useState<File | null>(null);
    const [portfolio, setPortfolio] = useState<File | null>(null);
    const [certificate, setCertificate] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSubmitting(true);
        setError(null);
        setSuccess(false);

        const data = new FormData();
        data.set('name', name);
        data.set('email', email);
        data.set('username', username);
        data.set('entity_type', entityType);
        data.set('company_name', entityType === 'company' ? companyName : '');
        data.set('company_license', entityType === 'company' ? companyLicense : '');
        data.set('identity_number', entityType === 'individual' ? identityNumber : '');
        data.set('npwp_number', entityType === 'company' ? npwpNumber : '');
        data.set('siup_number', entityType === 'company' ? siupNumber : '');

        if (foto) {
            data.set('foto', foto);
        }
        if (entityType === 'individual') {
            if (portfolio) data.set('file_portofolio', portfolio);
            if (certificate) data.set('file_sertifikat', certificate);
        } else {
            if (portfolio) data.set('npwp', portfolio);
            if (certificate) data.set('siup', certificate);
        }

        try {
            const response = await fetch('/api/me/professional', { method: 'POST', body: data });

            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as
                    | { message?: string; errors?: Record<string, string[]> }
                    | null;
                const firstError = body?.errors ? Object.values(body.errors)[0]?.[0] : undefined;
                setError(firstError ?? body?.message ?? `The application could not be submitted (${response.status}).`);
                return;
            }

            setSuccess(true);
            setFoto(null);
            setPortfolio(null);
            setCertificate(null);
            router.refresh();
        } catch {
            setError('The application could not be submitted. Check your connection and try again.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-6">
            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">
                    {error}
                </div>
            )}
            {success && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">
                    Application submitted successfully. The admin team will review your details.
                </div>
            )}

            <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mb-2">
                    Are you verifying as an Individual or a Company?
                </p>
                <div className="grid grid-cols-2 gap-2 max-w-md rounded-xl bg-neutral-50 border border-neutral-100 p-1.5">
                    <button
                        type="button"
                        onClick={() => setEntityType('individual')}
                        className={
                            entityType === 'individual'
                                ? 'py-2.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider'
                                : 'py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-neutral-500 hover:text-neutral-900'
                        }
                    >
                        Individual Professional
                    </button>
                    <button
                        type="button"
                        onClick={() => setEntityType('company')}
                        className={
                            entityType === 'company'
                                ? 'py-2.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider'
                                : 'py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-neutral-500 hover:text-neutral-900'
                        }
                    >
                        Company / Studio
                    </button>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                {entityType === 'company' ? (
                    <>
                        <label className="block">
                            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                Registered Company Name
                            </span>
                            <input
                                value={companyName}
                                onChange={(event) => setCompanyName(event.target.value)}
                                required
                                className={`mt-1.5 ${inputClass}`}
                            />
                        </label>
                        <label className="block">
                            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                Company Registration / NIB License
                            </span>
                            <input
                                value={companyLicense}
                                onChange={(event) => setCompanyLicense(event.target.value)}
                                required
                                className={`mt-1.5 ${inputClass}`}
                            />
                        </label>
                        <label className="block">
                            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                NPWP (Tax ID) Number
                            </span>
                            <input
                                value={npwpNumber}
                                onChange={(event) => setNpwpNumber(event.target.value)}
                                className={`mt-1.5 ${inputClass}`}
                            />
                        </label>
                        <label className="block">
                            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                SIUP Number
                            </span>
                            <input
                                value={siupNumber}
                                onChange={(event) => setSiupNumber(event.target.value)}
                                className={`mt-1.5 ${inputClass}`}
                            />
                        </label>
                    </>
                ) : (
                    <label className="block sm:col-span-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                            National ID (KTP) or Professional License Number
                        </span>
                        <input
                            value={identityNumber}
                            onChange={(event) => setIdentityNumber(event.target.value)}
                            required
                            className={`mt-1.5 ${inputClass}`}
                        />
                    </label>
                )}
            </div>

            <div className="border-t border-neutral-100 pt-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    Required Document Uploads
                </p>

                <label className="block">
                    <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                        Profile Photo / Logo
                    </span>
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/jpg"
                        onChange={(event) => setFoto(event.target.files?.[0] ?? null)}
                        className={`mt-1.5 ${fileClass}`}
                    />
                </label>

                <label className="block">
                    <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                        {entityType === 'individual' ? 'KTP / Identity Document' : 'NPWP Tax Document'}
                    </span>
                    <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(event) => setPortfolio(event.target.files?.[0] ?? null)}
                        className={`mt-1.5 ${fileClass}`}
                    />
                </label>

                <label className="block">
                    <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                        {entityType === 'individual' ? 'Professional Certificate' : 'SIUP Business Permit'}
                    </span>
                    <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(event) => setCertificate(event.target.files?.[0] ?? null)}
                        className={`mt-1.5 ${fileClass}`}
                    />
                </label>
            </div>

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700 disabled:opacity-50"
                >
                    {submitting ? 'Submitting…' : 'Submit for verification'}
                </button>
            </div>
        </form>
    );
}
