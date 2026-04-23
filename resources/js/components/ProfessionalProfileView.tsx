import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, CheckCircle, MapPin, Briefcase, Calendar, Award, Phone, ShieldCheck, FileText, MessageSquare, ArrowLeft, User as UserIcon, Scale } from 'lucide-react';
import { Project } from '../types/project.types';
import HireProfessionalModal from './HireProfessionalModal';
import ProjectCard from './ProjectCard';
import ProjectDetailModal from './ProjectDetailModal';
import { useAuth } from '../context/AuthContext';
import LegalServiceCard from './Notaris/LegalServiceCard';
import ConsultationModal from './Notaris/ConsultationModal';

interface ProfessionalProfileViewProps {
    type: 'architect' | 'constructor' | 'interior' | 'notaris';
    data: any;
    projects: Project[];
    onClose: () => void;
    onOpenChat: (prof: any) => void;
}

export default function ProfessionalProfileView({ type, data, projects, onClose, onOpenChat }: ProfessionalProfileViewProps) {
    const { user } = useAuth();
    const [showHireModal, setShowHireModal] = useState(false);
    const [showConsultationModal, setShowConsultationModal] = useState(false);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);

    const isOwnProfile = (type === 'architect' && user?.arsitek?.id === data.id) || 
                         (type === 'constructor' && user?.kontraktor?.id === data.id) ||
                         (type === 'interior' && user?.interior_profile?.id === data.id) ||
                         (type === 'notaris' && user?.notaris_profile?.id === data.id);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    };

    const isArchitect = type === 'architect';
    const isInterior = type === 'interior';
    const isNotary = type === 'notaris';
    
    const name = data.user?.name || data.nama_perusahaan || data.nama || (isInterior ? 'Boutique Studio' : isNotary ? 'Legal Firm' : 'Unnamed Professional');
    const specialty = isArchitect ? (data.spesialisasi || 'Arsitek Umum') : isInterior ? (data.spesialisasi || 'Interior Specialist') : isNotary ? (data.spesialisasi || 'Notaris & PPAT') : (data.jenis || 'Umum');
    const description = data.deskripsi || "Belum ada deskripsi yang ditambahkan oleh profesional ini.";
    const rate = data.rate_harga ? formatCurrency(data.rate_harga) : 'Rate tidak tersedia';
    
    // Heuristic for verified fallback: >10 yrs for notary, >5 yrs for arch/interior, >3 for constructor
    const exp = (data.pengalaman_tahun || data.pengalaman || 0);
    const verifiedHeuristic = exp > (isNotary ? 10 : (isArchitect || isInterior ? 5 : 3));
    const isVerified = data.is_verified ?? verifiedHeuristic;

    // Image logic
    const getImageUrl = (path: string | null) => {
        if (!path) return null;
        if (path.startsWith('http')) return path;
        return `/storage/${path}`;
    };

    const hasProfilePic = !!(data.user?.pic || data.foto || data.path_img);
    const profileImage = getImageUrl(data.user?.pic || data.foto || data.path_img);

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
            <div className="h-44 bg-blue-900 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-black to-blue-900 opacity-90" />
                <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
                <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-blue-600/10 blur-[80px] rounded-full" />
            </div>

            {/* Profile Info */}
            <div className="px-8 pb-10 relative">
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
                                <span className="bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-tighter px-3 py-1 rounded border border-blue-100 flex items-center gap-1.5 shrink-0">
                                    <ShieldCheck size={12} /> Verified {type}
                                </span>
                            )}
                        </div>
                        <p className="text-xl font-black text-blue-600 uppercase tracking-widest">{specialty}</p>
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
                        <section>
                            <h3 className="text-xl font-black text-zinc-900 mb-6 flex items-center gap-3">
                                <span className="w-1.5 h-6 bg-blue-900 rounded-full" /> Tentang {name}
                            </h3>
                            <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
                                <p className="text-gray-600 leading-relaxed whitespace-pre-wrap text-lg font-medium">
                                    {description}
                                </p>
                            </div>
                        </section>

                        {/* Services Section for Notaries */}
                        {isNotary && (
                            <section>
                                <h3 className="text-xl font-black text-zinc-900 mb-6 flex items-center gap-3">
                                    <span className="w-1.5 h-6 bg-blue-900 rounded-full" /> Legal Service Catalog
                                </h3>
                                
                                {data.services && data.services.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {data.services.map((service: any) => (
                                            <LegalServiceCard 
                                                key={service.id} 
                                                service={service} 
                                                onBook={() => setShowConsultationModal(true)}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl p-10 text-center">
                                        <Scale className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                        <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">No fixed-price service bundles listed yet</p>
                                        <p className="text-gray-400 text-xs mt-1">Contact for custom legal inquiries</p>
                                    </div>
                                )}
                            </section>
                        )}

                        <section className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm relative z-10">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                                <h3 className="text-xl font-black text-zinc-900 flex items-center gap-3">
                                    <span className="w-1.5 h-6 bg-blue-900 rounded-full shrink-0" /> {isNotary ? 'Document Samples' : 'Portfolio Projects'}
                                </h3>
                                {(data.file_portofolio || data.file_sertifikat) && (
                                    <div className="flex flex-wrap gap-3">
                                        {data.file_portofolio && (
                                            <a href={`/storage/${data.file_portofolio}`} target="_blank" rel="noreferrer" className="px-4 py-2 bg-blue-50 text-blue-700 text-sm font-bold rounded-xl hover:bg-blue-100 transition-colors flex items-center gap-2 border border-blue-100">
                                                <FileText size={16} /> {isNotary ? 'Credentials' : 'Portfolio PDF'}
                                            </a>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {data.projects && data.projects.length > 0 ? (
                                    data.projects.map((project: Project) => (
                                        <ProjectCard 
                                            key={project.id} 
                                            project={project} 
                                            onClick={setSelectedProject} 
                                        />
                                    ))
                                ) : (
                                    <div className="md:col-span-2 w-full py-16 text-center bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                                        <p className="text-gray-400 font-medium">Belum ada {isNotary ? 'sampel' : 'portofolio'} proyek yang diunggah.</p>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>

                    <div className="space-y-6 md:sticky md:top-8 md:h-fit pb-10">
                        {/* Contact Card */}
                        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden border border-gray-700">
                            <div className="absolute -right-12 -top-12 w-40 h-40 bg-blue-600 rounded-full blur-[60px] opacity-40"></div>
                            <div className="relative z-10">
                                <h3 className="text-2xl font-black mb-3">Interested?</h3>
                                <p className="text-gray-300 text-sm mb-8 leading-relaxed">Hubungi untuk konsultasi atau tawari proyek langsung.</p>
                                
                                {isOwnProfile ? (
                                    <div className="bg-white/10 border border-white/20 rounded-2xl p-6 text-center">
                                        <UserIcon size={24} className="text-white mx-auto mb-3" />
                                        <p className="text-sm font-bold uppercase tracking-widest">Your Profile</p>
                                    </div>
                                ) : (
                                    <>
                                        {isNotary ? (
                                            <button onClick={() => setShowConsultationModal(true)} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl transition-all shadow-lg hover:-translate-y-0.5 uppercase tracking-widest text-sm mb-4 flex items-center justify-center gap-2">
                                                <Scale size={18} /> Book Consultation
                                            </button>
                                        ) : (
                                            <button onClick={() => setShowHireModal(true)} className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-4 rounded-2xl transition-all shadow-lg hover:-translate-y-0.5 uppercase tracking-widest text-sm mb-4">
                                                Hire Professional
                                            </button>
                                        )}
                                        <button onClick={() => onOpenChat(data)} className="w-full bg-white/10 hover:bg-white/20 border border-white/5 text-white font-black py-4 rounded-2xl transition-all flex items-center justify-center tracking-widest text-xs uppercase gap-2 mb-4">
                                            <MessageSquare size={16} /> Send Message
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Quick Stats */}
                        <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-sm">
                            <h3 className="font-extrabold text-gray-900 mb-6 text-lg">Trust Stats</h3>
                            <ul className="space-y-5">
                                <li className="flex justify-between items-center text-sm border-b border-gray-50 pb-4">
                                    <span className="text-gray-500 font-medium">{isNotary ? 'SK Number' : 'Projects Done'}</span>
                                    <span className="font-black text-gray-900 text-lg">{isNotary ? (data.nomor_sk || 'Verified') : (data.projects?.length || 0)}</span>
                                </li>
                                <li className="flex justify-between items-center text-sm border-b border-gray-50 pb-4">
                                    <span className="text-gray-500 font-medium">{isNotary ? 'Work Area' : 'Experience'}</span>
                                    <span className="font-black text-gray-900 text-lg">{isNotary ? (data.wilayah_kerja || 'National') : `${exp} Years`}</span>
                                </li>
                                <li className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500 font-medium">Client Rating</span>
                                    <span className="font-black text-yellow-500 flex items-center gap-1.5 text-xl">
                                        <Star size={16} className="fill-current" /> {data.average_rating ? Number(data.average_rating).toFixed(1) : "N/A"}
                                    </span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {showHireModal && (
                    <HireProfessionalModal professional={data} type={type} userProjects={projects} onClose={() => setShowHireModal(false)} onSuccess={() => {}} />
                )}
                {showConsultationModal && (
                    <ConsultationModal notaris={data} isOpen={showConsultationModal} onClose={() => setShowConsultationModal(false)} />
                )}
                {selectedProject && (
                    <ProjectDetailModal project={selectedProject} onClose={() => setSelectedProject(null)} />
                )}
            </AnimatePresence>
        </motion.div>
    );
}
