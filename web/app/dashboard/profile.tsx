import { assetUrl } from '@/lib/assets';
import { formatIDR, titleCase } from '@/lib/format';
import type { User } from '@/context/AuthContext';
import { ProfileEditPanel } from './profileEdit';

/**
 * Native dashboard profile summary.
 *
 * The `/me` payload the dashboard already fetched is the source: identity,
 * contact, payout details and the role-specific profile relation. The editor
 * below is `ProfileEditPanel`, also native — it writes `/me` for a plain
 * account and `/me/professional` for a professional one, so the screen mounts
 * no synced component at all.
 */

const PROFILE_KEYS: Record<string, string> = {
    arsitek: 'arsitek',
    kontraktor: 'kontraktor',
    notaris: 'notaris_profile',
    interior: 'interior_profile',
    project_manager: 'project_manager',
    structural: 'structural_engineer',
    mep: 'mep_engineer',
    supplier: 'supplier',
};

function phoneList(user: User): string[] {
    const raw = user.phone_number;
    if (Array.isArray(raw)) {
        return raw
            .map((entry: unknown) =>
                typeof entry === 'string' ? entry : (entry as { contact?: string })?.contact ?? '',
            )
            .filter(Boolean);
    }
    if (typeof raw === 'string' && raw.trim() !== '') {
        return [raw];
    }
    return [];
}

function verificationClasses(status: string | null | undefined): string {
    switch (status) {
        case 'verified':
            return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        case 'rejected':
            return 'bg-red-50 text-red-700 border-red-200';
        case 'pending':
            return 'bg-amber-50 text-amber-700 border-amber-200';
        default:
            return 'bg-neutral-100 text-neutral-500 border-neutral-200';
    }
}

function valueOr(value: unknown): string | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    if (typeof value === 'number') {
        return String(value);
    }
    return String(value);
}

export function ProfilePanel({ user, error }: { user: User; error?: string }) {
    const avatar = assetUrl(user.pic);
    const phones = phoneList(user);
    const profileKey = PROFILE_KEYS[user.role_type];
    const profile = profileKey ? user[profileKey] : null;
    const profilePhone =
        valueOr(profile?.no_telp) ?? valueOr(profile?.no_telepon) ?? valueOr(profile?.phone_number) ?? null;

    const details: { label: string; value: string }[] = [];
    const push = (label: string, value: unknown) => {
        const text = valueOr(value);
        if (text !== null) {
            details.push({ label, value: text });
        }
    };

    if (profile) {
        push('Specialisation', profile.spesialisasi);
        push('Experience', profile.pengalaman_tahun != null ? `${profile.pengalaman_tahun} years` : null);
        push('Rate', profile.rate_harga != null ? formatIDR(profile.rate_harga) : null);
        push('Location', profile.lokasi);
        push('Company', profile.company_name ?? profile.nama_perusahaan ?? profile.store_name);
        push('Category', profile.category);
        push('Address', profile.address);
        push('Reliability', profile.reliability_score);
        push(
            'Rating',
            profile.average_rating != null
                ? `★ ${profile.average_rating} (${profile.review_count ?? 0})`
                : null,
        );
        push('About', profile.deskripsi ?? profile.bio);
    }

    const hasBank = Boolean(user.bank_name || user.bank_account_number || user.bank_account_name);
    const checks = [
        Boolean(user.name),
        Boolean(user.email),
        Boolean(user.username),
        phones.length > 0 || Boolean(profilePhone),
        hasBank,
        Boolean(profile) || user.role_type === 'user',
    ];
    const completeness = Math.round((checks.filter(Boolean).length / checks.length) * 100);

    return (
        <div data-native-panel="profile" className="space-y-6">
            <div>
                <h1 className="text-2xl font-black text-neutral-900">Profile</h1>
                <p className="text-sm text-neutral-500 mt-1">
                    Your identity, contact details and the profile professionals see.
                </p>
            </div>

            <section className="bg-white rounded-2xl border border-neutral-200 p-6">
                <div className="flex flex-wrap items-start gap-5">
                    <span className="h-20 w-20 shrink-0 rounded-2xl bg-neutral-900 text-white text-2xl font-black flex items-center justify-center overflow-hidden">
                        {avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={avatar} alt="" className="h-full w-full object-cover" />
                        ) : (
                            (user.name ?? '?').trim().charAt(0).toUpperCase()
                        )}
                    </span>

                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                            <h2 className="text-xl font-black text-neutral-900">{user.name}</h2>
                            <span className="px-2.5 py-1 rounded-full bg-neutral-900 text-white text-[9px] font-black uppercase tracking-wider">
                                {titleCase(user.role_type)}
                            </span>
                            {profile?.verification_status && (
                                <span
                                    className={`px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-wider ${verificationClasses(profile.verification_status)}`}
                                >
                                    {titleCase(profile.verification_status)}
                                </span>
                            )}
                        </div>
                        <p className="mt-1 text-sm text-neutral-500">@{user.username ?? 'no-username'}</p>
                        {user.roles && Array.isArray(user.roles) && user.roles.length > 1 && (
                            <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                Roles: {user.roles.map((role: string) => titleCase(role)).join(' · ')}
                            </p>
                        )}

                        <div className="mt-4">
                            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                <span>Profile completeness</span>
                                <span>{completeness}%</span>
                            </div>
                            <div className="mt-1.5 h-2 rounded-full bg-neutral-100 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-neutral-900"
                                    style={{ width: `${completeness}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <div className="grid gap-5 lg:grid-cols-2">
                <section className="bg-white rounded-2xl border border-neutral-200 p-5">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                        Contact
                    </h2>
                    <dl className="space-y-2 text-sm">
                        <div className="flex justify-between gap-4">
                            <dt className="text-neutral-500">Email</dt>
                            <dd className="font-semibold text-neutral-800 text-right break-all">{user.email}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                            <dt className="text-neutral-500">Username</dt>
                            <dd className="font-semibold text-neutral-800">{user.username ?? '—'}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                            <dt className="text-neutral-500">Phone</dt>
                            <dd className="font-semibold text-neutral-800 text-right">
                                {[...new Set([...phones, profilePhone].filter(Boolean))].join(', ') || '—'}
                            </dd>
                        </div>
                    </dl>
                </section>

                <section className="bg-white rounded-2xl border border-neutral-200 p-5">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                        Payout details
                    </h2>
                    {hasBank ? (
                        <dl className="space-y-2 text-sm">
                            <div className="flex justify-between gap-4">
                                <dt className="text-neutral-500">Bank</dt>
                                <dd className="font-semibold text-neutral-800">{user.bank_name ?? '—'}</dd>
                            </div>
                            <div className="flex justify-between gap-4">
                                <dt className="text-neutral-500">Account number</dt>
                                <dd className="font-semibold text-neutral-800">{user.bank_account_number ?? '—'}</dd>
                            </div>
                            <div className="flex justify-between gap-4">
                                <dt className="text-neutral-500">Account name</dt>
                                <dd className="font-semibold text-neutral-800">{user.bank_account_name ?? '—'}</dd>
                            </div>
                        </dl>
                    ) : (
                        <p className="text-sm text-neutral-500">
                            No payout details yet. Add them before receiving payments.
                        </p>
                    )}
                </section>
            </div>

            {profile ? (
                <section className="bg-white rounded-2xl border border-neutral-200 p-5">
                    <div className="flex items-baseline justify-between gap-3 mb-3">
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                            Professional profile
                        </h2>
                        <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                            {titleCase(profileKey)}
                        </span>
                    </div>

                    {details.length === 0 ? (
                        <p className="text-sm text-neutral-500">This profile has not been filled in yet.</p>
                    ) : (
                        <dl className="grid gap-3 sm:grid-cols-2">
                            {details.map((detail) => (
                                <div key={detail.label} className="rounded-xl bg-neutral-50 border border-neutral-100 px-4 py-3">
                                    <dt className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                        {detail.label}
                                    </dt>
                                    <dd className="mt-1 text-sm text-neutral-800 whitespace-pre-line">{detail.value}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </section>
            ) : (
                <section className="bg-white rounded-2xl border border-neutral-200 p-5">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">
                        Owner account
                    </h2>
                    <p className="text-sm text-neutral-600 leading-relaxed">
                        You post projects, hire professionals and list houses from this account. A professional
                        profile is created when you register in a licensed role.
                    </p>
                </section>
            )}

            <section className="bg-white rounded-2xl border border-neutral-200 p-5">
                <h2 className="text-lg font-black text-neutral-900 mb-1">Edit profile</h2>
                <p className="text-xs text-neutral-500 mb-4">
                    Changes are saved to the same account the header renders.
                </p>
                <ProfileEditPanel user={user} error={error} />
            </section>
        </div>
    );
}
