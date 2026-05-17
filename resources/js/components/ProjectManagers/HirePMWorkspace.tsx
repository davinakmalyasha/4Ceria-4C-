import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    ChevronLeft, DollarSign, Clock, FileText, CheckCircle2, 
    AlertCircle, Send, ShieldCheck, Wallet, History,
    ArrowRight, BadgeCheck, Scale, Info
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import axios from 'axios';
import { ProjectManager, PMBid } from '../../types/project_manager.types';
import { formatCurrency } from '../../types/explore';


interface HirePMWorkspaceProps {
    project: any;
    user: any;
    bid: PMBid;
    onBack: () => void;
    onRefresh?: () => void;
}

export const HirePMWorkspace: React.FC<HirePMWorkspaceProps> = ({ 
    project, user, bid: initialBid, onBack, onRefresh 
}) => {
    const { showToast } = useToast();
    const [bid, setBid] = useState<PMBid>(initialBid);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [negotiationPrice, setNegotiationPrice] = useState<string>(bid.price.toString());
    const [showNegotiate, setShowNegotiate] = useState(false);

    const isOwner = user?.id === project.user_id;
    const isPM = user?.id === bid.pm?.user_id;
    const isNegotiating = bid.status === 'negotiating';
    const isAccepted = bid.status === 'accepted';
    const isFeeAgreed = !!bid.fee_agreed_at;
    
    // Who offered last?
    const lastOfferedByMe = bid.offered_by_id === user?.id;

    const handleNegotiate = async () => {
        if (!negotiationPrice || parseFloat(negotiationPrice) <= 0) {
            showToast('Please enter a valid price.', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await axios.post(`/projects/${project.id}/bids/${bid.id}/negotiate`, {
                bid_type: 'project_manager',
                price: parseFloat(negotiationPrice)
            });
            
            setBid(response.data.bid);
            setShowNegotiate(false);
            showToast('Negotiation proposal sent successfully.', 'success');
            onRefresh?.();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to send negotiation.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleConfirmFee = async () => {
        setIsSubmitting(true);
        try {
            const response = await axios.post(`/projects/${project.id}/bids/${bid.id}/confirm-fee`, {
                bid_type: 'project_manager'
            });
            
            setBid(response.data.bid);
            showToast('Fee agreement confirmed!', 'success');
            onRefresh?.();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to confirm fee.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAcceptBid = async () => {
        setIsSubmitting(true);
        try {
            const response = await axios.post(`/projects/${project.id}/pm-bids/${bid.id}/accept`);
            showToast('Project Manager hired successfully!', 'success');
            onRefresh?.();
            onBack(); // Go back to overview or management
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to hire PM.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <button 
                    onClick={onBack}
                    className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors group"
                >
                    <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center group-hover:bg-zinc-200 transition-all">
                        <ChevronLeft size={16} />
                    </div>
                    <span className="text-xs font-black uppercase tracking-widest">Back to Explore</span>
                </button>

                <div className="flex items-center gap-2">
                    <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                        isAccepted ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                        isNegotiating ? 'bg-amber-50 text-amber-600 border-amber-200' :
                        'bg-zinc-100 text-zinc-600 border-zinc-200'
                    }`}>
                        Status: {bid.status}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* PM Profile Card */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white rounded-[2.5rem] border border-zinc-100 p-8 shadow-sm">
                        <div className="flex flex-col items-center text-center">
                            <div className="relative mb-6">
                                <div className="w-24 h-24 rounded-[2rem] bg-zinc-100 overflow-hidden ring-4 ring-zinc-50">
                                    {bid.pm?.user?.pic ? (
                                        <img src={`/storage/${bid.pm.user.pic}`} alt={bid.pm.nama} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-zinc-300">
                                            <BadgeCheck size={40} />
                                        </div>
                                    )}
                                </div>
                                <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center text-white border-4 border-white shadow-lg">
                                    <ShieldCheck size={18} />
                                </div>
                            </div>
                            <h3 className="text-xl font-black text-gray-900">{bid.pm?.nama}</h3>
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Certified Project Manager</p>
                            
                            <div className="grid grid-cols-2 gap-4 w-full mt-8 pt-8 border-t border-zinc-50">
                                <div className="text-center">
                                    <p className="text-[9px] font-black text-zinc-400 uppercase tracking-tighter">Experience</p>
                                    <p className="text-sm font-black text-gray-900">{bid.pm?.pengalaman_tahun} Years</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-[9px] font-black text-zinc-400 uppercase tracking-tighter">Rating</p>
                                    <p className="text-sm font-black text-gray-900">★ {bid.pm?.average_rating || 'N/A'}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Proposal Snippet */}
                    <div className="bg-zinc-900 rounded-[2.5rem] p-8 text-white">
                        <div className="flex items-center gap-3 mb-4">
                            <FileText className="text-amber-400" size={20} />
                            <h4 className="text-xs font-black uppercase tracking-widest">Initial Proposal</h4>
                        </div>
                        <p className="text-zinc-400 text-xs leading-relaxed italic">
                            "{bid.proposal}"
                        </p>
                    </div>
                </div>

                {/* Negotiation Workspace */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-[2.5rem] border border-zinc-100 p-10 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-10 opacity-[0.03]">
                            <Scale size={180} />
                        </div>

                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 shadow-sm border border-amber-100">
                                    <Wallet size={20} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900 leading-tight">Financial Agreement</h2>
                                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Formal Fee Negotiation</p>
                                </div>
                            </div>

                            <div className="bg-zinc-50 rounded-3xl p-8 mb-8">
                                <div className="flex items-end justify-between mb-4">
                                    <div>
                                        <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mb-1">Current Proposed Fee</p>
                                        <h4 className="text-4xl font-black text-gray-900">{formatCurrency(bid.price)}</h4>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Fee Type</p>
                                        <p className="text-xs font-black text-gray-900 uppercase">{bid.fee_type}</p>
                                    </div>
                                </div>
                                
                                {isNegotiating && (
                                    <div className={`mt-6 p-4 rounded-2xl flex items-center gap-3 ${
                                        lastOfferedByMe ? 'bg-zinc-200/50 text-zinc-600' : 'bg-amber-100 text-amber-800'
                                    }`}>
                                        <Info size={16} />
                                        <p className="text-[11px] font-bold">
                                            {lastOfferedByMe 
                                                ? "Waiting for the other party to respond to your proposal."
                                                : "A new fee proposal has been submitted. Review and respond."
                                            }
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Action Buttons */}
                            {!isAccepted && !isFeeAgreed && (
                                <div className="space-y-4">
                                    {!lastOfferedByMe && (
                                        <div className="grid grid-cols-2 gap-4">
                                            <button 
                                                onClick={handleConfirmFee}
                                                disabled={isSubmitting}
                                                className="py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
                                            >
                                                {isSubmitting ? 'Processing...' : <><CheckCircle2 size={16} /> Accept Fee</>}
                                            </button>
                                            <button 
                                                onClick={() => setShowNegotiate(!showNegotiate)}
                                                disabled={isSubmitting}
                                                className="py-4 bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-zinc-900/20 flex items-center justify-center gap-2"
                                            >
                                                <History size={16} /> Counter Offer
                                            </button>
                                        </div>
                                    )}

                                    {lastOfferedByMe && !showNegotiate && (
                                        <button 
                                            onClick={() => setShowNegotiate(true)}
                                            className="w-full py-4 border-2 border-dashed border-zinc-200 hover:border-zinc-400 rounded-2xl font-black text-[10px] text-zinc-400 hover:text-zinc-600 uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                        >
                                            <History size={16} /> Change Proposal
                                        </button>
                                    )}

                                    <AnimatePresence>
                                        {showNegotiate && (
                                            <motion.div 
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="pt-4 border-t border-zinc-50 space-y-4">
                                                    <div>
                                                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 block">Your Fee Proposal (IDR)</label>
                                                        <div className="relative">
                                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-400">
                                                                <span className="text-sm font-black">Rp</span>
                                                            </div>
                                                            <input 
                                                                type="number"
                                                                value={negotiationPrice}
                                                                onChange={(e) => setNegotiationPrice(e.target.value)}
                                                                className="w-full pl-12 pr-4 py-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl focus:border-zinc-900 focus:ring-0 transition-all font-black text-lg"
                                                                placeholder="0"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-4">
                                                        <button 
                                                            onClick={handleNegotiate}
                                                            disabled={isSubmitting}
                                                            className="flex-1 py-4 bg-zinc-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest"
                                                        >
                                                            {isSubmitting ? 'Sending...' : 'Submit Counter Offer'}
                                                        </button>
                                                        <button 
                                                            onClick={() => setShowNegotiate(false)}
                                                            className="px-6 py-4 bg-zinc-100 text-zinc-600 rounded-2xl font-black text-[10px] uppercase tracking-widest"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}

                            {/* Final Step: Hiring (Owner Only) */}
                            {isOwner && isFeeAgreed && !isAccepted && (
                                <div className="space-y-6">
                                    <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-100 flex items-center gap-4">
                                        <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg">
                                            <ShieldCheck size={24} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-black text-emerald-900 uppercase tracking-tight">Fee Agreement Locked</h4>
                                            <p className="text-[11px] text-emerald-700/70 font-medium">Both parties have confirmed the fee of {formatCurrency(bid.price)}.</p>
                                        </div>
                                    </div>

                                    <button 
                                        onClick={handleAcceptBid}
                                        disabled={isSubmitting}
                                        className="w-full py-5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl shadow-zinc-900/20 flex items-center justify-center gap-3"
                                    >
                                        {isSubmitting ? 'Finalizing...' : <>Proceed to Hire & Contract <ArrowRight size={18} /></>}
                                    </button>
                                    
                                    <p className="text-center text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
                                        Clicking proceed will formally hire {bid.pm?.nama} for this project.
                                    </p>
                                </div>
                            )}

                            {/* Payment Section (If Hired but Unpaid) */}
                            {isAccepted && bid.payment_status === 'unpaid' && (
                                <div className="p-10 bg-zinc-900 rounded-[3rem] text-white space-y-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 bg-amber-500 rounded-[1.5rem] flex items-center justify-center text-zinc-900 shadow-lg shadow-amber-500/20">
                                            <AlertCircle size={28} />
                                        </div>
                                        <div>
                                            <h4 className="text-xl font-black leading-tight">Payment Proof Required</h4>
                                            <p className="text-zinc-400 text-xs font-medium">To activate the PM's workspace, please upload your bank transfer proof.</p>
                                        </div>
                                    </div>

                                    <div className="p-6 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-between">
                                        <div>
                                            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Total to Pay</p>
                                            <p className="text-xl font-black text-white">{formatCurrency(bid.calculated_total)}</p>
                                        </div>
                                        <button 
                                            className="px-6 py-3 bg-white text-zinc-900 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-400 transition-all"
                                            onClick={() => {/* Trigger payment proof modal/workflow */}}
                                        >
                                            Upload Proof
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Timeline & Responsibilities */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white rounded-[2rem] border border-zinc-100 p-8">
                            <div className="flex items-center gap-3 mb-6">
                                <Clock size={18} className="text-zinc-400" />
                                <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Timeline Estimate</h4>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{bid.estimated_duration} {bid.duration_unit}</p>
                            <p className="text-[11px] text-zinc-400 font-medium mt-1">From legal start to handover.</p>
                        </div>
                        <div className="bg-white rounded-[2rem] border border-zinc-100 p-8">
                            <div className="flex items-center gap-3 mb-6">
                                <ShieldCheck size={18} className="text-zinc-400" />
                                <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Legal Responsibility</h4>
                            </div>
                            <p className="text-sm font-black text-gray-900">PBG & SLF Management</p>
                            <p className="text-[11px] text-zinc-400 font-medium mt-1">Included in this management fee.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
