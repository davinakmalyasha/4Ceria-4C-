import React from 'react';
import { BadgeCheck } from 'lucide-react';
import { PortfolioProject } from '../../types/project.types';

export interface ProfileData {
    foto?: string;
    no_telp?: string;
    no_telepon?: string;
    rate_harga?: string;
    pengalaman_tahun?: string;
    pengalaman?: string;
    lokasi?: string;
    alamat?: string;
    deskripsi?: string;
    spesialisasi?: string;
    pendidikan?: string;
    file_sertifikat?: string;
    file_portofolio?: string;
    alasan_hire?: string;
    verification_status?: string;
    nama_perusahaan?: string;
    jenis?: string;
    npwp?: string;
    siup?: string;
    nomor_sk?: string;
    no_kta?: string;
    nisp?: string;
    wilayah_kerja?: string;
    sk_nomor?: string;
    services?: any[];
    ratings?: any[];
    average_rating?: number;
    review_count?: number;
}

export const ROLE_LABELS: Record<string, string> = {
    arsitek: 'Architectural Consultant',
    kontraktor: 'General Contractor',
    interior: 'Interior Designer',
    notaris: 'Notary & Legal Consultant',
    project_manager: 'Project Manager',
    structural: 'Structural Engineer',
    mep: 'MEP Engineer',
};

export function getProfile(user: Record<string, unknown>): ProfileData | null {
    const map: Record<string, string> = {
        arsitek: 'arsitek',
        kontraktor: 'kontraktor',
        notaris: 'notaris_profile',
        interior: 'interior_profile',
        project_manager: 'project_manager',
        structural: 'structural_engineer',
        mep: 'mep_engineer',
    };
    const key = map[user.role_type as string];
    let profile = key ? (user[key] as ProfileData | null) : null;

    // Fallback: If primary profile key is missing, search all possible profile keys
    if (!profile) {
        const possibleKeys = Object.values(map);
        for (const fallbackKey of possibleKeys) {
            if (user[fallbackKey] && typeof user[fallbackKey] === 'object') {
                profile = user[fallbackKey] as ProfileData;
                break;
            }
        }
    }

    // Fallback: If profile key is missing but the user object itself looks like a profile
    if (!profile && (user.deskripsi || user.lokasi || user.pengalaman_tahun || user.spesialisasi)) {
        profile = user as unknown as ProfileData;
    }

    return profile;
}

export const StatPill: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
        <div className="flex items-center gap-1.5 text-gray-400 mb-1">
            {icon}
            <span className="text-[8px] font-black uppercase tracking-widest">{label}</span>
        </div>
        <p className="text-xs font-bold text-slate-900 truncate" title={value}>{value}</p>
    </div>
);

export const resolveStorageUrl = (path?: string | null): string | undefined => {
    if (!path) return undefined;
    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path;
    }
    if (path.startsWith('/storage/')) {
        return path;
    }
    if (path.startsWith('storage/')) {
        return '/' + path;
    }
    return `/storage/${path}`;
};

export const ProfileHeroBanner: React.FC<{ name: string; roleLabel: string; isVerified: boolean; photo?: string }> = ({ name, roleLabel, isVerified, photo }) => (
    <>
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-zinc-900 p-6 pb-16 relative">
            <div className="absolute inset-0 opacity-10">
                <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl -mr-48 -mt-48" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-red-500/10 rounded-full blur-3xl -ml-32 -mb-32" />
            </div>
            <div className="relative z-10 flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Professional Profile</span>
                {isVerified && (
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-full text-[8px] font-black uppercase tracking-wider">
                        <BadgeCheck size={10} /> Verified
                    </span>
                )}
            </div>
        </div>
        <div className="px-6 -mt-10 relative z-10">
            <div className="flex items-end gap-4">
                {photo ? (
                    <img src={resolveStorageUrl(photo)} alt={name} className="w-20 h-20 rounded-2xl object-cover border-4 border-white shadow-xl" />
                ) : (
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center text-white text-3xl font-black border-4 border-white shadow-xl">
                        {name.charAt(0).toUpperCase()}
                    </div>
                )}
                <div className="pb-1 flex-1 min-w-0">
                    <h3 className="text-xl font-black text-slate-900 truncate">{name}</h3>
                    <p className="text-xs font-bold text-red-600 uppercase tracking-widest">{roleLabel}</p>
                </div>
            </div>
        </div>
    </>
);

export const PortfolioItem: React.FC<{ item: PortfolioProject }> = ({ item }) => (
    <div className="rounded-xl overflow-hidden border border-gray-100 group">
        {item.image_path ? (
            <img src={resolveStorageUrl(item.image_path)} alt={item.title} className="w-full h-24 object-cover" />
        ) : (
            <div className="w-full h-24 bg-gray-100 flex items-center justify-center text-gray-300 text-xs">No Image</div>
        )}
        <div className="p-3">
            <h6 className="text-xs font-bold text-gray-900 truncate">{item.title}</h6>
            {item.duration && <p className="text-[10px] text-gray-400 mt-0.5">{item.duration}</p>}
            {item.client_review && (
                <p className="text-[10px] text-gray-500 italic mt-1 line-clamp-2">"{item.client_review}"</p>
            )}
        </div>
    </div>
);
