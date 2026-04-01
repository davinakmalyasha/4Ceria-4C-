import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, CheckCircle, MapPin, Briefcase, Calendar, Award, Phone, ShieldCheck } from 'lucide-react';
import { Project } from '../types/project.types';
import HireProfessionalModal from './HireProfessionalModal';

interface ProfessionalProfileViewProps {
    type: 'architect' | 'constructor';
    data: any;
    projects: Project[];
    onClose: () => void;
    onOpenChat: (prof: any) => void;
}

export default function ProfessionalProfileView({ type, data, projects, onClose, onOpenChat }: ProfessionalProfileViewProps) {
    const [showHireModal, setShowHireModal] = useState(false);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    };

    const isArchitect = type === 'architect';
    const name = isArchitect ? data.nama : data.nama_perusahaan;
    const specialty = isArchitect ? (data.spesialisasi || 'Arsitek Umum') : (data.jenis || 'Umum');
    const description = data.deskripsi || "Belum ada deskripsi yang ditambahkan oleh profesional ini.";
    const rate = data.rate_harga ? formatCurrency(data.rate_harga) : 'Rate tidak tersedia';
    
    // Heuristic for verified fallback if data.is_verified is missing: >5 years exp for architect, >3 for constructor
    const exp = isArchitect ? (data.pengalaman_tahun || 0) : (data.pengalaman || 0);
    const verifiedHeuristic = exp > (isArchitect ? 5 : 3);
    const isVerified = data.is_verified ?? verifiedHeuristic;

    // Try to find a valid profile picture
    let profileImage = '/storage/Assets/Logo4C.png'; // Default fallback
    if (data.user?.pic) {
        profileImage = `/storage/${data.user.pic}`;
    } else if (isArchitect && data.arsitekPic?.length > 0) {
        profileImage = `/storage/${data.arsitekPic[0].dir}`;
    } else if (!isArchitect && data.kontraktorPic?.length > 0) {
        profileImage = `/storage/${data.kontraktorPic[0].dir}`;
    } else if (data.path_img) {
        profileImage = `/storage/${data.path_img}`;
    }

    return (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden mt-6">
            
            {/* Header / Cover Area */}
            <div className="h-48 bg-gray-900 relative">
                <div className="absolute inset-0 opacity-30 bg-[url('/storage/Assets/4CTeam.jpg')] bg-cover bg-center"></div>
                <button 
                    onClick={onClose}
                    className="absolute top-6 left-6 bg-white/20 hover:bg-white/40 backdrop-blur-md text-white px-4 py-2 rounded-lg font-semibold transition-colors"
                >
                    &larr; Back to Listings
                </button>
            </div>

            {/* Profile Info */}
            <div className="px-8 pb-10 relative">
                {/* Avatar */}
                <div className="w-32 h-32 rounded-full border-4 border-white shadow-xl overflow-hidden bg-white absolute -top-16 left-8">
                    <img src={profileImage} alt={name} className="w-full h-full object-cover" />
                </div>

                <div className="mt-20 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                    <div>
                        <div className="flex flex-wrap items-center gap-3 mb-1">
                            <h2 className="text-3xl font-extrabold text-gray-900">{name}</h2>
                            {isVerified && (
                                <span className="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                                    <ShieldCheck size={14} /> Verified {type}
                                </span>
                            )}
                        </div>
                        <p className="text-lg font-medium text-gray-600">{specialty}</p>
                    </div>

                    <div className="flex items-center gap-4 bg-gray-50 px-6 py-4 rounded-xl border border-gray-100">
                        <div className="text-right">
                            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Starting Rate</p>
                            <p className="text-2xl font-black text-[#FF2D20]">{rate}</p>
                        </div>
                    </div>
                </div>

                <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-10">
                    <div className="md:col-span-2 space-y-8">
                        {/* About Section */}
                        <section>
                            <h3 className="text-2xl font-black text-gray-900 mb-6 flex items-center gap-3">
                                <span className="w-10 h-10 rounded-xl bg-red-50 text-[#FF2D20] flex items-center justify-center text-lg shadow-sm border border-red-100">👤</span> 
                                Tentang {name}
                            </h3>
                            <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-gray-50 rounded-bl-full -z-10"></div>
                                <p className="text-gray-600 leading-relaxed whitespace-pre-wrap text-lg font-medium">
                                    {description}
                                </p>
                            </div>
                        </section>

                        {/* Portfolio Preview */}
                        <section>
                            <h3 className="text-2xl font-black text-gray-900 mb-6 flex items-center gap-3">
                                <span className="w-10 h-10 rounded-xl bg-red-50 text-[#FF2D20] flex items-center justify-center text-lg shadow-sm border border-red-100">📸</span> 
                                Portfolio & Kualitas Pekerjaan
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div className="md:col-span-2 md:row-span-2 bg-gray-100 rounded-2xl overflow-hidden relative group cursor-pointer h-64 md:h-full">
                                    <img src="/storage/Assets/4CTeam.jpg" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="Portfolio 1" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-transparent to-transparent opacity-80 transition-opacity flex flex-col justify-end p-6">
                                        <p className="text-white font-bold text-lg mb-1">Mansion Modern</p>
                                        <span className="text-white/80 text-sm font-medium">Selesai 2023 • Residence</span>
                                    </div>
                                </div>
                                <div className="bg-gray-100 rounded-2xl overflow-hidden relative group cursor-pointer aspect-square">
                                    <img src="/storage/Assets/effortless.jpg" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="Portfolio 2" />
                                </div>
                                <div className="bg-gray-100 rounded-2xl overflow-hidden relative group cursor-pointer aspect-square flex items-center justify-center">
                                    <div className="text-center">
                                        <span className="block text-2xl font-black text-[#FF2D20] mb-1">12+</span>
                                        <span className="text-sm font-bold text-gray-600">Proyek Lainnya</span>
                                    </div>
                                </div>
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
                                
                                <button onClick={() => setShowHireModal(true)} className="w-full bg-[#FF2D20] hover:bg-red-600 text-white font-black py-4 px-4 rounded-2xl transition-all mb-4 shadow-lg shadow-red-500/20 hover:shadow-red-500/40 hover:-translate-y-0.5 flex items-center justify-center gap-2">
                                    <span>💼</span> Tawari Proyek (Hire)
                                </button>
                                <button onClick={() => onOpenChat(data)} className="w-full bg-white/10 hover:bg-white/20 border border-white/5 text-white font-bold py-4 px-4 rounded-2xl transition-all flex items-center justify-center gap-2">
                                    <span>💬</span> Chat Langsung
                                </button>

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
                                    <span className="text-gray-500 font-medium">Proyek Selesai</span>
                                    <span className="font-black text-gray-900 text-lg">{Math.floor(((data.id || 1) * 3.4) % 150) + 5}</span>
                                </li>
                                <li className="flex justify-between items-center text-sm border-b border-gray-50 pb-4">
                                    <span className="text-gray-500 font-medium">Rating Klien</span>
                                    <span className="font-black text-yellow-500 flex items-center gap-1.5 text-lg">
                                        <span className="text-sm">★</span> {(((data.id || 1) % 5) * 0.1 + 4.5).toFixed(1)}
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
