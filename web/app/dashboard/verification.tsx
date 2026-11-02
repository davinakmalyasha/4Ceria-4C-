import { titleCase } from '@/lib/format';
import type { User } from '@/context/AuthContext';
import { VerificationForm } from './verificationForm';

/**
 * Native verification (KYC) panel.
 *
 * The `/me` payload already contains the role-specific profile relation, so the
 * panel can render the current status, the submitted identifiers and the
 * document slots without another request. The submit form is native too and
 * posts the same multipart payload as the legacy page to `/me/professional`.
 */

const RELATION_MAP: Record<string, string> = {
    arsitek: 'arsitek',
    kontraktor: 'kontraktor',
    project_manager: 'project_manager',
    structural: 'structural_engineer',
    mep: 'mep_engineer',
    notaris: 'notaris_profile',
    interior: 'interior_profile',
    civil: 'kontraktor',
    mechanical: 'kontraktor',
    electrical: 'kontraktor',
    plumbing: 'kontraktor',
    roofing: 'kontraktor',
    finishing: 'kontraktor',
};

function basename(path: string): string {
    const cleaned = path.split('?')[0];
    return cleaned.slice(cleaned.lastIndexOf('/') + 1) || cleaned;
}

function statusCard(status: string, rejectionReason?: string | null) {
    switch (status) {
        case 'verified':
        case 'approved':
            return {
                heading: 'Officially Verified Account',
                tone: 'border-emerald-200 bg-emerald-50 text-emerald-900',
                body: 'Your professional identity and credentials have been authenticated. You can submit bids, participate in tenders and sign project contracts.',
            };
        case 'pending':
            return {
                heading: 'Verification Pending Review',
                tone: 'border-amber-200 bg-amber-50 text-amber-900',
                body: 'Your documents are in the review queue. The administrative team usually completes the check within 24 hours.',
            };
        case 'rejected':
            return {
                heading: 'Verification Declined',
                tone: 'border-red-200 bg-red-50 text-red-900',
                body: rejectionReason
                    ? `Your application was rejected: “${rejectionReason}”.`
                    : 'Your application was rejected. Update the details below and submit again.',
            };
        default:
            return {
                heading: 'Verification Unverified',
                tone: 'border-neutral-200 bg-neutral-50 text-neutral-900',
                body: 'Complete the application below to unlock bidding and the verified badge across the marketplace.',
            };
    }
}

export function VerificationPanel({ user }: { user: User }) {
    const relationKey = RELATION_MAP[user.role_type];
    const profile = relationKey ? user[relationKey] : null;
    const hasDocuments = Boolean(
        profile?.foto || profile?.file_portofolio || profile?.file_sertifikat || profile?.npwp || profile?.siup,
    );

    let status: string = profile?.verification_status ?? 'unverified';
    // The legacy page treated a PENDING row with no documents as unverified.
    if (status === 'pending' && !hasDocuments) {
        status = 'unverified';
    }

    const card = statusCard(status, profile?.rejection_reason);
    const isVerified = status === 'verified' || status === 'approved';

    const documents: { label: string; path: string }[] = [];
    if (profile?.foto) documents.push({ label: 'Profile photo / logo', path: profile.foto });
    const identityDoc = profile?.file_portofolio ?? profile?.npwp;
    if (identityDoc) documents.push({ label: 'Identity / NPWP document', path: identityDoc });
    const licenceDoc = profile?.file_sertifikat ?? profile?.siup;
    if (licenceDoc) documents.push({ label: 'Certificate / business permit', path: licenceDoc });

    const metadata: { label: string; value: string }[] = [];
    const push = (label: string, value: unknown) => {
        if (value !== null && value !== undefined && value !== '') {
            metadata.push({ label, value: String(value) });
        }
    };
    push('Entity type', profile?.entity_type ? titleCase(profile.entity_type) : null);
    push('Registered company', profile?.company_name);
    push('Company licence', profile?.company_license);
    push('Identity number', profile?.identity_number);
    push('NPWP number', profile?.npwp_number);
    push('SIUP number', profile?.siup_number);

    return (
        <div data-native-panel="verification" className="max-w-4xl space-y-6">
            <div>
                <h1 className="text-2xl font-black text-neutral-900">Verification</h1>
                <p className="text-sm text-neutral-500 mt-1">
                    Identity and credential checks for professional accounts.
                </p>
            </div>

            <section className={`rounded-2xl border p-5 ${card.tone}`}>
                <h2 className="text-sm font-black uppercase tracking-widest">{card.heading}</h2>
                <p className="mt-2 text-xs font-semibold leading-relaxed">{card.body}</p>
            </section>

            {!profile ? (
                <section className="bg-white rounded-2xl border border-neutral-200 p-6">
                    <h2 className="text-sm font-black text-neutral-900">Verification is for professional accounts</h2>
                    <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
                        This account posts projects and lists houses, so it does not carry professional
                        credentials. Register a licensed professional or firm account to submit KYC documents.
                    </p>
                    <a
                        href="/pro/register"
                        className="mt-4 inline-flex px-4 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                    >
                        Register a professional account
                    </a>
                </section>
            ) : (
                <>
                    <div className="grid gap-5 lg:grid-cols-2">
                        <section className="bg-white rounded-2xl border border-neutral-200 p-5">
                            <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                                Submitted details
                            </h2>
                            {metadata.length === 0 ? (
                                <p className="text-sm text-neutral-500">No details have been submitted yet.</p>
                            ) : (
                                <dl className="space-y-2 text-sm">
                                    {metadata.map((row) => (
                                        <div key={row.label} className="flex justify-between gap-4">
                                            <dt className="text-neutral-500">{row.label}</dt>
                                            <dd className="font-semibold text-neutral-800 text-right break-all">
                                                {row.value}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            )}
                        </section>

                        <section className="bg-white rounded-2xl border border-neutral-200 p-5">
                            <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                                Uploaded documents
                            </h2>
                            {documents.length === 0 ? (
                                <p className="text-sm text-neutral-500">No documents uploaded yet.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {documents.map((document) => (
                                        <li
                                            key={document.label}
                                            className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2"
                                        >
                                            <div className="min-w-0">
                                                <p className="text-[9px] font-black uppercase tracking-wider text-emerald-700">
                                                    {document.label}
                                                </p>
                                                <p className="text-[10px] font-semibold text-emerald-600 truncate">
                                                    {basename(document.path)}
                                                </p>
                                            </div>
                                            <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-emerald-700">
                                                Uploaded
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>

                    {!isVerified && status !== 'pending' && (
                        <section>
                            <h2 className="text-lg font-black text-neutral-900 mb-1">Submit verification</h2>
                            <p className="text-xs text-neutral-500 mb-3">
                                Upload clear, current documents. The status moves to pending immediately.
                            </p>
                            <VerificationForm
                                name={user.name}
                                email={user.email}
                                username={user.username ?? ''}
                                initialEntityType={profile.entity_type === 'company' ? 'company' : 'individual'}
                                initialCompanyName={profile.company_name ?? ''}
                                initialCompanyLicense={profile.company_license ?? ''}
                                initialIdentityNumber={profile.identity_number ?? ''}
                                initialNpwpNumber={profile.npwp_number ?? ''}
                                initialSiupNumber={profile.siup_number ?? ''}
                            />
                        </section>
                    )}
                </>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
                <section className="bg-white rounded-2xl border border-neutral-200 p-5">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                        Why verify your profile?
                    </h2>
                    <ul className="space-y-2 text-xs text-neutral-600 leading-relaxed">
                        <li>• Bidding access — standard bidding stays locked for unverified profiles.</li>
                        <li>• A verified badge appears beside your name across the marketplace.</li>
                        <li>• Verified accounts receive a positive baseline reliability score.</li>
                    </ul>
                </section>

                <section className="bg-white rounded-2xl border border-neutral-200 p-5">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                        Verification checklist
                    </h2>
                    <ul className="space-y-2 text-xs text-neutral-600 leading-relaxed">
                        <li>• KTP or NPWP digits must match the text inputs exactly.</li>
                        <li>• Scans must be clear, unblurred and fully readable.</li>
                        <li>• Upload active certifications or registrations only.</li>
                    </ul>
                </section>
            </div>
        </div>
    );
}
