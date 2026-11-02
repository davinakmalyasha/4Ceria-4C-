import Link from 'next/link';
import type { ReactNode } from 'react';
import type { User } from '@/context/AuthContext';
import { saveProfile } from './profile-actions';

/**
 * Native profile editor.
 *
 * Replaces the seven synced role forms (`EditProfileForm` dispatched to
 * Architect/Constructor/Interior/Notary/Supplier/Enterprise/User forms). The
 * fields are grouped exactly as the controller validates them: account
 * identity for everyone, a role-specific professional block, and the photo.
 * Official documents and KYC identifiers stay in the Verification panel, which
 * already writes them.
 *
 * Everything is one server-rendered form — the phone rows and notary service
 * rows are repeated inputs, not client state — so the screen has no legacy
 * island and no hydration cost.
 */

const PROFILE_KEYS: Record<string, string> = {
    arsitek: 'arsitek',
    kontraktor: 'kontraktor',
    notaris: 'notaris_profile',
    interior: 'interior_profile',
    project_manager: 'project_manager',
    structural: 'structural_engineer',
    mep: 'mep_engineer',
};

const CONTRACTOR_ROLES = new Set([
    'kontraktor',
    'civil',
    'mechanical',
    'electrical',
    'plumbing',
    'roofing',
    'finishing',
]);

const ENTERPRISE_ROLES = new Set(['project_manager', 'structural', 'mep']);

const ROLE_LABELS: Record<string, string> = {
    arsitek: 'Architect',
    kontraktor: 'Contractor',
    notaris: 'Notary',
    interior: 'Interior designer',
    project_manager: 'Project manager',
    structural: 'Structural engineer',
    mep: 'MEP specialist',
    civil: 'Civil specialist',
    mechanical: 'Mechanical specialist',
    electrical: 'Electrical specialist',
    plumbing: 'Plumbing specialist',
    roofing: 'Roofing specialist',
    finishing: 'Finishing specialist',
};

const PROFESSIONAL_ROLES = new Set([
    ...CONTRACTOR_ROLES,
    ...ENTERPRISE_ROLES,
    'arsitek',
    'interior',
    'notaris',
]);

const inputClass =
    'mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-neutral-900';

const fileClass =
    'mt-1 block text-xs text-neutral-600 file:mr-2 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-2 file:py-1.5 file:text-[9px] file:font-black file:uppercase file:tracking-wider file:text-white';

function Field({
    label,
    name,
    defaultValue,
    type = 'text',
    required = false,
    placeholder,
    inputMode,
}: {
    label: string;
    name: string;
    defaultValue?: string | number | null;
    type?: string;
    required?: boolean;
    placeholder?: string;
    inputMode?: 'text' | 'decimal' | 'numeric' | 'tel';
}) {
    return (
        <label className="block">
            <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">{label}</span>
            <input
                type={type}
                name={name}
                defaultValue={defaultValue ?? ''}
                required={required}
                placeholder={placeholder}
                inputMode={inputMode}
                className={inputClass}
            />
        </label>
    );
}

function TextArea({
    label,
    name,
    defaultValue,
    rows = 3,
}: {
    label: string;
    name: string;
    defaultValue?: string | null;
    rows?: number;
}) {
    return (
        <label className="block sm:col-span-2">
            <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">{label}</span>
            <textarea name={name} rows={rows} defaultValue={defaultValue ?? ''} className={inputClass} />
        </label>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">{title}</h2>
            {children}
        </section>
    );
}

function notaryServices(profile: Record<string, unknown> | null): { title: string; price: string; description: string }[] {
    const raw = profile?.services;

    if (!Array.isArray(raw)) {
        return [];
    }

    return raw.map((service: Record<string, unknown>) => ({
        title: String(service?.title ?? ''),
        price: String(service?.price ?? ''),
        description: String(service?.description ?? ''),
    }));
}

export function ProfileEditPanel({ user, error }: { user: User; error?: string }) {
    const role = user.role_type;

    // A supplier's public profile IS the storefront; the native Store panel
    // owns that form and the `/merchant/profile` endpoint.
    if (role === 'supplier') {
        return (
            <div className="bg-white rounded-2xl border border-neutral-200 p-5">
                <h2 className="text-lg font-black text-neutral-900">Edit your store</h2>
                <p className="mt-1 text-xs text-neutral-500">
                    A supplier profile is the public storefront. Its name, address, photo and bio are edited on
                    the Store screen.
                </p>
                <Link
                    href="/dashboard/store"
                    className="mt-4 inline-flex px-4 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                >
                    Open store settings →
                </Link>
            </div>
        );
    }

    const isProfessional = PROFESSIONAL_ROLES.has(role);
    const profileKey = PROFILE_KEYS[role];
    const profile = (profileKey ? (user[profileKey] as Record<string, unknown> | null) : null) ?? null;

    const phones = Array.isArray(user.phone_number)
        ? (user.phone_number as { contact?: string }[])
              .map((entry) => entry?.contact ?? '')
              .filter((entry) => entry !== '')
        : typeof user.phone_number === 'string' && user.phone_number !== ''
          ? [user.phone_number]
          : [];

    const services = role === 'notaris' ? notaryServices(profile) : [];

    return (
        <form action={saveProfile} className="space-y-5">
            <input type="hidden" name="mode" value={isProfessional ? 'professional' : 'user'} />

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>
            )}

            <Section title="Account">
                <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Name" name="name" defaultValue={user.name} required />
                    <Field label="Email" name="email" type="email" defaultValue={user.email} required />
                    <Field label="Username" name="username" defaultValue={user.username ?? ''} required />
                </div>

                <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                        Phone numbers
                    </p>
                    <div className="mt-1 grid gap-2 sm:grid-cols-3">
                        {phones.map((phone, index) => (
                            <input
                                key={`phone-${index}`}
                                name="phone_numbers"
                                defaultValue={phone}
                                inputMode="tel"
                                className={inputClass.replace('mt-1 ', '')}
                            />
                        ))}
                        <input
                            name="phone_numbers"
                            placeholder="Add a number"
                            inputMode="tel"
                            className={inputClass.replace('mt-1 ', '')}
                        />
                    </div>
                </div>

                {!isProfessional && (
                    <label className="block">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                            Profile photo
                        </span>
                        <input type="file" name="pic" accept="image/jpeg,image/png,image/gif,image/webp" className={fileClass} />
                    </label>
                )}
            </Section>

            {isProfessional && (
                <>
                    <Section title={`${ROLE_LABELS[role] ?? 'Professional'} profile`}>
                        {CONTRACTOR_ROLES.has(role) ? (
                            <div className="grid gap-3 sm:grid-cols-3">
                                <Field label="Company name" name="nama_perusahaan" defaultValue={(profile?.nama_perusahaan ?? '') as string} />
                                <Field label="Address" name="alamat" defaultValue={(profile?.alamat ?? profile?.lokasi ?? '') as string} />
                                <Field label="Phone" name="no_telepon" defaultValue={(profile?.no_telepon ?? profile?.no_telp ?? '') as string} />
                                <Field label="Specialisation" name="spesialisasi" defaultValue={(profile?.spesialisasi ?? '') as string} />
                                <Field label="Years of experience" name="pengalaman" defaultValue={(profile?.pengalaman ?? profile?.pengalaman_tahun ?? '') as string} />
                                <Field label="Rate (Rp)" name="rate_harga" defaultValue={(profile?.rate_harga ?? '') as string} inputMode="decimal" />
                                <Field label="Type" name="jenis" defaultValue={(profile?.jenis ?? '') as string} />
                                <Field label="Education" name="pendidikan" defaultValue={(profile?.pendidikan ?? '') as string} />
                                <Field label="Why hire you" name="alasan_hire" defaultValue={(profile?.alasan_hire ?? '') as string} />
                            </div>
                        ) : role === 'notaris' ? (
                            <div className="grid gap-3 sm:grid-cols-3">
                                <Field label="Notary name" name="nama" defaultValue={(profile?.nama ?? user.name) as string} />
                                <Field label="Phone" name="no_telp" defaultValue={(profile?.no_telp ?? '') as string} />
                                <Field label="Decree number (SK)" name="nomor_sk" defaultValue={(profile?.nomor_sk ?? '') as string} />
                                <Field label="Working area" name="wilayah_kerja" defaultValue={(profile?.wilayah_kerja ?? '') as string} />
                                <Field label="Specialisation" name="spesialisasi" defaultValue={(profile?.spesialisasi ?? '') as string} />
                                <Field label="Location" name="lokasi" defaultValue={(profile?.lokasi ?? '') as string} />
                                <Field label="Years of experience" name="pengalaman_tahun" defaultValue={(profile?.pengalaman_tahun ?? '') as string} />
                                <Field label="Rate (Rp)" name="rate_harga" defaultValue={(profile?.rate_harga ?? '') as string} inputMode="decimal" />
                                <TextArea label="About" name="deskripsi" defaultValue={(profile?.deskripsi ?? '') as string} />
                            </div>
                        ) : (
                            <div className="grid gap-3 sm:grid-cols-3">
                                <Field label="Specialisation" name="spesialisasi" defaultValue={(profile?.spesialisasi ?? '') as string} />
                                <Field label="Years of experience" name="pengalaman_tahun" defaultValue={(profile?.pengalaman_tahun ?? '') as string} />
                                <Field label="Rate (Rp)" name="rate_harga" defaultValue={(profile?.rate_harga ?? '') as string} inputMode="decimal" />
                                <Field label="Location" name="lokasi" defaultValue={(profile?.lokasi ?? '') as string} />
                                <Field label="Phone" name="no_telp" defaultValue={(profile?.no_telp ?? '') as string} />
                                {(role === 'arsitek' || ENTERPRISE_ROLES.has(role)) && (
                                    <Field label="Education" name="pendidikan" defaultValue={(profile?.pendidikan ?? '') as string} />
                                )}
                                {(role === 'arsitek' || ENTERPRISE_ROLES.has(role)) && (
                                    <Field label="Why hire you" name="alasan_hire" defaultValue={(profile?.alasan_hire ?? '') as string} />
                                )}
                                <TextArea label="About" name="deskripsi" defaultValue={(profile?.deskripsi ?? '') as string} />
                            </div>
                        )}

                        <label className="block">
                            <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                Profile photo
                            </span>
                            <input type="file" name="foto" accept="image/jpeg,image/png,image/jpg" className={fileClass} />
                        </label>
                    </Section>

                    {role === 'notaris' && (
                        <Section title="Notary services">
                            <div className="space-y-2">
                                {[...services, { title: '', price: '', description: '' }].map((service, index) => (
                                    <div key={`service-${index}`} className="grid gap-2 sm:grid-cols-4">
                                        <input
                                            name="service_title"
                                            defaultValue={service.title}
                                            placeholder="Service title"
                                            className={inputClass.replace('mt-1 ', '')}
                                        />
                                        <input
                                            name="service_price"
                                            defaultValue={service.price}
                                            placeholder="Price"
                                            inputMode="decimal"
                                            className={inputClass.replace('mt-1 ', '')}
                                        />
                                        <input
                                            name="service_description"
                                            defaultValue={service.description}
                                            placeholder="Description"
                                            className={`${inputClass.replace('mt-1 ', '')} sm:col-span-2`}
                                        />
                                    </div>
                                ))}
                            </div>
                            <p className="text-[10px] text-neutral-400">
                                Clear a title to remove that service. Empty rows are ignored.
                            </p>
                        </Section>
                    )}

                    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-5 py-3 text-xs text-neutral-500">
                        Official documents, tax numbers and the KYC status are managed in{' '}
                        <Link href="/dashboard/verification" className="font-black text-neutral-900 hover:text-red-600">
                            Verification →
                        </Link>
                    </div>
                </>
            )}

            <div className="flex items-center justify-end gap-3">
                <Link
                    href="/dashboard/profile"
                    className="px-4 py-2 rounded-xl border border-neutral-200 text-[10px] font-black uppercase tracking-wider text-neutral-600 hover:text-neutral-900"
                >
                    Reset
                </Link>
                <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                >
                    Save profile
                </button>
            </div>
        </form>
    );
}
