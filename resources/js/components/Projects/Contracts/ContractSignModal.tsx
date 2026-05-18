import React, { useState } from 'react';
import { 
    X, Check, Loader2, FileText, 
    ShieldCheck, AlertCircle, Percent, Layers, Users
} from 'lucide-react';
import axios from 'axios';
import { useToast } from '../../../context/ToastContext';
import { ProposedTeamMember } from '../../../types/sub_professional.types';

interface ContractSignModalProps {
    isOpen: boolean;
    onClose: () => void;
    project: any;
    bid: any;
    bidType: string;
    onSuccess: () => void;
}

export const ContractSignModal: React.FC<ContractSignModalProps> = ({ isOpen, onClose, project, bid, bidType, onSuccess }) => {
    const { showToast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bankDetails, setBankDetails] = useState('');

    React.useEffect(() => {
        if (isOpen) {
            setBankDetails(bid?.payment_instructions || '');
        }
    }, [isOpen, bid?.payment_instructions]);
    
    // IMMUTABLE STATE - Purely for display
    // Reactive data derived from props
    const termins = React.useMemo(() => {
        return (bid.proposed_termins || []).map((t: any) => ({
            ...t,
            label: t.trigger_description || t.label || 'Payment Phase',
            percentage: Number(t.percentage) || 0,
            amount: Number(t.amount) || 0,
            milestone_index: t.milestone_index ?? -1
        }));
    }, [bid.proposed_termins]);

    const milestones = React.useMemo(() => {
        const raw = bid.proposed_milestones || [];
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return (Array.isArray(parsed) ? parsed : []).map((m: any) => ({
            ...m,
            title: m.title || '',
            description: m.description || '',
            services: m.services || m.content?.services || m.items || m.assigned_services || []
        }));
    }, [bid.proposed_milestones]);

    const proposedTeam = React.useMemo((): ProposedTeamMember[] => {
        const raw = bid.proposed_team || [];
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return (Array.isArray(parsed) ? parsed : []).map((m: any) => ({
            team_member_id: m.team_member_id ?? null,
            name: m.name || '',
            role_title: m.role_title || '',
            role: m.role || 'other',
            fee: Number(m.fee) || 0,
            fee_type: m.fee_type || 'fixed',
            note: m.note || ''
        }));
    }, [bid.proposed_team]);

    const paymentNotes = bid.payment_instructions || '';

    // Calculation constants
    const safeBudget = Number(project?.budget) || 0;
    const availableServices = bid.selected_services || [];
    const servicesTotal = availableServices.reduce((sum: number, s: any) => sum + (Number(s.price) || 0), 0);
    const agreedFee = Number(bid.calculated_total) || 0;
    
    // The true base fee is the calculated total minus any additional services.
    // If calculated_total is missing (legacy/edge cases), fallback to robust manual calculation.
    const fallbackBaseFee = bid.fee_type === 'percentage' 
        ? Math.round((Number(bid.price) / 100) * safeBudget)
        : (Number(bid.price) || 0);
        
    const baseFeeAmount = agreedFee > 0 
        ? Math.max(0, agreedFee - servicesTotal) 
        : fallbackBaseFee;

    const totalPercentage = termins.reduce((sum, t) => sum + Number(t.percentage), 0);

    const handleSubmit = async () => {
        if (!bankDetails || !bankDetails.trim()) {
            showToast('Bank details & payment instructions are required before signing.', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            // FINAL CALCULATION: Ensure all termins have their absolute Rupiah amounts calculated 
            // before we commit to the DB, ensuring no "Rp 0" payments appear in the hub.
            const finalTermins = termins.map((t) => {
                const milestone = t.milestone_index >= 0 ? milestones[t.milestone_index] : null;
                
                // Use the same robust service extraction logic as the UI
                let milestoneServices = [
                    ...(milestone?.services || []),
                    ...(milestone?.content?.services || []),
                    ...(milestone?.items || []),
                    ...(t?.services || []),
                    ...(t?.content?.services || [])
                ];

                if (milestoneServices.length === 0 && availableServices.length > 0) {
                    milestoneServices = availableServices.filter((s: any) => s.milestone_index === t.milestone_index);
                }

                const basePortion = Math.round((Number(t.percentage) / 100) * baseFeeAmount);
                const servicesPortion = milestoneServices.reduce((sum: number, s: any) => sum + (Number(s.price) || 0), 0);
                
                return {
                    ...t,
                    amount: basePortion + servicesPortion
                };
            });

            await axios.post(`/projects/${project.id}/bids/${bid.id}/sign-contract`, {
                bid_type: bidType,
                termins: finalTermins,
                milestones: milestones,
                payment_instructions: bankDetails
            });
            showToast('Contract signed successfully!', 'success');
            onSuccess();
            onClose();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to sign contract', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
                {/* Header */}
                <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl">
                            <ShieldCheck size={20} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-white uppercase tracking-widest">Contract Signature Preview</h3>
                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Project: {project.title}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Summary Card */}
                    <div className="bg-zinc-800/50 rounded-3xl p-6 border border-zinc-700/50 space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Negotiated Base Fee</span>
                            <span className="text-sm font-bold text-zinc-300">Rp {Number(baseFeeAmount).toLocaleString()}</span>
                        </div>
                        
                        {servicesTotal > 0 && (
                            <div className="space-y-2 pt-2 border-t border-zinc-700/30">
                                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">Included Services</span>
                                {availableServices.map((s: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between text-[10px]">
                                        <span className="text-zinc-400 font-medium">{s.title || s.name || s.label || 'Legal Document'}</span>
                                        <span className="text-zinc-400">Rp {Number(s.price).toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex items-center justify-between pt-4 border-t-2 border-zinc-700">
                            <span className="text-[10px] font-black text-white uppercase tracking-widest">Total Contract Value</span>
                            <span className="text-xl font-black text-emerald-500">Rp {Number(agreedFee).toLocaleString()}</span>
                        </div>
                    </div>

                    {/* Termins List */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Payment Schedule Preview</h4>
                            <div className="flex items-center gap-2 text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                                <ShieldCheck size={12} className="text-emerald-500" />
                                Confirmed Breakdown
                            </div>
                        </div>

                        {termins.map((termin, index) => {
                            const milestone = termin.milestone_index >= 0 ? milestones[termin.milestone_index] : null;
                            
                            // Aggressive service extraction with "Self-Healing" Fallback
                            let milestoneServices = [
                                ...(milestone?.services || []),
                                ...(milestone?.content?.services || []),
                                ...(milestone?.items || []),
                                ...(termin?.services || []),
                                ...(termin?.content?.services || [])
                            ];

                            // SELF-HEALING: If no services found in nested data, try to re-map from global selected_services
                            // by checking the milestone_index tag we added in the negotiation phase.
                            if (milestoneServices.length === 0 && availableServices.length > 0) {
                                milestoneServices = availableServices.filter((s: any) => s.milestone_index === termin.milestone_index);
                            }
                            
                            // Calculate current termin amount: (base_percentage * base_fee) + phase_services
                            const basePortion = Math.round((Number(termin.percentage) / 100) * baseFeeAmount);
                            const servicesPortion = milestoneServices.reduce((sum: number, s: any) => sum + (Number(s.price) || 0), 0);
                            const currentTotal = basePortion + servicesPortion;

                            return (
                                <div key={index} className="bg-zinc-800/30 border border-zinc-700/30 rounded-3xl p-6 space-y-4">
                                    <div className="flex gap-4 items-end">
                                        <div className="flex-1">
                                            <label className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Label</label>
                                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-300">
                                                {termin.label}
                                            </div>
                                        </div>
                                        <div className="w-24">
                                            <label className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Base %</label>
                                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-300 flex justify-between items-center">
                                                <span>{termin.percentage}</span>
                                                <Percent size={10} className="text-zinc-600" />
                                            </div>
                                        </div>
                                        <div className="flex-1">
                                            <label className="text-[8px] font-black text-emerald-500/50 uppercase tracking-widest block mb-1">Total Amount (Rp)</label>
                                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-black text-emerald-500">
                                                Rp {currentTotal.toLocaleString()}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Deliverables & Services Preview */}
                                    {(milestone?.description || milestoneServices.length > 0 || bidType === 'notaris') && (
                                        <div className="pt-4 border-t border-zinc-700/30 space-y-3">
                                            {milestone?.description && (
                                                <div className="space-y-1">
                                                    <label className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block">Deliverables / Scope</label>
                                                    <p className="text-[10px] text-zinc-400 font-semibold leading-relaxed">
                                                        {milestone.description}
                                                    </p>
                                                </div>
                                            )}

                                            {(milestoneServices.length > 0 || bidType === 'notaris') && (
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Legal Documents</span>
                                                        {milestoneServices.length > 0 && (
                                                            <span className="text-[8px] font-bold text-emerald-500/70 uppercase">
                                                                Includes {milestoneServices.length} Documents
                                                            </span>
                                                        )}
                                                    </div>
                                                    {milestoneServices.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {milestoneServices.map((service: any, sIdx: number) => {
                                                                const displayName = service.title || service.name || service.label || service.document_name || 'Legal Document';
                                                                return (
                                                                    <div
                                                                        key={sIdx}
                                                                        className="px-3 py-1.5 rounded-lg text-[9px] font-black bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center gap-1.5"
                                                                    >
                                                                        <FileText size={10} />
                                                                        <span>{displayName}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <p className="text-[8px] font-bold text-zinc-600 uppercase italic">No legal documents assigned to this phase</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Totals Row */}
                        <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-2xl">
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center italic">Terms are locked to negotiation results</span>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-emerald-500">
                                    {totalPercentage.toFixed(1)}% Total
                                </span>
                                <Check size={14} className="text-emerald-500" />
                            </div>
                        </div>
                    </div>

                    {/* Proposed Team Section Preview */}
                    {proposedTeam.length > 0 && (
                        <div className="space-y-3 pt-4 border-t border-zinc-800">
                            <div className="flex items-center justify-between">
                                <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Proposed Team Composition</h4>
                                <div className="flex items-center gap-1.5 text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                                    <Users size={12} className="text-zinc-500" />
                                    {proposedTeam.length} Member{proposedTeam.length > 1 ? 's' : ''}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                                {proposedTeam.map((member, index) => (
                                    <div key={index} className="bg-zinc-800/30 border border-zinc-700/30 rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center font-black text-emerald-400 text-sm shrink-0">
                                                {member.name ? member.name.charAt(0) : 'T'}
                                            </div>
                                            <div>
                                                <h5 className="text-xs font-black text-white uppercase tracking-wider">{member.name || 'Unnamed Member'}</h5>
                                                <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest mt-0.5">{member.role_title || 'Team Member'}</p>
                                            </div>
                                        </div>

                                        <div className="flex flex-col sm:items-end gap-1 shrink-0">
                                            <span className="text-xs font-black text-white">
                                                Rp {member.fee.toLocaleString()} {member.fee_type === 'percentage' ? '% of Project' : ''}
                                            </span>
                                            {member.note ? (
                                                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider max-w-[200px] truncate block">
                                                    {member.note}
                                                </span>
                                            ) : (
                                                <span className="text-[8px] font-bold text-zinc-600 uppercase italic block">
                                                    No special notes
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Bank Details & Payment Instructions (Required) */}
                    <div className="space-y-2 pt-4 border-t border-zinc-800">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-1">
                                Bank Details & Payment Instructions <span className="text-rose-500 font-bold">*</span>
                            </label>
                            <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Required</span>
                        </div>
                        <textarea
                            value={bankDetails}
                            onChange={(e) => setBankDetails(e.target.value)}
                            required
                            className="w-full bg-zinc-950/80 border border-zinc-700 rounded-2xl p-4 text-xs font-bold text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all resize-none h-24"
                            placeholder="Example: Bank Mandiri A/N Aisha Project Management - Acc: 1234567890"
                        />
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-6 border-t border-zinc-800 bg-zinc-900/80 flex flex-col gap-3">
                    <button 
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="w-full py-4 bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-emerald-900/20 flex items-center justify-center gap-2 transition-all"
                    >
                        {isSubmitting ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <>
                                <ShieldCheck size={18} />
                                Sign & Finalize Contract
                            </>
                        )}
                    </button>
                    <button 
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="w-full py-3 bg-zinc-800 text-zinc-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-700 hover:text-white transition-all"
                    >
                        Cancel
                    </button>
                    <p className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest text-center mt-1 leading-relaxed">
                        By clicking "Sign & Finalize", you formally accept the terms above.<br/> 
                        A legal SPK document will be generated immediately.
                    </p>
                </div>
            </div>
        </div>
    );
};
