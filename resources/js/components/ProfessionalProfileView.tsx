import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, CheckCircle, MapPin, Briefcase, Calendar, Award, Phone, ShieldCheck, FileText, MessageSquare, ArrowLeft, User as UserIcon } from 'lucide-react';
import { Project } from '../types/project.types';
import HireProfessionalModal from './HireProfessionalModal';
import { useAuth } from '../context/AuthContext';

interface ProfessionalProfileViewProps {
    type: 'architect' | 'constructor';
    data: any;
    projects: Project[];
    onClose: () => void;
    onOpenChat: (prof: any) => void;
}

export default function ProfessionalProfileView({ type, data, projects, onClose, onOpenChat }: ProfessionalProfileViewProps) {
    const { user } = useAuth();
    const [showHireModal, setShowHireModal] = useState(false);

    const isOwnProfile = (type === 'architect' && user?.arsitek?.id === data.id) || 
                         (type === 'constructor' && user?.kontraktor?.id === data.id);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    };

    const isArchitect = type === 'architect';
    const name = data.nama_perusahaan || data.nama || 'Unnamed Professional';
    const specialty = isArchitect ? (data.spesialisasi || 'Arsitek Umum') : (data.jenis || 'Umum');
    const description = data.deskripsi || "Belum ada deskripsi yang ditambahkan oleh profesional ini.";
    const rate = data.rate_harga ? formatCurrency(data.rate_harga) : 'Rate tidak tersedia';
    
    // Heuristic for verified fallback if data.is_verified is missing: >5 years exp for architect, >3 for constructor
    const exp = isArchitect ? (data.pengalaman_tahun || 0) : (data.pengalaman || 0);
    const verifiedHeuristic = exp > (isArchitect ? 5 : 3);
    const isVerified = data.is_verified ?? verifiedHeuristic;

    // Image logic
    const hasProfilePic = !!(data.user?.pic || data.foto || data.path_img);
    const profileImage = data.user?.pic ? `/storage/${data.user.pic}` 
                       : data.foto ? `/storage/${data.foto}` 
                       : data.path_img ? `/storage/${data.path_img}` 
                       : null;

    // Initials for fallback
    const initials = name.split(' ').map((n: any) => n[0]).join('').toUpperCase().slice(0, 2);

    return (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="bg-white rounded-3xl overflow-hidden relative border border-gray-100">
            {/* Back Button */}
            <div className="absolute top-6 left-8 z-[70] flex items-center gap-3">
                <button 
                    onClick={onClose}
                    className="group flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/20 rounded-xl text-white transition-all shadow-xl hover:shadow-white/10 active:scale-95"
                >
                    <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                    <span className="text-[11px] font-black uppercase tracking-widest text-white">Back</span>
                </button>
            </div>
            
            {/* Header / Cover Area */}
            <div className="h-44 bg-zinc-900 relative overflow-hidden">
                {/* Default Mesh/Gradient Background if no banner uploaded yet */}
                <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-black to-zinc-900 opacity-90" />
                <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
                <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-red-600/10 blur-[80px] rounded-full" />
            </div>

            {/* Profile Info */}
            <div className="px-8 pb-10 relative">
                {/* Avatar */}
                <div className="w-32 h-32 rounded-[28px] border-4 border-white shadow-xl overflow-hidden bg-white absolute -top-16 left-8 flex items-center justify-center">
                    {hasProfilePic ? (
                        <img src={profileImage!} alt={name} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full bg-zinc-100 flex items-center justify-center text-zinc-400">
                             <span className="text-3xl font-black tracking-tighter">{initials}</span>
                        </div>
                    )}
                </div>

                <div className="md:pl-36 pt-20 md:pt-4 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                    <div>
                        <div className="flex flex-wrap items-center gap-3 mb-1">
                            <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">{name}</h2>
                            {isVerified && (
                                <span className="bg-red-50 text-red-700 text-[10px] font-black uppercase tracking-tighter px-3 py-1 rounded border border-red-100 flex items-center gap-1.5 shrink-0">
                                    <ShieldCheck size={12} /> Verified {type}
                                </span>
                            )}
                        </div>
                        <p className="text-xl font-black text-red-600 uppercase tracking-widest">{specialty}</p>
                    </div>

                    <div className="flex items-center gap-4 bg-gray-50 px-6 py-4 rounded-xl border border-gray-100">
                        <div className="text-right">
                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-0.5">Starting Rate</p>
                            <p className="text-2xl font-black text-zinc-900">{rate}</p>
                        </div>
                    </div>
                </div>

                <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-10">
                    <div className="md:col-span-2 space-y-8">
                        {/* About Section */}
                        <section>
                            <h3 className="text-xl font-black text-zinc-900 mb-6 flex items-center gap-3">
                                <span className="w-1.5 h-6 bg-red-600 rounded-full" /> 
                                Tentang {name}
                            </h3>
                            <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-gray-50 rounded-bl-full -z-10"></div>
                                <p className="text-gray-600 leading-relaxed whitespace-pre-wrap text-lg font-medium">
                                    {description}
                                </p>
                            </div>
                        </section>

                        {/* Education & Why Hire Me */}
                        {(data.pendidikan || data.alasan_hire) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {data.pendidikan && (
                                    <section>
                                        <h3 className="text-xl font-black text-zinc-900 mb-6 flex items-center gap-3 text-sm uppercase tracking-wider">
                                            <span className="w-1.5 h-4 bg-red-600" /> 
                                            Pendidikan
                                        </h3>
                                        <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                                            <p className="text-gray-600 text-sm italic">
                                                {data.pendidikan}
                                            </p>
                                        </div>
                                    </section>
                                )}
                                {data.alasan_hire && (
                                    <section>
                                        <h3 className="text-xl font-black text-zinc-900 mb-6 flex items-center gap-3 text-sm uppercase tracking-wider">
                                            <span className="w-1.5 h-4 bg-red-600" /> 
                                            Mengapa Harus Saya?
                                        </h3>
                                        <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                                            <p className="text-gray-600 text-sm">
                                                {data.alasan_hire}
                                            </p>
                                        </div>
                                    </section>
                                )}
                            </div>
                        )}

                        {/* Portfolio Preview */}
                        <section className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm relative z-10">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                                <h3 className="text-xl font-black text-zinc-900 flex items-center gap-3">
                                    <span className="w-1.5 h-6 bg-red-600 rounded-full shrink-0" /> 
                                    Portfolio & Kualitas Pekerjaan
                                </h3>
                                {(data.file_portofolio || data.file_sertifikat) && (
                                    <div className="flex flex-wrap gap-3">
                                        {data.file_portofolio && (
                                            <a 
                                                href={`/storage/${data.file_portofolio}`} 
                                                target="_blank" 
                                                rel="noreferrer"
                                                className="px-4 py-2 bg-red-50 text-red-700 text-sm font-bold rounded-xl hover:bg-red-100 transition-colors flex items-center gap-2 border border-red-100"
                                            >
                                                <FileText size={16} /> Buka PDF Portfolio
                                            </a>
                                        )}
                                        {data.file_sertifikat && (
                                            <a 
                                                href={`/storage/${data.file_sertifikat}`} 
                                                target="_blank" 
                                                rel="noreferrer"
                                                className="px-4 py-2 bg-blue-50 text-blue-700 text-sm font-bold rounded-xl hover:bg-blue-100 transition-colors flex items-center gap-2 border border-blue-100"
                                            >
                                                <Award size={16} /> Buka Sertifikat
                                            </a>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                {data.foto ? (
                                    <div className="w-full h-80 bg-gray-100 rounded-2xl overflow-hidden relative group cursor-pointer shadow-sm">
                                        <img 
                                            src={`/storage/${data.foto}`} 
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                                            alt={`Portfolio ${name}`} 
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                                            <p className="text-white text-sm font-bold uppercase tracking-widest">Foto Hasil Kerja Terbaik</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full py-16 text-center bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                                        <p className="text-gray-400 font-medium">Belum ada foto hasil pekerjaan yang diunggah.</p>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>

                    <div className="space-y-6 md:sticky md:top-8 md:h-fit pb-10">
                        {/* Contact Card */}
                        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden border border-gray-700">
                            <div className="absolute -right-12 -top-12 w-40 h-40 bg-[#FF2D20] rounded-full blur-[60px] opacity-40"></div>
                            <div className="relative z-10">
                                <h3 className="text-2xl font-black mb-3">Tertarik Bekerja Sama?</h3>
                                <p className="text-gray-300 text-sm mb-8 leading-relaxed">Jangan ragu untuk menghubungi atau memberikan penawaran proyek secara langsung kepada {name}.</p>
                                
                                {isOwnProfile ? (
                                    <div className="bg-white/10 border border-white/20 rounded-2xl p-6 text-center">
                                        <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <UserIcon size={24} className="text-white" />
                                        </div>
                                        <p className="text-sm font-bold uppercase tracking-widest text-white mb-1">Your Profile</p>
                                        <p className="text-xs text-gray-300">This is how other users see your professional profile.</p>
                                    </div>
                                ) : (
                                    <>
                                        <button onClick={() => setShowHireModal(true)} className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-4 px-4 rounded-2xl transition-all mb-4 shadow-lg shadow-red-600/20 hover:shadow-red-600/40 hover:-translate-y-0.5 flex items-center justify-center uppercase tracking-widest text-sm">
                                            Tawari Proyek (Hire)
                                        </button>
                                        
                                        <div className="flex gap-2 mb-2">
                                            <button onClick={() => onOpenChat(data)} className="flex-1 bg-white/10 hover:bg-white/20 border border-white/5 text-white font-black py-4 rounded-2xl transition-all flex flex-col items-center justify-center tracking-[0.2em] text-[10px] uppercase gap-1.5">
                                                <MessageSquare size={16} /> Internal
                                            </button>
                                            
                                            {(() => {
                                                let rawNumber = data.no_telp || data.no_telepon || '';
                                                if (!rawNumber && data.user?.phone_number && data.user.phone_number.length > 0) {
                                                    rawNumber = data.user.phone_number[0].contact;
                                                }
                                                
                                                if (!rawNumber) return null;
                                                
                                                let cleanNumber = rawNumber.replace(/\D/g, '');
                                                if (cleanNumber.startsWith('0')) {
                                                    cleanNumber = '62' + cleanNumber.substring(1);
                                                }
                                                
                                                return (
                                                    <a 
                                                        href={`https://wa.me/${cleanNumber}`} 
                                                        target="_blank" 
                                                        rel="noreferrer"
                                                        className="flex-1 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 text-white font-black py-4 rounded-2xl transition-all shadow-lg hover:shadow-green-500/20 hover:-translate-y-0.5 flex flex-col items-center justify-center tracking-[0.2em] text-[10px] uppercase gap-1.5"
                                                    >
                                                        <Phone size={16} /> WhatsApp
                                                    </a>
                                                );
                                            })()}
                                        </div>
                                    </>
                                )}

                                <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-400 font-medium">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                    Tersedia untuk proyek baru
                                </div>
                            </div>
                        </div>

                        {/* Quick Stats */}
                        <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-sm">
                            <h3 className="font-extrabold text-gray-900 mb-6 text-lg">Statistik Kepercayaan</h3>
                            <ul className="space-y-5">
                                <li className="flex justify-between items-center text-sm border-b border-gray-50 pb-4">
                                    <span className="text-gray-500 font-medium">Proyek Dikerjakan</span>
                                    <span className="font-black text-gray-900 text-lg">{data.projects ? data.projects.length : 0}</span>
                                </li>
                                <li className="flex justify-between items-center text-sm border-b border-gray-50 pb-4">
                                    <span className="text-gray-500 font-medium">Rating Klien</span>
                                    <span className="font-black text-yellow-500 flex items-center gap-1.5 text-lg">
                                        <Star size={14} className="fill-current" /> {data.average_rating ? Number(data.average_rating).toFixed(1) : "Baru"}
                                    </span>
                                </li>
                                <li className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500 font-medium">Member Sejak</span>
                                    <span className="font-bold text-gray-900">{data.created_at ? new Date(data.created_at).getFullYear() : '2023'}</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            <AnimatePresence>
                {showHireModal && (
                    <HireProfessionalModal 
                        professional={data}
                        type={type}
                        userProjects={projects}
                        onClose={() => setShowHireModal(false)}
                        onSuccess={() => {}}
                    />
                )}
            </AnimatePresence>
        </motion.div>
    );
}
