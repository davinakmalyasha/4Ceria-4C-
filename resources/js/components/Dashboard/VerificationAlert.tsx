import React from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, Clock, ArrowRight, AlertTriangle } from 'lucide-react';
import { User } from '../../context/AuthContext';

interface VerificationAlertProps {
    user: User;
    activeTab: string;
    setActiveTab: (tab: string) => void;
}

interface ProfileResult {
    profile: any;
    type: string;
}

function getProfileData(user: User): ProfileResult | null {
    const role = user.role_type;
    if (role === 'arsitek') return { profile: user.arsitek, type: 'arsitek' };
    if (role === 'kontraktor') return { profile: user.kontraktor, type: 'kontraktor' };
    if (role === 'notaris') return { profile: user.notaris_profile, type: 'notaris' };
    if (role === 'interior') return { profile: user.interior_profile, type: 'interior' };
    if (role === 'project_manager') return { profile: user.project_manager, type: 'project_manager' };
    if (role === 'structural') return { profile: user.structural_engineer, type: 'structural' };
    if (role === 'mep') return { profile: user.mep_engineer, type: 'mep' };
    if (role === 'supplier') return { profile: user.supplier, type: 'supplier' };
    if (['civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'].includes(role)) {
        return { profile: user.kontraktor, type: 'kontraktor' };
    }
    return null;
}

function hasUploadedDocuments(profile: any): boolean {
    if (!profile) return false;
    return !!(profile.file_portofolio || profile.npwp || profile.file_sertifikat || profile.siup || profile.foto);
}

export const VerificationAlert: React.FC<VerificationAlertProps> = ({ user, activeTab, setActiveTab }) => {
    // Hide warning alert on profile, verification, or inbox tabs to prevent clutter
    if (activeTab === 'profile' || activeTab === 'verification' || activeTab === 'chat') {
        return null;
    }

    const result = getProfileData(user);
    if (!result) return null;

    const { profile } = result;
    const isUploaded = hasUploadedDocuments(profile);
    
    let activeStatus = profile?.verification_status || 'unverified';
    if (activeStatus === 'pending' && !isUploaded) {
        activeStatus = 'unverified';
    }

    // Do not show the banner if the user is already verified/approved
    if (activeStatus === 'verified' || activeStatus === 'approved') {
        return null;
    }

    const alertConfig = {
        rejected: {
            bg: 'bg-rose-50 border-rose-100 text-rose-950',
            text: `Verification declined: "${profile?.rejection_reason || 'Uploaded documents are invalid or blurred.'}"`,
            icon: AlertTriangle,
            iconColor: 'text-rose-600',
            btnText: 'Update Credentials',
            btnClass: 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm focus:ring-rose-500',
        },
        pending: {
            bg: 'bg-amber-50 border-amber-100 text-amber-950',
            text: 'Your credentials are under review! Administrative verification takes about 24 hours.',
            icon: Clock,
            iconColor: 'text-amber-600',
            btnText: 'Review Details',
            btnClass: 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm focus:ring-amber-500',
        },
        unverified: {
            bg: 'bg-orange-50 border-orange-100 text-orange-950',
            text: 'Your professional account is not verified yet. Complete your profile to unlock bidding.',
            icon: ShieldAlert,
            iconColor: 'text-orange-600',
            btnText: 'Verify Profile',
            btnClass: 'bg-orange-600 hover:bg-orange-700 text-white shadow-sm focus:ring-orange-500',
        }
    }[activeStatus as 'rejected' | 'pending'] || {
        bg: 'bg-orange-50 border-orange-100 text-orange-950',
        text: 'Your professional account is not verified yet. Complete your profile to unlock bidding.',
        icon: ShieldAlert,
        iconColor: 'text-orange-600',
        btnText: 'Verify Profile',
        btnClass: 'bg-orange-600 hover:bg-orange-700 text-white shadow-sm focus:ring-orange-500',
    };

    const IconComponent = alertConfig.icon;

    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className={`mb-4 border ${alertConfig.bg} rounded-2xl py-2.5 px-4 flex flex-row items-center justify-between gap-4 shadow-sm relative overflow-hidden`}
        >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <IconComponent size={16} className={`${alertConfig.iconColor} shrink-0`} />
                <p className="text-xs font-bold truncate leading-none mt-[1px]">
                    {alertConfig.text}
                </p>
            </div>

            <button
                onClick={() => setActiveTab('verification')}
                className={`py-1.5 px-3.5 ${alertConfig.btnClass} font-black text-[10px] uppercase tracking-wider rounded-xl transition-all duration-200 hover:scale-[1.02] flex items-center gap-1.5 shrink-0 active:scale-95 outline-none`}
            >
                <span>{alertConfig.btnText}</span>
                <ArrowRight size={10} strokeWidth={3} />
            </button>
        </motion.div>
    );
};
