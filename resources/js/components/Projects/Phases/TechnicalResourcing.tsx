import React, { useState } from 'react';
import axios from 'axios';
import { 
    ShieldCheck, HardHat, Zap, CheckCircle2, 
    AlertTriangle, Users, ArrowRight, Check, X, Clock
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { Project, ProjectAddendum, formatCurrency } from '../../../types/project.types';
import EngineeringCoordination from './EngineeringCoordination';
import EngineeringBudgetCard from './EngineeringBudgetCard';

interface TechnicalResourcingProps {
    project: Project;
    user: any;
    isArchitect: boolean;
    onRefresh: () => void;
}

export default function TechnicalResourcing({ project, user, isArchitect, onRefresh }: TechnicalResourcingProps) {
    const { showToast } = useToast();
    const [isProcessing, setIsProcessing] = useState<string | null>(null);

    const isPM = (user?.role_type === 'project_manager' || user?.role_type === 'pm') && Number(project.pm_id) === Number(user?.id);
    const isOwner = Number(user?.id) === Number(project.owner_id);

    const requiresStructural = !!project.requires_structural;
    const requiresMep = !!project.requires_mep;
    const hasStructural = !!project.structural_id;
    const hasMEP = !!project.mep_id;

    // Filter pending requests for this phase
    const pendingRequests = project.addendums?.filter(a => 
        a.status === 'pending_approval' && (a.role_type === 'structural' || a.role_type === 'mep')
    ) || [];

    const handleRequestEngineering = async (type: 'structural' | 'mep') => {
        const description = window.prompt(
            `Explain to the PM why this project needs a specialized ${type.toUpperCase()} engineer:`,
            `Based on current architectural layouts, a ${type} analysis is required for compliance and safety.`
        );

        if (!description) return;

        setIsProcessing(type);
        try {
            await axios.post(`/projects/${project.id}/request-engineering`, {
                role_type: type,
                description,
                suggested_fee: 0 // Market bidding will decide
            });
            showToast(`${type.toUpperCase()} request sent to PM for review.`, 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to send request.', 'error');
        } finally {
            setIsProcessing(null);
        }
    };

    const handleVerifyRequest = async (addendumId: number, status: 'approved' | 'rejected') => {
        setIsProcessing(`verify-${addendumId}`);
        try {
            await axios.post(`/projects/${project.id}/verify-engineering/${addendumId}`, { status });
            showToast(`Engineering request ${status}.`, 'success');
            onRefresh();
        } catch (error: any) {
            showToast('Failed to process request.', 'error');
        } finally {
            setIsProcessing(null);
        }
    };

    const handleAcceptBid = async (bidId: number, bidType: 'structural' | 'mep') => {
        const actionLabel = isPM ? 'recommend this specialist to the Owner' : 'officially accept this specialist';
        if (!window.confirm(`Are you sure you want to ${actionLabel}?`)) return;
        
        setIsProcessing(`accept-${bidId}`);
        try {
            await axios.post(`/projects/${project.id}/accept-bid`, {
                bid_id: bidId,
                bid_type: bidType
            });
            const msg = isPM ? 'Recommendation sent to owner for budget authorization.' : 'Bid successfully accepted!';
            showToast(msg, 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to process bid.', 'error');
        } finally {
            setIsProcessing(null);
        }
    };

    const handleApproveHire = async (addendumId: number) => {
        setIsProcessing(`approve-hire-${addendumId}`);
        try {
            await axios.post(`/projects/${project.id}/approve-engineering-hire/${addendumId}`);
            showToast('Budget authorized and specialist hired!', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Authorization failed.', 'error');
        } finally {
            setIsProcessing(null);
        }
    };

    const handleRejectHire = async (addendumId: number) => {
        if (!window.confirm("Reject this hiring recommendation?")) return;
        setIsProcessing(`reject-hire-${addendumId}`);
        try {
            await axios.post(`/projects/${project.id}/reject-engineering-hire/${addendumId}`);
            showToast('Recommendation rejected.', 'success');
            onRefresh();
        } catch (error: any) {
            showToast('Failed to reject.', 'error');
        } finally {
            setIsProcessing(null);
        }
    };

    return (
        <div className="bg-white border-2 border-slate-100 rounded-[2.5rem] p-8 shadow-sm space-y-8 relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="absolute top-0 right-0 w-48 h-48 bg-slate-50 rounded-bl-[5rem] -mr-12 -mt-12 -z-10" />
            
            {/* PM Review Board - TOP PRIORITY ALERT */}
            {(isPM || isOwner) && pendingRequests.length > 0 && (
                <div className="p-6 bg-slate-950 rounded-[2rem] text-white space-y-6 shadow-2xl border-2 border-indigo-500/50 ring-4 ring-indigo-500/10 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                        <Clock size={160} />
                    </div>
                    
                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-ping" />
                                <h4 className="text-sm font-black uppercase tracking-widest text-indigo-400">Action Required</h4>
                            </div>
                            <h3 className="text-lg font-black text-white">Technician Authorization Pending</h3>
                            <p className="text-[11px] text-white/40 font-medium max-w-sm uppercase tracking-widest">Architect has requested structural/mep specialist hiring</p>
                        </div>
                        
                        <div className="flex flex-col gap-3 w-full md:w-auto">
                            {pendingRequests.map(req => (
                                <div key={req.id} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl gap-8 group hover:bg-white/10 transition-all">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-white/80">{req.title}</p>
                                        <p className="text-[10px] text-white/40 font-bold truncate max-w-[150px]">{req.description}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => handleVerifyRequest(req.id, 'rejected')}
                                            disabled={!!isProcessing}
                                            className="h-9 w-9 flex items-center justify-center rounded-lg bg-white/5 hover:bg-red-500/20 text-white/20 hover:text-red-400 transition-all"
                                        >
                                            <X size={18} />
                                        </button>
                                        <button 
                                            onClick={() => handleVerifyRequest(req.id, 'approved')}
                                            disabled={!!isProcessing}
                                            className="px-6 h-9 flex items-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/20"
                                        >
                                            <CheckCircle2 size={16} />
                                            Authorize
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Owner Budget Authorization Panels */}
            {isOwner && pendingRequests.map(req => (
                <EngineeringBudgetCard 
                    key={req.id}
                    addendum={req}
                    project={project}
                    onApprove={handleApproveHire}
                    onDecline={handleRejectHire}
                    isProcessing={isProcessing === `approve-hire-${req.id}`}
                />
            ))}

            <div className="flex items-center justify-between border-b border-slate-100 pb-6">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0">
                        <Users size={28} />
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">Technical Resourcing</h3>
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mt-1">
                            Expert-Led Engineering Management
                        </p>
                    </div>
                </div>

                {!isPM && !isArchitect && !isOwner && (
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Process Owner</span>
                        <div className="flex items-center gap-2 mt-1 px-3 py-1 bg-slate-100 rounded-full border border-slate-200">
                            <ShieldCheck size={12} className="text-emerald-500" />
                            <span className="text-[10px] font-black text-slate-700">PM Managed</span>
                        </div>
                    </div>
                )}
            </div>

            {/* PM Review Board - Only visible if there are requests */}
            {(isPM || isOwner) && pendingRequests.length > 0 && (
                <div className="p-6 bg-slate-950 rounded-[2rem] text-white space-y-4 shadow-xl border border-white/10 ring-4 ring-slate-100">
                    <div className="flex items-center gap-2">
                        <Clock className="text-amber-400" size={18} />
                        <h4 className="text-sm font-black uppercase tracking-widest">Pending Technical Requests</h4>
                    </div>
                    
                    <div className="space-y-3">
                        {pendingRequests.map(req => (
                            <div key={req.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl gap-4">
                                <div className="space-y-1">
                                    <h5 className="text-xs font-black text-white">{req.title}</h5>
                                    <p className="text-[11px] text-white/50 leading-relaxed max-w-xl">{req.description}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button 
                                        onClick={() => handleVerifyRequest(req.id, 'rejected')}
                                        disabled={!!isProcessing}
                                        className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-all border border-white/10"
                                    >
                                        <X size={18} />
                                    </button>
                                    <button 
                                        onClick={() => handleVerifyRequest(req.id, 'approved')}
                                        disabled={!!isProcessing}
                                        className="px-6 h-10 flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/30"
                                    >
                                        <Check size={16} />
                                        Approve & Open Bidding
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Structural Engineer Block */}
                <div className={`p-6 border-2 rounded-3xl space-y-5 transition-colors ${
                    requiresStructural ? 'border-indigo-500/30 bg-indigo-50/10' : 'border-slate-100 bg-slate-50/50'
                }`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                requiresStructural ? 'bg-indigo-100 text-indigo-600 shadow-sm' : 'bg-slate-200 text-slate-600'
                            }`}>
                                <HardHat size={20} />
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-slate-900 leading-tight">Structural Engineer</h4>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Forces & Structural Calculations
                                </p>
                            </div>
                        </div>
                        {hasStructural ? (
                            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-widest">Assigned</span>
                        ) : requiresStructural ? (
                            <div className="flex items-center gap-2">
                                <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                                <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-black uppercase tracking-widest border border-indigo-200">Open Bidding</span>
                            </div>
                        ) : (
                            <span className="px-3 py-1 bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest">Standby</span>
                        )}
                    </div>

                    {!hasStructural && !requiresStructural && (
                        <div className="p-3 bg-slate-100 border border-slate-200 rounded-2xl flex items-start gap-3">
                            <ShieldCheck className="text-slate-400 shrink-0 mt-0.5" size={16} />
                            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                Standard project. Structural necessity can be flagged by the Architect if the design complexity increases.
                            </p>
                        </div>
                    )}

                    {requiresStructural && !hasStructural && (
                        <div className="space-y-4">
                            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center gap-3">
                                <Users className="text-indigo-500 shrink-0" size={16} />
                                <p className="text-[11px] text-indigo-800 font-semibold italic">
                                    "{project.bids_structural_count || 0} Engineering bids pending review"
                                </p>
                            </div>

                            {/* Live Structural Proposals */}
                            {(project.bids_structural || []).length > 0 && (
                                <div className="space-y-3 mt-4">
                                    {project.bids_structural?.map((bid: any) => (
                                        <div key={bid.id} className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-indigo-300 transition-all">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <h5 className="text-sm font-black text-slate-900">{bid.bidder?.name || 'Engineer'}</h5>
                                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{bid.bidder?.experience_years} Years Experience</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-black text-slate-900">{formatCurrency(bid.price)}</p>
                                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{bid.estimated_duration} {bid.duration_unit}</p>
                                                </div>
                                            </div>
                                            
                                            <div className="p-3 bg-slate-50 rounded-xl mb-3 border border-slate-100 text-xs text-slate-600 italic line-clamp-3">
                                                "{bid.proposal}"
                                            </div>

                                            {(isOwner || isPM) ? (
                                                <button 
                                                    onClick={() => handleAcceptBid(bid.id, 'structural')}
                                                    disabled={!!isProcessing}
                                                    className="w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-md shadow-indigo-500/20 flex justify-center items-center gap-2"
                                                >
                                                    {isProcessing === `accept-${bid.id}` ? 'Processing...' : (isPM ? 'Recommend to Owner' : 'Accept Engineer Proposal')}
                                                </button>
                                            ) : (
                                                <p className="text-[9px] text-center text-slate-400 font-black uppercase tracking-widest">Awaiting PM/Owner Acceptance</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {hasStructural && (
                        <EngineeringCoordination
                            project={project}
                            roleType="structural"
                            isArchitect={isArchitect}
                            onRefresh={onRefresh}
                        />
                    )}

                    {isArchitect && !hasStructural && !requiresStructural && (
                        <button 
                            onClick={() => handleRequestEngineering('structural')}
                            disabled={!!isProcessing}
                            className="w-full py-4 rounded-2xl bg-white border-2 border-slate-200 text-slate-600 hover:border-slate-900 hover:text-slate-900 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 group"
                        >
                            {isProcessing === 'structural' ? 'Notifying PM...' : 'Notify PM of Structural Need'}
                            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    )}
                </div>

                {/* MEP Engineer Block */}
                <div className={`p-6 border-2 rounded-3xl space-y-5 transition-colors ${
                    requiresMep ? 'border-amber-500/30 bg-amber-50/10' : 'border-slate-100 bg-slate-50/50'
                }`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                requiresMep ? 'bg-amber-100 text-amber-600 shadow-sm' : 'bg-slate-200 text-slate-600'
                            }`}>
                                <Zap size={20} />
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-slate-900 leading-tight">MEP Engineer</h4>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Mechanical, Electrical, Plumbing
                                </p>
                            </div>
                        </div>
                        {hasMEP ? (
                            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-widest">Assigned</span>
                        ) : requiresMep ? (
                            <div className="flex items-center gap-2">
                                <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                                <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-[10px] font-black uppercase tracking-widest border border-amber-200">Open Bidding</span>
                            </div>
                        ) : (
                            <span className="px-3 py-1 bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest">Standby</span>
                        )}
                    </div>
 
                    {!hasMEP && !requiresMep && (
                        <div className="p-3 bg-slate-100 border border-slate-200 rounded-2xl flex items-start gap-3">
                            <ShieldCheck className="text-slate-400 shrink-0 mt-0.5" size={16} />
                            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                Managed by Architect/Contractor. High-performance utility routing requires specialist engagement.
                            </p>
                        </div>
                    )}

                    {requiresMep && !hasMEP && (
                        <div className="space-y-4">
                            <div className="p-3 bg-amber-50 border border-amber-100 rounded-2xl flex items-center gap-3">
                                <Users className="text-amber-500 shrink-0" size={16} />
                                <p className="text-[11px] text-amber-800 font-semibold italic">
                                    "{project.bids_mep_count || 0} MEP bids pending review"
                                </p>
                            </div>

                            {/* Live MEP Proposals */}
                            {(project.bids_mep || []).length > 0 && (
                                <div className="space-y-3 mt-4">
                                    {project.bids_mep?.map((bid: any) => (
                                        <div key={bid.id} className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-amber-300 transition-all">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <h5 className="text-sm font-black text-slate-900">{bid.bidder?.name || 'Engineer'}</h5>
                                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{bid.bidder?.experience_years} Years Experience</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-black text-slate-900">{formatCurrency(bid.price)}</p>
                                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{bid.estimated_duration} {bid.duration_unit}</p>
                                                </div>
                                            </div>
                                            
                                            <div className="p-3 bg-slate-50 rounded-xl mb-3 border border-slate-100 text-xs text-slate-600 italic line-clamp-3">
                                                "{bid.proposal}"
                                            </div>

                                            {(isOwner || isPM) ? (
                                                <button 
                                                    onClick={() => handleAcceptBid(bid.id, 'mep')}
                                                    disabled={!!isProcessing}
                                                    className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-md shadow-emerald-500/20 flex justify-center items-center gap-2"
                                                >
                                                    {isProcessing === `accept-${bid.id}` ? 'Processing...' : (isPM ? 'Recommend to Owner' : 'Accept Engineer Proposal')}
                                                </button>
                                            ) : (
                                                <p className="text-[9px] text-center text-slate-400 font-black uppercase tracking-widest">Awaiting PM/Owner Acceptance</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
 
                    {hasMEP && (
                        <EngineeringCoordination
                            project={project}
                            roleType="mep"
                            isArchitect={isArchitect}
                            onRefresh={onRefresh}
                        />
                    )}

                    {isArchitect && !hasMEP && !requiresMep && (
                        <button 
                            onClick={() => handleRequestEngineering('mep')}
                            disabled={!!isProcessing}
                            className="w-full py-4 rounded-2xl bg-white border-2 border-slate-200 text-slate-600 hover:border-slate-900 hover:text-slate-900 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 group"
                        >
                            {isProcessing === 'mep' ? 'Notifying PM...' : 'Notify PM of MEP Need'}
                            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    )}
                </div>
            </div>

            {/* Final Sign-off Status */}
            {project.legal_locked_at && (
                <div className="mt-8 p-6 bg-emerald-50 border border-emerald-100 rounded-[2rem] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm">
                            <ShieldCheck size={24} />
                        </div>
                        <div>
                            <h4 className="text-sm font-black text-emerald-900 leading-tight tracking-tight uppercase">Technical Phase Sealed</h4>
                            <p className="text-[10px] font-bold text-emerald-700/60 uppercase tracking-widest">
                                Designs locked and legally authenticated for Building Permit (PBG).
                            </p>
                        </div>
                    </div>
                    <div className="hidden sm:block px-4 py-2 bg-white/50 rounded-xl text-[9px] font-black text-emerald-600 uppercase tracking-widest border border-emerald-100">
                        Date: {new Date(project.legal_locked_at).toLocaleDateString()}
                    </div>
                </div>
            )}
        </div>
    );
}
