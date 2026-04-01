import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, Briefcase, FileText, Send } from 'lucide-react';
import { Project } from '../types/project.types';

interface HireModalProps {
    professional: any; // Accommodates both architect and constructor
    type: 'architect' | 'constructor';
    userProjects: Project[];
    onClose: () => void;
    onSuccess: (projectId: number, message: string) => void;
}

export default function HireProfessionalModal({ professional, type, userProjects, onClose, onSuccess }: HireModalProps) {
    const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    const activeProjects = userProjects.filter(p => p.status === 'open');
    const name = professional.nama_perusahaan || professional.nama || 'Professional';
    const role = type === 'architect' ? (professional.spesialisasi || 'Arsitek') : (professional.jenis || 'Kontraktor');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProjectId) return;
        
        setIsSubmitting(true);
        // Simulate network delay for MVP feel
        setTimeout(() => {
            setIsSubmitting(false);
            setShowSuccess(true);
            setTimeout(() => {
                onSuccess(selectedProjectId, message);
                onClose();
            }, 2000);
        }, 1500);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]"
            >
                <div className="relative h-32 bg-gradient-to-br from-gray-900 to-gray-800 p-6 flex items-end">
                    <div className="absolute right-0 top-0 w-32 h-32 bg-[#FF2D20] rounded-full blur-[60px] opacity-40 mix-blend-screen" />
                    <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-md">
                        <X size={16} />
                    </button>
                    <div className="flex items-center gap-4 relative z-10 w-full">
                        <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-3xl font-black text-gray-900 border-4 border-gray-800 shadow-xl overflow-hidden shrink-0">
                            {professional.user?.pic ? <img src={`/storage/${professional.user.pic}`} className="w-full h-full object-cover" /> : name.charAt(0)}
                        </div>
                        <div className="text-white">
                            <h3 className="font-extrabold text-xl leading-tight line-clamp-1">{name}</h3>
                            <p className="text-gray-300 text-sm font-medium">{role}</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 md:p-8 overflow-y-auto">
                    <AnimatePresence mode="wait">
                        {showSuccess ? (
                            <motion.div key="success" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-10 text-center">
                                <div className="w-20 h-20 rounded-full bg-green-100 text-green-500 flex items-center justify-center mb-6">
                                    <CheckCircle size={40} />
                                </div>
                                <h3 className="text-2xl font-black text-gray-900 mb-2">Penawaran Terkirim!</h3>
                                <p className="text-gray-500 font-medium">{name} akan meninjau tawaran proyek Anda dan segera membalasnya.</p>
                            </motion.div>
                        ) : (
                            <motion.form key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onSubmit={handleSubmit} className="space-y-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                                        <Briefcase size={16} className="text-[#FF2D20]" />
                                        Pilih Proyek Anda
                                    </label>
                                    {activeProjects.length === 0 ? (
                                        <div className="p-4 bg-orange-50 text-orange-800 rounded-xl text-sm font-medium border border-orange-100">
                                            Anda belum memiliki proyek aktif yang bisa ditawarkan. Silakan buat proyek baru di Dashboard terlebih dahulu.
                                        </div>
                                    ) : (
                                        <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                            {activeProjects.map(p => (
                                                <div 
                                                    key={p.id} 
                                                    onClick={() => setSelectedProjectId(p.id)}
                                                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedProjectId === p.id ? 'border-[#FF2D20] bg-red-50/50 shadow-[0_0_0_4px_rgba(255,45,32,0.1)]' : 'border-gray-100 hover:border-gray-200 bg-white'}`}
                                                >
                                                    <h4 className="font-bold text-gray-900">{p.title}</h4>
                                                    <p className="text-xs text-gray-500 mt-1 line-clamp-1">{p.description}</p>
                                                    <div className="mt-2 text-xs font-bold text-gray-700 bg-white inline-block px-2 py-1 rounded-md shadow-sm border border-gray-100">
                                                        Rp {(p.budget || 0).toLocaleString('id-ID')}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                                        <FileText size={16} className="text-[#FF2D20]" />
                                        Pesan Singkat (Opsional)
                                    </label>
                                    <textarea 
                                        value={message}
                                        onChange={e => setMessage(e.target.value)}
                                        placeholder={`Halo ${name}, saya tertarik dengan portofolio Anda dan ingin menawarkan proyek ini...`}
                                        rows={4}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 focus:border-[#FF2D20] focus:ring-4 focus:ring-red-100 rounded-xl transition-all outline-none resize-none text-sm"
                                    />
                                </div>

                                <button 
                                    type="submit" 
                                    disabled={!selectedProjectId || activeProjects.length === 0 || isSubmitting}
                                    className="w-full py-4 px-6 bg-[#FF2D20] hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-bold text-lg transition-all shadow-lg shadow-red-500/30 hover:shadow-red-500/50 flex items-center justify-center gap-2 disabled:shadow-none"
                                >
                                    {isSubmitting ? (
                                        <span className="flex items-center gap-2">Memproses Tawaran <span className="animate-pulse">...</span></span>
                                    ) : (
                                        <>Kirim Tawaran <Send size={18} /></>
                                    )}
                                </button>
                            </motion.form>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
}
