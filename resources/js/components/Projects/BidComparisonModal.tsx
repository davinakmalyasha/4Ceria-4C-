import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, User, Clock, Check, MessageCircle, TrendingDown, Award, MapPin } from 'lucide-react';

interface Bidder {
    id: number;
    name: string;
    location?: string;
    experience_years?: number;
    average_rating?: number;
    review_count?: number;
}

interface Bid {
    id: number;
    price: number;
    price_max?: number;
    fee_type?: string;
    proposal: string;
    estimated_duration?: number;
    duration_unit?: string;
    bidder: Bidder | null;
    type: 'arsitek' | 'kontraktor';
}

interface BidComparisonModalProps {
    bids: Bid[];
    onClose: () => void;
    onAccept: (bidId: number, type: 'arsitek' | 'kontraktor') => void;
    onChat: (bidderId: number) => void;
    formatCurrency: (amount: number) => string;
    projectBudget?: number;
}

export default function BidComparisonModal({ bids, onClose, onAccept, onChat, formatCurrency, projectBudget }: BidComparisonModalProps) {
    const lowestPrice = Math.min(...bids.map(b => b.price));
    const highestRating = Math.max(...bids.map(b => b.bidder?.average_rating || 0));

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
            onClick={onClose}
        >
            <motion.div
                initial={{ y: 50, opacity: 0, scale: 0.95 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 20, opacity: 0, scale: 0.95 }}
                className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 tracking-tight">Bid Comparison Matrix</h2>
                        <p className="text-sm text-gray-500 font-medium">Compare {bids.length} proposals side-by-side</p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-3 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-full transition-all"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Table Content */}
                <div className="flex-1 overflow-x-auto overflow-y-auto p-4 sm:p-8 scrollbar-thin">
                    <div className="min-w-[800px]">
                        <table className="w-full border-separate border-spacing-x-4 border-spacing-y-0">
                            <thead>
                                <tr>
                                    <th className="w-1/5 text-left pb-6"></th>
                                    {bids.map(bid => (
                                        <th key={bid.id} className="pb-6">
                                            <div className="flex flex-col items-center text-center p-6 bg-gray-50 rounded-3xl border border-gray-100 shadow-sm relative group">
                                                {bid.price === lowestPrice && bids.length > 1 && (
                                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#FF2D20] text-white text-[9px] px-3 py-1 rounded-full font-black uppercase tracking-widest shadow-lg animate-bounce">
                                                        Best Value
                                                    </div>
                                                )}
                                                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gray-900 to-black flex items-center justify-center text-white font-black text-xl mb-3 shadow-lg group-hover:scale-110 transition-transform">
                                                    {bid.bidder?.name?.charAt(0).toUpperCase()}
                                                </div>
                                                <h4 className="text-lg font-black text-gray-900 leading-tight">{bid.bidder?.name}</h4>
                                                <p className="text-[10px] font-black text-[#FF2D20] uppercase tracking-widest mt-1">
                                                    {bid.type === 'arsitek' ? 'Architect' : 'Contractor'}
                                                </p>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="space-y-4">
                                {/* Price Row */}
                                <tr className="group">
                                    <td className="py-6 border-b border-gray-50">
                                        <div className="flex items-center gap-2 text-gray-400">
                                            <TrendingDown size={14} />
                                            <span className="text-[11px] font-black uppercase tracking-widest">Total Bid</span>
                                        </div>
                                    </td>
                                    {bids.map(bid => (
                                        <td key={bid.id} className="py-6 text-center border-b border-gray-50">
                                            <div className={`text-2xl font-black ${bid.price === lowestPrice ? 'text-[#FF2D20]' : 'text-gray-900'}`}>
                                                {bid.fee_type === 'percentage' ? (
                                                    bid.price_max && Number(bid.price_max) > 0 ? (
                                                        projectBudget ? (
                                                            `${formatCurrency((Number(bid.price) / 100) * projectBudget)} - ${formatCurrency((Number(bid.price_max) / 100) * projectBudget)}`
                                                        ) : (
                                                            `${bid.price}% - ${bid.price_max}%`
                                                        )
                                                    ) : (
                                                        projectBudget ? formatCurrency((Number(bid.price) / 100) * projectBudget) : `${bid.price}%`
                                                    )
                                                ) : (
                                                    bid.price_max && Number(bid.price_max) > 0 ? (
                                                        `${formatCurrency(bid.price)} - ${formatCurrency(bid.price_max)}`
                                                    ) : (
                                                        formatCurrency(bid.price)
                                                    )
                                                )}
                                            </div>
                                            {bid.fee_type === 'percentage' && (
                                                <div className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-tighter">
                                                    {bid.price_max && Number(bid.price_max) > 0 ? `${bid.price}% - ${bid.price_max}% budget` : `${bid.price}% budget`}
                                                </div>
                                            )}
                                        </td>
                                    ))}
                                </tr>

                                {/* Experience Row */}
                                <tr className="group">
                                    <td className="py-6 border-b border-gray-50">
                                        <div className="flex items-center gap-2 text-gray-400">
                                            <Award size={14} />
                                            <span className="text-[11px] font-black uppercase tracking-widest">Experience</span>
                                        </div>
                                    </td>
                                    {bids.map(bid => (
                                        <td key={bid.id} className="py-6 text-center border-b border-gray-50">
                                            <div className="text-lg font-bold text-gray-700">
                                                {bid.bidder?.experience_years ? `${bid.bidder.experience_years} Years` : 'Not specified'}
                                            </div>
                                        </td>
                                    ))}
                                </tr>

                                {/* Duration Row */}
                                <tr className="group">
                                    <td className="py-6 border-b border-gray-50">
                                        <div className="flex items-center gap-2 text-gray-400">
                                            <Clock size={14} />
                                            <span className="text-[11px] font-black uppercase tracking-widest">Est. Duration</span>
                                        </div>
                                    </td>
                                    {bids.map(bid => (
                                        <td key={bid.id} className="py-6 text-center border-b border-gray-50">
                                            <div className="text-lg font-bold text-gray-700 flex items-center justify-center gap-2">
                                                <Check className="text-emerald-500" size={16} />
                                                {bid.estimated_duration ? `${bid.estimated_duration} ${bid.duration_unit}` : 'Flexible'}
                                            </div>
                                        </td>
                                    ))}
                                </tr>

                                {/* Rating Row */}
                                <tr className="group">
                                    <td className="py-6 border-b border-gray-50">
                                        <div className="flex items-center gap-2 text-gray-400">
                                            <Star size={14} />
                                            <span className="text-[11px] font-black uppercase tracking-widest">Rating</span>
                                        </div>
                                    </td>
                                    {bids.map(bid => (
                                        <td key={bid.id} className="py-6 text-center border-b border-gray-50">
                                            {bid.bidder?.average_rating ? (
                                                <div className="flex flex-col items-center">
                                                    <div className="flex items-center gap-1.5 text-[#FF2D20]">
                                                        <Star size={16} className="fill-[#FF2D20]" />
                                                        <span className="text-xl font-black">{bid.bidder.average_rating}</span>
                                                    </div>
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                                                        {bid.bidder.review_count} client reviews
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-sm text-gray-400 font-medium italic">New Professional</span>
                                            )}
                                        </td>
                                    ))}
                                </tr>

                                {/* Location Row */}
                                <tr className="group">
                                    <td className="py-6 border-b border-gray-50">
                                        <div className="flex items-center gap-2 text-gray-400">
                                            <MapPin size={14} />
                                            <span className="text-[11px] font-black uppercase tracking-widest">Location</span>
                                        </div>
                                    </td>
                                    {bids.map(bid => (
                                        <td key={bid.id} className="py-6 text-center border-b border-gray-50">
                                            <div className="text-sm font-bold text-gray-600">
                                                {bid.bidder?.location || 'Remote'}
                                            </div>
                                        </td>
                                    ))}
                                </tr>

                                {/* Proposal Summary Row */}
                                <tr className="group">
                                    <td className="py-6 border-b border-gray-50 align-top">
                                        <div className="flex items-center gap-2 text-gray-400">
                                            <MessageCircle size={14} />
                                            <span className="text-[11px] font-black uppercase tracking-widest">Pitch Summary</span>
                                        </div>
                                    </td>
                                    {bids.map(bid => (
                                        <td key={bid.id} className="py-6 border-b border-gray-50 px-4">
                                            <div className="text-xs text-gray-600 leading-relaxed max-h-32 overflow-y-auto pr-2 custom-scrollbar italic bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                                                "{bid.proposal.length > 250 ? bid.proposal.substring(0, 250) + '...' : bid.proposal}"
                                            </div>
                                        </td>
                                    ))}
                                </tr>

                                {/* Action Buttons Row */}
                                <tr>
                                    <td className="py-8"></td>
                                    {bids.map(bid => (
                                        <td key={bid.id} className="py-8">
                                            <div className="flex flex-col gap-3 items-center">
                                                <button
                                                    onClick={() => onAccept(bid.id, bid.type)}
                                                    className="w-full max-w-[180px] bg-black hover:bg-[#FF2D20] text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-xl hover:shadow-[#FF2D20]/20 active:scale-95"
                                                >
                                                    Select & Hire
                                                </button>
                                                <button
                                                    onClick={() => onChat(bid.bidder?.id || 0)}
                                                    className="flex items-center justify-center gap-2 text-xs font-bold text-gray-600 hover:text-gray-900 transition-colors"
                                                >
                                                    <MessageCircle size={14} /> Chat to Negotiate
                                                </button>
                                            </div>
                                        </td>
                                    ))}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer Tip */}
                <div className="px-8 py-4 bg-[#FF2D20]/5 text-center shrink-0">
                    <p className="text-[10px] font-black text-[#FF2D20] uppercase tracking-[0.15em] flex items-center justify-center gap-2">
                        <Award size={12} /> Pro-Tip: We recommend selecting professionals with verified reviews & local expertise
                    </p>
                </div>
            </motion.div>
        </motion.div>
    );
}
