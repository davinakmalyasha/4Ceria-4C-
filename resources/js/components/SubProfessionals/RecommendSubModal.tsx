import React, { useState } from 'react';
import { ProjectSubProfessional } from '../../types/sub_professional.types';

interface RecommendSubModalProps {
    sub: ProjectSubProfessional | null;
    onClose: () => void;
    onRecommend: (subId: number, fee: number, notes: string) => Promise<boolean>;
}

const RecommendSubModal: React.FC<RecommendSubModalProps> = ({ sub, onClose, onRecommend }) => {
    const [fee, setFee] = useState<number>(sub?.rate || 0);
    const [notes, setNotes] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!sub) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        const success = await onRecommend(sub.id, fee, notes);
        setIsSubmitting(false);
        if (success) onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
                <div className="p-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Recommend Specialist</h3>
                    <p className="text-sm text-gray-500 mb-6">
                        Recommend <span className="font-semibold text-gray-700">{sub.user?.name}</span> to the owner for formal hiring.
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Negotiated Fee (Rp)</label>
                            <input
                                type="number"
                                value={fee}
                                onChange={(e) => setFee(Number(e.target.value))}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                required
                                min="0"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Recommendation Note</label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg h-32 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Explain why you recommend this professional..."
                                required
                            />
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-lg shadow-blue-200 disabled:opacity-50"
                            >
                                {isSubmitting ? 'Sending...' : 'Send Recommendation'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default RecommendSubModal;
