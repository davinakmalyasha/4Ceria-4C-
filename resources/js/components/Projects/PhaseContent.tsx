import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Lock, FileText, LogOut, CheckCircle2, Clock } from 'lucide-react';
import { CONSTRUCTION_SUB_ROLES, ConstructionSubRoleKey } from '../../constants/ConstructionSubRolePresets';
import { ErrorBoundary } from '../Common/ErrorBoundary';
import { Phase, PhaseKey, PHASE_ROLE_MAP, getCategoryPhaseLabel } from '../../types/phase.types';
import PhaseAssignedPro from './Phases/PhaseAssignedPro';
import PhaseBidsList from './Phases/PhaseBidsList';
import { ProjectBidForm } from './Details/ProjectBidForm';
import StructuralWorkspace from './Phases/StructuralWorkspace';
import ConfirmModal from './ConfirmModal';
import MepWorkspace from './Phases/MepWorkspace';
import InteriorWorkspace from './Phases/InteriorWorkspace';
import PMWorkspace from './Phases/PMWorkspace';
import FinalHandover from './Phases/FinalHandover';
import SpecialistBiddingBoard from './Phases/SpecialistBiddingBoard';
import PhaseInitiationPanel from './Phases/PhaseInitiationPanel';
import EngineeringManualLogs from './Phases/EngineeringManualLogs';
import TechnicalResourcing from './Phases/TechnicalResourcing';
import ConstructionResourcing from './Phases/ConstructionResourcing';
import { BidReviewCard } from './Phases/BidReviewCard';
import { MessageCircle, UserCheck, ArrowRight, HardHat, Activity, Pencil, Wrench, Sofa } from 'lucide-react';
import axios from 'axios';
import { useToast } from '../../context/ToastContext';
import StickyNotesLayer from './Phases/StickyNotesLayer';
import PhaseReadOnlySummary from './Phases/PhaseReadOnlySummary';

interface PhaseContentProps {
    phase: Phase;
    project: any;
    user: any;
    onRefresh: () => void;
    onPhaseComplete?: (nextPhase: PhaseKey) => void;
    onOpenChat?: (user: any) => void;
    onViewProfile?: (pro: any, phaseKey: PhaseKey) => void;
    onShortlist?: (bidId: number, role: string) => void;
    onRecommend?: (bidId: number, role: string) => void;
    subs?: any[];
    onSwitchTab?: (tab: any) => void;
}

export default function PhaseContent({ 
    phase, project, user, onRefresh, 
    onPhaseComplete, onOpenChat, onViewProfile, onShortlist, onRecommend, subs = [],
    onSwitchTab 
}: PhaseContentProps) {
    const { showToast } = useToast();
    const [engineeringSubTab, setEngineeringSubTab] = React.useState<'architecture' | 'structural' | 'mep' | 'interior'>(
        phase.key === 'technical' ? 'structural' : 'architecture'
    );
    const [constructionSubTab, setConstructionSubTab] = React.useState<ConstructionSubRoleKey>('general');

    const [isResignModalOpen, setIsResignModalOpen] = React.useState(false);
    const [isResigning, setIsResigning] = React.useState(false);
    const [isSealingDesign, setIsSealingDesign] = React.useState(false);
    const [showSealDesignConfirm, setShowSealDesignConfirm] = React.useState(false);
    const [isSealingConstruction, setIsSealingConstruction] = React.useState(false);
    const [showSealConstructionConfirm, setShowSealConstructionConfirm] = React.useState(false);

    const handleResign = async (reason: string) => {
        setIsResigning(true);
        try {
            await axios.post(`/projects/${project.id}/resign`, { reason });
            showToast('Anda berhasil mengundurkan diri dari proyek ini.', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Gagal mengundurkan diri.', 'error');
        } finally {
            setIsResigning(false);
            setIsResignModalOpen(false);
        }
    };

    const handleSealDesign = async () => {
        setIsSealingDesign(true);
        setShowSealDesignConfirm(false);
        try {
            await axios.post(`/projects/${project.id}/seal-design`);
            showToast('Design submitted for PM verification!', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to submit design for approval.', 'error');
        } finally {
            setIsSealingDesign(false);
        }
    };

    const handleSealConstruction = async () => {
        setIsSealingConstruction(true);
        setShowSealConstructionConfirm(false);
        try {
            await axios.post(`/projects/${project.id}/seal-construction`);
            showToast('Construction submitted for PM verification!', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to submit construction for approval.', 'error');
        } finally {
            setIsSealingConstruction(false);
        }
    };

    if (!phase) return null;

    const isStructuralHired = (project.structural_id && (user?.structural_engineer?.id === project.structural_id || user?.id === project.structural_engineer?.user?.id)) ||
        (project.sub_professionals?.some((s: any) => s.user_id === user?.id && s.sub_role === 'structural' && s.status === 'active'));
    const isMEPHired = (project.mep_id && (user?.mep_engineer?.id === project.mep_id || user?.id === project.mep_engineer?.user?.id)) ||
        (project.sub_professionals?.some((s: any) => s.user_id === user?.id && s.sub_role === 'mep' && s.status === 'active'));
    const isInteriorHired = (project.selected_interior_id && (
        user?.interior_profile?.id === project.selected_interior_id || 
        user?.id === project.interior?.user_id || 
        user?.id === project.interior?.user?.id ||
        user?.id === project.interior_profile?.user_id || 
        user?.id === project.interior_profile?.user?.id
    )) || (project.sub_professionals?.some((s: any) => s.user_id === user?.id && s.sub_role === 'interior' && s.status === 'active'));

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
        (project.bids_interior?.some((b: any) => b.status === 'accepted' && (b.bidder?.user?.id === user?.id || b.bidder?.user_id === user?.id))) ||
        (project.sub_professionals?.some((s: any) => s.user_id === user?.id && s.sub_role === 'interior' && s.status === 'active'))
    );

    const isPMAuthorized = 
        (phase.key === 'design' || phase.key === 'technical') ? !!project.design_authorized_at :
        phase.key === 'materials' ? !!project.materials_authorized_at :
        phase.key === 'build' ? !!project.construction_authorized_at : true;

    const isHiredSpecialistForActiveTab = 
        (engineeringSubTab === 'structural' && user?.role_type === 'structural' && isStructuralHired) ||
        (engineeringSubTab === 'mep' && user?.role_type === 'mep' && isMEPHired) ||
        (engineeringSubTab === 'interior' && user?.role_type === 'interior' && isInteriorHired);

    const isHiredProForActiveTab = React.useMemo(() => {
        if (!user) return false;
        if (phase.key === 'design' || phase.key === 'technical') {
            if (engineeringSubTab === 'architecture') return isHiredArchitect;
            if (engineeringSubTab === 'interior') return isHiredInterior;
        }
        if (phase.key === 'build') {
            if (constructionSubTab === 'general') return isHiredContractor;
        }
        return false;
    }, [phase.key, engineeringSubTab, constructionSubTab, user, isHiredArchitect, isHiredInterior, isHiredContractor]);

    if (!project) {
        return (
            <div className="py-20 text-center animate-pulse">
                <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Activity size={32} className="text-zinc-300" />
                </div>
                <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">Hydrating Phase Architecture...</p>
            </div>
        );
    }

    const isHiredPM = project.pm_id && user?.id === project.pm_id;

    const config = PHASE_ROLE_MAP[phase.key];
    const isOwner = user?.id === project?.user_id;
    const canManage = isOwner || isHiredPM || 
        (phase.key === 'build' && isHiredContractor) || 
        ((phase.key === 'design' || phase.key === 'technical') && isHiredArchitect);
    
    // Sub-phase adjusted variables
    const isBuildPhase = phase.key === 'build';
    const isDesignPhase = phase.key === 'design' || phase.key === 'technical';
    const roleKey = config.profileKey || (phase.key === 'management' ? 'project_manager' : '');

    const currentConfig = isDesignPhase
        ? (engineeringSubTab === 'architecture' ? PHASE_ROLE_MAP['design'] : 
           (engineeringSubTab === 'structural' ? PHASE_ROLE_MAP['technical'] : 
            (engineeringSubTab === 'mep' ? { bidKey: 'bids_mep', selectedKey: 'mep_id', profileKey: 'mep' } : 
             PHASE_ROLE_MAP['interior'])))
        : isBuildPhase && constructionSubTab !== 'general'
            ? { bidKey: '', selectedKey: '', profileKey: 'kontraktor' }
            : config;
    
    const currentRoleKey = isDesignPhase
        ? (engineeringSubTab === 'architecture' ? 'arsitek' : 
           (engineeringSubTab === 'structural' ? 'structural' : 
            (engineeringSubTab === 'mep' ? 'mep' : 'interior')))
        : isBuildPhase && constructionSubTab !== 'general'
            ? constructionSubTab
            : roleKey;

    const isReadOnlyView = React.useMemo(() => {
        if (isHiredPM) return false;
        if (phase.key === 'materials') {
            const isHiredProOnProject = isHiredArchitect || isHiredContractor || isHiredInterior || isStructuralHired || isMEPHired;
            return !(isOwner || isHiredProOnProject);
        }
        if (isOwner) {
            if (project.pm_id) {
                if (phase.key === 'management') return true;
                return true;
            }
            return false;
        }

        // Hired Contractor can manage build sub-phases
        if (phase.key === 'build' && isHiredContractor) {
            return false;
        }

        // Hired Architect can manage design/technical sub-phases
        if ((phase.key === 'design' || phase.key === 'technical') && isHiredArchitect) {
            return false;
        }

        const isProfessional = user?.role_type && user?.role_type !== 'user' && user?.role_type !== 'project_manager';
        if (isProfessional) {
            const isMatchingCurrentRole = (user?.role_type === currentRoleKey);
            return !isMatchingCurrentRole;
        }
        return false;
    }, [isOwner, isHiredPM, project.pm_id, phase.key, currentRoleKey, user?.role_type, isHiredArchitect, isHiredContractor, isHiredInterior, isStructuralHired, isMEPHired]);
    
    // Check if phase role is published to bidding board
    const isPublished = project.published_bidding_roles?.includes(roleKey) || 
        (project.bidding_choices?.[roleKey] === 'find') || 
        (roleKey === 'notaris' && project.bidding_choices?.[roleKey] === 'cert_only');
    
    // Check for external vendor for this phase
    const externalVendor = project.external_vendors?.find(v => v.phase_role === roleKey);
    
    const hasPro = (config.selectedKey && project?.[config.selectedKey]) || externalVendor;
    const isMaterialsPhase = phase.key === 'materials';
    const bids = config.bidKey ? (project?.[config.bidKey] || []) : [];
 
    // Check if current user is a professional matching this phase
    const isStructuralOrMEP = user?.role_type === 'structural' || user?.role_type === 'mep';
    const isMatchingPro = (user?.role_type === config.profileKey) || (isStructuralOrMEP && phase.key === 'technical');


    const currentBids = isDesignPhase
        ? (engineeringSubTab === 'architecture' ? project?.bids_arsitek : 
           (engineeringSubTab === 'structural' ? project?.bids_structural : 
            (engineeringSubTab === 'mep' ? project?.bids_mep : project?.bids_interior)))
        : isBuildPhase && constructionSubTab !== 'general'
            ? [] // Sub-contractors use sub_professionals, not bidding board
            : bids;

    const acceptedBid = React.useMemo(() => {
        if (!currentBids) return null;
        return currentBids.find((b: any) => 
            ['accepted', 'contract_pending', 'active', 'awaiting_payment'].includes(b.status)
        );
    }, [currentBids]);

    const userBid = React.useMemo(() => {
        if (!currentBids) return null;
        return currentBids.find((b: any) => 
            (b.user_id === user.id) || 
            (b.bidder?.user_id === user.id) || 
            (b.bidder?.user?.id === user.id) || // PM and others use nested user object
            (b.structural_engineer?.user_id === user.id) || 
            (b.structural_engineer?.user?.id === user.id) || 
            (b.mep_engineer?.user_id === user.id) ||
            (b.mep_engineer?.user?.id === user.id) ||
            // Match via profile IDs when relations aren't loaded
            (b.structural_id && user?.structural_engineer?.id === b.structural_id) ||
            (b.mep_id && user?.mep_engineer?.id === b.mep_id) ||
            (b.pm_id && user?.project_manager?.id === b.pm_id)
        );
    }, [currentBids, user.id, user?.structural_engineer?.id, user?.mep_engineer?.id, user?.project_manager?.id]);

    const hasAlreadyBid = project?.has_submitted_bid || !!userBid;

    const activeSubTab = isBuildPhase && constructionSubTab !== 'general' ? constructionSubTab : engineeringSubTab;

    const activeSubPro = React.useMemo(() => {
        if (!project?.sub_professionals || !activeSubTab) return null;
        return project.sub_professionals.find((s: any) => 
            s.sub_role === activeSubTab && s.status === 'active'
        );
    }, [project?.sub_professionals, activeSubTab]);

    const hasDirectResourcing = React.useMemo(() => {
        if (!project?.sub_professionals || !activeSubTab) return false;
        return project.sub_professionals.some((s: any) => 
            s.sub_role === activeSubTab && ['invited', 'accepted', 'interviewing', 'recommended', 'active'].includes(s.status)
        );
    }, [project?.sub_professionals, activeSubTab]);

    const isInvitedSpecialistForTab = React.useMemo(() => {
        if (!project?.sub_professionals || !activeSubTab || !user) return false;
        return project.sub_professionals.some((s: any) => 
            s.sub_role === activeSubTab && s.user_id === user.id && s.status === 'invited'
        );
    }, [project?.sub_professionals, activeSubTab, user]);

    const currentHasPro = isDesignPhase
        ? (engineeringSubTab === 'architecture' ? !!project.selected_arsitek_id : 
           (engineeringSubTab === 'structural' ? (!!project.structural_id || !!acceptedBid || !!activeSubPro) : 
            (engineeringSubTab === 'mep' ? (!!project.mep_id || !!acceptedBid || !!activeSubPro) : 
             (!!project.selected_interior_id || !!acceptedBid || !!activeSubPro))))
        : isBuildPhase && constructionSubTab !== 'general'
            ? !!activeSubPro
            : (hasPro || !!acceptedBid || !!activeSubPro);

    const currentIsMatchingPro = (user?.role_type === currentRoleKey);

    // A specialist who has already submitted a bid must ALWAYS see their bid card,
    // regardless of whether the role is "published" in published_bidding_roles.
    const isSpecialistWithBid = currentIsMatchingPro && !!userBid && !currentHasPro;

    // PM Phase Lock Logic for New Builds
    const isNewBuildLocked = 
        project?.project_category === 'new_build' && 
        !project?.pm_id && 
        ['design', 'build', 'interior'].includes(phase.key);

    const activePhaseContext = React.useMemo(() => {
        if (phase.key === 'design' || phase.key === 'technical') {
            if (engineeringSubTab === 'architecture') return 'design';
            if (engineeringSubTab === 'structural') return 'structural';
            if (engineeringSubTab === 'mep') return 'mep';
            if (engineeringSubTab === 'interior') return 'interior';
        }
        if (isBuildPhase && constructionSubTab !== 'general') {
            return `build_${constructionSubTab}`;
        }
        return phase.key;
    }, [phase.key, engineeringSubTab, isBuildPhase, constructionSubTab]);

    // Calculate dynamic notification counts for specialists tagged on briefing requirements
    const badgeCounts = React.useMemo(() => {
        const counts = {
            architecture: 0,
            structural: 0,
            mep: 0,
            interior: 0
        };

        const requirements = project.design_details?.requirements || [];

        requirements.forEach((req: any) => {
            if (!req.tagged_role) return;

            const isTaggedRole = req.tagged_role;
            if (['structural', 'mep', 'interior'].includes(isTaggedRole)) {
                // Count a notification if the specialist role is tagged and the user has not written feedback yet
                const hasReplied = req.feedback?.some((f: any) => 
                    f.author_role === isTaggedRole || f.author_id === user?.id
                );

                if (!hasReplied) {
                    if (isTaggedRole === 'structural') counts.structural += 1;
                    if (isTaggedRole === 'mep') counts.mep += 1;
                    if (isTaggedRole === 'interior') counts.interior += 1;
                }
            }
        });

        return counts;
    }, [project.design_details?.requirements, user?.id]);

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={phase.key}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-6"
            >
                {/* PM Notes Floating/Header Trigger for non-navigated phases */}
                {!isDesignPhase && !isBuildPhase && phase.key !== 'legal' && phase.key !== 'management' && (
                    <div className="flex justify-end w-full mb-6">
                        <StickyNotesLayer 
                            project={project} 
                            currentUser={user} 
                            phaseContext={activePhaseContext} 
                            renderTrigger={(toggle, isOpen) => (
                                <button 
                                    onClick={toggle}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm border ${
                                        isOpen 
                                            ? 'bg-amber-300 border-amber-400 text-amber-950 scale-95 shadow-inner' 
                                            : 'bg-amber-200 border-amber-300 text-amber-900 hover:bg-amber-300 hover:scale-105'
                                    }`}
                                    title="PM Notes"
                                >
                                    <FileText size={14} className={isOpen ? 'animate-bounce' : ''} />
                                    PM Notes
                                </button>
                            )}
                        />
                    </div>
                )}

                {/* Sub-Phase and Main Content responsive sidebar layout */}
                {(() => {
                    const hasSubTabs = phase.key === 'design' || phase.key === 'technical' || isBuildPhase;

                    return (
                        <div className={`flex flex-col lg:flex-row gap-6 ${hasSubTabs ? 'items-start' : ''}`}>
                            {/* Sub-Phase Navigator (Left Sidebar on Desktop, Top Scrollbar on Mobile) */}
                            {hasSubTabs && (
                                <div className="w-full lg:w-48 lg:shrink-0 flex flex-col gap-3">
                                    <div className="flex flex-row lg:flex-col items-stretch gap-1.5 p-1.5 bg-slate-50 border border-slate-150/50 rounded-2xl lg:rounded-[1.5rem] overflow-x-auto lg:overflow-x-visible w-full">
                                        {(phase.key === 'design' || phase.key === 'technical') && (
                                            <>
                                                <button 
                                                    onClick={() => setEngineeringSubTab('architecture')}
                                                    className={`relative flex items-center justify-start gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all w-full text-left shrink-0 whitespace-nowrap ${
                                                        engineeringSubTab === 'architecture' 
                                                            ? 'bg-white text-slate-900 shadow-sm' 
                                                            : (user?.role_type === 'arsitek'
                                                                ? 'bg-slate-50/60 border border-slate-200/50 text-slate-600 hover:bg-slate-50'
                                                                : 'text-gray-400 hover:text-gray-600')
                                                    }`}
                                                >
                                                    <Pencil size={14} className="shrink-0" />
                                                    <span className="truncate">Architecture</span>
                                                    {isHiredArchitect && (
                                                        <span className="ml-auto px-1.5 py-0.5 rounded-md bg-slate-500 text-white font-black text-[7px] tracking-normal leading-none animate-pulse shrink-0">
                                                            YOU
                                                        </span>
                                                    )}
                                                </button>
                                                <button 
                                                    onClick={() => setEngineeringSubTab('structural')}
                                                    className={`relative flex items-center justify-start gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all w-full text-left shrink-0 whitespace-nowrap ${
                                                        engineeringSubTab === 'structural' 
                                                            ? 'bg-white text-slate-600 shadow-sm' 
                                                            : (user?.role_type === 'structural'
                                                                ? 'bg-slate-50/60 border border-slate-200/50 text-slate-600 hover:bg-slate-50'
                                                                : 'text-gray-400 hover:text-gray-600')
                                                    }`}
                                                >
                                                    <HardHat size={14} className="shrink-0" />
                                                    <span className="truncate">Structural</span>
                                                    {isStructuralHired && (
                                                        <span className="ml-auto px-1.5 py-0.5 rounded-md bg-slate-500 text-white font-black text-[7px] tracking-normal leading-none animate-pulse shrink-0">
                                                            YOU
                                                        </span>
                                                    )}
                                                    {user?.role_type === 'structural' && badgeCounts.structural > 0 && (
                                                        <span className="absolute -top-1.5 -right-1.5 bg-slate-500 text-white font-black text-[8px] h-4 w-4 rounded-full flex items-center justify-center border border-white shadow-lg animate-pulse shrink-0">
                                                            {badgeCounts.structural}
                                                        </span>
                                                    )}
                                                </button>
                                                <button 
                                                    onClick={() => setEngineeringSubTab('mep')}
                                                    className={`relative flex items-center justify-start gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all w-full text-left shrink-0 whitespace-nowrap ${
                                                        engineeringSubTab === 'mep' 
                                                            ? 'bg-white text-amber-600 shadow-sm' 
                                                            : (user?.role_type === 'mep'
                                                                ? 'bg-slate-50/60 border border-slate-200/50 text-slate-600 hover:bg-slate-50'
                                                                : 'text-gray-400 hover:text-gray-600')
                                                    }`}
                                                >
                                                    <Wrench size={14} className="shrink-0" />
                                                    <span className="truncate">MEP</span>
                                                    {isMEPHired && (
                                                        <span className="ml-auto px-1.5 py-0.5 rounded-md bg-slate-500 text-white font-black text-[7px] tracking-normal leading-none animate-pulse shrink-0">
                                                            YOU
                                                        </span>
                                                    )}
                                                    {user?.role_type === 'mep' && badgeCounts.mep > 0 && (
                                                        <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white font-black text-[8px] h-4 w-4 rounded-full flex items-center justify-center border border-white shadow-lg animate-pulse shrink-0">
                                                            {badgeCounts.mep}
                                                        </span>
                                                    )}
                                                </button>
                                                <button 
                                                    onClick={() => setEngineeringSubTab('interior')}
                                                    className={`relative flex items-center justify-start gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all w-full text-left shrink-0 whitespace-nowrap ${
                                                        engineeringSubTab === 'interior' 
                                                            ? 'bg-white text-rose-600 shadow-sm' 
                                                            : (user?.role_type === 'interior'
                                                                ? 'bg-slate-50/60 border border-slate-200/50 text-slate-600 hover:bg-slate-50'
                                                                : 'text-gray-400 hover:text-gray-600')
                                                    }`}
                                                >
                                                    <Sofa size={14} className="shrink-0" />
                                                    <span className="truncate">Interior</span>
                                                    {isHiredInterior && (
                                                        <span className="ml-auto px-1.5 py-0.5 rounded-md bg-slate-500 text-white font-black text-[7px] tracking-normal leading-none animate-pulse shrink-0">
                                                            YOU
                                                        </span>
                                                    )}
                                                    {user?.role_type === 'interior' && badgeCounts.interior > 0 && (
                                                        <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white font-black text-[8px] h-4 w-4 rounded-full flex items-center justify-center border border-white shadow-lg animate-pulse shrink-0">
                                                            {badgeCounts.interior}
                                                        </span>
                                                    )}
                                                </button>
                                            </>
                                        )}

                                        {isBuildPhase && (
                                            <>
                                                {CONSTRUCTION_SUB_ROLES.map((role) => {
                                                    const Icon = role.icon;
                                                    const isActive = constructionSubTab === role.key;
                                                    const isUserWorkspace = (role.key === 'general' && isHiredContractor) || 
                                                        (project.sub_professionals?.some((s: any) => s.user_id === user?.id && s.sub_role === role.key && s.status === 'active'));
                                                    
                                                    return (
                                                        <button 
                                                            key={role.key}
                                                            onClick={() => setConstructionSubTab(role.key)}
                                                            className={`flex items-center justify-start gap-1.5 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all w-full text-left shrink-0 whitespace-nowrap ${
                                                                isActive 
                                                                    ? role.activeClass 
                                                                    : (isUserWorkspace 
                                                                        ? 'bg-slate-50/60 border border-slate-200/50 text-slate-600 hover:bg-slate-50' 
                                                                        : 'text-gray-400 hover:text-gray-600')
                                                            }`}
                                                        >
                                                            <Icon size={14} className="shrink-0" />
                                                            <span className="truncate">{role.label.split(' ')[0]}</span>
                                                            {isUserWorkspace && (
                                                                <span className="ml-auto px-1.5 py-0.5 rounded-md bg-slate-500 text-white font-black text-[7px] tracking-normal leading-none animate-pulse shrink-0">
                                                                    YOU
                                                                </span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </>
                                        )}
                                    </div>
                                    
                                    <div className="w-full flex flex-col gap-2">
                                        <StickyNotesLayer 
                                            project={project} 
                                            currentUser={user} 
                                            phaseContext={activePhaseContext} 
                                            renderTrigger={(toggle, isOpen) => (
                                                <button 
                                                    onClick={toggle}
                                                    className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm border w-full ${
                                                        isOpen 
                                                            ? 'bg-amber-300 border-amber-400 text-amber-950 scale-95 shadow-inner' 
                                                            : 'bg-amber-200 border-amber-300 text-amber-900 hover:bg-amber-300 hover:scale-102'
                                                    }`}
                                                    title="PM Notes"
                                                >
                                                    <FileText size={14} className={isOpen ? 'animate-bounce' : ''} />
                                                    PM Notes
                                                </button>
                                            )}
                                        />
                                        {isHiredProForActiveTab && (
                                            <button 
                                                onClick={() => setIsResignModalOpen(true)}
                                                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100/30 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all w-full cursor-pointer mb-1"
                                            >
                                                <LogOut size={14} />
                                                Resign Proyek
                                            </button>
                                        )}
                                        {phase.key === 'design' && engineeringSubTab === 'architecture' && isHiredArchitect && (() => {
                                            const hasStructuralHired = !!project.structural_id;
                                            const hasMepHired = !!project.mep_id;
                                            const hasInteriorHired = !!project.selected_interior_id;

                                            const hasStructuralDocs = (project.documents || []).some((d: any) => d.category === 'structural_calc');
                                            const hasMepDocs = (project.documents || []).some((d: any) => d.category === 'mep_layout');
                                            const hasInteriorDocs = (project.documents || []).some((d: any) => d.category === 'interior_design');

                                            const isStructuralPending = hasStructuralHired && !hasStructuralDocs;
                                            const isMepPending = hasMepHired && !hasMepDocs;
                                            const isInteriorPending = hasInteriorHired && !hasInteriorDocs;
                                            const isStructuralNotHired = project.requires_structural && !project.structural_id;
                                            const isAnySubPending = isStructuralPending || isMepPending || isInteriorPending || isStructuralNotHired;

                                            return project.design_handover_submitted_at ? (
                                                <div className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-amber-50 border border-amber-250 text-amber-800 text-[10px] font-black uppercase tracking-widest rounded-xl w-full text-center">
                                                    <Clock size={14} className="text-amber-500 shrink-0" />
                                                    Awaiting PM Review
                                                </div>
                                            ) : project.design_completed_at ? (
                                                <div className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-50 border border-emerald-250 text-emerald-800 text-[10px] font-black uppercase tracking-widest rounded-xl w-full text-center">
                                                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                                                    Approved by PM
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-2 w-full">
                                                    <button 
                                                        onClick={() => setShowSealDesignConfirm(true)}
                                                        disabled={isSealingDesign || isAnySubPending}
                                                        className={`flex items-center justify-center gap-2 px-4 py-2.5 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all w-full shadow-sm ${
                                                            isAnySubPending 
                                                                ? 'bg-slate-300 cursor-not-allowed opacity-60' 
                                                                : 'bg-zinc-900 hover:bg-zinc-800 cursor-pointer shadow-slate-100'
                                                        }`}
                                                    >
                                                        <ShieldCheck size={14} />
                                                        Request PM Approval
                                                    </button>
                                                    {isAnySubPending && (
                                                        <div className="p-3 bg-rose-50 border border-rose-150 text-rose-800 rounded-xl text-[9px] font-bold uppercase tracking-wider leading-relaxed border-dashed">
                                                            <p className="font-black mb-1">Awaiting Sub Deliverables:</p>
                                                            <ul className="list-disc pl-3.5 space-y-0.5 font-semibold">
                                                                {isStructuralNotHired && <li>Structural Engineer not hired</li>}
                                                                {isStructuralPending && <li>Structural calculations not uploaded</li>}
                                                                {isMepPending && <li>MEP layout not uploaded</li>}
                                                                {isInteriorPending && <li>Interior design not uploaded</li>}
                                                            </ul>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        {phase.key === 'build' && constructionSubTab === 'general' && isHiredContractor && (() => {
                                            return project.construction_handover_submitted_at ? (
                                                <div className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-amber-50 border border-amber-250 text-amber-800 text-[10px] font-black uppercase tracking-widest rounded-xl w-full text-center">
                                                    <Clock size={14} className="text-amber-500 shrink-0" />
                                                    Awaiting PM Review
                                                </div>
                                            ) : project.construction_completed_at ? (
                                                <div className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-50 border border-emerald-250 text-emerald-800 text-[10px] font-black uppercase tracking-widest rounded-xl w-full text-center">
                                                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                                                    Approved by PM
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-2 w-full">
                                                    <button 
                                                        onClick={() => setShowSealConstructionConfirm(true)}
                                                        disabled={isSealingConstruction}
                                                        className="flex items-center justify-center gap-2 px-4 py-2.5 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all w-full shadow-sm bg-zinc-900 hover:bg-zinc-800 cursor-pointer shadow-slate-100 disabled:opacity-50"
                                                    >
                                                        <ShieldCheck size={14} />
                                                        {project.construction_handover_notes ? 'Resubmit Handover' : 'Request PM Approval'}
                                                    </button>
                                                    {project.construction_handover_notes && (
                                                        <div className="p-3 bg-red-50 border border-red-150 text-red-800 rounded-xl text-[9px] font-bold uppercase tracking-wider leading-relaxed border-dashed text-left">
                                                            <p className="font-black mb-1 text-red-900">Revision Required:</p>
                                                            <p className="font-semibold text-red-700 normal-case">{project.construction_handover_notes}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            )}

                            {/* Main Content Pane */}
                            <div className="flex-1 w-full min-w-0">
                                {/* Redirect for Technical Phase - Only show on Architecture subtab or if already hired */}
                                {phase.key === 'technical' && (engineeringSubTab === 'architecture' || currentHasPro) && (
                                    <div className="bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] p-12 text-center space-y-6 mb-8">
                                        <div className="w-20 h-20 bg-white text-slate-900 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-slate-200/50">
                                            <HardHat size={40} />
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">Engineering Workspace</h4>
                                            <p className="text-sm text-slate-500 font-medium max-w-md mx-auto leading-relaxed">
                                                Detailed coordination and technical document management for Structural and MEP engineers is centralized in the <span className="font-black text-slate-900 underline underline-offset-4">Engineering</span> tab.
                                            </p>
                                        </div>
                                        <div className="pt-4">
                                            <button 
                                                onClick={() => onSwitchTab?.('engineering')}
                                                className="px-8 py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-2xl shadow-slate-900/20 flex items-center gap-2 mx-auto group"
                                            >
                                                Open Engineering Hub
                                                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                                            </button>
                                        </div>
                                    </div>
                                )}


                                {isReadOnlyView ? (
                                    <PhaseReadOnlySummary
                                        phase={phase}
                                        project={project}
                                        currentRoleKey={currentRoleKey}
                                        currentHasPro={currentHasPro}
                                        isPublished={isPublished}
                                        currentBids={currentBids}
                                        onOpenChat={onOpenChat}
                                        onRefresh={onRefresh}
                                        user={user}
                                    />
                                ) : phase.key === 'handover' ? (
                                    <FinalHandover project={project} user={user} onRefresh={onRefresh} />
                                ) : (
                                    <>
                                        {/* Phase Gate for Owner/PM: If not published, no pro, no external vendor */}
                                        {!currentHasPro && !isMaterialsPhase && canManage && !isPublished && currentRoleKey && (
                                            <div className="mb-8">
                                                {isNewBuildLocked ? (
                                                    <div className="bg-slate-50 border-2 border-slate-200 border-dashed rounded-[2rem] p-8 text-center space-y-4">
                                                        <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                                                            <Lock size={32} />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight">Phase Locked</h4>
                                                            <p className="text-sm text-slate-500 font-medium max-w-md mx-auto">
                                                                Awaiting Project Manager. For New Builds, you must hire a PM first so they can guide your hiring process.
                                                            </p>
                                                        </div>
                                                        {isOwner && (
                                                            <div className="pt-4">
                                                                <button 
                                                                    onClick={() => {
                                                                        const pmTab = document.querySelector<HTMLButtonElement>('button[data-phase-key="management"]');
                                                                        if (pmTab) pmTab.click();
                                                                        else window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Please go to the Management phase to hire a PM.', type: 'info' } }));
                                                                    }}
                                                                    className="px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg"
                                                                >
                                                                    Hire Project Manager
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <PhaseInitiationPanel 
                                                        projectId={project.id} 
                                                        phaseKey={engineeringSubTab === 'interior' ? 'interior' : phase.key} 
                                                        phaseLabel={engineeringSubTab === 'interior' ? 'Interior' : phase.label} 
                                                        onRefresh={onRefresh} 
                                                        project={project}
                                                    />
                                                )}
                                            </div>
                                        )}

                                        {/* Main content: show if published, has pro, is materials phase, no role key, or specialist already has a bid */}
                                        {(currentHasPro || isMaterialsPhase || isPublished || !currentRoleKey || isSpecialistWithBid) && (
                                            <>
                                                {/* Architecture & Built Phase Pro Workspace */}
                                                {(currentHasPro || isMaterialsPhase || (phase.key === 'interior' && isHiredContractor)) && (engineeringSubTab === 'architecture') && (!isBuildPhase || constructionSubTab === 'general') && !(phase.key === 'management' && user?.id === project.pm_id) && (
                                                    <ErrorBoundary name="PhaseAssignedPro">
                                                        <PhaseAssignedPro 
                                                            hideResignButton={hasSubTabs}
                                                            project={project} 
                                                            phaseKey={engineeringSubTab === 'interior' ? 'interior' : phase.key} 
                                                            activeSubRole={(phase.key === 'design' || phase.key === 'technical') ? engineeringSubTab : undefined}
                                                            user={user}
                                                            config={currentConfig} 
                                                            isContractor={isHiredContractor}
                                                            onRefresh={onRefresh}
                                                            onPhaseComplete={onPhaseComplete}
                                                            onOpenChat={onOpenChat} 
                                                            onViewProfile={onViewProfile} 
                                                            onGoToPayments={() => onSwitchTab?.('payments')}
                                                            onGoToInterviews={() => onSwitchTab?.('interviews')}
                                                            onShortlist={onShortlist}
                                                            onRecommend={onRecommend}
                                                        />
                                                    </ErrorBoundary>
                                                )}

                                                {/* Technical Resourcing (Structural / MEP / Interior) directly managed from Design Phase Tabs */}
                                                {(phase.key === 'design' || phase.key === 'technical') && (engineeringSubTab === 'structural' || engineeringSubTab === 'mep' || engineeringSubTab === 'interior') && (
                                                    <ErrorBoundary name="TechnicalResourcing">
                                                        {!isPMAuthorized && isHiredSpecialistForActiveTab ? (
                                                            <div className="p-12 text-center bg-slate-50 border-2 border-slate-100 rounded-[2rem] space-y-6 relative overflow-hidden group">
                                                                <div className="absolute top-0 right-0 w-32 h-32 bg-slate-200/50 rounded-full blur-[80px] opacity-40 -translate-y-1/2 translate-x-1/2" />
                                                                <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-slate-100/50 border border-slate-100 transition-transform duration-500 group-hover:scale-110">
                                                                    <Lock size={36} className="text-red-500 animate-pulse" />
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">Awaiting Phase Authorization</h3>
                                                                    <p className="text-sm text-slate-500 font-bold max-w-lg mx-auto leading-relaxed">
                                                                        The Project Manager has not yet authorized the start of this phase. The active workspace will unlock once the PM grants authorization.
                                                                    </p>
                                                                </div>
                                                                <div className="pt-4 flex justify-center">
                                                                    <div className="px-6 py-3 bg-red-50 border border-red-100 rounded-xl text-red-800 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                                                        <Lock size={12} /> Pending Project Manager Signal
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : engineeringSubTab === 'structural' && user?.role_type === 'structural' && isStructuralHired ? (
                                                            <StructuralWorkspace project={project} user={user} onRefresh={onRefresh} />
                                                        ) : engineeringSubTab === 'mep' && user?.role_type === 'mep' && isMEPHired ? (
                                                            <MepWorkspace project={project} user={user} onRefresh={onRefresh} currentPhase={phase.key} />
                                                        ) : engineeringSubTab === 'interior' && user?.role_type === 'interior' && isInteriorHired ? (
                                                            <InteriorWorkspace project={project} user={user} onRefresh={onRefresh} />
                                                        ) : isInvitedSpecialistForTab ? (
                                                            <div className="bg-amber-50 border border-amber-200 rounded-[2rem] p-10 text-center space-y-4">
                                                                <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                                                                    <Sofa size={32} />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <h4 className="text-lg font-black text-amber-900 uppercase tracking-tight">Specialist Invitation Pending</h4>
                                                                    <p className="text-sm text-amber-700 font-medium max-w-md mx-auto leading-relaxed">
                                                                        You have been directly invited to this project as the Interior Designer. Please review and **Accept the Invitation** via the banner at the top of the page to activate your design workspace and begin collaboration.
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <TechnicalResourcing 
                                                                project={project} 
                                                                user={user} 
                                                                isArchitect={isHiredArchitect} 
                                                                onRefresh={onRefresh} 
                                                                onShortlist={onShortlist}
                                                                onRecommend={onRecommend}
                                                                activeTab={engineeringSubTab as 'structural' | 'mep' | 'interior'}
                                                            />
                                                        )}
                                                    </ErrorBoundary>
                                                )}


                                                {/* Construction Sub-Contractor Resourcing (Build Phase Sub-Tabs) */}
                                                {isBuildPhase && constructionSubTab !== 'general' && (
                                                    <ErrorBoundary name="ConstructionResourcing">
                                                        <ConstructionResourcing
                                                            project={project}
                                                            user={user}
                                                            activeSubRole={constructionSubTab}
                                                            onRefresh={onRefresh}
                                                            isContractor={isHiredContractor}
                                                        />
                                                    </ErrorBoundary>
                                                )}

                                                {!currentHasPro && canManage && currentBids?.length > 0 && (!project.pm_id || isHiredPM || phase.key === 'management' || engineeringSubTab !== 'architecture') && (
                                                    <div className="bg-slate-50 border border-slate-150 rounded-[2rem] p-10 text-center space-y-5">
                                                        <div className="w-14 h-14 bg-white text-slate-900 border border-slate-150/40 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                                                            <UserCheck size={24} />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Review Candidates in Tendering Hub</h4>
                                                            <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest animate-pulse">
                                                                {currentBids.length} Pending Proposal{currentBids.length > 1 ? 's' : ''} Received
                                                            </p>
                                                            <p className="text-xs text-slate-500 font-medium max-w-sm mx-auto leading-relaxed">
                                                                Review details, compare proposals, discuss terms in chat, and hire professionals directly from the centralized Tendering Hub.
                                                            </p>
                                                        </div>
                                                        <div className="pt-2">
                                                            <button 
                                                                type="button"
                                                                onClick={() => {
                                                                    if (isOwner || isHiredPM) {
                                                                        onSwitchTab?.('proposals', 'pending');
                                                                    } else {
                                                                        onSwitchTab?.('interviews');
                                                                    }
                                                                }}
                                                                className="px-6 py-3 bg-slate-900 hover:bg-black text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md hover:scale-105 active:scale-95"
                                                            >
                                                                Go to Tendering Hub
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                {!currentHasPro && isOwner && currentBids?.length > 0 && project.pm_id && !isHiredPM && (
                                                    <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-8 text-center text-gray-400">
                                                        <p className="font-bold text-sm">Proposals are being managed by your Project Manager.</p>
                                                        <p className="text-[10px] uppercase tracking-widest mt-1">Visit the Overview tab to see global progress</p>
                                                    </div>
                                                )}
                                                {isHiredPM && phase.key === 'management' && (
                                                    <ErrorBoundary name="PMWorkspace">
                                                        <PMWorkspace project={project} user={user} onRefresh={onRefresh} phaseKey={phase.key} onNavigateToPhase={onPhaseComplete} />
                                                    </ErrorBoundary>
                                                )}
                                                {!isMaterialsPhase && !isBuildPhase && !currentHasPro && (!currentBids || currentBids.length === 0) && !hasDirectResourcing && (
                                                    <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-8 text-center text-gray-400">
                                                        <p className="font-black text-sm uppercase tracking-widest">Waiting for Proposals</p>
                                                        <p className="text-[10px] mt-1">
                                                            This project is visible to {
                                                                engineeringSubTab === 'architecture' ? 'Architectural' : 
                                                                (engineeringSubTab === 'structural' ? 'Structural' : 
                                                                 (engineeringSubTab === 'mep' ? 'MEP' : 'Interior'))
                                                            } professionals.
                                                        </p>
                                                    </div>
                                                )}

                                                {!currentHasPro && currentIsMatchingPro && !hasAlreadyBid && !hasDirectResourcing && (
                                                    <div className="mt-8">
                                                        <ProjectBidForm 
                                                            project={project} 
                                                            user={user} 
                                                            onSuccess={onRefresh} 
                                                        />
                                                    </div>
                                                )}

                                                {!currentHasPro && currentIsMatchingPro && hasAlreadyBid && (
                                                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-8 text-center mt-8">
                                                        <p className="text-emerald-700 font-black text-sm uppercase tracking-widest">You have submitted a proposal for this role.</p>
                                                        <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest mt-1">Status: Under Review by PM/Owner</p>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })()}
                
                <ConfirmModal 
                    isOpen={isResignModalOpen}
                    onClose={() => setIsResignModalOpen(false)}
                    onConfirm={handleResign}
                    type="resign"
                />

                <ConfirmModal 
                    isOpen={showSealDesignConfirm}
                    title="Request PM Approval?"
                    description="Submit your finalized design package to the Project Manager for technical audit? This will freeze design modifications."
                    confirmText="Request Approval"
                    cancelText="Cancel"
                    variant="success"
                    onConfirm={handleSealDesign}
                    onCancel={() => setShowSealDesignConfirm(false)}
                    isLoading={isSealingDesign}
                />

                <ConfirmModal 
                    isOpen={showSealConstructionConfirm}
                    title="Request PM Approval?"
                    description="Submit your finalized construction work to the Project Manager for technical audit? This will freeze construction modifications."
                    confirmText="Request Approval"
                    cancelText="Cancel"
                    variant="success"
                    onConfirm={handleSealConstruction}
                    onCancel={() => setShowSealConstructionConfirm(false)}
                    isLoading={isSealingConstruction}
                />
            </motion.div>
        </AnimatePresence>
    );
}
