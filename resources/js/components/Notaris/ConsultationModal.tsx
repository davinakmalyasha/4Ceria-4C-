import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, X, MessageSquare, Info, ShieldCheck, ArrowRight } from 'lucide-react';
import axios from 'axios';
import { NotarisProfile } from '../../types/notaris.types';

interface ConsultationModalProps {
    notaris: NotarisProfile;
    isOpen: boolean;
    onClose: () => void;
}

export default function ConsultationModal({ notaris, isOpen, onClose }: ConsultationModalProps) {
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        schedule_date: '',
        notes: ''
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await axios.post('/consultations', {
                notaris_id: notaris.id,
                ...formData
            });
            setSuccess(true);
            setTimeout(() => {
                onClose();
                setSuccess(false);
                setFormData({ schedule_date: '', notes: '' });
            }, 2000);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to book consultation');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-zinc-900/40 backdrop-blur-md"
                    />
                    
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className="relative w-full max-w-lg bg-white rounded-[40px] shadow-2xl overflow-hidden border border-gray-100"
                    >
                        {/* Header */}
                        <div className="bg-gradient-to-br from-blue-900 to-black p-8 text-white">
                            <button 
                                onClick={onClose}
                                className="absolute top-6 right-6 p-2 hover:bg-white/10 rounded-full transition-colors"
                            >
                                <X size={20} />
                            </button>
                            
                            <div className="flex items-center gap-4 mb-4">
                                <div className="p-3 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20">
                                    <Calendar className="text-blue-400" size={24} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black tracking-tight">Book Consultation</h2>
                                    <p className="text-blue-100/60 text-sm font-medium">With {notaris.user?.name || 'Legal Professional'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-8">
                            {success ? (
                                <div className="py-12 text-center space-y-4">
                                    <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <ShieldCheck size={40} />
                                    </div>
                                    <h3 className="text-2xl font-black text-gray-900">Request Sent!</h3>
                                    <p className="text-gray-500 font-medium">The legal firm will review your request and confirm the schedule shortly.</p>
                                </div>
                            ) : (
                                <form onSubmit={handleSubmit} className="space-y-6">
                                    <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 flex items-start gap-3 mb-6">
                                        <Info className="text-blue-600 shrink-0 mt-0.5" size={18} />
                                        <p className="text-xs text-blue-900/70 font-bold leading-relaxed">
                                            Consultations are subject to the firm's availability. You will be notified once the schedule is confirmed.
                                        </p>
                                    </div>

                                    <div className="group">
                                        <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">Preferred Schedule</label>
                                        <div className="relative">
                                            <Calendar size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" />
                                            <input 
                                                type="datetime-local"
                                                required
                                                value={formData.schedule_date}
                                                onChange={e => setFormData({ ...formData, schedule_date: e.target.value })}
                                                className="w-full pl-14 pr-6 py-4 bg-gray-50 border-gray-100 border-2 rounded-2xl focus:border-blue-900 focus:bg-white outline-none transition-all font-bold text-gray-900"
                                            />
                                        </div>
                                    </div>

                                    <div className="group">
                                        <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">Consultation Notes</label>
                                        <div className="relative">
                                            <MessageSquare size={18} className="absolute left-5 top-6 text-gray-400" />
                                            <textarea 
                                                value={formData.notes}
                                                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                                rows={4}
                                                placeholder="Explain your legal needs or documents to be discussed..."
                                                className="w-full pl-14 pr-6 py-5 bg-gray-50 border-gray-100 border-2 rounded-2xl focus:border-blue-900 focus:bg-white outline-none transition-all font-bold text-gray-900 resize-none"
                                            />
                                        </div>
                                    </div>

                                    {error && (
                                        <p className="text-red-600 text-xs font-black uppercase text-center">{error}</p>
                                    )}

                                    <button 
                                        disabled={loading}
                                        className="w-full group bg-blue-900 hover:bg-black text-white px-8 py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-xs transition-all shadow-xl hover:shadow-blue-900/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                                    >
                                        {loading ? 'Processing...' : (
                                            <>
                                                Book Consultation <ArrowRight size={16} />
                                            </>
                                        )}
                                    </button>
                                </form>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
