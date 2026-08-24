import React, { useState } from 'react';
import axios from 'axios';
import { 
    ShieldCheck, HardHat, Zap, CheckCircle2, 
    AlertTriangle, Users, ArrowRight, Check, X, Clock, Sofa
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { Project, ProjectAddendum, formatCurrency } from '../../../types/project.types';
import EngineeringCoordination from './EngineeringCoordination';
import EngineeringBidsBoard from './EngineeringBidsBoard';
import AddendumProposalModal from './AddendumProposalModal';
import RequestSpecialistModal from './RequestSpecialistModal';
import { TeamMember } from '../../../types/sub_professional.types';
import { UserPlus, MessageCircle, Send } from 'lucide-react';

interface TechnicalResourcingProps {
    project: Project;
    user: any;
    isArchitect: boolean;
    onRefresh: () => void;
    onShortlist?: (bidId: number, role: string) => void;
    onRecommend?: (bidId: number, role: string) => void;
    activeTab?: 'structural' | 'mep' | 'interior';
}

export default function TechnicalResourcing({ 
    project, user, isArchitect, onRefresh, onShortlist, onRecommend, activeTab 
}: TechnicalResourcingProps) {
    const { showToast } = useToast();
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [showBidsBoard, setShowBidsBoard] = useState<'structural' | 'mep' | 'interior' | null>(null);
    const [isAddendumModalOpen, setIsAddendumModalOpen] = useState(false);
    const [addendumInitialType, setAddendumInitialType] = useState<'extra_fee' | 'specialist_assignment'>('specialist_assignment');
    const [importRole, setImportRole] = useState<'structural' | 'mep' | 'interior'>('structural');
    const [requestRole, setRequestRole] = useState<'structural' | 'mep' | 'interior' | null>(null);

    const isPM = (user?.role_type === 'project_manager' || user?.role_type === 'pm') && Number(project.pm_id) === Number(user?.id);
    const isOwner = Number(user?.id) === Number(project.user_id);


    const requiresStructural = !!project.requires_structural;
    const requiresMep = !!project.requires_mep;
    const requiresInterior = !!project.requires_interior;
    const hasStructural = !!project.structural_id;
    const hasMEP = !!project.mep_id;
    const hasInterior = !!project.selected_interior_id;

    // Smart Advisory Logic
    const designDetails = project.design_details || {};
    const floorCount = Number(designDetails.floorCount || 1);
    const targetArea = Number(designDetails.targetArea || 0);
    
    const structuralRecommended = floorCount > 2 || targetArea > 200;
    const mepRecommended = targetArea > 150; // Standard threshold for MEP specialist

    // Filter pending requests for this phase (both manual requests and specialist assignments)
    const pendingRequests = project.addendums?.filter(a => 
        (a.status === 'pending_approval' || a.status === 'approved_unpaid' || a.status === 'verifying') && (
            a.role_type === 'structural' || a.role_type === 'mep' || a.role_type === 'interior' ||
            a.specialist_type === 'structural' || a.specialist_type === 'mep' || a.specialist_type === 'interior'
        )
    ) || [];

    const activePendingStructural = pendingRequests.find(a => 
        (a.role_type === 'structural' || a.specialist_type === 'structural') && a.status === 'pending_approval'
    );
    const awaitingPaymentStructural = pendingRequests.find(a => 
        (a.role_type === 'structural' || a.specialist_type === 'structural') && (a.status === 'approved_unpaid' || a.status === 'verifying')
    );

    const activePendingMep = pendingRequests.find(a => 
        (a.role_type === 'mep' || a.specialist_type === 'mep') && a.status === 'pending_approval'
    );
    const awaitingPaymentMep = pendingRequests.find(a => 
        (a.role_type === 'mep' || a.specialist_type === 'mep') && (a.status === 'approved_unpaid' || a.status === 'verifying')
    );

    const activePendingInterior = pendingRequests.find(a => 
        (a.role_type === 'interior' || a.specialist_type === 'interior') && a.status === 'pending_approval'
    );
    const awaitingPaymentInterior = pendingRequests.find(a => 
        (a.role_type === 'interior' || a.specialist_type === 'interior') && (a.status === 'approved_unpaid' || a.status === 'verifying')
    );

    // Keep compatibility with existing variables or update them
    const pendingStructuralRequest = activePendingStructural;
    const pendingMepRequest = activePendingMep;
    const pendingInteriorRequest = activePendingInterior;

    const handleRequestEngineering = (type: 'structural' | 'mep' | 'interior') => {
        setRequestRole(type);
    };

    const handleInvitePartner = async (type: 'structural' | 'mep' | 'interior') => {
        if (type === 'interior') {
            window.dispatchEvent(new CustomEvent('switchDashboardTab', { detail: 'find-interior' }));
        } else {
            window.dispatchEvent(new CustomEvent('switchDashboardTab', { detail: 'find-engineers' }));
        }
    };


    const getDisplayPrice = (bid: any) => {
        if (bid.fee_type === 'percentage' && (!bid.calculated_total || bid.calculated_total === 0) && bid.price > 0 && project.budget > 0) {
            return (bid.price / 100) * Number(project.budget);
        }
        return bid.calculated_total || bid.price;
    };

    const renderBidPriceRange = (bid: any) => {
        if (bid.price_max && Number(bid.price_max) > 0) {
            if (bid.fee_type === 'percentage') {
                if (project.budget > 0) {
                    return `${formatCurrency((Number(bid.price) / 100) * project.budget)} - ${formatCurrency((Number(bid.price_max) / 100) * project.budget)}`;
                } else {
                    return `${bid.price}% - ${bid.price_max}%`;
                }
            }
            return `${formatCurrency(bid.price)} - ${formatCurrency(bid.price_max)}`;
        }
        return formatCurrency(getDisplayPrice(bid));
    };

    const renderBidPriceSubtitle = (bid: any) => {
        const percentageText = bid.fee_type === 'percentage'
            ? (bid.price_max && Number(bid.price_max) > 0 ? `${bid.price}% - ${bid.price_max}% • ` : `${bid.price}% • `)
            : '';
        return `${percentageText}${bid.estimated_duration} ${bid.duration_unit}`;
    };

    const handleAuthorizeSpecialist = async (bidId: number, bidType: 'structural' | 'mep' | 'interior') => {
        if (!window.confirm('Authorize this specialist hire and commit budget?')) return;
        
        setIsProcessing(`accept-${bidId}`);
        try {
            await axios.post(`/projects/${project.id}/authorize-specialist`, {
                bid_id: bidId,
                bid_type: bidType
            });
            showToast('Specialist authorized and hired!', 'success');
            onRefresh();
        } catch (error: unknown) {
            const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to authorize specialist.';
            showToast(msg, 'error');
        } finally {
            setIsProcessing(null);
        }
    };


    const handleRejectSpecialist = async (bidId: number, bidType: 'structural' | 'mep' | 'interior') => {
        if (!window.confirm('Reject this specialist recommendation?')) return;
        
        setIsProcessing(`reject-${bidId}`);
        try {
            await axios.post(`/projects/${project.id}/reject-specialist`, {
                bid_id: bidId,
                bid_type: bidType
            });
            showToast('Recommendation rejected.', 'success');
            onRefresh();
        } catch (error: any) {
            showToast('Failed to reject recommendation.', 'error');
        } finally {
            setIsProcessing(null);
        }
    };

    const renderExternalVendors = (role: string) => {
        const vendors = project.external_vendors?.filter(v => v.phase_role === role) || [];
        if (vendors.length === 0) return null;

        return (
            <div className="space-y-3 mt-4 animate-in fade-in slide-in-from-top-2 duration-500">
                <div className="flex items-center gap-2 mb-2">
                    <span className="flex h-1.5 w-1.5 rounded-full bg-slate-900" />
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400">External Partners</h5>
                </div>
                {vendors.map(vendor => (
                    <div key={vendor.id} className="p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl flex items-center justify-between group hover:border-slate-900 transition-all">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-slate-900 group-hover:border-slate-900 transition-all">
                                <Users size={18} />
                            </div>
                            <div>
                                <h5 className="text-sm font-black text-slate-900">{vendor.contact_person}</h5>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{vendor.company_name || 'Individual Partner'}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-black text-slate-900">{formatCurrency(vendor.agreed_fee)}</p>
                            <span className="inline-block px-2 py-0.5 bg-slate-900 text-white text-[8px] font-black uppercase tracking-widest rounded mt-1">
                                Partner Assigned
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderHighFidelityPendingCard = (request: any, role: string) => {
        if (!request) return null;

        const isDirectHire = !!(request.assigned_user_id || request.team_member_id || request.assignedUser || request.teamMember);
        const strategy = isDirectHire ? 'Bring Own Team' : 'Open Bidding Board';
        const fee = request.amount ? formatCurrency(request.amount) : 'Fixed Fee Proposed';

        let statusLabel = 'Pending PM Approval';
        let statusColor = 'bg-amber-100 text-amber-800 border-amber-200';
        let pulseColor = 'bg-amber-500';

        if (request.status === 'approved_unpaid') {
            statusLabel = 'Awaiting Client Payment';
            statusColor = 'bg-slate-100 text-slate-800 border-slate-200';
            pulseColor = 'bg-slate-500';
        } else if (request.status === 'verifying') {
            statusLabel = 'Verifying Escrow Ledger';
            statusColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
            pulseColor = 'bg-emerald-500';
        }

        const colleague = request.assignedUser || request.teamMember;

        return (
            <div className="p-5 bg-white border-2 border-slate-100 rounded-3xl space-y-4 shadow-sm hover:border-slate-300 transition-all animate-in fade-in slide-in-from-top-2 duration-500">
                <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Resourcing Strategy</p>
                        <h5 className="text-xs font-black text-slate-900 mt-0.5">{strategy}</h5>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${statusColor} flex items-center gap-1.5`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${pulseColor} animate-pulse`} />
                        {statusLabel}
                    </span>
                </div>

                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Financial Impact (Fixed Fee)</p>
                        <p className="text-sm font-black text-slate-700 mt-0.5">{fee}</p>
                    </div>
                </div>

                {colleague && (
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100/50 flex items-center gap-3">
                        <div className="w-10 h-10 bg-white border border-slate-200 rounded-xl overflow-hidden flex items-center justify-center text-slate-400 shrink-0">
                            {colleague.profile_picture || colleague.photo_url ? (
                                <img src={colleague.profile_picture || colleague.photo_url} alt={colleague.name} className="w-full h-full object-cover" />
                            ) : (
                                <Users size={18} />
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Proposed Candidate</p>
                            <h6 className="text-xs font-black text-slate-900 truncate mt-0.5">{colleague.name}</h6>
                            <p className="text-[9px] text-slate-400 font-medium truncate">
                                {colleague.role_title || colleague.experience_years ? `${colleague.role_title || 'Expert'} • ${colleague.experience_years || 'Roster'} Years Exp` : 'Firm Colleague'}
                            </p>
                        </div>
                    </div>
                )}

                {request.description && (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[10px] text-slate-500 italic">
                        "{request.description}"
                    </div>
                )}

                {isOwner && request.status === 'approved_unpaid' && (
                    <div className="flex flex-col gap-2 pt-2 border-t border-slate-50">
                        <button
                            onClick={() => {
                                // BUGFIX: /projects/{id}?tab=payments is not a real
                                // SPA route — use the dashboard tab-switch event.
                                window.dispatchEvent(new CustomEvent('switchDashboardTab', {
                                    detail: { tab: 'project-detail', projectId: project.id, subTab: 'payments' }
                                }));
                            }}
                            className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md shadow-slate-600/10 flex items-center justify-center gap-1.5"
                        >
                            Upload Escrow Payment Proof
                        </button>
                    </div>
                )}

                {(isPM || isArchitect) && request.status === 'approved_unpaid' && (
                    <div className="flex gap-2 pt-2 border-t border-slate-50">
                        <button 
                            onClick={() => {
                                const phone = project.owner?.phone || project.user?.phone || '';
                                let cleanPhone = phone.replace(/\D/g, '');
                                if (cleanPhone.startsWith('0')) {
                                    cleanPhone = '62' + cleanPhone.substring(1);
                                }
                                const appUrl = window.location.origin;
                                // BUGFIX: dead SPA route replaced with the dashboard.
                                const paymentLink = `${appUrl}/dashboard`;
                                const messageTemplate = `Halo, permintaan koordinasi spesialis *${role.toUpperCase()}* untuk proyek *${project.title}* telah disetujui oleh Project Manager.\n\nSilakan lakukan pembayaran escrow sebesar *Rp ${Number(request.amount).toLocaleString('id-ID')}* agar tenaga spesialis dapat mulai diintegrasikan ke proyek.\n\nKlik link berikut untuk melakukan pembayaran escrow:\n${paymentLink}\n\nTerima kasih.`;
                                const encodedMessage = encodeURIComponent(messageTemplate);
                                const waUrl = cleanPhone 
                                    ? `https://wa.me/${cleanPhone}?text=${encodedMessage}`
                                    : `https://wa.me/?text=${encodedMessage}`;
                                window.open(waUrl, '_blank');
                            }}
                            className="flex-1 py-2 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center justify-center gap-1.5"
                        >
                            <MessageCircle size={12} /> Notify Owner (WhatsApp)
                        </button>
                        <button 
                            onClick={() => {
                                const appUrl = window.location.origin;
                                // BUGFIX: dead SPA route replaced with the dashboard.
                                const paymentLink = `${appUrl}/dashboard`;
                                const messageTemplate = `Halo, permintaan koordinasi spesialis *${role.toUpperCase()}* untuk proyek *${project.title}* telah disetujui oleh Project Manager.\n\nSilakan lakukan pembayaran escrow sebesar *Rp ${Number(request.amount).toLocaleString('id-ID')}* agar tenaga spesialis dapat mulai diintegrasikan ke proyek.\n\nKlik link berikut untuk melakukan pembayaran escrow:\n${paymentLink}\n\nTerima kasih.`;
                                navigator.clipboard.writeText(messageTemplate);
                                showToast('Pesan disalin! Silakan paste di Internal Chat.', 'success');
                            }}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1"
                        >
                            <Send size={12} /> Copy Chat
                        </button>
                    </div>
                )}

                {isPM && request.status === 'pending_approval' && (
                    <div className="flex gap-2 pt-2 border-t border-slate-50">
                        <button 
                            onClick={async () => {
                                if (!window.confirm('Approve and authorize this specialist request?')) return;
                                try {
                                    await axios.post(`/projects/${project.id}/verify-engineering/${request.id}`, { status: 'approved' });
                                    showToast('Specialist request approved!', 'success');
                                    onRefresh();
                                } catch (err) {
                                    showToast('Failed to approve request', 'error');
                                }
                            }}
                            className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shadow-sm"
                        >
                            Verify & Approve
                        </button>
                        <button 
                            onClick={async () => {
                                if (!window.confirm('Reject this specialist request?')) return;
                                try {
                                    await axios.post(`/projects/${project.id}/verify-engineering/${request.id}`, { status: 'rejected' });
                                    showToast('Specialist request rejected.', 'info');
                                    onRefresh();
                                } catch (err) {
                                    showToast('Failed to reject request', 'error');
                                }
                            }}
                            className="px-3 py-2 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                        >
                            Reject
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="bg-white border-2 border-slate-100 rounded-[2.5rem] p-8 shadow-sm space-y-8 relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="absolute top-0 right-0 w-48 h-48 bg-slate-50 rounded-bl-[5rem] -mr-12 -mt-12 -z-10" />
            
            {/* PM Review Board - TOP PRIORITY ALERT */}

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

            {/* Smart Advisory Alert for Architect */}
            {isArchitect && (structuralRecommended || mepRecommended) && !requiresStructural && !requiresMep && (
                <div className="p-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-6 animate-in slide-in-from-top-2 duration-500">
                    <div className="flex items-center gap-4 text-center md:text-left">
                        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-600 shadow-sm shrink-0">
                            <AlertTriangle size={24} />
                        </div>
                        <div>
                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Engineering Advisory</h4>
                            <p className="text-[10px] text-slate-700 font-bold leading-tight mt-1">
                                Based on your current plan ({floorCount} Floors / {targetArea} sqm), specialized engineering is legally recommended.
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {structuralRecommended && !requiresStructural && (
                            <button 
                                onClick={() => handleRequestEngineering('structural')}
                                className="px-5 py-2.5 bg-zinc-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-all shadow-lg shadow-slate-200"
                            >
                                Request Structural
                            </button>
                        )}
                        {mepRecommended && !requiresMep && (
                            <button 
                                onClick={() => handleRequestEngineering('mep')}
                                className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-slate-200"
                            >
                                Request MEP
                            </button>
                        )}
                    </div>
                </div>
            )}


            <div className={`grid grid-cols-1 ${!activeTab ? 'lg:grid-cols-3' : ''} gap-6`}>
                {/* Structural Engineer Block */}
                {(!activeTab || activeTab === 'structural') && (
                <div className={`p-6 border-2 rounded-3xl space-y-5 transition-colors ${
                    requiresStructural ? 'border-slate-500/30 bg-slate-50/10' : 'border-slate-100 bg-slate-50/50'
                }`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                requiresStructural ? 'bg-slate-100 text-slate-600 shadow-sm' : 'bg-slate-200 text-slate-600'
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
                        ) : awaitingPaymentStructural ? (
                            <div className="flex items-center gap-2">
                                <span className="flex h-2 w-2 rounded-full bg-slate-500 animate-pulse" />
                                <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-black uppercase tracking-widest border border-slate-200">
                                    {awaitingPaymentStructural.status === 'verifying' ? 'Verifying Payment' : 'Awaiting Payment'}
                                </span>
                            </div>
                        ) : pendingStructuralRequest ? (
                            <div className="flex items-center gap-2">
                                <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                                <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-[10px] font-black uppercase tracking-widest border border-amber-200">Awaiting PM Approval</span>
                            </div>
                        ) : (
                            <span className="px-3 py-1 bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest">Standby</span>
                        )}
                    </div>

                    {!hasStructural && (pendingStructuralRequest || awaitingPaymentStructural) && (
                        renderHighFidelityPendingCard(pendingStructuralRequest || awaitingPaymentStructural, 'structural')
                    )}

                    {!hasStructural && !requiresStructural && !pendingStructuralRequest && !awaitingPaymentStructural && (
                        <div className="p-3 bg-slate-100 border border-slate-200 rounded-2xl flex items-start gap-3">
                            <ShieldCheck className="text-slate-400 shrink-0 mt-0.5" size={16} />
                            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                Standard project. Structural necessity can be flagged by the Architect if the design complexity increases.
                            </p>
                        </div>
                    )}

                    {requiresStructural && !hasStructural && !pendingStructuralRequest && !awaitingPaymentStructural && (
                        <div className="space-y-4">
                            <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Users className="text-slate-500 shrink-0" size={16} />
                                    <p className="text-[11px] text-slate-800 font-semibold italic">
                                        "{project.bids_structural_count || 0} Engineering bids pending review"
                                    </p>
                                </div>
                                {isArchitect && (
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => {
                                                setImportRole(importRole); // For consistency if used elsewhere, but AddendumModal handles it via initialType + UI select
                                                setAddendumInitialType('specialist_assignment');
                                                setIsAddendumModalOpen(true);
                                            }} 
                                            className="px-3 py-1 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center gap-1.5 shadow-sm"
                                        >
                                            <UserPlus size={12} />
                                            Bring Own Team
                                        </button>
                                        <button onClick={() => handleInvitePartner('structural')} disabled={!!isProcessing} className="px-3 py-1 bg-white border border-slate-200 text-slate-600 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all">
                                            Invite Partner
                                        </button>
                                        <button onClick={() => setShowBidsBoard('structural')} className="px-3 py-1 bg-zinc-900 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-all shadow-sm">
                                            Review Bids
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Live Structural Proposals */}
                            {(project.bids_structural || []).length > 0 && (
                                <div className="space-y-3 mt-4">
                                    {project.bids_structural?.map((bid: any) => (
                                        <div key={bid.id} className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-slate-300 transition-all">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <h5 className="text-sm font-black text-slate-900">{bid.bidder?.name || 'Engineer'}</h5>
                                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{bid.bidder?.experience_years} Years Experience</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-black text-slate-900">{renderBidPriceRange(bid)}</p>
                                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                                                        {renderBidPriceSubtitle(bid)}
                                                    </p>
                                                </div>
                                            </div>
                                            
                                            <div className="p-3 bg-slate-50 rounded-xl mb-3 border border-slate-100 text-xs text-slate-600 italic line-clamp-3">
                                                "{bid.proposal}"
                                            </div>
 
                                            {bid.is_recommended && (
                                                <div className="flex items-center gap-2 mb-3">
                                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[8px] font-black uppercase tracking-widest rounded flex items-center gap-1">
                                                        <ShieldCheck size={10} /> Architect Recommended
                                                    </span>
                                                </div>
                                            )}
 
                                            {isOwner ? (
                                                bid.is_recommended ? (
                                                    <div className="flex gap-2 mt-3">
                                                        <button 
                                                            onClick={() => handleAuthorizeSpecialist(bid.id, 'structural')}
                                                            disabled={!!isProcessing}
                                                            className="flex-1 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-md shadow-slate-600/20 flex justify-center items-center gap-2"
                                                        >
                                                            {isProcessing === `accept-${bid.id}` ? 'Processing...' : 'Confirm & Hire'}
                                                        </button>
                                                        <button 
                                                            onClick={() => handleRejectSpecialist(bid.id, 'structural')}
                                                            disabled={!!isProcessing}
                                                            className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 text-[10px] font-black uppercase tracking-widest transition-all"
                                                        >
                                                            Reject
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <p className="text-[9px] text-center text-amber-500 font-black uppercase tracking-widest mt-3 flex items-center justify-center gap-1">
                                                        <Clock size={10} /> Architect Review Pending
                                                    </p>
                                                )
                                            ) : isPM ? (
                                                <p className="text-[9px] text-center text-amber-500 font-black uppercase tracking-widest mt-3 flex items-center justify-center gap-1">
                                                    <Clock size={10} /> 
                                                    {bid.is_recommended ? 'Awaiting Owner Authorization' : 'Awaiting Architect Recommendation'}
                                                </p>
                                            ) : isArchitect ? (
                                                <div className="flex items-center gap-2 mt-4">
                                                    {(!bid.status || bid.status === 'pending') ? (
                                                        <button 
                                                            onClick={() => onShortlist?.(bid.id, 'structural')}
                                                            className="flex-1 py-2.5 bg-zinc-900 text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-zinc-800 transition-all shadow-lg shadow-slate-200"
                                                        >
                                                            Shortlist for Interview
                                                        </button>
                                                    ) : (
                                                        <>
                                                            {bid.status === 'shortlisted' && (
                                                                 <button 
                                                                    onClick={() => onRecommend?.(bid.id, 'structural')}
                                                                    className="flex-1 py-2.5 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200"
                                                                >
                                                                    Recommend to Owner
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                    <button className="px-4 py-2.5 bg-slate-100 text-slate-600 text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-200 transition-all">
                                                        Profile
                                                    </button>
                                                </div>
                                            ) : (
                                                <p className="text-[9px] text-center text-slate-400 font-black uppercase tracking-widest mt-3">
                                                    {bid.is_recommended ? 'Awaiting Owner Authorization' : 'Architect Review Pending'}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {renderExternalVendors('structural')}
                        </div>
                    )}

                    {hasStructural && (
                        <EngineeringCoordination
                            project={project}
                            user={user}
                            roleType="structural"
                            isArchitect={isArchitect}
                            onRefresh={onRefresh}
                        />
                    )}

                    {isArchitect && !hasStructural && !requiresStructural && !pendingStructuralRequest && !awaitingPaymentStructural && (
                        <button 
                            onClick={() => handleRequestEngineering('structural')}
                            disabled={!!isProcessing || !!pendingStructuralRequest}
                            className={`w-full py-4 rounded-2xl border-2 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 group ${
                                pendingStructuralRequest 
                                    ? 'bg-amber-50 border-amber-200 text-amber-700 cursor-default' 
                                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-900 hover:text-slate-900'
                            }`}
                        >
                            {pendingStructuralRequest ? (
                                <>
                                    <Clock size={14} className="animate-pulse" /> Request Awaiting PM Approval
                                </>
                            ) : (
                                <>
                                    {isProcessing === 'structural' ? 'Notifying PM...' : 'Notify PM of Structural Need'}
                                    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    )}
                </div>
                )}

                {/* MEP Engineer Block */}
                {(!activeTab || activeTab === 'mep') && (
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
                        ) : awaitingPaymentMep ? (
                            <div className="flex items-center gap-2">
                                <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                                <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-[10px] font-black uppercase tracking-widest border border-amber-200">
                                    {awaitingPaymentMep.status === 'verifying' ? 'Verifying Payment' : 'Awaiting Payment'}
                                </span>
                            </div>
                        ) : pendingMepRequest ? (
                            <div className="flex items-center gap-2">
                                <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                                <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-[10px] font-black uppercase tracking-widest border border-amber-200">Awaiting PM Approval</span>
                            </div>
                        ) : (
                            <span className="px-3 py-1 bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest">Standby</span>
                        )}
                    </div>
 
                    {!hasMEP && (pendingMepRequest || awaitingPaymentMep) && (
                        renderHighFidelityPendingCard(pendingMepRequest || awaitingPaymentMep, 'mep')
                    )}

                    {!hasMEP && !requiresMep && !pendingMepRequest && !awaitingPaymentMep && (
                        <div className="p-3 bg-slate-100 border border-slate-200 rounded-2xl flex items-start gap-3">
                            <ShieldCheck className="text-slate-400 shrink-0 mt-0.5" size={16} />
                            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                Managed by Architect/Contractor. High-performance utility routing requires specialist engagement.
                            </p>
                        </div>
                    )}

                    {requiresMep && !hasMEP && !pendingMepRequest && !awaitingPaymentMep && (
                        <div className="space-y-4">
                            <div className="p-3 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Users className="text-amber-500 shrink-0" size={16} />
                                    <p className="text-[11px] text-amber-800 font-semibold italic">
                                        "{project.bids_mep_count || 0} MEP bids pending review"
                                    </p>
                                </div>
                                {isArchitect && (
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => {
                                                setAddendumInitialType('specialist_assignment');
                                                setIsAddendumModalOpen(true);
                                            }} 
                                            className="px-3 py-1 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center gap-1.5 shadow-sm"
                                        >
                                            <UserPlus size={12} />
                                            Bring Own Team
                                        </button>
                                        <button onClick={() => handleInvitePartner('mep')} disabled={!!isProcessing} className="px-3 py-1 bg-white border border-amber-200 text-amber-600 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-amber-50 transition-all">
                                            Invite Partner
                                        </button>
                                        <button onClick={() => setShowBidsBoard('mep')} className="px-3 py-1 bg-amber-500 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all shadow-sm">
                                            Review Bids
                                        </button>
                                    </div>
                                )}
                            </div>                            {/* Live MEP Proposals */}
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
                                                    <p className="text-sm font-black text-slate-900">{renderBidPriceRange(bid)}</p>
                                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                                                        {renderBidPriceSubtitle(bid)}
                                                    </p>
                                                </div>
                                            </div>
                                            
                                            <div className="p-3 bg-slate-50 rounded-xl mb-3 border border-slate-100 text-xs text-slate-600 italic line-clamp-3">
                                                "{bid.proposal}"
                                            </div>
 
                                            {bid.is_recommended && (
                                                <div className="flex items-center gap-2 mb-3">
                                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[8px] font-black uppercase tracking-widest rounded flex items-center gap-1">
                                                        <ShieldCheck size={10} /> Architect Recommended
                                                    </span>
                                                </div>
                                            )}
 
                                            {isOwner ? (
                                                bid.is_recommended ? (
                                                    <div className="flex gap-2 mt-3">
                                                        <button 
                                                            onClick={() => handleAuthorizeSpecialist(bid.id, 'mep')}
                                                            disabled={!!isProcessing}
                                                            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-md shadow-emerald-600/20 flex justify-center items-center gap-2"
                                                        >
                                                            {isProcessing === `accept-${bid.id}` ? 'Processing...' : 'Confirm & Hire'}
                                                        </button>
                                                        <button 
                                                            onClick={() => handleRejectSpecialist(bid.id, 'mep')}
                                                            disabled={!!isProcessing}
                                                            className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 text-[10px] font-black uppercase tracking-widest transition-all"
                                                        >
                                                            Reject
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <p className="text-[9px] text-center text-amber-500 font-black uppercase tracking-widest mt-3 flex items-center justify-center gap-1">
                                                        <Clock size={10} /> Architect Review Pending
                                                    </p>
                                                )
                                             ) : isPM ? (
                                                <p className="text-[9px] text-center text-amber-500 font-black uppercase tracking-widest mt-3 flex items-center justify-center gap-1">
                                                    <Clock size={10} /> 
                                                    {bid.is_recommended ? 'Awaiting Owner Authorization' : 'Awaiting Architect Recommendation'}
                                                </p>
                                             ) : isArchitect ? (
                                                <div className="flex items-center gap-2 mt-4">
                                                    {(!bid.status || bid.status === 'pending') ? (
                                                        <button 
                                                            onClick={() => onShortlist?.(bid.id, 'mep')}
                                                            className="flex-1 py-2.5 bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-amber-600 transition-all shadow-lg shadow-amber-200"
                                                        >
                                                            Shortlist for Interview
                                                        </button>
                                                    ) : (
                                                        <>
                                                            {bid.status === 'shortlisted' && (
                                                                <button 
                                                                    onClick={() => onRecommend?.(bid.id, 'mep')}
                                                                    className="flex-1 py-2.5 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200"
                                                                >
                                                                    Recommend to Owner
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                    <button className="px-4 py-2.5 bg-slate-100 text-slate-600 text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-200 transition-all">
                                                        Profile
                                                    </button>
                                                </div>
                                             ) : (
                                                <p className="text-[9px] text-center text-slate-400 font-black uppercase tracking-widest mt-3">
                                                    {bid.is_recommended ? 'Awaiting Owner Authorization' : 'Architect Review Pending'}
                                                </p>
                                             )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {renderExternalVendors('mep')}
                        </div>
                    )}

                    {hasMEP && (
                        <EngineeringCoordination
                            project={project}
                            user={user}
                            roleType="mep"
                            isArchitect={isArchitect}
                            onRefresh={onRefresh}
                        />
                    )}

                    {isArchitect && !hasMEP && !requiresMep && !pendingMepRequest && !awaitingPaymentMep && (
                        <button 
                            onClick={() => handleRequestEngineering('mep')}
                            disabled={!!isProcessing || !!pendingMepRequest}
                            className={`w-full py-4 rounded-2xl border-2 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 group ${
                                pendingMepRequest 
                                    ? 'bg-amber-50 border-amber-200 text-amber-700 cursor-default' 
                                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-900 hover:text-slate-900'
                            }`}
                        >
                            {pendingMepRequest ? (
                                <>
                                    <Clock size={14} className="animate-pulse" /> Request Awaiting PM Approval
                                </>
                            ) : (
                                <>
                                    {isProcessing === 'mep' ? 'Notifying PM...' : 'Notify PM of MEP Need'}
                                    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    )}
                </div>
                )}

                {/* Interior Designer Block */}
                {(!activeTab || activeTab === 'interior') && (
                <div className={`p-6 border-2 rounded-3xl space-y-5 transition-colors ${
                    requiresInterior ? 'border-rose-500/30 bg-rose-50/10' : 'border-slate-100 bg-slate-50/50'
                }`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                requiresInterior ? 'bg-rose-100 text-rose-600 shadow-sm' : 'bg-slate-200 text-slate-600'
                            }`}>
                                <Sofa size={20} />
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-slate-900 leading-tight">Interior Designer</h4>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Space Planning & Aesthetics Styling
                                </p>
                            </div>
                        </div>
                        {hasInterior ? (
                            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-widest">Assigned</span>
                        ) : awaitingPaymentInterior ? (
                            <div className="flex items-center gap-2">
                                <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                                <span className="px-3 py-1 bg-rose-100 text-rose-700 rounded-lg text-[10px] font-black uppercase tracking-widest border border-rose-200">
                                    {awaitingPaymentInterior.status === 'verifying' ? 'Verifying Payment' : 'Awaiting Payment'}
                                </span>
                            </div>
                        ) : pendingInteriorRequest ? (
                            <div className="flex items-center gap-2">
                                <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                                <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-[10px] font-black uppercase tracking-widest border border-amber-200">Awaiting PM Approval</span>
                            </div>
                        ) : (
                            <span className="px-3 py-1 bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest">Standby</span>
                        )}
                    </div>

                    {!hasInterior && (pendingInteriorRequest || awaitingPaymentInterior) && (
                        renderHighFidelityPendingCard(pendingInteriorRequest || awaitingPaymentInterior, 'interior')
                    )}

                    {!hasInterior && !requiresInterior && !pendingInteriorRequest && !awaitingPaymentInterior && (
                        <div className="p-3 bg-slate-100 border border-slate-200 rounded-2xl flex items-start gap-3">
                            <ShieldCheck className="text-slate-400 shrink-0 mt-0.5" size={16} />
                            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                Standard project. Interior styling necessity can be flagged by the Architect if spatial curation is required.
                            </p>
                        </div>
                    )}

                    {requiresInterior && !hasInterior && !pendingInteriorRequest && !awaitingPaymentInterior && (
                        <div className="space-y-4">
                            <div className="p-3 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Users className="text-rose-500 shrink-0" size={16} />
                                    <p className="text-[11px] text-rose-800 font-semibold italic">
                                        "{project.bids_interior_count || 0} Interior bids pending review"
                                    </p>
                                </div>
                                {isArchitect && (
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => {
                                                setAddendumInitialType('specialist_assignment');
                                                setIsAddendumModalOpen(true);
                                            }} 
                                            className="px-3 py-1 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center gap-1.5 shadow-sm"
                                        >
                                            <UserPlus size={12} />
                                            Bring Own Team
                                        </button>
                                        <button onClick={() => handleInvitePartner('interior')} disabled={!!isProcessing} className="px-3 py-1 bg-white border border-rose-200 text-rose-600 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-rose-50 transition-all">
                                            Invite Partner
                                        </button>
                                        <button onClick={() => setShowBidsBoard('interior')} className="px-3 py-1 bg-rose-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-rose-700 transition-all shadow-sm">
                                            Review Bids
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Live Interior Proposals */}
                            {(project.bids_interior || []).length > 0 && (
                                <div className="space-y-3 mt-4">
                                    {project.bids_interior?.map((bid: any) => (
                                        <div key={bid.id} className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-rose-300 transition-all">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <h5 className="text-sm font-black text-slate-900">{bid.bidder?.name || 'Designer'}</h5>
                                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{bid.bidder?.experience_years} Years Experience</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-black text-slate-900">{renderBidPriceRange(bid)}</p>
                                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                                                        {renderBidPriceSubtitle(bid)}
                                                    </p>
                                                </div>
                                            </div>
                                            
                                            <div className="p-3 bg-slate-50 rounded-xl mb-3 border border-slate-100 text-xs text-slate-600 italic line-clamp-3">
                                                "{bid.proposal}"
                                            </div>
 
                                            {bid.is_recommended && (
                                                <div className="flex items-center gap-2 mb-3">
                                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[8px] font-black uppercase tracking-widest rounded flex items-center gap-1">
                                                        <ShieldCheck size={10} /> Architect Recommended
                                                    </span>
                                                </div>
                                            )}
 
                                            {isOwner ? (
                                                bid.is_recommended ? (
                                                    <div className="flex gap-2 mt-3">
                                                        <button 
                                                            onClick={() => handleAuthorizeSpecialist(bid.id, 'interior')}
                                                            disabled={!!isProcessing}
                                                            className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-md shadow-rose-600/20 flex justify-center items-center gap-2"
                                                        >
                                                            {isProcessing === `accept-${bid.id}` ? 'Processing...' : 'Confirm & Hire'}
                                                        </button>
                                                        <button 
                                                            onClick={() => handleRejectSpecialist(bid.id, 'interior')}
                                                            disabled={!!isProcessing}
                                                            className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 text-[10px] font-black uppercase tracking-widest transition-all"
                                                        >
                                                            Reject
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <p className="text-[9px] text-center text-amber-500 font-black uppercase tracking-widest mt-3 flex items-center justify-center gap-1">
                                                        <Clock size={10} /> Architect Review Pending
                                                    </p>
                                                )
                                            ) : isPM ? (
                                                <p className="text-[9px] text-center text-amber-500 font-black uppercase tracking-widest mt-3 flex items-center justify-center gap-1">
                                                    <Clock size={10} /> 
                                                    {bid.is_recommended ? 'Awaiting Owner Authorization' : 'Awaiting Architect Recommendation'}
                                                </p>
                                            ) : isArchitect ? (
                                                <div className="flex items-center gap-2 mt-4">
                                                    {(!bid.status || bid.status === 'pending') ? (
                                                        <button 
                                                            onClick={() => onShortlist?.(bid.id, 'interior')}
                                                            className="flex-1 py-2.5 bg-rose-600 text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-rose-700 transition-all shadow-lg shadow-rose-200"
                                                        >
                                                            Shortlist for Interview
                                                        </button>
                                                    ) : (
                                                        <>
                                                            {bid.status === 'shortlisted' && (
                                                                <button 
                                                                    onClick={() => onRecommend?.(bid.id, 'interior')}
                                                                    className="flex-1 py-2.5 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200"
                                                                >
                                                                    Recommend to Owner
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                    <button className="px-4 py-2.5 bg-slate-100 text-slate-600 text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-200 transition-all">
                                                        Profile
                                                    </button>
                                                </div>
                                            ) : (
                                                <p className="text-[9px] text-center text-slate-400 font-black uppercase tracking-widest mt-3">
                                                    {bid.is_recommended ? 'Awaiting Owner Authorization' : 'Architect Review Pending'}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {renderExternalVendors('interior')}
                        </div>
                    )}

                    {hasInterior && (
                        <EngineeringCoordination
                            project={project}
                            user={user}
                            roleType="interior"
                            isArchitect={isArchitect}
                            onRefresh={onRefresh}
                        />
                    )}

                    {isArchitect && !hasInterior && !requiresInterior && !pendingInteriorRequest && !awaitingPaymentInterior && (
                        <button 
                            onClick={() => handleRequestEngineering('interior')}
                            disabled={!!isProcessing || !!pendingInteriorRequest}
                            className={`w-full py-4 rounded-2xl border-2 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 group ${
                                pendingInteriorRequest 
                                    ? 'bg-amber-50 border-amber-200 text-amber-700 cursor-default' 
                                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-900 hover:text-slate-900'
                            }`}
                        >
                            {pendingInteriorRequest ? (
                                <>
                                    <Clock size={14} className="animate-pulse" /> Request Awaiting PM Approval
                                </>
                            ) : (
                                <>
                                    {isProcessing === 'interior' ? 'Notifying PM...' : 'Notify PM of Interior Designer Need'}
                                    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    )}
                </div>
                )}
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
            {showBidsBoard && (
                <EngineeringBidsBoard 
                    project={project}
                    user={user}
                    roleType={showBidsBoard}
                    isArchitect={isArchitect}
                    onRefresh={onRefresh}
                    onClose={() => setShowBidsBoard(null)}
                />
            )}
            
            <AddendumProposalModal 
                project={project}
                isOpen={isAddendumModalOpen}
                initialType={addendumInitialType}
                onClose={() => setIsAddendumModalOpen(false)}
                onRefresh={onRefresh}
            />

            <RequestSpecialistModal 
                projectId={project.id}
                project={project}
                isOpen={!!requestRole}
                roleType={requestRole}
                onClose={() => setRequestRole(null)}
                onRefresh={onRefresh}
            />
        </div>
    );
}
