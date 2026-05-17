import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, Briefcase, FileText, Send, Loader2 } from 'lucide-react';
import { Project } from '../types/project.types';
import axios from 'axios';
import { useToast } from '../context/ToastContext';

interface HireModalProps {
    professional: any; // Accommodates both architect and constructor
    type: 'architect' | 'constructor' | 'interior' | 'notaris' | 'project_manager' | 'structural' | 'mep';
    userProjects: Project[];
    onClose: () => void;
    onSuccess: (projectId: number, bid: any) => void;
}

export default function HireProfessionalModal({ professional, type, userProjects, onClose, onSuccess }: HireModalProps) {
    const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    const { showToast } = useToast();
    const activeProjects = userProjects.filter(p => 
        ['open', 'accepted_arsitek', 'accepted_kontraktor', 'procurement', 'in_progress', 'completed_build', 'awaiting_payment', 'contract_pending', 'planning', 'legal'].includes(p.status)
    );
    const name = professional.nama_perusahaan || professional.nama || 'Professional';
    const roleLabels = {
        architect: professional.spesialisasi || 'Arsitek',
        constructor: professional.jenis || 'Kontraktor',
        interior: professional.spesialisasi || 'Interior Designer',
        notaris: professional.spesialisasi || 'Notaris',
        project_manager: professional.spesialisasi || 'Project Manager',
        structural: 'Structural Engineer',
        mep: 'MEP Engineer'
    };
    const role = roleLabels[type] || 'Professional';

    // Mapping frontend role type to backend invitation role
    const backendRole = type === 'architect' ? 'arsitek' : 
                       type === 'constructor' ? 'kontraktor' : 
                       type === 'notaris' ? 'notaris' : 
                       type === 'project_manager' ? 'project_manager' : 
                       type === 'structural' ? 'structural' : 
                       type === 'mep' ? 'mep' : 'interior';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProjectId) return;
        
        setIsSubmitting(true);
        try {
            const response = await axios.post(`/projects/${selectedProjectId}/invite`, {
                professional_id: professional.id,
                role_type: backendRole,
                message: message
            });

            setShowSuccess(true);
            setTimeout(() => {
                onSuccess(selectedProjectId, response.data.bid);
                onClose();
            }, 2000);

        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to send invitation', 'error');
        } finally {
            setIsSubmitting(false);
        }
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
                                            {activeProjects.map(p => {
                                                let isHired = false;
                                                let hasPending = false;
                                                switch (type) {
                                                    case 'architect': isHired = !!p.selected_arsitek_id; hasPending = (p.bids_arsitek||[]).some(b=>['invited', 'pending', 'negotiating'].includes(b.status)); break;
                                                    case 'constructor': isHired = !!p.selected_kontraktor_id; hasPending = (p.bids_kontraktor||[]).some(b=>['invited', 'pending', 'negotiating'].includes(b.status)); break;
                                                    case 'project_manager': isHired = !!p.pm_id; hasPending = (p.bids_project_manager||[]).some(b=>['invited', 'pending', 'negotiating'].includes(b.status)); break;
                                                    case 'structural': isHired = !!p.structural_id; hasPending = (p.bids_structural||[]).some(b=>['invited', 'pending', 'negotiating'].includes(b.status)); break;
                                                    case 'mep': isHired = !!p.mep_id; hasPending = (p.bids_mep||[]).some(b=>['invited', 'pending', 'negotiating'].includes(b.status)); break;
                                                    case 'notaris': isHired = !!p.selected_notaris_id; break;
                                                    case 'interior': isHired = !!p.selected_interior_id; break;
                                                }
                                                return (
                                                <div 
                                                    key={p.id} 
                                                    onClick={() => !isHired && setSelectedProjectId(p.id)}
                                                    className={`p-4 rounded-xl border-2 transition-all relative overflow-hidden ${selectedProjectId === p.id ? 'border-[#FF2D20] bg-red-50/50 shadow-[0_0_0_4px_rgba(255,45,32,0.1)]' : isHired ? 'border-gray-200 bg-gray-50 opacity-70 cursor-not-allowed' : 'border-gray-100 hover:border-gray-200 bg-white cursor-pointer'}`}
                                                >
                                                    <div className="flex justify-between items-start mb-1">
                                                        <h4 className="font-bold text-gray-900 pr-4">{p.title}</h4>
                                                        <div className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border ${isHired ? 'bg-green-50 text-green-700 border-green-200' : hasPending ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-zinc-100 text-zinc-500 border-zinc-200'}`}>
                                                            {isHired ? '1/1 Terisi' : hasPending ? 'Pending' : `0/1 ${roleLabels[type]}`}
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-gray-500 mt-1 line-clamp-1 pr-16">{p.description}</p>
                                                    <div className="mt-2 text-xs font-bold text-gray-700 bg-white inline-block px-2 py-1 rounded-md shadow-sm border border-gray-100">
                                                        Rp {(p.budget || 0).toLocaleString('id-ID')}
                                                    </div>
                                                </div>
                                            )})}
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
                                        <span className="flex items-center gap-2">Memproses <Loader2 size={18} className="animate-spin" /></span>
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
