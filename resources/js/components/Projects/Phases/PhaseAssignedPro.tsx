import React from 'react';
import axios from 'axios';
import {
    Star, MessageCircle, ExternalLink, Settings,
    FileText, Box, Check, Briefcase, BookOpen, Package,
    ShieldCheck, Clock, Pencil, Layers, Hammer, Wallet, Users, AlertTriangle, LogOut,
    FolderOpen, Plus, DollarSign, UserPlus, ArrowRight, Lock, X
} from 'lucide-react';
import LifecycleActionModal from '../Details/LifecycleActionModal';
import AddendumProposalModal from './AddendumProposalModal';
import { PhaseKey } from '../../../types/phase.types';
import DesignBriefManager from './DesignBriefManager';
import DesignProgress from './DesignProgress';
import ProjectDeliverables from './ProjectDeliverables';
import ProjectReference from './ProjectReference';
import ProjectRequirements from '../ProjectRequirements';
import MaterialHistoryLog from '../Requirements/MaterialHistoryLog';
import TechnicalResourcing from './TechnicalResourcing';
import ConstructionMilestones from './ConstructionMilestones';
import ChangeOrderPanel from './ChangeOrderPanel';
import MaterialOrderTracker from './MaterialOrderTracker';
import InteriorProgress from './InteriorProgress';
import InteriorBriefManager from './InteriorBriefManager';
import LegalVault from './LegalVault';
import { ErrorBoundary } from '../../Common/ErrorBoundary';
import StickyNotesLayer from './StickyNotesLayer';
import ProfessionalNegotiationCard from './ProfessionalNegotiationCard';
import SpecialistActionCenter from './SpecialistActionCenter';
import { useToast } from '../../../context/ToastContext';
import { PHASE_ORDER } from '../../../types/phase.types';
import ConfirmModal from '../ConfirmModal';
import MutualTerminationPanel from './MutualTerminationPanel';

interface PhaseAssignedProProps {
    project: any;
    phaseKey: PhaseKey;
    activeSubRole?: string;
    user: any;
    config: { bidKey?: string; selectedKey: string; profileKey: string };
    onRefresh: () => void;
    onPhaseComplete?: (nextPhase: PhaseKey) => void;
    onOpenChat?: (user: any) => void;
    onViewProfile?: (pro: any, phaseKey: PhaseKey) => void;
    isContractor?: boolean;
    onGoToPayments?: () => void;
    onGoToInterviews?: () => void;
    onShortlist?: (bidId: number, role: string) => void;
    onRecommend?: (bidId: number, role: string) => void;
    hideResignButton?: boolean;
}
export default function PhaseAssignedPro({
    project, phaseKey, activeSubRole, user, config,
    onRefresh, onPhaseComplete, onOpenChat, onViewProfile,
    onGoToPayments, onGoToInterviews, onShortlist, onRecommend,
    hideResignButton
}: PhaseAssignedProProps) {
    const { showToast } = useToast();
    const ROLE_MAP: Record<string, string> = {
        management: 'project_manager',
        legal: 'notaris',
        design: 'arsitek',
        build: 'kontraktor',
        interior: 'interior',
        technical: 'structural',
        structural: 'structural',
        mep: 'mep'
    };
    const roleKey = activeSubRole || ROLE_MAP[phaseKey] || phaseKey;
    const bidKey = config?.bidKey;
    const acceptedBid = bidKey ? project?.[bidKey]?.find((b: any) => 
        ['accepted', 'contract_pending', 'active', 'awaiting_payment'].includes(b.status)
    ) : null;
    const isPMAuthorized = 
        phaseKey === 'design' ? !!project.design_authorized_at :
        phaseKey === 'materials' ? !!project.materials_authorized_at :
        phaseKey === 'build' ? !!project.construction_authorized_at : true;
    const isWorkspaceLocked = (acceptedBid && ['contract_pending', 'awaiting_payment'].includes(acceptedBid.status)) || !isPMAuthorized;
    const pro = (config.profileKey ? project?.[config.profileKey] : null) || acceptedBid?.bidder;
    const externalVendor = project.external_vendors?.find((v: any) => v.phase_role === roleKey);
    const isHiredContractor = user?.role_type === 'kontraktor' && (
        (project.selected_kontraktor_id && user?.kontraktor?.id === project.selected_kontraktor_id) ||
        (project.kontraktor?.user?.id === user?.id) ||
        (project.kontraktor?.user_id === user?.id) ||
        (project.bids_kontraktor?.some((b: any) => b.status === 'accepted' && (b.bidder?.user?.id === user?.id || b.bidder?.user_id === user?.id)))
    );

    const isHiredArchitect = user?.role_type === 'arsitek' && (
        (project.selected_arsitek_id && user?.arsitek?.id === project.selected_arsitek_id) ||
        (project.arsitek?.user?.id === user?.id) ||
        (project.arsitek?.user_id === user?.id) ||
        (project.bids_arsitek?.some((b: any) => b.status === 'accepted' && (b.bidder?.user?.id === user?.id || b.bidder?.user_id === user?.id)))
    );

    const isHiredInterior = user?.role_type === 'interior' && (
        (project.selected_interior_id && (
            user?.interior_profile?.id === project.selected_interior_id || 
            user?.id === project.interior?.user_id || 
            user?.id === project.interior?.user?.id ||
            user?.id === project.interior_profile?.user_id || 
            user?.id === project.interior_profile?.user?.id
        )) ||
        (project.bids_interior?.some((b: any) => b.status === 'accepted' && (b.bidder?.user?.id === user?.id || b.bidder?.user_id === user?.id)))
    );

    const isStructuralHired = user?.role_type === 'structural' && (
        (project.structural_id && (user?.structural_engineer?.id === project.structural_id || user?.id === project.structural_engineer?.user?.id)) ||
        (project.sub_professionals?.some((s: any) => s.user_id === user?.id && s.sub_role === 'structural' && s.status === 'active'))
    );

    const isMEPHired = user?.role_type === 'mep' && (
        (project.mep_id && (user?.mep_engineer?.id === project.mep_id || user?.id === project.mep_engineer?.user?.id)) ||
        (project.sub_professionals?.some((s: any) => s.user_id === user?.id && s.sub_role === 'mep' && s.status === 'active'))
    );

    if (!pro && !externalVendor && phaseKey !== 'materials' && !(phaseKey === 'interior' && isHiredContractor)) return null;

    const name = pro 
        ? String(pro?.user?.name || pro?.nama || pro?.name || 'Professional') 
        : (externalVendor ? externalVendor.contact_person : (isHiredContractor ? 'Contractor Coordination' : 'Professional'));
    
    const rating = pro?.average_rating || 0;

    // Check if current user is the hired professional
    const isOwner = user?.id === project.user_id;
    const proUserId = pro?.user_id || pro?.user?.id;
    const isHiredPro = user?.role_type === config.profileKey && user?.id === proUserId;
    const isExternal = !!externalVendor && !pro;

    const [activeSubTab, setActiveSubTab] = React.useState(
        phaseKey === 'legal' ? 'vault' :
            phaseKey === 'build' ? 'progress' :
                phaseKey === 'materials' ? 'bom' :
                    phaseKey === 'interior' ? 'planning' :
                        'managing'
    );

    React.useEffect(() => {
        setActiveSubTab(
            phaseKey === 'legal' ? 'vault' :
                phaseKey === 'build' ? 'progress' :
                    phaseKey === 'materials' ? 'bom' :
                        phaseKey === 'interior' ? 'planning' :
                            'managing'
        );
    }, [phaseKey]);

    const [isUpdating, setIsUpdating] = React.useState(false);
    const [isAddendumModalOpen, setIsAddendumModalOpen] = React.useState(false);
    const [initialAddendumType, setInitialAddendumType] = React.useState<'extra_fee' | 'specialist_assignment'>('extra_fee');
    const [isResignModalOpen, setIsResignModalOpen] = React.useState(false);
    const [confirmModal, setConfirmModal] = React.useState<{
        isOpen: boolean;
        title: string;
        description: string;
        onConfirm: () => void;
        variant: 'info' | 'success' | 'danger' | 'warning';
    }>({
        isOpen: false,
        title: '',
        description: '',
        onConfirm: () => {},
        variant: 'info'
    });

    const showConfirm = (title: string, description: string, onConfirm: () => void, variant: 'info' | 'success' | 'danger' | 'warning' = 'info') => {
        setConfirmModal({
            isOpen: true,
            title,
            description,
            onConfirm: () => {
                onConfirm();
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
            },
            variant
        });
    };

    const isPM = user?.role_type === 'project_manager' && project.pm_id === user.id;

    const submittedAt = 
        phaseKey === 'design' ? project.design_handover_submitted_at :
        phaseKey === 'build' ? project.construction_handover_submitted_at :
        phaseKey === 'interior' ? project.interior_handover_submitted_at :
        phaseKey === 'legal' ? project.legal_handover_submitted_at : null;

    const revisionNotes = 
        phaseKey === 'design' ? project.design_handover_notes :
        phaseKey === 'build' ? project.construction_handover_notes :
        phaseKey === 'interior' ? project.interior_handover_notes :
        phaseKey === 'legal' ? project.legal_handover_notes : null;



    const handleMarkComplete = () => {
        if (!isOwner) return;

        showConfirm(
            "Mark Phase as Completed",
            `Are you sure you want to mark ${phaseKey} as completed? This will move your project forward.`,
            async () => {
                setIsUpdating(true);
                try {
                    const currentCompleted = project.completed_phases || [];
                    if (!currentCompleted.includes(phaseKey)) {
                        const nextCompleted = [...currentCompleted, phaseKey];

                        // Prepare data for update
                        const updateData: any = {
                            completed_phases: nextCompleted
                        };

                        // Logic for transitioning from design to build
                        if (phaseKey === 'design') {
                            updateData.target_role = 'both';
                        }

                        await axios.put(`/projects/${project.id}`, updateData);

                        showToast(`${phaseKey.charAt(0).toUpperCase() + phaseKey.slice(1)} phase completed!`, 'success');

                        // 1. Refresh global project state
                        onRefresh();

                        // 2. Calculate next phase automatically
                        if (typeof onPhaseComplete === 'function') {
                            const neededPhases = project.needed_phases && project.needed_phases.length > 0
                                ? project.needed_phases
                                : PHASE_ORDER;

                            const currentIndex = neededPhases.indexOf(phaseKey);

                            if (currentIndex !== -1 && currentIndex < neededPhases.length - 1) {
                                const nextPhase = neededPhases[currentIndex + 1] as PhaseKey;
                                // Small delay to ensure state reflects completion if needed
                                setTimeout(() => onPhaseComplete(nextPhase), 100);
                            }
                        }
                    }
                } catch (err: any) {
                    console.error('Failed to complete phase:', err);
                    showToast(err.response?.data?.message || 'Failed to update phase.', 'error');
                } finally {
                    setIsUpdating(false);
                }
            },
            "warning"
        );
    };
    const handleResign = async (reason: string) => {
        try {
            await axios.post(`/projects/${project.id}/resign`, { reason });
            showToast('Anda berhasil mengundurkan diri dari proyek.', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Gagal mengundurkan diri.', 'error');
            throw error;
        }
    };

    const handleAuthorizePhase = (phase: string, authorize: boolean) => {
        const phaseName = phase === 'build' ? 'Construction' : (phase === 'materials' ? 'Material' : 'Design');
        
        showConfirm(
            authorize ? `Authorize ${phaseName} Phase?` : `Revoke ${phaseName} Phase Authorization?`,
            authorize
                ? `Are you sure you want to authorize the ${phaseName} phase? Hired specialists will be allowed to start working and uploading files.`
                : `Are you sure you want to revoke authorization for the ${phaseName} phase? Hired specialists will be blocked from uploading documents.`,
            async () => {
                setIsUpdating(true);
                try {
                    await axios.post(`/projects/${project.id}/authorize-phase`, { phase, authorize });
                    showToast(`Phase ${phase} ${authorize ? 'authorized' : 'authorization revoked'}.`, 'success');
                    onRefresh();
                } catch (error: any) {
                    showToast(error.response?.data?.message || 'Failed to update phase authorization.', 'error');
                } finally {
                    setIsUpdating(false);
                }
            },
            authorize ? 'success' : 'danger'
        );
    };

    const canAuthorize = isOwner || isPM;

    const hasSubTabs = ['legal', 'design', 'build', 'materials', 'interior'].includes(phaseKey);

    return (
        <div className="relative">

            {/* ACTIVE NEGOTIATIONS SECTION — Visible across all phases for the hired pro */}
            {isHiredPro && project.addendums?.some((a: any) => a.status === 'negotiating' && a.user_id === user.id) && (
                <div className="mb-8 space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center shadow-sm">
                            <DollarSign size={20} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 tracking-tight">Financial Hub</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Fee Negotiations</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-6">
                        {project.addendums
                            .filter((a: any) => a.status === 'negotiating' && a.user_id === user.id)
                            .map((addendum: any) => (
                                <ProfessionalNegotiationCard 
                                    key={addendum.id}
                                    addendum={addendum}
                                    project={project}
                                    onRefresh={onRefresh}
                                />
                            ))
                        }
                    </div>
                </div>
            )}
            
            {/* Design Package Sealed Banner — only in design tab */}
            {phaseKey === 'design' && project.design_completed_at && (
                <div className="mb-8 p-8 bg-black rounded-[3rem] border border-zinc-800 shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-zinc-800 rounded-full blur-[100px] opacity-20 -translate-y-1/2 translate-x-1/2" />
                    <div className="relative flex flex-col md:flex-row items-center justify-between gap-8">
                        <div className="flex items-center gap-6">
                            <div className="w-20 h-20 bg-zinc-800 text-white rounded-[2rem] flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform duration-700">
                                <ShieldCheck size={40} className="text-zinc-400" />
                            </div>
                            <div>
                                <h4 className="text-2xl font-black text-white tracking-tight">Design Package Sealed</h4>
                                <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.2em] mt-2 flex items-center gap-2">
                                    <Clock size={12} /> Handed over on {new Date(project.design_completed_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                                </p>
                            </div>
                        </div>
                        <div className="px-8 py-4 bg-zinc-800 rounded-2xl border border-zinc-700 flex flex-col items-center">
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Status</span>
                            <span className="text-emerald-400 text-xs font-black tracking-widest uppercase flex items-center gap-2">
                                <Check size={14} /> Ready for Build
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Owner Decision Panel — Only show after brief is locked */}
            {isOwner && !isWorkspaceLocked && !(project.completed_phases || []).includes(phaseKey) && (
                (phaseKey === 'design' && project.design_locked_at) ||
                (phaseKey === 'build' && project.construction_locked_at) ||
                !['design', 'build', 'management'].includes(phaseKey)
            ) && (
                    <div className="mb-8 p-6 bg-emerald-50 border-2 border-emerald-100 rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-500 shadow-sm">
                                <Check size={24} />
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-emerald-900 uppercase tracking-widest">Phase Progression</h4>
                                <p className="text-[10px] text-emerald-600 font-bold leading-tight max-w-xs">
                                    Working with {name}. Click below when this phase is ready to advance.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleMarkComplete}
                            disabled={isUpdating}
                            className="w-full md:w-auto px-8 py-3 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50"
                        >
                            {isUpdating ? 'Advancing...' : (phaseKey === 'design' ? 'Complete Design & Find Builder' : 'Mark as Completed')}
                        </button>
                    </div>
                )}




            {/* Interior Designer Handover Workshop Button */}
            {isHiredPro && !isWorkspaceLocked && phaseKey === 'interior' && !project.interior_completed_at && (
                <div className="mb-8 p-8 bg-purple-900 border border-purple-800 rounded-[3rem] shadow-sm flex flex-col items-center text-center gap-6">
                    <div className="max-w-md">
                        <h4 className="text-xl font-black text-white tracking-tight">Interior Design Handover</h4>
                        <p className="text-xs text-purple-400 font-bold mt-2 leading-relaxed uppercase tracking-wider">
                            By submitting this interior package, you certify that all room designs, mood boards, and specifications
                            are finalized. The PM will verify the deliverables.
                        </p>
                    </div>

                    {submittedAt && (
                        <div className="px-6 py-3 bg-white/10 rounded-2xl flex items-center gap-3 animate-pulse">
                            <Clock size={16} className="text-purple-300" />
                            <span className="text-[10px] font-black text-white/70 uppercase tracking-widest">Awaiting Verification Since {new Date(submittedAt).toLocaleDateString()}</span>
                        </div>
                    )}

                    {revisionNotes && !submittedAt && (
                        <div className="p-5 bg-purple-400/10 border border-purple-400/20 rounded-2xl text-left w-full">
                            <div className="flex items-center gap-2 mb-2 text-purple-300">
                                <AlertTriangle size={16} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Revision Requested</span>
                            </div>
                            <p className="text-xs font-bold text-purple-100">{revisionNotes}</p>
                        </div>
                    )}

                    <button
                        onClick={() => {
                            showConfirm(
                                "Submit Interior Handover",
                                "Submit interior design for verification?",
                                async () => {
                                    setIsUpdating(true);
                                    try {
                                        await axios.post(`/projects/${project.id}/seal-interior`);
                                        showToast('Interior Handover Submitted', 'success');
                                        onRefresh();
                                    } catch (error: any) {
                                        const message = error.response?.data?.message || 'Seal failed.';
                                        showToast(message, 'error');
                                    } finally {
                                        setIsUpdating(false);
                                    }
                                },
                                "info"
                            );
                        }}
                        disabled={isUpdating || !!submittedAt}
                        className="group relative px-12 py-5 bg-white text-purple-900 rounded-[2rem] font-black text-xs uppercase tracking-[0.25em] shadow-2xl hover:bg-purple-50 transition-all flex items-center gap-4 overflow-hidden disabled:opacity-50"
                    >
                        <ShieldCheck size={20} className={!submittedAt ? "group-hover:rotate-12 transition-transform" : ""} />
                        {isUpdating ? 'SUBMITTING...' : submittedAt ? 'PENDING PM REVIEW' : revisionNotes ? 'RESUBMIT INTERIOR' : 'SUBMIT INTERIOR HANDOVER'}
                    </button>
                </div>
            )}


            {isHiredPro && phaseKey !== 'legal' && phaseKey !== 'management' && !hideResignButton && (
                <div className="flex justify-end mb-4">
                    <button
                        onClick={() => setIsResignModalOpen(true)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all shadow-xs z-10"
                    >
                        <LogOut size={12} /> Resign Proyek
                    </button>
                </div>
            )}

            {pro && phaseKey !== 'legal' && !(phaseKey === 'management' && isHiredPro) && !isHiredPro && (
                <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 ${hasSubTabs ? 'mb-6 pb-6 border-b border-gray-50' : ''}`}>
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center overflow-hidden shadow-inner flex-shrink-0">
                            {pro?.foto ? (
                                <img src={pro.foto.startsWith('http') ? pro.foto : `/storage/${pro.foto}`} alt={name} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-lg font-black text-gray-400">{name.charAt(0)}</span>
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Assigned Professional</p>
                                {isExternal && (
                                    <span className="px-1.5 py-0.5 bg-slate-900 text-white text-[7px] font-black rounded-md tracking-tighter">EXTERNAL</span>
                                )}
                            </div>
                            <h3 className="text-base font-black text-slate-900 tracking-tight leading-none">{name}</h3>
                            <div className="flex items-center gap-1.5 mt-1">
                                <Star size={12} className="text-amber-400 fill-amber-400" />
                                <span className="text-xs text-slate-500 font-bold">{rating}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2 items-center flex-wrap">
                        <a
                            href={pro?.user?.phone_number ? `https://wa.me/${String(pro.user.phone_number).replace(/\D/g, '').replace(/^0/, '62')}` : '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-1.5 px-4 py-2 bg-[#25D366] text-white rounded-xl text-[9px] font-black uppercase tracking-wider hover:scale-105 active:scale-95 transition-all shadow-sm ${!pro?.user?.phone_number ? 'opacity-50 cursor-not-allowed' : ''}`}
                            onClick={(e) => !pro?.user?.phone_number && e.preventDefault()}
                        >
                            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg> WhatsApp
                        </a>
                        <button
                            onClick={() => onOpenChat && pro?.user && onOpenChat(pro.user)}
                            className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-wider hover:scale-105 active:scale-95 transition-all shadow-sm"
                        >
                            <MessageCircle size={12} /> Open Channel
                        </button>
                        <button
                            onClick={() => onViewProfile && onViewProfile(pro, phaseKey)}
                            className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-900 rounded-xl transition-all"
                        >
                            <ExternalLink size={16} />
                        </button>
                    </div>
                </div>
            )}

            <AddendumProposalModal 
                project={project}
                isOpen={isAddendumModalOpen}
                initialType={initialAddendumType}
                onClose={() => setIsAddendumModalOpen(false)}
                onRefresh={onRefresh}
            />

            {isWorkspaceLocked ? (
                <div className="p-12 text-center bg-slate-50 border-2 border-slate-100 rounded-[2rem] space-y-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-slate-200/50 rounded-full blur-[80px] opacity-40 -translate-y-1/2 translate-x-1/2" />
                    
                    <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-slate-100/50 border border-slate-100 transition-transform duration-500 group-hover:scale-110">
                        {!isPMAuthorized ? (
                            <Lock size={36} className="text-red-500 animate-pulse" />
                        ) : acceptedBid?.status === 'contract_pending' ? (
                            <FileText size={36} className="text-amber-500 animate-pulse" />
                        ) : (
                            <Wallet size={36} className="text-emerald-500" />
                        )}
                    </div>
                    
                    <div className="space-y-2">
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                            {!isPMAuthorized 
                                ? 'Awaiting Phase Authorization'
                                : acceptedBid?.status === 'contract_pending' 
                                    ? 'Contract Signature Pending' 
                                    : 'Milestone Payment Pending'
                            }
                        </h3>
                        <p className="text-sm text-slate-500 font-bold max-w-lg mx-auto leading-relaxed">
                            {!isPMAuthorized ? (
                                isHiredPro ? (
                                    'The Project Manager has not yet authorized the start of this phase. Please wait until they have verified the necessary prerequisites before commencing work.'
                                ) : (
                                    'The Project Manager has not yet authorized the start of this phase. The active workspace will unlock once the PM grants authorization.'
                                )
                            ) : acceptedBid?.status === 'contract_pending' ? (
                                isHiredPro ? (
                                    'Congratulations! You have been selected for this phase. Please sign the contract to unlock your active workspace and start collaborating.'
                                ) : (
                                    `The contract has been generated and sent to ${name}. The active workspace will unlock immediately once they sign the agreement.`
                                )
                            ) : (
                                isOwner ? (
                                    'The contract has been signed by both parties! To unlock the workspace and authorize the professional to begin, please complete the initial milestone payment.'
                                ) : (
                                    "The contract is fully signed! The active workspace will unlock as soon as the owner's initial down payment is verified."
                                )
                            )}
                        </p>
                    </div>

                    <div className="pt-4 flex justify-center gap-4">
                        {!isPMAuthorized ? (
                            canAuthorize ? (
                                <button
                                    onClick={() => handleAuthorizePhase(phaseKey, true)}
                                    disabled={isUpdating}
                                    className="px-8 py-4 bg-zinc-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-900/10 flex items-center gap-2 cursor-pointer"
                                >
                                    <ShieldCheck size={16} />
                                    {isUpdating ? 'Authorizing...' : `Authorize ${phaseKey === 'build' ? 'Construction' : phaseKey === 'materials' ? 'Material' : 'Design'} Phase`}
                                </button>
                            ) : (
                                <div className="px-6 py-3 bg-red-50 border border-red-100 rounded-xl text-red-800 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                    <Lock size={12} /> Pending Project Manager Signal
                                </div>
                            )
                        ) : acceptedBid?.status === 'contract_pending' ? (
                            isHiredPro ? (
                                <button
                                    onClick={onGoToInterviews}
                                    className="px-8 py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-900/10 flex items-center gap-2"
                                >
                                    Sign Contract in Interviews
                                    <ArrowRight size={14} />
                                </button>
                            ) : (
                                <div className="px-6 py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[10px] font-black uppercase tracking-widest">
                                    Waiting for Professional's Signature
                                </div>
                            )
                        ) : (
                            isOwner ? (
                                <button
                                    onClick={onGoToPayments}
                                    className="px-8 py-4 bg-emerald-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/10 flex items-center gap-2"
                                >
                                    Go to Payments Hub
                                    <ArrowRight size={14} />
                                </button>
                            ) : (
                                <div className="px-6 py-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-800 text-[10px] font-black uppercase tracking-widest animate-pulse">
                                    Waiting for Owner Payment Verification
                                </div>
                            )
                        )}
                    </div>
                </div>
            ) : (
                <>
            {/* If Legal Phase, show the Legal Workspace Navigation */}
            {phaseKey === 'legal' && (
                <div className="space-y-8">
                    <div className="flex items-center justify-between gap-4 border-b border-slate-50 pb-2">
                        <div className="flex items-center gap-1 p-1 bg-slate-50 rounded-2xl w-fit overflow-x-auto">
                            {[
                                { id: 'vault', label: 'Document Vault & Scope', icon: ShieldCheck },
                                { id: 'archive', label: 'Client ID & Reference Files', icon: FolderOpen },
                            ].filter(Boolean).map((tab: any) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveSubTab(tab.id)}
                                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeSubTab === tab.id
                                        ? 'bg-white text-slate-900 shadow-sm'
                                        : 'text-slate-400 hover:text-slate-600'
                                        }`}
                                >
                                    <tab.icon size={14} />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Legal Phase Actions (Resign & Review Request) */}
                        {isHiredPro && (
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setIsResignModalOpen(true)}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer"
                                >
                                    <LogOut size={12} /> Resign Proyek
                                </button>

                                {!project.legal_completed_at && (
                                    <>
                                        {revisionNotes && !submittedAt && (
                                            <div className="px-3 py-1.5 bg-rose-50 border border-rose-100 rounded-xl text-[10px] font-bold text-rose-700 max-w-xs truncate" title={revisionNotes}>
                                                Revision requested: {revisionNotes}
                                            </div>
                                        )}
                                        {submittedAt ? (
                                            <div className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-black uppercase tracking-widest rounded-xl animate-pulse">
                                                <Clock size={12} className="text-amber-500" />
                                                Awaiting PM Review
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    showConfirm(
                                                        "Submit Legal Progress",
                                                        "Submit your legal progress for PM review?",
                                                        async () => {
                                                            setIsUpdating(true);
                                                            try {
                                                                await axios.post(`/projects/${project.id}/seal-legal`);
                                                                showToast('Legal Progress Submitted', 'success');
                                                                onRefresh();
                                                            } catch (error: any) {
                                                                showToast(error.response?.data?.message || 'Submit failed.', 'error');
                                                            } finally {
                                                                setIsUpdating(false);
                                                            }
                                                        },
                                                        "info"
                                                    );
                                                }}
                                                disabled={isUpdating}
                                                className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-900 hover:bg-black text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-sm disabled:opacity-50 active:scale-95 cursor-pointer"
                                            >
                                                <ShieldCheck size={14} />
                                                {revisionNotes ? 'Resubmit Progress' : 'Request PM Review'}
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="transition-all">
                        {activeSubTab === 'vault' && (
                            <ErrorBoundary name="LegalVault">
                                <LegalVault
                                    project={project}
                                    currentUser={user}
                                    isNotaris={isHiredPro}
                                    isArchitect={user?.role_type === 'arsitek' && ((project.selected_arsitek_id && user?.arsitek?.id === project.selected_arsitek_id) || project.arsitek?.user_id === user?.id)}
                                    isPM={isPM}
                                    isOwner={isOwner}
                                    onUpdate={onRefresh}
                                    onGoToPayments={onGoToPayments}
                                />
                            </ErrorBoundary>
                        )}
                        {activeSubTab === 'archive' && (
                            <ProjectDeliverables 
                                project={project} 
                                currentUser={user} 
                                isPro={isHiredPro || isPM || isOwner} 
                            />
                        )}
                    </div>
                </div>
            )}

            {/* If Design Phase, show the Workspace Navigation */}
            {phaseKey === 'design' && (
                <div className="space-y-8">
                    <div className="flex items-center gap-1 p-1 bg-slate-50 rounded-2xl w-fit overflow-x-auto">
                        {[
                            { id: 'managing', label: project.design_locked_at ? 'Brief' : 'Planning', icon: Settings },
                            { id: 'progress', label: 'Design Progress', icon: FileText }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveSubTab(tab.id)}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap relative ${activeSubTab === tab.id
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-400 hover:text-slate-600'
                                    }`}
                            >
                                <tab.icon size={14} />
                                {tab.label}
                                {tab.count > 0 && (
                                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] flex items-center justify-center rounded-full border-2 border-white animate-bounce">
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="transition-all">
                        {activeSubTab === 'managing' && (
                            <DesignBriefManager
                                project={project}
                                isArchitect={isHiredPro}
                                isOwner={isOwner}
                                isPM={isPM}
                                onRefresh={onRefresh}
                            />
                        )}
                        {activeSubTab === 'progress' && (
                            <DesignProgress project={project} currentUser={user} isArchitect={isHiredPro} isPM={isPM} />
                        )}
                    </div>
                </div>
            )}

            {/* If Build Phase, show the Contractor Workspace Navigation */}
            {phaseKey === 'build' && (
                <div className="space-y-8">
                    <ConstructionMilestones
                        project={project}
                        currentUser={user}
                        isContractor={isHiredPro}
                        isPM={isPM}
                    />
                </div>
            )}

            {/* Structural/MEP Phase Workspace */}
            {(roleKey === 'structural' || roleKey === 'mep') && (
                <div className="space-y-8">
                     <div className="flex items-center gap-1 p-1 bg-slate-50 rounded-2xl w-fit overflow-x-auto">
                        {[
                            { id: 'managing', label: 'Brief & Contract', icon: Settings },
                            { id: 'progress', label: 'Technical Progress', icon: Layers },
                            { id: 'results', label: 'Results & Files', icon: Box }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveSubTab(tab.id)}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeSubTab === tab.id
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-400 hover:text-slate-600'
                                    }`}
                            >
                                <tab.icon size={14} />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="transition-all">
                        {activeSubTab === 'managing' && (
                            <SpecialistActionCenter 
                                project={project} 
                                isPro={isHiredPro}
                                isOwner={isOwner}
                                isPM={isPM}
                                roleType={roleKey}
                                onProjectUpdate={onRefresh}
                            />
                        )}
                        {activeSubTab === 'progress' && (
                            <DesignProgress 
                                project={project} 
                                currentUser={user} 
                                isArchitect={isHiredPro}
                                isPM={isPM}
                                roleType={roleKey}
                            />
                        )}
                        {activeSubTab === 'results' && (
                            <ProjectDeliverables 
                                project={project} 
                                currentUser={user} 
                                isPro={isHiredPro || isOwner || isPM} 
                            />
                        )}
                    </div>
                </div>
            )}
            {phaseKey === 'materials' && (
                <div className="space-y-8">
                    <div className="flex items-center gap-1 p-1 bg-slate-50 rounded-2xl w-fit overflow-x-auto">
                        {[
                            { id: 'orders', label: 'Order Tracker', icon: Package },
                            { id: 'bom', label: 'Bill of Materials', icon: Layers },
                            { id: 'results', label: 'History/Log', icon: FileText }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveSubTab(tab.id)}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeSubTab === tab.id
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-400 hover:text-slate-600'
                                    }`}
                            >
                                <tab.icon size={14} />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="transition-all">
                        {activeSubTab === 'orders' && (
                            <MaterialOrderTracker project={project} currentUser={user} />
                        )}
                        {activeSubTab === 'bom' && (() => {
                            const isOwner = user?.id === project?.user_id;
                            const isPM = user?.role_type === 'project_manager' && project?.pm_id === user?.id;
                            const canMutateBOM = isOwner || isPM || isHiredContractor || isHiredArchitect || isHiredInterior || isStructuralHired || isMEPHired;
                            
                            return (
                                <ProjectRequirements 
                                    project={project} 
                                    onUpdate={onRefresh} 
                                    canMutate={canMutateBOM}
                                    currentUser={user}
                                />
                            );
                        })()}
                        {activeSubTab === 'results' && (
                            <MaterialHistoryLog project={project} />
                        )}
                    </div>
                </div>
            )}

            {/* Interior Phase Workspace */}
            {phaseKey === 'interior' && (
                <div className="space-y-8">
                    <div className="flex items-center gap-1 p-1 bg-slate-50 rounded-2xl w-fit overflow-x-auto">
                        {[
                            { id: 'planning', label: project.interior_locked_at ? 'Brief' : 'Planning', icon: Settings },
                            { id: 'progress', label: 'Room Designs', icon: Layers },
                            { id: 'results', label: 'Results & Files', icon: Box }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveSubTab(tab.id)}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeSubTab === tab.id
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-400 hover:text-slate-600'
                                    }`}
                            >
                                <tab.icon size={14} />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="transition-all">
                        {activeSubTab === 'planning' && (
                            <InteriorBriefManager
                                project={project}
                                isInteriorDesigner={isHiredPro}
                                onRefresh={onRefresh}
                            />
                        )}
                        {activeSubTab === 'progress' && (
                            <InteriorProgress
                                project={project}
                                currentUser={user}
                                isInteriorDesigner={isHiredPro}
                                isContractor={isContractor || isHiredContractor}
                                isPM={isPM}
                            />
                        )}
                        {activeSubTab === 'results' && (
                            <ProjectDeliverables project={project} currentUser={user} isPro={isHiredPro} />
                        )}
                    </div>
                </div>
            )}
                </>
            )}

            <LifecycleActionModal
                isOpen={isResignModalOpen}
                onClose={() => setIsResignModalOpen(false)}
                onConfirm={handleResign}
                type="resign"
                title="Undur Diri dari Proyek"
                description="Apakah Anda yakin ingin mengundurkan diri? Tindakan ini akan menghapus Anda dari proyek dan membuka kembali bidding untuk Project Owner."
            />

            {/* Amicable exit: backend + freeze middleware existed with zero UI */}
            {isHiredPro && (
                <MutualTerminationPanel project={project} user={user} onRefresh={onRefresh} />
            )}

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                description={confirmModal.description}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                variant={confirmModal.variant}
            />
        </div>
    );
}
