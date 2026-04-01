import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Building2, Calendar, DollarSign, CheckCircle2, XCircle, Clock, ArrowRight } from 'lucide-react';
import { formatCurrency } from '../../types/project.types';

interface Bid {
    id: number;
    project_id: number;
    price: number;
    proposal: string;
    status: 'pending' | 'accepted' | 'rejected';
    created_at: string;
    project?: {
        id: number;
        title: string;
        budget: number;
        location?: string;
        status: string;
    };
}

interface Props {
    bids: Bid[];
    isLoading: boolean;
    onViewProject: (projectId: number) => void;
}

export default function MyBidsList({ bids, isLoading, onViewProject }: Props) {
    if (isLoading) {
        return (
            <div className="w-full space-y-4 animate-pulse">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-32 bg-white rounded-2xl border border-gray-100 shadow-sm"></div>
                ))}
            </div>
        );
    }

    if (bids.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm">
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                    <FileText className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">No active proposals</h3>
                <p className="text-gray-500 text-center max-w-sm mb-8">
                    You haven't submitted any bids yet. Explore the Open Bidding Tenders to find your next project.
                </p>
            </div>
        );
    }

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'accepted': return { icon: CheckCircle2, colors: 'text-emerald-700 bg-emerald-50 border-emerald-200', label: 'Accepted' };
            case 'rejected': return { icon: XCircle, colors: 'text-red-700 bg-red-50 border-red-200', label: 'Rejected' };
            default: return { icon: Clock, colors: 'text-amber-700 bg-amber-50 border-amber-200', label: 'Pending Review' };
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <AnimatePresence>
                {bids.map((bid) => {
                    const statusConfig = getStatusConfig(bid.status);
                    const StatusIcon = statusConfig.icon;
                    
                    return (
                        <motion.div 
                            key={bid.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row gap-6 relative overflow-hidden group"
                        >
                            {/* Status Accent Line */}
                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusConfig.colors.split(' ')[1]}`} />
                            
                            <div className="flex-1 flex flex-col justify-between">
                                <div>
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="text-lg font-bold text-gray-900 line-clamp-1">{bid.project?.title || 'Unknown Project'}</h4>
                                        <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shrink-0 ${statusConfig.colors}`}>
                                            <StatusIcon className="w-3.5 h-3.5" />
                                            {statusConfig.label}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs font-medium text-gray-500 mb-4">
                                        <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {bid.project?.location || 'Remote'}</span>
                                        <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {new Date(bid.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-sm text-gray-600 line-clamp-2">
                                        <span className="font-bold text-gray-800 pr-2 block mb-1 uppercase text-[10px] tracking-wider">Your Proposal:</span>
                                        "{bid.proposal}"
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex flex-col justify-between items-end md:w-48 shrink-0 border-t md:border-t-0 md:border-l border-gray-100 pt-4 md:pt-0 md:pl-6">
                                <div className="text-right w-full mb-4 md:mb-0">
                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center justify-end gap-1"><DollarSign className="w-3 h-3"/> Offered Price</div>
                                    <div className="text-xl font-extrabold text-[#FF2D20]">{formatCurrency(bid.price)}</div>
                                </div>
                                
                                {bid.project && (
                                    <button 
                                        onClick={() => onViewProject(bid.project!.id)}
                                        className="w-full flex items-center justify-center gap-2 bg-white border-2 border-gray-200 hover:border-gray-900 text-gray-900 font-bold py-2.5 px-4 rounded-xl text-sm transition-colors group/btn"
                                    >
                                        View Project
                                        <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
