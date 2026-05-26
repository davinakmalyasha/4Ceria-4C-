import React from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, Clock, ArrowRight, ShieldCheck } from 'lucide-react';

interface Props {
    user: any;
    setActiveTab: (tab: string) => void;
}

function getProfileData(user: any) {
    if (!user) return null;
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

function calculateCompleteness(profile: any, type: string) {
    if (!profile) return 0;
    let fields: string[] = [];
    if (['arsitek', 'project_manager', 'structural', 'mep', 'interior'].includes(type)) {
        fields = ['foto', 'file_portofolio', 'file_sertifikat', 'deskripsi', 'lokasi', 'rate_harga', 'spesialisasi', 'pengalaman_tahun', 'pendidikan'];
    } else if (type === 'kontraktor') {
        fields = ['foto', 'npwp', 'siup', 'nama_perusahaan', 'alamat', 'rate_harga', 'pengalaman', 'spesialisasi', 'alasan_hire'];
    } else if (type === 'notaris') {
        fields = ['foto', 'file_sertifikat', 'nomor_sk', 'wilayah_kerja', 'spesialisasi', 'lokasi', 'deskripsi', 'pengalaman_tahun', 'rate_harga'];
    } else if (type === 'supplier') {
        fields = ['foto', 'store_name', 'address', 'no_telp', 'category', 'bio'];
    }
    if (fields.length === 0) return 0;
    const filledCount = fields.filter(field => {
        const val = profile[field];
        if (val === null || val === undefined || val === '') return false;
        if (typeof val === 'number') return true;
        if (typeof val === 'string') return val.trim().length > 0;
        return true;
    }).length;
    return Math.round((filledCount / fields.length) * 100);
}

export default function ProfileCompletenessCard({ user, setActiveTab }: Props) {
    const result = getProfileData(user);
    if (!result) return null;
    const { profile, type } = result;
    const hasExistingPhoto = !!profile?.foto;
    const hasExistingPortfolio = !!profile?.file_portofolio || !!profile?.npwp;
    const hasExistingCert = !!profile?.file_sertifikat || !!profile?.siup;
    const isUploaded = hasExistingPortfolio || hasExistingCert || hasExistingPhoto;

    let activeStatus = profile?.verification_status || 'unverified';
    if (activeStatus === 'pending' && !isUploaded) {
        activeStatus = 'unverified';
    }

    if (activeStatus === 'verified' || activeStatus === 'approved') return null;

    const percent = calculateCompleteness(profile, type);

    const config = {
        rejected: {
            bg: 'border-red-200/80',
            text: `Verification Declined: ${profile?.rejection_reason || 'Uploaded documents are invalid or blurred.'}`,
            icon: ShieldAlert,
            iconColor: 'text-red-500',
            btnText: 'Update Credentials',
            badgeBg: 'bg-red-50 text-red-700 border border-red-100',
            progressColor: 'bg-red-500',
        },
        pending: {
            bg: 'border-amber-200/80',
            text: 'Credentials under review! Admin verification takes about 24 hours. You can still fill in remaining profile fields.',
            icon: Clock,
            iconColor: 'text-amber-500',
            btnText: 'Complete Profile Details',
            badgeBg: 'bg-amber-50 text-amber-700 border border-amber-100',
            progressColor: 'bg-amber-500',
        },
        unverified: {
            bg: 'border-gray-150',
            text: percent < 100 
                ? `Your professional profile is ${percent}% complete. Complete all fields and upload documents to get verified and unlock bidding.`
                : 'Your profile is complete! Please request verification in your profile settings to start bidding.',
            icon: ShieldAlert,
            iconColor: 'text-gray-400',
            btnText: percent < 100 ? 'Complete Profile' : 'Request Verification',
            badgeBg: 'bg-gray-50 text-gray-500 border border-gray-200/60',
            progressColor: 'bg-red-600',
        }
    }[activeStatus as 'rejected' | 'pending'] || {
        bg: 'border-gray-150',
        text: `Your professional profile is ${percent}% complete. Complete all fields and upload documents to get verified and unlock bidding.`,
        icon: ShieldAlert,
        iconColor: 'text-gray-400',
        btnText: 'Complete Profile',
        badgeBg: 'bg-gray-50 text-gray-500 border border-gray-200/60',
        progressColor: 'bg-red-600',
    };

    const IconComponent = config.icon;

    return (
        <div className={`bg-white border ${config.bg} rounded-[2rem] p-7 text-gray-900 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden`}>
            <div className="flex-1 space-y-4 relative z-10 w-full">
                <div className="flex items-center gap-3">
                    <div className={`px-3 py-1.5 rounded-xl ${config.badgeBg} flex items-center gap-2 font-bold text-[10px] uppercase tracking-wider`}>
                        <IconComponent size={14} className={`${config.iconColor} shrink-0`} />
                        <span>Profile Completion ({percent}%)</span>
                    </div>
                </div>
                <p className="text-xs text-gray-700 font-semibold leading-relaxed max-w-2xl">
                    {config.text}
                </p>
                <div className="flex items-center gap-4 w-full max-w-md">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${percent}%` }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                            className={`h-full ${config.progressColor} rounded-full`}
                        />
                    </div>
                    <span className="text-xs font-bold text-gray-500 shrink-0">{percent}%</span>
                </div>
            </div>
            <button 
                onClick={() => setActiveTab('profile')}
                className="w-full md:w-auto bg-slate-900 hover:bg-black text-white font-black text-xs uppercase tracking-wider py-4 px-6 rounded-2xl transition-all duration-300 hover:scale-[1.02] flex items-center justify-center gap-2 shrink-0 relative z-10 shadow-lg shadow-neutral-900/10 active:scale-95"
            >
                {config.btnText}
                <ArrowRight size={14} />
            </button>
        </div>
    );
}
