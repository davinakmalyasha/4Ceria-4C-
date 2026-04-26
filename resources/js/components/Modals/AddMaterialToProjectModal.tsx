import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, Briefcase, FileText, Send, Loader2 } from 'lucide-react';
import axios from 'axios';
import { useToast } from '../../context/ToastContext';

interface AddMaterialToProjectModalProps {
    material: any;
    onClose: () => void;
}

export default function AddMaterialToProjectModal({ material, onClose }: AddMaterialToProjectModalProps) {
    const { showToast } = useToast();
    const [projects, setProjects] = useState<{id: number, title: string}[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
    const [notes, setNotes] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        const fetchProjects = async () => {
            try {
                const res = await axios.get('/user/active-projects');
                setProjects(res.data.data);
            } catch (err) {
                showToast('Failed to load your projects', 'error');
            } finally {
                setIsLoading(false);
            }
        };
        fetchProjects();
    }, [showToast]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProjectId) return;

        setIsSubmitting(true);
        try {
            await axios.post(`/projects/${selectedProjectId}/requirements`, {
                name: material.name,
                quantity_required: 1, // Default to 1, user can adjust in project dashboard
                unit: material.unit || 'unit',
                category: material.category?.toLowerCase() || 'general',
                notes: `Added from Marketplace: ${material.description || ''}\n\nUser Notes: ${notes}`,
                quality_level: 'premium'
            });

            setShowSuccess(true);
            setTimeout(() => {
                onClose();
            }, 2000);
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to add material to project', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]"
            >
                <div className="relative h-32 bg-gradient-to-br from-gray-900 to-gray-800 p-6 flex items-end">
                    <div className="absolute right-0 top-0 w-32 h-32 bg-red-500 rounded-full blur-[60px] opacity-40 mix-blend-screen" />
                    <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-md">
                        <X size={16} />
                    </button>
                    <div className="flex items-center gap-4 relative z-10 w-full">
                        <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center text-3xl font-black text-gray-900 border-2 border-gray-800 shadow-xl overflow-hidden shrink-0">
                            {material.images?.[0]?.image_path ? (
                                <img src={`/storage/${material.images[0].image_path}`} className="w-full h-full object-cover" />
                            ) : material.name.charAt(0)}
                        </div>
                        <div className="text-white">
                            <h3 className="font-extrabold text-xl leading-tight line-clamp-1">{material.name}</h3>
                            <p className="text-gray-300 text-sm font-medium">{material.category}</p>
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
                                <h3 className="text-2xl font-black text-gray-900 mb-2">Material Ditambahkan!</h3>
                                <p className="text-gray-500 font-medium">{material.name} telah masuk ke daftar kebutuhan proyek Anda.</p>
                            </motion.div>
                        ) : (
                            <motion.form key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onSubmit={handleSubmit} className="space-y-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                                        <Briefcase size={16} className="text-red-500" />
                                        Pilih Proyek Tujuan
                                    </label>
                                    
                                    {isLoading ? (
                                        <div className="flex items-center justify-center py-8">
                                            <Loader2 size={24} className="animate-spin text-gray-300" />
                                        </div>
                                    ) : projects.length === 0 ? (
                                        <div className="p-4 bg-orange-50 text-orange-800 rounded-xl text-sm font-medium border border-orange-100">
                                            Anda belum memiliki proyek aktif. Silakan buat proyek baru di Dashboard terlebih dahulu.
                                        </div>
                                    ) : (
                                        <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                            {projects.map(p => (
                                                <div 
                                                    key={p.id} 
                                                    onClick={() => setSelectedProjectId(p.id)}
                                                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedProjectId === p.id ? 'border-red-500 bg-red-50/50 shadow-[0_0_0_4px_rgba(255,45,32,0.1)]' : 'border-gray-100 hover:border-gray-200 bg-white'}`}
                                                >
                                                    <h4 className="font-bold text-gray-900">{p.title}</h4>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                                        <FileText size={16} className="text-red-500" />
                                        Catatan Kebutuhan (Opsional)
                                    </label>
                                    <textarea 
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        placeholder="Tentukan kuantitas atau area pemasangan untuk material ini..."
                                        rows={3}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 focus:border-red-500 focus:ring-4 focus:ring-red-100 rounded-xl transition-all outline-none resize-none text-sm"
                                    />
                                </div>

                                <button 
                                    type="submit" 
                                    disabled={!selectedProjectId || projects.length === 0 || isSubmitting}
                                    className="w-full py-4 px-6 bg-gray-900 hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-bold text-lg transition-all shadow-lg shadow-gray-200 flex items-center justify-center gap-2 disabled:shadow-none"
                                >
                                    {isSubmitting ? (
                                        <span className="flex items-center gap-2">Memproses <Loader2 size={18} className="animate-spin" /></span>
                                    ) : (
                                        <>Tambahkan ke Proyek <Send size={18} /></>
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
