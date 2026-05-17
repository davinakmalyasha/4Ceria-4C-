import React from 'react';
import { MapPin, Clock, Star, Briefcase, GraduationCap, Phone, Building2, FileCheck, Pencil, ShieldCheck } from 'lucide-react';
import { PortfolioProject } from '../../types/project.types';
import { getProfile, ROLE_LABELS, StatPill, PortfolioItem, ProfileHeroBanner } from './ProfilePreviewHelpers';
import { PortfolioManager } from '../Dashboard/PortfolioManager';

interface Props {
    user: { id: number; name: string; email: string; role_type: string; [key: string]: unknown };
    portfolios?: PortfolioProject[];
    compact?: boolean;
    showPortfolioManager?: boolean;
    onEdit?: () => void;
}

export const ProfilePreviewCard: React.FC<Props> = ({ 
    user, 
    portfolios = [], 
    compact = false,
    showPortfolioManager = false,
    onEdit
}) => {
    const profile = getProfile(user);
    const roleLabel = ROLE_LABELS[user.role_type] || user.role_type;
    const isVerified = profile?.verification_status === 'verified' || profile?.verification_status === 'approved';
    const skills = profile?.spesialisasi ? profile.spesialisasi.split(',').map(s => s.trim()).filter(Boolean) : [];
    const description = profile?.deskripsi || profile?.alasan_hire;
    const education = profile?.pendidikan;
    const experience = profile?.pengalaman_tahun || profile?.pengalaman;
    const location = profile?.lokasi || profile?.alamat;
    const rate = profile?.rate_harga;
    const company = profile?.nama_perusahaan;
    const getPhoneNumber = () => {
        if (Array.isArray(user.phone_number) && user.phone_number.length > 0) {
            const first = user.phone_number[0];
            return first.contact || first.phone_number || first.no_telp || first.phone || (typeof first === 'string' ? first : null);
        }
        
        const possiblePhones = [
            user.phone_number, user.phoneNumber, user.phone, user.no_telp,
            profile?.no_telp, profile?.no_telepon, profile?.phone, profile?.phoneNumber
        ];
        
        return possiblePhones.find(p => p && typeof p === 'string' && p.trim().length > 0 && p !== 'null' && p !== 'undefined');
    };
    
    const phone = getPhoneNumber() as string | undefined;

    return (
        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden relative">
            {onEdit && (
                <button 
                    onClick={onEdit}
                    className="absolute top-6 right-6 z-20 flex items-center gap-2 bg-white/90 backdrop-blur text-gray-900 px-4 py-2 rounded-xl font-bold text-xs hover:bg-white transition-all shadow-xl"
                >
                    <Pencil size={14} />
                    Edit Profile
                </button>
            )}

            <ProfileHeroBanner name={user.name} roleLabel={roleLabel} isVerified={isVerified} photo={profile?.foto} />

            {/* Stats */}
            <div className="px-8 mt-6">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {experience && <StatPill icon={<Clock size={13} />} label="Experience" value={`${experience} yr${Number(experience) !== 1 ? 's' : ''}`} />}
                    {location && <StatPill icon={<MapPin size={13} />} label="Office Loc" value={location} />}
                    {profile?.wilayah_kerja && <StatPill icon={<MapPin size={13} />} label="Work Area" value={profile.wilayah_kerja} />}
                    {(rate !== undefined && rate !== null && Number(rate) > 0) && <StatPill icon={<Star size={13} />} label="Base Rate" value={`Rp ${Number(rate).toLocaleString('id-ID')}`} />}
                    {(profile?.average_rating !== undefined && profile?.average_rating !== null) && (
                        <StatPill 
                            icon={<Star size={13} className="text-amber-400 fill-amber-400" />} 
                            label="Rating" 
                            value={`${Number(profile.average_rating).toFixed(1)} (${profile.review_count || 0} reviews)`} 
                        />
                    )}
                    {company && <StatPill icon={<Building2 size={13} />} label="Company" value={company} />}
                    {phone && <StatPill icon={<Phone size={13} />} label="Contact" value={phone} />}
                    {portfolios.length > 0 && <StatPill icon={<Briefcase size={13} />} label="Portfolio" value={`${portfolios.length} project${portfolios.length !== 1 ? 's' : ''}`} />}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 px-8 mt-8 pb-10">
                <div className="md:col-span-8 space-y-8">
                    {/* Bio */}
                    {description && (
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block">About Professional</label>
                            <p className={`text-base text-gray-600 leading-relaxed ${compact ? 'line-clamp-3' : ''}`}>{description}</p>
                        </div>
                    )}

                    {/* Service Catalog */}
                    {profile?.services && profile.services.length > 0 && (
                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block">Service Catalog</label>
                            <div className="grid grid-cols-1 gap-3">
                                {profile.services.map((service: any, idx: number) => (
                                    <div key={idx} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between group hover:border-blue-200 transition-all">
                                        <div>
                                            <h6 className="text-sm font-black text-gray-900 group-hover:text-blue-600 transition-colors">{service.title || service.name}</h6>
                                            {service.description && <p className="text-xs text-gray-500 mt-1">{service.description}</p>}
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Fixed Price</p>
                                            <p className="text-sm font-bold text-gray-900">Rp {Number(service.price).toLocaleString('id-ID')}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Specializations */}
                    {skills.length > 0 && (
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block mb-3">Specializations</label>
                            <div className="flex flex-wrap gap-2">
                                {skills.map((skill, i) => (
                                    <span key={i} className="px-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-xs font-bold border border-slate-100">
                                        {skill}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Portfolio Section */}
                    {showPortfolioManager ? (
                        <div className="pt-8 border-t border-gray-100">
                            <PortfolioManager />
                        </div>
                    ) : (
                        portfolios.length > 0 && !compact && (
                            <div className="pt-8 border-t border-gray-100">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block mb-4">Portfolio Highlights</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {portfolios.slice(0, 4).map(p => <PortfolioItem key={p.id} item={p} />)}
                                </div>
                                {portfolios.length > 4 && <p className="text-xs font-bold text-gray-400 text-center mt-4">+{portfolios.length - 4} more projects</p>}
                            </div>
                        )
                    )}
                </div>

                <div className="md:col-span-4 space-y-8">
                    {/* Credentials */}
                    {(education || profile?.file_sertifikat) && !compact && (
                        <div className="bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block mb-4">Credentials</label>
                            <div className="space-y-4">
                                {education && (
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 bg-blue-100 rounded-lg text-blue-600 mt-0.5">
                                            <GraduationCap size={16} />
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-1">Education</p>
                                            <p className="text-sm font-bold text-gray-800">{education}</p>
                                        </div>
                                    </div>
                                )}
                                {(profile?.nomor_sk || profile?.no_kta || profile?.nisp || profile?.sk_nomor) && (
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 bg-purple-100 rounded-lg text-purple-600 mt-0.5">
                                            <ShieldCheck size={16} />
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-1">License / SK</p>
                                            <p className="text-sm font-bold text-gray-800">
                                                {profile?.nomor_sk || profile?.no_kta || profile?.nisp || profile?.sk_nomor}
                                            </p>
                                        </div>
                                    </div>
                                )}
                                {profile?.file_sertifikat && (
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 bg-amber-100 rounded-lg text-amber-600 mt-0.5">
                                            <FileCheck size={16} />
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-1">Certification</p>
                                            <p className="text-sm font-bold text-gray-800">Verified Certificate</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
