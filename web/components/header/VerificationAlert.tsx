import { AlertTriangle, ArrowRight, Clock, ShieldAlert } from 'lucide-react';
import type { User } from '@/context/AuthContext';

/**
 * The verification banner — a native port of the synced `VerificationAlert`.
 *
 * The rule is unchanged: only a professional account with a profile shows it,
 * `pending` with NO uploaded documents displays as unverified, and a verified
 * account never sees it. The CTA now lands on the native Verification screen
 * (the legacy one pushed the profile tab).
 */

const CONTRACTOR_ROLES = ['civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'];

function profileFor(user: User): Record<string, unknown> | null {
    const role = user.role_type;

    if (role === 'arsitek') return user.arsitek ?? null;
    if (role === 'kontraktor') return user.kontraktor ?? null;
    if (role === 'notaris') return user.notaris_profile ?? null;
    if (role === 'interior') return user.interior_profile ?? null;
    if (role === 'project_manager') return user.project_manager ?? null;
    if (role === 'structural') return user.structural_engineer ?? null;
    if (role === 'mep') return user.mep_engineer ?? null;
    if (role === 'supplier') return user.supplier ?? null;
    if (CONTRACTOR_ROLES.includes(role)) return user.kontraktor ?? null;

    return null;
}

function hasUploadedDocuments(profile: Record<string, unknown> | null): boolean {
    if (!profile) return false;

    return Boolean(
        profile.file_portofolio || profile.npwp || profile.file_sertifikat || profile.siup || profile.foto,
    );
}

const STYLES = {
    rejected: {
        bg: 'bg-rose-50 border-rose-100 text-rose-950',
        iconColor: 'text-rose-600',
        button: 'bg-rose-600 hover:bg-rose-700 text-white',
        buttonLabel: 'Update credentials',
        Icon: AlertTriangle,
    },
    pending: {
        bg: 'bg-amber-50 border-amber-100 text-amber-950',
        iconColor: 'text-amber-600',
        button: 'bg-amber-600 hover:bg-amber-700 text-white',
        buttonLabel: 'Review details',
        Icon: Clock,
    },
    unverified: {
        bg: 'bg-orange-50 border-orange-100 text-orange-950',
        iconColor: 'text-orange-600',
        button: 'bg-orange-600 hover:bg-orange-700 text-white',
        buttonLabel: 'Verify profile',
        Icon: ShieldAlert,
    },
} as const;

export function VerificationAlert({
    user,
    activeTab,
    setActiveTab,
}: {
    user: User;
    activeTab: string;
    setActiveTab: (tab: string) => void;
}) {
    if (activeTab === 'profile' || activeTab === 'verification' || activeTab === 'chat') {
        return null;
    }

    const profile = profileFor(user);
    if (!profile) {
        return null;
    }

    let status = String(profile.verification_status ?? 'unverified');
    if (status === 'pending' && !hasUploadedDocuments(profile)) {
        status = 'unverified';
    }

    if (status === 'verified' || status === 'approved') {
        return null;
    }

    const style = status === 'rejected' ? STYLES.rejected : status === 'pending' ? STYLES.pending : STYLES.unverified;
    const message =
        status === 'rejected'
            ? `Verification declined: "${String(profile.rejection_reason ?? 'Uploaded documents are invalid or blurred.')}"`
            : status === 'pending'
              ? 'Your credentials are under review. Administrative verification takes about 24 hours.'
              : 'Your professional account is not verified yet. Complete your profile to unlock bidding.';
    const Icon = style.Icon;

    return (
        <div
            data-native-verification-alert
            className={`mb-4 border ${style.bg} rounded-2xl py-2.5 px-4 flex flex-row items-center justify-between gap-4 shadow-sm`}
        >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Icon size={16} className={`${style.iconColor} shrink-0`} />
                <p className="text-xs font-bold truncate leading-none mt-px">{message}</p>
            </div>

            <button
                type="button"
                onClick={() => setActiveTab('verification')}
                className={`py-1.5 px-3.5 ${style.button} font-black text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 shrink-0`}
            >
                <span>{style.buttonLabel}</span>
                <ArrowRight size={10} strokeWidth={3} />
            </button>
        </div>
    );
}
