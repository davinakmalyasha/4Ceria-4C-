'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Native document upload.
 *
 * Posts `multipart/form-data` to the BFF (`/api/projects/{id}/documents`), so
 * the httpOnly token never reaches the browser. The route is refreshed on
 * success, and the new row renders in the server vault.
 */

const CATEGORIES = [
    'general',
    'blueprint',
    'permit',
    'contract',
    'invoice',
    'milestone_attachment',
    'legal_land',
    'legal_pbg',
    'legal_slf',
];

const TARGET_ROLES = [
    'general',
    'architect',
    'contractor',
    'notary',
    'interior',
    'pm',
    'structural',
    'mep',
    'civil',
    'mechanical',
    'electrical',
    'plumbing',
    'roofing',
    'finishing',
];

const inputClass =
    'w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-neutral-900';

export function DocumentUpload({ projectId }: { projectId: number }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSubmitting(true);
        setError(null);

        const form = event.currentTarget;
        const data = new FormData(form);

        try {
            const response = await fetch(`/api/projects/${projectId}/documents`, {
                method: 'POST',
                body: data,
            });

            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as
                    | { message?: string; errors?: Record<string, string[]> }
                    | null;
                const firstError = body?.errors ? Object.values(body.errors)[0]?.[0] : undefined;
                setError(firstError ?? body?.message ?? `The document could not be uploaded (${response.status}).`);
                return;
            }

            form.reset();
            setOpen(false);
            router.refresh();
        } catch {
            setError('The document could not be uploaded. Check your connection and try again.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <section className="bg-white rounded-2xl border border-neutral-200 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-sm font-black text-neutral-900">Upload a document</h2>
                    <p className="text-[11px] text-neutral-500">
                        PDF, Office files, images, DWG or ZIP up to 20 MB.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setOpen((value) => !value)}
                    className="px-3 py-1.5 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                >
                    {open ? 'Close' : 'Upload'}
                </button>
            </div>

            {open && (
                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                    {error && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">
                            {error}
                        </div>
                    )}

                    <label className="block">
                        <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                            File
                        </span>
                        <input
                            type="file"
                            name="file"
                            required
                            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls,.dwg,.zip"
                            className="mt-1.5 block w-full text-xs text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-[10px] file:font-black file:uppercase file:tracking-wider file:text-white"
                        />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block sm:col-span-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                Title (optional)
                            </span>
                            <input name="title" maxLength={255} className={`mt-1.5 ${inputClass}`} />
                        </label>

                        <label className="block">
                            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                Category
                            </span>
                            <select name="category" defaultValue="general" className={`mt-1.5 ${inputClass}`}>
                                {CATEGORIES.map((category) => (
                                    <option key={category} value={category}>
                                        {category}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="block">
                            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                Target role
                            </span>
                            <select name="target_role" defaultValue="general" className={`mt-1.5 ${inputClass}`}>
                                {TARGET_ROLES.map((role) => (
                                    <option key={role} value={role}>
                                        {role}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="block">
                            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                Version label (optional)
                            </span>
                            <input name="version_label" maxLength={50} className={`mt-1.5 ${inputClass}`} />
                        </label>

                        <label className="block sm:col-span-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                Description (optional)
                            </span>
                            <textarea name="description" rows={2} className={`mt-1.5 ${inputClass}`} />
                        </label>
                    </div>

                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700 disabled:opacity-50"
                        >
                            {submitting ? 'Uploading…' : 'Upload document'}
                        </button>
                    </div>
                </form>
            )}
        </section>
    );
}
