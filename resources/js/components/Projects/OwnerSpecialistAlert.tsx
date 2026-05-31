import React, { useState } from 'react';
import axios from 'axios';
import { ShieldCheck, UserCheck, Clock, AlertTriangle } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { formatCurrency } from '../../types/project.types';
import ConfirmModal from './ConfirmModal';

interface RecommendedBid {
    id: number;
    price: number;
    calculated_total: number | null;
    interview_notes: string | null;
    is_recommended: boolean;
    status: string;
    bid_type: 'structural' | 'mep';
    fee_type?: string;
    structuralEngineer?: { user?: { name: string } };
    mepEngineer?: { user?: { name: string } };
    structural_engineer?: { user?: { name: string } };
    mep_engineer?: { user?: { name: string } };
}

interface OwnerSpecialistAlertProps {
    projectId: number;
    projectBudget?: number;
    bids: RecommendedBid[];
    onRefresh: () => void;
}

export default function OwnerSpecialistAlert({ projectId, projectBudget, bids, onRefresh }: OwnerSpecialistAlertProps) {
    const { showToast } = useToast();
    const [processingId, setProcessingId] = useState<number | null>(null);
    const [confirmBid, setConfirmBid] = useState<RecommendedBid | null>(null);

    const getDisplayPrice = (bid: RecommendedBid) => {
        if (bid.fee_type === 'percentage' && (!bid.calculated_total || bid.calculated_total === 0) && bid.price > 0 && projectBudget && projectBudget > 0) {
            return (bid.price / 100) * Number(projectBudget);
        }
        return bid.calculated_total || bid.price;
    };

    if (bids.length === 0) return null;

    const handleAuthorize = async (bid: RecommendedBid) => {
        setConfirmBid(bid);
    };

    const executeAuthorize = async () => {
        if (!confirmBid) return;
        const bid = confirmBid;
        setConfirmBid(null);
        setProcessingId(bid.id);
        try {
            await axios.post(`/projects/${projectId}/authorize-specialist`, {
                bid_id: bid.id,
                bid_type: bid.bid_type,
            });
            showToast('Specialist authorized and hired!', 'success');
            onRefresh();
        } catch (error: unknown) {
            const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Authorization failed.';
            showToast(msg, 'error');
        } finally {
            setProcessingId(null);
        }
    };

    const getName = (bid: RecommendedBid): string => {
        return bid.structuralEngineer?.user?.name
            || bid.structural_engineer?.user?.name
            || bid.mepEngineer?.user?.name
            || bid.mep_engineer?.user?.name
            || 'Specialist';
    };

    return (
        <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 rounded-[2.5rem] p-8 text-white shadow-2xl border border-indigo-500/30 ring-4 ring-indigo-500/10 relative overflow-hidden animate-in slide-in-from-top-4 duration-500">
            <div className="absolute top-0 right-0 p-6 opacity-5">
                <ShieldCheck size={140} />
            </div>

            <div className="relative z-10 space-y-6">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-indigo-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
                        <AlertTriangle size={22} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black tracking-tight text-indigo-300">Architect Recommendation</h3>
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                            Your architect has vetted and recommends the following specialists
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    {bids.map(bid => (
                        <div key={bid.id} className="p-5 bg-white/5 border border-white/10 rounded-[1.5rem] flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:bg-white/10 transition-all">
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
                                    <UserCheck size={22} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-black text-white truncate">{getName(bid)}</p>
                                    <p className="text-[10px] text-white/50 font-bold uppercase tracking-widest">
                                        {bid.bid_type === 'structural' ? 'Structural' : 'MEP'} Engineer • {bid.fee_type === 'percentage' ? `${bid.price}% - ` : ''}{formatCurrency(getDisplayPrice(bid))}
                                    </p>
                                    {bid.interview_notes && (
                                        <p className="text-[11px] text-white/30 italic mt-1 line-clamp-1">"{bid.interview_notes}"</p>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => handleAuthorize(bid)}
                                disabled={processingId === bid.id}
                                className="px-8 h-11 bg-emerald-500 hover:bg-emerald-600 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 shrink-0 flex items-center gap-2"
                            >
                                {processingId === bid.id ? (
                                    <><Clock size={14} className="animate-spin" /> Processing...</>
                                ) : (
                                    <><ShieldCheck size={14} /> Authorize Hire</>
                                )}
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <ConfirmModal
                isOpen={confirmBid !== null}
                title="Authorize Specialist Hire"
                description="Authorize this specialist hire and commit budget?"
                confirmText="Authorize Hire"
                variant="success"
                onConfirm={executeAuthorize}
                onCancel={() => setConfirmBid(null)}
                isLoading={processingId !== null}
            />
        </div>
    );
}
