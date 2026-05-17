import React, { useState } from 'react';
import axios from 'axios';
import { 
    Clock, Banknote, CheckCircle, XCircle, Send, AlertTriangle, 
    CornerDownRight, User, DollarSign, MessageSquare
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

interface ProfessionalNegotiationCardProps {
    addendum: any;
    project: any;
    onRefresh: () => void;
}

export default function ProfessionalNegotiationCard({ addendum, project, onRefresh }: ProfessionalNegotiationCardProps) {
    const { showToast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showRevise, setShowRevise] = useState(false);
    const [newAmount, setNewAmount] = useState(addendum.amount.toString());

    const handleAccept = async () => {
        if (!window.confirm(`Accept counter offer of Rp ${Number(addendum.counter_offer_amount).toLocaleString('id-ID')}?`)) return;
        setIsSubmitting(true);
        try {
            // Updating to accepted_by_pro with the counter offer amount
            await axios.put(`/projects/${project.id}/budget/addendums/${addendum.id}`, { 
                status: 'accepted_by_pro',
                amount: addendum.counter_offer_amount
            });
            showToast('Counter offer accepted! Waiting for PM final confirmation.', 'success');
            onRefresh();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to accept', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResubmit = async () => {
        setIsSubmitting(true);
        try {
            await axios.put(`/projects/${project.id}/budget/addendums/${addendum.id}`, { 
                status: 'pending_approval',
                amount: newAmount
            });
            showToast('Revised proposal submitted!', 'success');
            setShowRevise(false);
            onRefresh();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to resubmit', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-white border-2 border-amber-200 rounded-[2.5rem] p-6 shadow-xl shadow-amber-500/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
                <Banknote size={80} />
            </div>

            <div className="relative z-10 space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
                            <Clock size={24} />
                        </div>
                        <div>
                            <h4 className="text-lg font-black text-slate-900 tracking-tight">Fee Negotiation</h4>
                            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">{addendum.title}</p>
                        </div>
                    </div>
                    <span className="px-4 py-1.5 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">
                        Awaiting Your Response
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Your Original Proposal</p>
                        <p className="text-lg font-black text-slate-900">Rp {Number(addendum.amount).toLocaleString('id-ID')}</p>
                    </div>
                    <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                        <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">Owner Counter Offer</p>
                        <p className="text-lg font-black text-emerald-700">Rp {Number(addendum.counter_offer_amount).toLocaleString('id-ID')}</p>
                    </div>
                </div>

                {addendum.negotiation_note && (
                    <div className="p-4 bg-slate-900 rounded-2xl text-white">
                        <div className="flex items-center gap-2 mb-2 text-amber-400">
                            <MessageSquare size={14} />
                            <span className="text-[9px] font-black uppercase tracking-widest">Negotiation Note</span>
                        </div>
                        <p className="text-xs font-medium leading-relaxed italic">"{addendum.negotiation_note}"</p>
                    </div>
                )}

                {!showRevise ? (
                    <div className="flex gap-3 pt-2">
                        <button 
                            disabled={isSubmitting}
                            onClick={() => setShowRevise(true)}
                            className="flex-1 py-4 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                        >
                            Revise & Resubmit
                        </button>
                        <button 
                            disabled={isSubmitting}
                            onClick={handleAccept}
                            className="flex-1 py-4 bg-emerald-500 text-white hover:bg-emerald-600 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                        >
                            <CheckCircle size={16} /> Accept Counter Offer
                        </button>
                    </div>
                ) : (
                    <div className="pt-4 border-t border-slate-100 space-y-4 animate-in slide-in-from-bottom-4 duration-300">
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">New Proposed Amount (Rp)</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">Rp</span>
                                <input 
                                    type="number"
                                    value={newAmount}
                                    onChange={(e) => setNewAmount(e.target.value)}
                                    className="w-full h-14 pl-12 pr-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 transition-all"
                                    placeholder="Enter amount..."
                                />
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button 
                                onClick={() => setShowRevise(false)}
                                className="px-6 py-3 bg-white text-slate-500 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest"
                            >
                                Back
                            </button>
                            <button 
                                onClick={handleResubmit}
                                disabled={isSubmitting}
                                className="flex-1 py-3 bg-amber-500 text-white hover:bg-amber-600 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                            >
                                <Send size={16} /> Submit New Proposal
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
