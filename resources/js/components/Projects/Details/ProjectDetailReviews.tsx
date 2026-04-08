import React from 'react';
import { Star } from 'lucide-react';

interface Props {
    detail: any;
    reviewRating: number;
    setReviewRating: (v: number) => void;
    reviewComment: string;
    setReviewComment: (v: string) => void;
    reviewSubmitting: boolean;
    onSubmit: (e: React.FormEvent) => void;
    isFullyCompleted: boolean;
}

export const ProjectDetailReviews: React.FC<Props> = ({
    detail, reviewRating, setReviewRating, reviewComment, setReviewComment,
    reviewSubmitting, onSubmit, isFullyCompleted
}) => {
    return (
        <div className="space-y-6 pt-8 border-t border-zinc-100">
            <h4 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                Executive Review
                {isFullyCompleted && <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-black uppercase tracking-widest">Completed</span>}
            </h4>

            {/* Existing Review Display */}
            {(detail?.review_arsitek || detail?.review_kontraktor) ? (
                <div className="space-y-4">
                    {[detail.review_arsitek, detail.review_kontraktor].filter(Boolean).map((review, i) => (
                        <div key={i} className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800 shadow-xl shadow-zinc-200 group">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex gap-1 text-amber-400">
                                    {[...Array(5)].map((_, j) => (
                                        <Star key={j} size={16} fill={j < review.rating ? 'currentColor' : 'none'} className={j < review.rating ? '' : 'text-zinc-700'} />
                                    ))}
                                </div>
                                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">{new Date(review.created_at).toLocaleDateString('id-ID')}</span>
                            </div>
                            <p className="text-white font-bold text-lg leading-relaxed italic">"{review.comment}"</p>
                        </div>
                    ))}
                </div>
            ) : isFullyCompleted ? (
                <form onSubmit={onSubmit} className="bg-white rounded-3xl p-8 border border-zinc-100 shadow-xl shadow-zinc-100 border-dashed animate-pulse-slow">
                    <div className="text-center space-y-2 mb-8">
                        <h5 className="text-xl font-black text-gray-900">Project Delivered!</h5>
                        <p className="text-gray-400 text-sm">Please finalize the project by rating the professional's performance.</p>
                    </div>

                    <div className="flex flex-col items-center gap-6 mb-8">
                        <div className="flex gap-4">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    type="button"
                                    onClick={() => setReviewRating(star)}
                                    className={`p-2 transition-transform active:scale-90 ${reviewRating >= star ? 'text-amber-400' : 'text-gray-200'}`}
                                >
                                    <Star size={40} fill={reviewRating >= star ? 'currentColor' : 'none'} strokeWidth={2.5} />
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Select rating from 1 to 5</p>
                    </div>

                    <div className="space-y-2 mb-8">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Collaborative Experience Review</label>
                        <textarea 
                            value={reviewComment}
                            onChange={e => setReviewComment(e.target.value)}
                            rows={3}
                            placeholder="Write your feedback regarding the professional's workmanship, communication, and delivery..."
                            className="w-full px-5 py-4 rounded-2xl border border-zinc-100 focus:border-red-500 bg-zinc-50/50 outline-none transition-all font-bold text-zinc-900 text-sm shadow-inner resize-none"
                            required
                        />
                    </div>

                    <button 
                        type="submit"
                        disabled={reviewSubmitting || reviewRating === 0}
                        className="w-full bg-red-600 hover:bg-black text-white py-5 rounded-2xl font-black text-[11px] uppercase tracking-[0.4em] shadow-xl shadow-red-100 transition-all active:scale-95 disabled:opacity-50"
                    >
                        {reviewSubmitting ? 'Finalizing...' : 'Submit Executive Review'}
                    </button>
                </form>
            ) : (
                <div className="bg-zinc-50 rounded-2xl p-6 border border-zinc-100 flex items-center justify-center text-center">
                    <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest leading-relaxed">
                        Final review will be available once all milestones are 100% completed.
                    </p>
                </div>
            )}
        </div>
    );
};
