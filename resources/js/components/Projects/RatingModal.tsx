import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Star, X, Award } from 'lucide-react';

interface RatingModalProps {
    projectId: number;
    projectTitle: string;
    hasArsitek: boolean;
    hasKontraktor: boolean;
    onClose: () => void;
    onRated: () => void;
}

export default function RatingModal({ projectId, projectTitle, hasArsitek, hasKontraktor, onClose, onRated }: RatingModalProps) {
    const [rating, setRating] = useState(0);
    const [hover, setHover] = useState(0);
    const [komentar, setKomentar] = useState('');
    const [targetType, setTargetType] = useState<'arsitek' | 'kontraktor'>(hasArsitek ? 'arsitek' : 'kontraktor');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async () => {
        if (rating === 0 || isSubmitting) return;
        setIsSubmitting(true);
        try {
            await axios.post(`/projects/${projectId}/rate`, {
                rating,
                komentar,
                target_type: targetType,
            });
            setSubmitted(true);
            setTimeout(() => onRated(), 1500);
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to submit rating.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const labels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

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
                className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 relative"
                onClick={(e) => e.stopPropagation()}
            >
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors">
                    <X className="w-5 h-5" />
                </button>

                {submitted ? (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="text-center py-8"
                    >
                        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Award className="w-10 h-10 text-emerald-600" />
                        </div>
                        <h3 className="text-xl font-extrabold text-gray-900">Thank You! 🎉</h3>
                        <p className="text-gray-500 mt-2 text-sm">Your review has been published.</p>
                    </motion.div>
                ) : (
                    <>
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-200">
                                <Star className="w-8 h-8 text-white fill-white" />
                            </div>
                            <h3 className="text-xl font-extrabold text-gray-900">Project Completed!</h3>
                            <p className="text-gray-500 text-sm mt-1 max-w-xs mx-auto">
                                Rate the professional who worked on <strong>"{projectTitle}"</strong>
                            </p>
                        </div>

                        {hasArsitek && hasKontraktor && (
                            <div className="flex gap-2 mb-5">
                                <button
                                    onClick={() => setTargetType('arsitek')}
                                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${targetType === 'arsitek' ? 'bg-gray-900 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                >
                                    🏛️ Architect
                                </button>
                                <button
                                    onClick={() => setTargetType('kontraktor')}
                                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${targetType === 'kontraktor' ? 'bg-gray-900 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                >
                                    🏗️ Contractor
                                </button>
                            </div>
                        )}

                        <div className="flex justify-center gap-2 mb-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    onMouseEnter={() => setHover(star)}
                                    onMouseLeave={() => setHover(0)}
                                    onClick={() => setRating(star)}
                                    className="transition-transform hover:scale-125 active:scale-95"
                                >
                                    <Star
                                        className={`w-10 h-10 transition-colors ${
                                            star <= (hover || rating) ? 'text-amber-400 fill-amber-400' : 'text-gray-200'
                                        }`}
                                    />
                                </button>
                            ))}
                        </div>
                        <p className="text-center text-sm font-bold text-gray-500 mb-5 h-5">
                            {labels[hover || rating] || 'Tap a star'}
                        </p>

                        <textarea
                            value={komentar}
                            onChange={(e) => setKomentar(e.target.value)}
                            placeholder="Share your experience working with them... (optional)"
                            rows={3}
                            maxLength={1000}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-300 outline-none text-sm resize-none mb-5"
                        />

                        <button
                            onClick={handleSubmit}
                            disabled={rating === 0 || isSubmitting}
                            className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold rounded-xl disabled:opacity-40 transition-all shadow-lg shadow-amber-200"
                        >
                            {isSubmitting ? 'Submitting...' : `Submit ${rating > 0 ? rating + ' Star' + (rating > 1 ? 's' : '') : ''} Review`}
                        </button>

                        <button
                            onClick={onClose}
                            className="w-full mt-3 py-2.5 text-gray-500 font-semibold text-sm hover:text-gray-700 transition-colors"
                        >
                            Skip for now
                        </button>
                    </>
                )}
            </motion.div>
        </motion.div>
    );
}
