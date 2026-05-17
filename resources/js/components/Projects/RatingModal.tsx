import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Star, X, Award, Trophy, Building, Briefcase } from 'lucide-react';
import { useToast } from '../../context/ToastContext';


interface RatingModalProps {
    projectId: number;
    projectTitle: string;
    roleType: 'arsitek' | 'kontraktor' | 'interior' | 'notaris' | 'pm';
    professionalName: string;
    onClose: () => void;
    onRated: () => void;
}

export default function RatingModal({ projectId, projectTitle, roleType, professionalName, onClose, onRated }: RatingModalProps) {
    const [rating, setRating] = useState(0);
    const [hover, setHover] = useState(0);
    const [komentar, setKomentar] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const { showToast } = useToast();

    const handleSubmit = async () => {
        if (rating === 0 || isSubmitting) return;
        setIsSubmitting(true);
        try {
            // Using the ReviewController endpoint
            await axios.post(`/projects/${projectId}/review`, {
                rating,
                comment: komentar,
                target_role: roleType,
            });
            showToast('Review published successfully', 'success');
            setSubmitted(true);
            setTimeout(() => onRated(), 1500);
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to submit rating.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const labels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

    const getRoleLabel = () => {
        switch(roleType) {
            case 'arsitek': return 'Architect';
            case 'kontraktor': return 'Contractor';
            case 'interior': return 'Interior Designer';
            case 'notaris': return 'Notary';
            case 'pm': return 'Project Manager';
            default: return 'Professional';
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 30 }}
                className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md p-10 relative"
                onClick={(e) => e.stopPropagation()}
            >
                <button onClick={onClose} className="absolute top-6 right-6 text-gray-400 hover:text-gray-700 transition-colors p-2 hover:bg-gray-100 rounded-full">
                    <X className="w-5 h-5" />
                </button>

                {submitted ? (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="text-center py-8"
                    >
                        <div className="w-24 h-24 bg-emerald-50 text-emerald-500 rounded-[2rem] flex items-center justify-center mx-auto mb-6 border border-emerald-100 rotate-6 shadow-xl shadow-emerald-500/10">
                            <Trophy className="w-12 h-12" />
                        </div>
                        <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">Terima Kasih!</h3>
                        <p className="text-gray-500 mt-2 text-sm font-medium">Review Anda telah berhasil dipublikasikan.</p>
                    </motion.div>
                ) : (
                    <>
                        <div className="text-center mb-8">
                            <div className="w-20 h-20 bg-gradient-to-br from-amber-400 to-amber-500 rounded-[1.5rem] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-amber-200 rotate-3">
                                <Star className="w-10 h-10 text-white fill-white" />
                            </div>
                            <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter leading-none mb-2">Beri Penilaian</h3>
                            <p className="text-gray-500 text-sm font-medium leading-relaxed">
                                Bagaimana pengalaman Anda bekerja dengan <strong>{professionalName}</strong> ({getRoleLabel()})?
                            </p>
                        </div>

                        <div className="flex justify-center gap-3 mb-4">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    onMouseEnter={() => setHover(star)}
                                    onMouseLeave={() => setHover(0)}
                                    onClick={() => setRating(star)}
                                    className="transition-transform hover:scale-125 active:scale-95"
                                >
                                    <Star
                                        className={`w-12 h-12 transition-all duration-300 ${
                                            star <= (hover || rating) ? 'text-amber-400 fill-amber-400 scale-110 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' : 'text-gray-100'
                                        }`}
                                    />
                                </button>
                            ))}
                        </div>
                        <p className="text-center text-xs font-black text-amber-600 uppercase tracking-widest mb-8 h-4">
                            {labels[hover || rating] || 'Ketuk Bintang'}
                        </p>

                        <div className="space-y-6">
                            <div className="relative group">
                                <textarea
                                    value={komentar}
                                    onChange={(e) => setKomentar(e.target.value)}
                                    placeholder="Ceritakan pengalaman Anda... (opsional)"
                                    rows={4}
                                    maxLength={500}
                                    className="w-full px-6 py-5 border-2 border-gray-100 rounded-3xl bg-gray-50 focus:bg-white focus:border-amber-300 outline-none text-sm font-medium resize-none transition-all"
                                />
                                <div className="absolute bottom-4 right-6 text-[10px] font-black text-gray-300 uppercase tracking-widest">
                                    {komentar.length}/500
                                </div>
                            </div>

                            <button
                                onClick={handleSubmit}
                                disabled={rating === 0 || isSubmitting}
                                className="w-full py-5 bg-gray-900 hover:bg-black text-white font-black text-xs uppercase tracking-[0.2em] rounded-3xl disabled:opacity-40 transition-all shadow-2xl shadow-gray-900/20 active:scale-[0.98]"
                            >
                                {isSubmitting ? 'Mengirim...' : `Kirim Review ${rating > 0 ? rating + ' Bintang' : ''}`}
                            </button>

                            <button
                                onClick={onClose}
                                className="w-full text-gray-400 font-black text-[10px] uppercase tracking-widest hover:text-gray-600 transition-colors"
                            >
                                Lewati Sekarang
                            </button>
                        </div>
                    </>
                )}
            </motion.div>
        </motion.div>
    );
}
