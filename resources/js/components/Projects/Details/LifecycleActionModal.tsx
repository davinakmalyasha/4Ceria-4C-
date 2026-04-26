import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, ShieldAlert, LogOut } from 'lucide-react';

interface LifecycleActionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => Promise<void>;
    title: string;
    description: string;
    type: 'fire' | 'resign';
    roleLabel?: string;
    proName?: string;
}

export default function LifecycleActionModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    type,
    roleLabel,
    proName
}: LifecycleActionModalProps) {
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reason.trim()) return;

        setIsSubmitting(true);
        try {
            await onConfirm(reason);
            onClose();
        } catch (error) {
            // Error handling is expected to be handled by the parent's toast system
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
                    >
                        {/* Header Decoration */}
                        <div className={`h-2 w-full ${type === 'fire' ? 'bg-red-500' : 'bg-amber-500'}`} />
                        
                        <div className="p-8 sm:p-10">
                            <div className="flex items-center justify-between mb-6">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                                    type === 'fire' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'
                                }`}>
                                    {type === 'fire' ? <ShieldAlert size={28} /> : <LogOut size={28} />}
                                </div>
                                <button 
                                    onClick={onClose}
                                    className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="space-y-2 mb-8">
                                <h3 className="text-2xl font-black text-gray-900 tracking-tight leading-tight">
                                    {title}
                                </h3>
                                <p className="text-sm text-gray-500 font-medium leading-relaxed">
                                    {description}
                                </p>
                            </div>

                            {proName && roleLabel && (
                                <div className="mb-8 p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-[10px] font-black text-gray-400 uppercase">
                                        {proName.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">{roleLabel}</p>
                                        <p className="text-sm font-bold text-gray-900">{proName}</p>
                                    </div>
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                                        Alasan {type === 'fire' ? 'Pemutusan' : 'Pengunduran Diri'}
                                    </label>
                                    <textarea
                                        required
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        placeholder="Berikan alasan yang jelas dan profesional..."
                                        className="w-full min-h-[120px] p-5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-200 transition-all resize-none"
                                    />
                                    <div className="flex items-center gap-2 text-[10px] font-bold text-amber-600 mt-2 px-1">
                                        <AlertTriangle size={12} />
                                        <span>Tindakan ini bersifat permanen dan akan dicatat dalam histori proyek.</span>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                                    <button
                                        type="submit"
                                        disabled={isSubmitting || !reason.trim()}
                                        className={`flex-1 py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 ${
                                            type === 'fire' 
                                            ? 'bg-red-500 text-white hover:bg-red-600 shadow-red-100' 
                                            : 'bg-slate-900 text-white hover:bg-black shadow-slate-100'
                                        }`}
                                    >
                                        {isSubmitting ? 'Memproses...' : type === 'fire' ? 'Putus Kontrak Sekarang' : 'Konfirmasi Resign'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        disabled={isSubmitting}
                                        className="px-8 py-4 bg-gray-100 text-gray-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-200 transition-all active:scale-[0.98]"
                                    >
                                        Batal
                                    </button>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
