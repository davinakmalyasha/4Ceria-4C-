import React, { useState } from 'react';
import axios from 'axios';
import { 
    Users, AlertCircle, RefreshCw, X, FileText, Check, ShieldCheck
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { Project, formatCurrency } from '../../../types/project.types';

interface EngineeringBidsBoardProps {
    project: Project;
    user: any; // Logged in user
    roleType: 'structural' | 'mep';
    isArchitect: boolean;
    onRefresh: () => void;
    onClose: () => void;
}

export default function EngineeringBidsBoard({ project, user, roleType, isArchitect, onRefresh, onClose }: EngineeringBidsBoardProps) {
    const { showToast } = useToast();
    const [submittingId, setSubmittingId] = useState<number | null>(null);
    const [interviewNotes, setInterviewNotes] = useState<Record<number, string>>({});

    const bids = roleType === 'structural' ? (project.bids_structural || []) : (project.bids_mep || []);
    
    const getDisplayPrice = (bid: any) => {
        if (bid.fee_type === 'percentage' && (!bid.calculated_total || bid.calculated_total === 0) && bid.price > 0 && project.budget > 0) {
            return (bid.price / 100) * Number(project.budget);
        }
        return bid.calculated_total || bid.price;
    };

    const handleNotesChange = (bidId: number, text: string) => {
        setInterviewNotes(prev => ({ ...prev, [bidId]: text }));
    };

    const handleRecommend = async (bidId: number) => {
        const notes = interviewNotes[bidId] || '';
        if (!notes.trim()) {
            showToast('Please provide interview notes to justify this recommendation.', 'error');
            return;
        }

        if (!window.confirm('Recommend this engineer to the Owner for budget authorization?')) return;

        setSubmittingId(bidId);
        try {
            await axios.post(`/projects/${project.id}/submit-engineering-interview`, {
                bid_id: bidId,
                bid_type: roleType,
                interview_notes: notes,
                is_recommended: true
            });
            showToast('Engineer Recommended Successfully!', 'success');
            onRefresh();
            onClose();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to submit recommendation.', 'error');
        } finally {
            setSubmittingId(null);
        }
    };

    const handleReject = async (bidId: number) => {
        if (!window.confirm('Reject this recommendation?')) return;
        setSubmittingId(bidId);
        try {
            await axios.post(`/projects/${project.id}/reject-engineering-bid/${bidId}`, {
                bid_type: roleType
            });
            showToast('Recommendation rejected.', 'success');
            onRefresh();
            onClose();
        } catch (error: any) {
            showToast('Failed to reject.', 'error');
        } finally {
            setSubmittingId(null);
        }
    };

    const handleAuthorizeSpecialist = async (bidId: number) => {
        if (!window.confirm('Confirm and hire this specialist?')) return;
        setSubmittingId(bidId);
        try {
            await axios.post(`/projects/${project.id}/authorize-specialist`, {
                bid_id: bidId,
                bid_type: roleType
            });
            showToast('Specialist hired!', 'success');
            onRefresh();
            onClose();
        } catch (error: any) {
            showToast('Failed to hire.', 'error');
        } finally {
            setSubmittingId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${roleType === 'structural' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-600'}`}>
                            <Users size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 capitalize">{roleType} Engineer Candidates</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                Architect Technical Review Board
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white hover:bg-slate-100 text-slate-400 rounded-xl transition-all shadow-sm">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto bg-slate-50 flex-1 space-y-4">
                    {bids.length === 0 ? (
                        <div className="py-20 flex flex-col items-center justify-center text-center">
                            <AlertCircle size={48} className="text-slate-300 mb-4" />
                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">No candidates yet</h4>
                            <p className="text-[11px] text-slate-500 font-medium max-w-sm mt-2">
                                Waiting for engineers to submit proposals.
                            </p>
                        </div>
                    ) : (
                        bids.map(bid => {
                            const vendor = roleType === 'structural' ? (bid as any).structuralEngineer : (bid as any).mepEngineer;
                            const vendorUser = vendor?.user;

                            return (
                                <div key={bid.id} className={`p-6 bg-white border-2 rounded-3xl transition-all ${bid.is_recommended ? 'border-emerald-500 ring-4 ring-emerald-50' : 'border-slate-100'}`}>
                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-6">
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <h4 className="text-lg font-black text-slate-900">{vendorUser?.name || 'Engineer'}</h4>
                                                {bid.is_recommended && (
                                                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1">
                                                        <ShieldCheck size={12} /> Architect Recommended
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mt-1">
                                                {vendor?.experience_years || 0} Years Experience
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xl font-black text-slate-900">
                                                {bid.price_max && Number(bid.price_max) > 0 ? (
                                                    bid.fee_type === 'percentage' ? (
                                                        project.budget > 0 ? (
                                                            `${formatCurrency((Number(bid.price) / 100) * project.budget)} - ${formatCurrency((Number(bid.price_max) / 100) * project.budget)}`
                                                        ) : (
                                                            `${bid.price}% - ${bid.price_max}%`
                                                        )
                                                    ) : (
                                                        `${formatCurrency(bid.price)} - ${formatCurrency(bid.price_max)}`
                                                    )
                                                ) : (
                                                    formatCurrency(getDisplayPrice(bid))
                                                )}
                                            </p>
                                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">
                                                {bid.fee_type === 'percentage' ? (
                                                    bid.price_max && Number(bid.price_max) > 0 ? (
                                                        `${bid.price}% - ${bid.price_max}% • `
                                                    ) : (
                                                        `${bid.price}% • `
                                                    )
                                                ) : ''}
                                                Est. {bid.estimated_duration || '?'} {bid.duration_unit || 'Days'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 mb-6">
                                        <div className="flex items-center gap-2 mb-2">
                                            <FileText size={14} className="text-slate-400" />
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vendor Proposal</span>
                                        </div>
                                        <p className="text-xs text-slate-700 leading-relaxed italic">"{bid.proposal}"</p>
                                    </div>

                                    {isArchitect && !bid.is_recommended && (
                                        <div className="space-y-4 pt-4 border-t border-slate-100">
                                            <div>
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Technical Interview Notes</label>
                                                <textarea 
                                                    value={interviewNotes[bid.id] || ''}
                                                    onChange={(e) => handleNotesChange(bid.id, e.target.value)}
                                                    placeholder="e.g., Conducted technical review. Candidate understands local load-bearing requirements."
                                                    className="w-full mt-2 p-4 bg-white border border-slate-200 rounded-2xl text-xs text-slate-700 outline-none focus:border-slate-500 focus:ring-4 focus:ring-slate-50 transition-all min-h-[100px]"
                                                />
                                            </div>
                                            
                                            <button 
                                                onClick={() => handleRecommend(bid.id)}
                                                disabled={submittingId === bid.id}
                                                className="w-full py-4 rounded-xl bg-slate-900 hover:bg-black text-white text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-900/10 disabled:opacity-50"
                                            >
                                                {submittingId === bid.id ? (
                                                    <><RefreshCw size={14} className="animate-spin" /> Processing...</>
                                                ) : (
                                                    <><Check size={16} /> Submit Notes & Recommend to Owner</>
                                                )}
                                            </button>
                                        </div>
                                    )}

                                    {bid.is_recommended && bid.interview_notes && (
                                        <div className="space-y-4">
                                            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                                                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Architect's Notes</span>
                                                <p className="text-xs text-emerald-800 leading-relaxed mt-1 font-medium">{bid.interview_notes}</p>
                                            </div>

                                            {Number(project.user_id) === Number(user?.id) && (
                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={() => handleAuthorizeSpecialist(bid.id)}
                                                        disabled={submittingId === bid.id}
                                                        className="flex-1 py-4 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-2"
                                                    >
                                                        {submittingId === bid.id ? <RefreshCw className="animate-spin" size={14} /> : <Check size={14} />}
                                                        Confirm & Hire
                                                    </button>
                                                    <button 
                                                        onClick={() => handleReject(bid.id)}
                                                        disabled={submittingId === bid.id}
                                                        className="px-6 py-4 bg-white border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                                    >
                                                        Reject
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
