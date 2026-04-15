import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Clock, DollarSign, Check, X, Loader2, 
    Shield, Users, Hammer, CreditCard, 
    ChevronDown, ChevronUp, Construction, Info
} from 'lucide-react';
import { CONSTRUCTION_METHODS, PAYMENT_SCHEDULE_OPTIONS } from '../../../constants/ContractorStandardPresets';
import { PM_SERVICE_SCOPES, PM_DELIVERABLES, PM_FEE_TYPES, stripPMAutomatedProposal } from '../../../constants/ProjectManagerStandardPresets';

interface BidReviewCardProps {
    bid: any;
    phaseKey: string;
    onAction: (bidId: number, action: 'accept' | 'decline') => void;
    isActioning: boolean;
    isPM?: boolean;
    readOnly?: boolean;
}

export const BidReviewCard: React.FC<BidReviewCardProps> = ({ bid, phaseKey, onAction, isActioning, isPM, readOnly }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const isContractor = phaseKey === 'build';

    // Data normalization for different professional types
    const proName = isPM ? (bid.pm?.nama || bid.pm?.user?.name) : (bid.bidder?.name || 'Professional');
    const proInitial = proName?.charAt(0).toUpperCase() || 'P';

    // Helper to find labels
    const getMethodLabel = (id: string) => CONSTRUCTION_METHODS.find(m => m.id === id)?.label || id;
    const getPaymentLabel = (id: string) => PAYMENT_SCHEDULE_OPTIONS.find(p => p.id === id)?.label || id;

    return (
        <div className="bg-white border border-gray-100 rounded-[1.5rem] p-5 hover:border-zinc-900 group transition-all shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-zinc-900 flex items-center justify-center text-sm font-black text-white shadow-xl">
                        {proInitial}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h4 className="font-black text-gray-900 text-base">{proName}</h4>
                            {isContractor && bid.construction_method && (
                                <span className="px-2 py-0.5 bg-zinc-100 text-[10px] font-black uppercase text-zinc-500 rounded-md tracking-wider">
                                    {getMethodLabel(bid.construction_method)}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-[11px] font-bold text-gray-400">
                            <span className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-lg">
                                <DollarSign size={13} className="text-emerald-500" />
                                <span className="text-gray-900">Rp {Number(bid.price).toLocaleString('id-ID')}</span>
                            </span>
                            <span className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-lg">
                                <Clock size={13} className="text-blue-500" />
                                <span className="text-gray-900">{bid.estimated_duration} {bid.duration_unit}</span>
                            </span>
                            {isContractor && bid.warranty_months && (
                                <span className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-lg">
                                    <Shield size={13} className="text-amber-500" />
                                    <span className="text-gray-900">{bid.warranty_months} Months</span>
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {!readOnly && (
                    <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                            <button 
                                onClick={() => onAction(bid.id, 'decline')}
                                disabled={isActioning}
                                className="p-3 bg-gray-50 text-gray-400 rounded-xl hover:bg-red-50 hover:text-red-600 transition-all disabled:opacity-50"
                                title="Decline"
                            >
                                <X size={18} />
                            </button>
                            <button 
                                onClick={() => onAction(bid.id, 'accept')}
                                disabled={isActioning}
                                className="px-6 py-2.5 bg-zinc-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600 shadow-lg shadow-zinc-200 transition-all flex items-center gap-2 disabled:opacity-50"
                            >
                                {isActioning ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                Accept
                            </button>
                        </div>
                        {(isContractor || isPM) && (
                            <button 
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="flex items-center justify-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-zinc-900 transition-all py-1"
                            >
                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                {isExpanded ? 'Show Less' : 'Details'}
                            </button>
                        )}
                    </div>
                )}

                {readOnly && (isContractor || isPM) && (
                    <button 
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-3 bg-gray-50 text-gray-400 rounded-xl hover:bg-zinc-100 hover:text-zinc-900 transition-all"
                        title="View Details"
                    >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                )}
            </div>

            {/* Proposal Snippet */}
            {bid.proposal && (
                <div className="mt-4 px-4 py-3 bg-zinc-50 rounded-xl border-l-4 border-zinc-200 italic text-[12px] text-gray-500 leading-relaxed font-medium">
                    "{isPM ? stripPMAutomatedProposal(bid.proposal) : bid.proposal}"
                </div>
            )}

            {/* Always Visible PM Details */}
            {isPM && (
                <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <Users size={12} /> Management Scope
                        </label>
                        <div className="space-y-2">
                            {(bid.scopes || []).length > 0 ? (bid.scopes || []).map((sId: string) => {
                                const scope = PM_SERVICE_SCOPES.find(x => x.id === sId);
                                return (
                                    <div key={sId} className="flex items-center gap-2 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                                        <div className="w-1.5 h-1.5 bg-zinc-900 rounded-full" />
                                        <span className="text-[11px] font-bold text-gray-700">{scope?.label || sId}</span>
                                    </div>
                                );
                            }) : (
                                <div className="text-[11px] font-bold text-gray-400 italic p-3 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                    No specific management scopes defined.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Shield size={12} /> Key Deliverables
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {(bid.deliverables || []).length > 0 ? (bid.deliverables || []).map((dId: string) => {
                                    const del = PM_DELIVERABLES.find(x => x.id === dId);
                                    return (
                                        <span key={dId} className="px-3 py-1.5 bg-zinc-900 text-white text-[9px] font-black uppercase tracking-wider rounded-lg">
                                            {del?.label || dId}
                                        </span>
                                    );
                                }) : (
                                    <span className="text-[11px] font-bold text-gray-400 italic">No key deliverables listed.</span>
                                )}
                            </div>
                        </div>

                        <div className="bg-zinc-100 p-4 rounded-2xl">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-2">Fee Structure</label>
                            <div className="flex items-center gap-2 text-zinc-900">
                                <CreditCard size={16} />
                                <span className="text-xs font-black uppercase tracking-tight">
                                    {PM_FEE_TYPES.find(f => f.id === bid.fee_type)?.label || 'Professional Fee'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Expandable Contractor Details */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-6">
                            {isContractor ? (
                                <>
                                    {/* Cost Breakdown */}
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                            <Construction size={12} /> Cost Allocation (RAB)
                                        </label>
                                        <div className="space-y-2 bg-gray-50 p-4 rounded-2xl">
                                            {bid.cost_breakdown && Object.entries(bid.cost_breakdown).map(([key, val]: [string, any]) => (
                                                <div key={key} className="space-y-1">
                                                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight">
                                                        <span className="text-gray-500">{key.replace('_', ' ')}</span>
                                                        <span className="text-zinc-900">{val}%</span>
                                                    </div>
                                                    <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                                                        <div className="h-full bg-zinc-900 rounded-full" style={{ width: `${val}%` }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Logistics & Capacity */}
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-gray-50 p-4 rounded-2xl border border-transparent hover:border-zinc-200 transition-all">
                                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-2">Workforce</label>
                                                <div className="flex items-center gap-2">
                                                    <Users size={16} className="text-zinc-900" />
                                                    <span className="text-sm font-black text-zinc-900">{bid.workforce_count || 0} People</span>
                                                </div>
                                            </div>
                                            <div className="bg-gray-50 p-4 rounded-2xl border border-transparent hover:border-zinc-200 transition-all">
                                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-2">Equipment</label>
                                                <div className="flex items-center gap-2">
                                                    <Hammer size={16} className="text-zinc-900" />
                                                    <span className="text-[10px] font-bold text-gray-500 truncate" title={bid.equipment_owned}>
                                                        {bid.equipment_owned || 'N/A'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="bg-zinc-900 p-4 rounded-2xl shadow-xl shadow-zinc-100">
                                            <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Payment Terms</label>
                                            <div className="flex items-center gap-2">
                                                <CreditCard size={16} className="text-emerald-400" />
                                                <span className="text-xs font-bold text-white uppercase tracking-tight">
                                                    {getPaymentLabel(bid.payment_preference)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : null}

                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
