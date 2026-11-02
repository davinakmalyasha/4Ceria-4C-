'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * Native "Post a Project" form — the last synced dashboard tab.
 *
 * The legacy wizard walked the same fields across steps. This is a single-page
 * compose form that posts the SAME multipart payload to the BFF `/api/projects`
 * (so the token stays server-side) and opens the newly created project. The
 * wizard's easy/advanced branching only changed which questions were asked;
 * the resulting columns are the ones below.
 */

const PHASES: { key: string; label: string }[] = [
    { key: 'design', label: 'Design (architect)' },
    { key: 'build', label: 'Build (contractor)' },
    { key: 'legal', label: 'Legal (notary)' },
    { key: 'interior', label: 'Interior' },
];

const CATEGORIES = [
    { value: 'new_build', label: 'New build' },
    { value: 'renovation', label: 'Renovation' },
    { value: 'interior', label: 'Interior' },
    { value: 'maintenance', label: 'Maintenance' },
];

const inputClass =
    'w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-neutral-900';

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{label}</span>
            {hint && <span className="ml-2 text-[10px] text-neutral-400">{hint}</span>}
            <div className="mt-1.5">{children}</div>
        </label>
    );
}

export function PostProjectForm() {
    const router = useRouter();
    const [category, setCategory] = useState('new_build');
    const [phases, setPhases] = useState<string[]>(['design']);
    const [wantsPm, setWantsPm] = useState(false);
    const [discussLater, setDiscussLater] = useState(false);
    const [images, setImages] = useState<File[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function togglePhase(key: string) {
        setPhases((current) =>
            current.includes(key) ? current.filter((phase) => phase !== key) : [...current, key],
        );
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);

        if (!wantsPm && phases.length === 0) {
            setError('Choose at least one phase to publish, or request a project manager.');
            return;
        }

        setSubmitting(true);
        const form = event.currentTarget;
        const data = new FormData(form);

        // The budget is a plain number; strip separators a user might paste.
        const rawBudget = String(data.get('budget') ?? '');
        data.set('budget', rawBudget.replace(/[^0-9.]/g, ''));

        const length = Number.parseFloat(String(data.get('building_length') ?? ''));
        const width = Number.parseFloat(String(data.get('building_width') ?? ''));
        const dimensions: Record<string, number> = {};
        if (Number.isFinite(length) && length > 0) dimensions.building_length = length;
        if (Number.isFinite(width) && width > 0) dimensions.building_width = width;
        if (Number.isFinite(length) && Number.isFinite(width) && length > 0 && width > 0) {
            dimensions.building_area = length * width;
        }
        data.set('project_dimensions', JSON.stringify(dimensions));

        data.set('needed_phases', JSON.stringify(phases));
        data.set('wants_project_manager', wantsPm ? '1' : '0');
        data.set('wants_to_discuss_later', discussLater ? '1' : '0');
        data.set('external_vendors', '{}');
        data.set('bidding_choices', JSON.stringify({
            project_manager: wantsPm ? 'find' : 'none',
            notaris: phases.includes('legal') ? 'find' : 'none',
            arsitek: phases.includes('design') ? 'find' : 'none',
            kontraktor: phases.includes('build') ? 'find' : 'none',
            interior: phases.includes('interior') ? 'find' : 'none',
        }));
        data.set('target_role', category === 'maintenance' ? 'kontraktor' : 'both');

        images.forEach((file, index) => data.append(`images[${index}]`, file));

        try {
            const response = await fetch('/api/projects', { method: 'POST', body: data });

            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as
                    | { message?: string; errors?: Record<string, string[]> }
                    | null;
                const firstError = body?.errors ? Object.values(body.errors)[0]?.[0] : undefined;
                setError(firstError ?? body?.message ?? `The project could not be published (${response.status}).`);
                return;
            }

            const body = (await response.json().catch(() => null)) as { data?: { id?: number } } | null;
            const id = body?.data?.id;
            router.push(id ? `/projects/${id}` : '/dashboard/projects');
            router.refresh();
        } catch {
            setError('The project could not be published. Check your connection and try again.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div data-native-panel="post-project" className="max-w-3xl space-y-6">
            <div>
                <h1 className="text-2xl font-black text-neutral-900">Post a Project</h1>
                <p className="text-sm text-neutral-500 mt-1">
                    Describe the work, choose the phases you need, and open the brief for bids.
                </p>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                <section className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Brief</h2>

                    <Field label="Project title">
                        <input name="title" required maxLength={255} className={inputClass} />
                    </Field>

                    <Field label="Description">
                        <textarea name="description" required rows={5} className={inputClass} />
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-3">
                        <Field label="Budget (Rp)">
                            <input name="budget" required inputMode="decimal" className={inputClass} placeholder="250000000" />
                        </Field>
                        <Field label="Category">
                            <select
                                name="project_category"
                                value={category}
                                onChange={(event) => setCategory(event.target.value)}
                                className={inputClass}
                            >
                                {CATEGORIES.map((entry) => (
                                    <option key={entry.value} value={entry.value}>
                                        {entry.label}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Deadline">
                            <input type="date" name="deadline" required className={inputClass} />
                        </Field>
                    </div>

                    <Field label="Location">
                        <input name="lokasi" required maxLength={255} className={inputClass} placeholder="Bekasi, Jawa Barat" />
                    </Field>
                </section>

                <section className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                        Dimensions &amp; address
                    </h2>

                    <div className="grid gap-4 sm:grid-cols-3">
                        <Field label="Length (m)">
                            <input name="building_length" type="number" min={0} step="0.01" className={inputClass} />
                        </Field>
                        <Field label="Width (m)">
                            <input name="building_width" type="number" min={0} step="0.01" className={inputClass} />
                        </Field>
                        <Field label="Postal code">
                            <input name="postal_code" className={inputClass} />
                        </Field>
                        <Field label="Province">
                            <input name="province" className={inputClass} />
                        </Field>
                        <Field label="City">
                            <input name="city" className={inputClass} />
                        </Field>
                        <Field label="Kecamatan">
                            <input name="kecamatan" className={inputClass} />
                        </Field>
                        <Field label="Kelurahan">
                            <input name="kelurahan" className={inputClass} />
                        </Field>
                        <Field label="Street name">
                            <input name="street_name" className={inputClass} />
                        </Field>
                        <Field label="Jenis proyek">
                            <input name="jenis_proyek" className={inputClass} placeholder="umum" />
                        </Field>
                        <Field label="Latitude">
                            <input name="latitude" className={inputClass} placeholder="-6.2088" />
                        </Field>
                        <Field label="Longitude">
                            <input name="longitude" className={inputClass} placeholder="106.8456" />
                        </Field>
                    </div>
                </section>

                <section className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                        Roles needed
                    </h2>

                    <div className="flex flex-wrap gap-3">
                        {PHASES.map((phase) => (
                            <label
                                key={phase.key}
                                className={
                                    phases.includes(phase.key)
                                        ? 'px-3 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider cursor-pointer'
                                        : 'px-3 py-2 rounded-xl border border-neutral-200 text-[10px] font-black uppercase tracking-wider text-neutral-500 cursor-pointer hover:text-neutral-900'
                                }
                            >
                                <input
                                    type="checkbox"
                                    className="hidden"
                                    checked={phases.includes(phase.key)}
                                    onChange={() => togglePhase(phase.key)}
                                />
                                {phase.label}
                            </label>
                        ))}
                    </div>

                    <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700">
                        <input
                            type="checkbox"
                            checked={wantsPm}
                            onChange={(event) => setWantsPm(event.target.checked)}
                        />
                        Request a project manager to run the build
                    </label>

                    <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700">
                        <input
                            type="checkbox"
                            checked={discussLater}
                            onChange={(event) => setDiscussLater(event.target.checked)}
                        />
                        I would like to discuss the details later
                    </label>

                    <Field label="Legal notes (optional)">
                        <textarea name="legal_detail" rows={2} className={inputClass} />
                    </Field>
                </section>

                <section className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                        Project images (optional, max 3)
                    </h2>
                    <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) => setImages(Array.from(event.target.files ?? []).slice(0, 3))}
                        className="block w-full text-xs text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-[10px] file:font-black file:uppercase file:tracking-wider file:text-white"
                    />
                    <p className="text-[10px] text-neutral-400">
                        JPEG, PNG or WebP, up to 5 MB each. {images.length} selected.
                    </p>
                </section>

                <div className="flex items-center justify-end gap-3">
                    <Link
                        href="/dashboard/projects"
                        className="px-4 py-2 rounded-xl border border-neutral-200 text-[10px] font-black uppercase tracking-wider text-neutral-600 hover:text-neutral-900"
                    >
                        Cancel
                    </Link>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-5 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700 disabled:opacity-50"
                    >
                        {submitting ? 'Publishing…' : 'Publish project'}
                    </button>
                </div>
            </form>
        </div>
    );
}
