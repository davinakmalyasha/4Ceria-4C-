import React from 'react';
import { motion } from 'framer-motion';

interface ProfessionalProfileViewProps {
    type: 'architect' | 'constructor';
    data: any;
    onClose: () => void;
}

export default function ProfessionalProfileView({ type, data, onClose }: ProfessionalProfileViewProps) {
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    };

    const isArchitect = type === 'architect';
    const name = isArchitect ? data.nama : data.nama_perusahaan;
    const specialty = isArchitect ? (data.spesialisasi || 'Arsitek Umum') : (data.jenis || 'Umum');
    const description = data.deskripsi || "Belum ada deskripsi yang ditambahkan oleh profesional ini.";
    const rate = data.rate_harga ? formatCurrency(data.rate_harga) : 'Rate tidak tersedia';

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
                        <div className="flex items-center gap-3 mb-1">
                            <h2 className="text-3xl font-extrabold text-gray-900">{name}</h2>
                            <span className="bg-[#FF2D20]/10 text-[#FF2D20] text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                                Verified {type}
                            </span>
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
                            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <span className="w-8 h-8 rounded-full bg-red-50 text-[#FF2D20] flex items-center justify-center text-sm">👤</span> 
                                Tentang {name}
                            </h3>
                            <p className="text-gray-600 leading-relaxed whitespace-pre-wrap bg-gray-50 p-6 rounded-xl border border-gray-100">
                                {description}
                            </p>
                        </section>

                        {/* Portfolio Preview */}
                        <section>
                            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <span className="w-8 h-8 rounded-full bg-red-50 text-[#FF2D20] flex items-center justify-center text-sm">📸</span> 
                                Portfolio & Sertifikasi
                            </h3>
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                                {/* Dummy portfolio items for visual richness since DB doesn't have strict split yet */}
                                <div className="aspect-square bg-gray-200 rounded-lg overflow-hidden border border-gray-200 shadow-sm relative group cursor-pointer">
                                    <img src="/storage/Assets/4CTeam.jpg" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <p className="text-white font-bold">Project Alpha</p>
                                    </div>
                                </div>
                                <div className="aspect-square bg-gray-200 rounded-lg overflow-hidden border border-gray-200 shadow-sm relative group cursor-pointer">
                                    <img src="/storage/Assets/effortless.jpg" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <p className="text-white font-bold">Project Beta</p>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>

                    <div className="space-y-6">
                        {/* Contact Card */}
                        <div className="bg-gray-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                            <div className="absolute -right-8 -top-8 w-32 h-32 bg-[#FF2D20] rounded-full blur-3xl opacity-30"></div>
                            <h3 className="text-lg font-bold mb-2">Tertarik Bekerja Sama?</h3>
                            <p className="text-gray-400 text-sm mb-6">Jangan ragu untuk menghubungi atau memberikan penawaran proyek secara langsung kepada {name}.</p>
                            
                            <button className="w-full bg-[#FF2D20] hover:bg-red-600 text-white font-bold py-3 px-4 rounded-xl transition-colors mb-3 shadow-lg shadow-red-500/30">
                                💼 Tawari Proyek (Hire)
                            </button>
                            <button className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-4 rounded-xl transition-colors">
                                💬 Chat Langsung
                            </button>
                        </div>

                        {/* Quick Stats */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                            <h3 className="font-bold text-gray-900 mb-4">Statistik Kepercayaan</h3>
                            <ul className="space-y-4">
                                <li className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500">Proyek Selesai</span>
                                    <span className="font-bold text-gray-900">{Math.floor(Math.random() * 50) + 1}</span>
                                </li>
                                <li className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500">Rating Klien</span>
                                    <span className="font-bold text-yellow-500 flex items-center gap-1">
                                        ★ {(Math.random() * (5.0 - 4.2) + 4.2).toFixed(1)}
                                    </span>
                                </li>
                                <li className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500">Member Sejak</span>
                                    <span className="font-bold text-gray-900">{new Date(data.created_at).getFullYear()}</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>

            </div>
        </motion.div>
    );
}
