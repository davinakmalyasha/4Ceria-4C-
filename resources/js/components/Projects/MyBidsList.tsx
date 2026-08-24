import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Building2, Calendar, DollarSign, CheckCircle2, XCircle, Clock, ArrowRight, Send } from 'lucide-react';
import { formatCurrency } from '../../types/project.types';

interface Bid {
    id: number;
    project_id: number;
    price: number;
    price_max?: number;
    calculated_total?: number;
    fee_type?: string;
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
    onViewProject: (project: any) => void;
    initialSubTab?: string | null;
    onSubTabChange?: (tab: string) => void;
    onPrefetch?: (projectId: number) => void;
}

export default function MyBidsList({ bids, isLoading, onViewProject, initialSubTab, onSubTabChange, onPrefetch }: Props) {
    const [activeTab, setActiveTab] = React.useState(initialSubTab || 'proposals');

    React.useEffect(() => {
        if (initialSubTab) setActiveTab(initialSubTab);
    }, [initialSubTab]);

    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        onSubTabChange?.(tab);
    };

    if (isLoading) {
        return (
            <div className="w-full space-y-4 animate-pulse">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-32 bg-white rounded-2xl border border-gray-100 shadow-sm"></div>
                ))}
            </div>
        );
    }

    const proposals = bids.filter(b => b.status !== 'invited');
    const invitations = bids.filter(b => b.status === 'invited');
    const displayBids = activeTab === 'proposals' ? proposals : invitations;

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'accepted': return { icon: CheckCircle2, colors: 'text-emerald-700 bg-emerald-50 border-emerald-200', label: 'Accepted' };
            case 'rejected': return { icon: XCircle, colors: 'text-red-700 bg-red-50 border-red-200', label: 'Rejected' };
            case 'invited': return { icon: Send, colors: 'text-slate-700 bg-slate-50 border-slate-200', label: 'Invited (Response Required)' };
            default: return { icon: Clock, colors: 'text-amber-700 bg-amber-50 border-amber-200', label: 'Pending Review' };
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex bg-gray-100 p-1 rounded-2xl w-fit">
                <button
                    onClick={() => handleTabChange('proposals')}
                    className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                        activeTab === 'proposals' 
                            ? 'bg-white text-gray-900 shadow-sm' 
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                    }`}
                >
                    Active Proposals ({proposals.length})
                </button>
                <button
                    onClick={() => handleTabChange('invitations')}
                    className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                        activeTab === 'invitations' 
                            ? 'bg-white text-gray-900 shadow-sm' 
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                    }`}
                >
                    Invitations 
                    {invitations.length > 0 && (
                        <span className="w-5 h-5 bg-slate-100 text-slate-700 rounded-full flex items-center justify-center text-[10px] font-black">
                            {invitations.length}
                        </span>
                    )}
                </button>
            </div>

            {displayBids.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                        {activeTab === 'proposals' ? <FileText className="w-8 h-8 text-gray-300" /> : <Send className="w-8 h-8 text-gray-300" />}
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                        {activeTab === 'proposals' ? 'No active proposals' : 'No invitations yet'}
                    </h3>
                    <p className="text-gray-500 text-center max-w-sm mb-8">
                        {activeTab === 'proposals' 
                            ? "You haven't submitted any bids yet. Explore the Open Bidding Tenders to find your next project."
                            : "You haven't received any project invitations. Complete your profile to attract more clients!"}
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    <AnimatePresence mode="popLayout">
                        {displayBids.map((bid) => {
                    const statusConfig = getStatusConfig(bid.status);
                    const StatusIcon = statusConfig.icon;
                    
                    return (
                        <motion.div 
                            key={bid.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            onMouseEnter={() => bid.project?.id && onPrefetch?.(bid.project.id)}
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
                                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-sm text-gray-600">
                                        <span className="font-bold text-gray-800 pr-2 block mb-2 uppercase text-[10px] tracking-wider">Your Proposal:</span>
                                        <p className="line-clamp-3 italic">"{bid.proposal}"</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex flex-col justify-between items-end md:w-48 shrink-0 border-t md:border-t-0 md:border-l border-gray-100 pt-4 md:pt-0 md:pl-6">
                                <div className="text-right w-full mb-4 md:mb-0">
                                    {bid.status === 'invited' ? (
                                        <div className="flex flex-col items-end gap-1.5 mt-2">
                                            <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] bg-amber-50 px-2 py-1 rounded-md border border-amber-100/50">Response Required</span>
                                            <span className="text-[10px] font-bold text-gray-400">View project to accept</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center justify-end gap-1">
                                                <DollarSign className="w-3 h-3"/> 
                                                {bid.fee_type === 'percentage' ? 'Estimated Fee' : 'Offered Price'}
                                            </div>
                                            <div className="text-xl font-extrabold text-zinc-900">
                                                {bid.fee_type === 'percentage' ? (
                                                    bid.price_max && Number(bid.price_max) > 0 ? (
                                                        bid.project?.budget ? (
                                                            `${formatCurrency((Number(bid.price) / 100) * bid.project.budget)} - ${formatCurrency((Number(bid.price_max) / 100) * bid.project.budget)}`
                                                        ) : (
                                                            `${bid.price}% - ${bid.price_max}%`
                                                        )
                                                    ) : (
                                                        bid.calculated_total ? formatCurrency(bid.calculated_total) : `${bid.price}%`
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
                                                    {bid.price_max && Number(bid.price_max) > 0 ? (
                                                        `${bid.price}% - ${bid.price_max}% of project budget`
                                                    ) : (
                                                        `${bid.price}% of project budget`
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                                
                                {bid.project && (
                                    <button 
                                        onClick={() => {
                                            const proj: any = { ...bid.project };
                                            if ('arsitek_id' in bid) proj.bids_arsitek = [bid];
                                            else if ('kontraktor_id' in bid) proj.bids_kontraktor = [bid];
                                            else if ('interior_id' in bid) proj.bids_interior = [bid];
                                            else if ('notaris_id' in bid) proj.bids_notaris = [bid];
                                            else if ('pm_id' in bid) proj.bids_project_manager = [bid];
                                            else if ('structural_id' in bid) proj.bids_structural = [bid];
                                            else if ('mep_id' in bid) proj.bids_mep = [bid];
                                            
                                            onViewProject(proj);
                                        }}
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
            )}
        </div>
    );
}
