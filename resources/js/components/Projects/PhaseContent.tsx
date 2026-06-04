import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Lock, FileText } from 'lucide-react';
import { CONSTRUCTION_SUB_ROLES, ConstructionSubRoleKey } from '../../constants/ConstructionSubRolePresets';
import { ErrorBoundary } from '../Common/ErrorBoundary';
import { Phase, PhaseKey, PHASE_ROLE_MAP, getCategoryPhaseLabel } from '../../types/phase.types';
import PhaseAssignedPro from './Phases/PhaseAssignedPro';
import PhaseBidsList from './Phases/PhaseBidsList';
import { ProjectBidForm } from './Details/ProjectBidForm';
import StructuralWorkspace from './Phases/StructuralWorkspace';
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
    const canManage = isOwner || isHiredPM;
    
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
        if (isOwner) {
            if (project.pm_id) {
                if (phase.key === 'management') return true;
                return true;
            }
            return false;
        }
        const isProfessional = user?.role_type && user?.role_type !== 'user' && user?.role_type !== 'project_manager';
        if (isProfessional) {
            const isMatchingCurrentRole = (user?.role_type === currentRoleKey);
            return !isMatchingCurrentRole;
        }
        return false;
    }, [isOwner, isHiredPM, project.pm_id, phase.key, currentRoleKey, user?.role_type]);
    
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
                {phase.key !== 'legal' && !(phase.key === 'management' && user?.id === project.pm_id) && (
                    <div className="flex items-center justify-between pb-6 border-b border-slate-100">
                        <div>
                            <h3 className="text-xl font-black text-gray-900">
                                {phase.key === 'design' ? 'Architecture & Design' : 
                                 phase.key === 'technical' ? 'Engineering Procurement' : 
                                 phase.title}
                            </h3>
                            {phase.key !== 'legal' && (
                                <p className="text-sm text-gray-400 mt-0.5">
                                    {phase.key === 'design' ? 'Floor plans, elevations, and 3D renders.' : 
                                     phase.key === 'technical' ? 'Structural and MEP specialist management.' : 
                                     phase.description}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-4">
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
                            {phase.key !== 'legal' && (
                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                    phase.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                    phase.status === 'active' ? 'bg-red-50 text-[#FF2D20]' :
                                    'bg-gray-100 text-gray-400'
                                }`}>
                                    {phase.status}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Sub-Phase Navigator (The Bracket) */}
                {(phase.key === 'design' || phase.key === 'technical') && (
                    <div className="flex items-center gap-2 p-1 bg-slate-50 rounded-2xl w-fit">
                        <button 
                            onClick={() => setEngineeringSubTab('architecture')}
                            className={`relative flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                engineeringSubTab === 'architecture' 
                                    ? 'bg-white text-slate-900 shadow-sm' 
                                    : (user?.role_type === 'arsitek'
                                        ? 'bg-indigo-50/60 border border-indigo-200/50 text-indigo-600 hover:bg-indigo-50'
                                        : 'text-gray-400 hover:text-gray-600')
                            }`}
                        >
                            <Pencil size={14} />
                            Architecture
                            {isHiredArchitect && (
                                <span className="ml-1 px-1.5 py-0.5 rounded-md bg-indigo-500 text-white font-black text-[7px] tracking-normal leading-none animate-pulse">
                                    YOU
                                </span>
                            )}
                        </button>
                        <button 
                            onClick={() => setEngineeringSubTab('structural')}
                            className={`relative flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                engineeringSubTab === 'structural' 
                                    ? 'bg-white text-indigo-600 shadow-sm' 
                                    : (user?.role_type === 'structural'
                                        ? 'bg-indigo-50/60 border border-indigo-200/50 text-indigo-600 hover:bg-indigo-50'
                                        : 'text-gray-400 hover:text-gray-600')
                            }`}
                        >
                            <HardHat size={14} />
                            Structural
                            {isStructuralHired && (
                                <span className="ml-1 px-1.5 py-0.5 rounded-md bg-indigo-500 text-white font-black text-[7px] tracking-normal leading-none animate-pulse">
                                    YOU
                                </span>
                            )}
                            {user?.role_type === 'structural' && badgeCounts.structural > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 bg-indigo-500 text-white font-black text-[8px] h-4 w-4 rounded-full flex items-center justify-center border border-white shadow-lg animate-pulse">
                                    {badgeCounts.structural}
                                </span>
                            )}
                        </button>
                        <button 
                            onClick={() => setEngineeringSubTab('mep')}
                            className={`relative flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                engineeringSubTab === 'mep' 
                                    ? 'bg-white text-amber-600 shadow-sm' 
                                    : (user?.role_type === 'mep'
                                        ? 'bg-indigo-50/60 border border-indigo-200/50 text-indigo-600 hover:bg-indigo-50'
                                        : 'text-gray-400 hover:text-gray-600')
                            }`}
                        >
                            <Wrench size={14} />
                            MEP
                            {isMEPHired && (
                                <span className="ml-1 px-1.5 py-0.5 rounded-md bg-indigo-500 text-white font-black text-[7px] tracking-normal leading-none animate-pulse">
                                    YOU
                                </span>
                            )}
                            {user?.role_type === 'mep' && badgeCounts.mep > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white font-black text-[8px] h-4 w-4 rounded-full flex items-center justify-center border border-white shadow-lg animate-pulse">
                                    {badgeCounts.mep}
                                </span>
                            )}
                        </button>
                        <button 
                            onClick={() => setEngineeringSubTab('interior')}
                            className={`relative flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                engineeringSubTab === 'interior' 
                                    ? 'bg-white text-rose-600 shadow-sm' 
                                    : (user?.role_type === 'interior'
                                        ? 'bg-indigo-50/60 border border-indigo-200/50 text-indigo-600 hover:bg-indigo-50'
                                        : 'text-gray-400 hover:text-gray-600')
                            }`}
                        >
                            <Sofa size={14} />
                            Interior
                            {isHiredInterior && (
                                <span className="ml-1 px-1.5 py-0.5 rounded-md bg-indigo-500 text-white font-black text-[7px] tracking-normal leading-none animate-pulse">
                                    YOU
                                </span>
                            )}
                            {user?.role_type === 'interior' && badgeCounts.interior > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white font-black text-[8px] h-4 w-4 rounded-full flex items-center justify-center border border-white shadow-lg animate-pulse">
                                    {badgeCounts.interior}
                                </span>
                            )}
                        </button>
                    </div>
                )}

                {/* Construction Sub-Phase Navigator (Build Phase) */}
                {isBuildPhase && (
                    <div className="flex items-center gap-1.5 p-1 bg-slate-50 rounded-2xl w-fit flex-wrap">
                        {CONSTRUCTION_SUB_ROLES.map((role) => {
                            const Icon = role.icon;
                            const isActive = constructionSubTab === role.key;
                            const isUserWorkspace = (role.key === 'general' && isHiredContractor) || 
                                (project.sub_professionals?.some((s: any) => s.user_id === user?.id && s.sub_role === role.key && s.status === 'active'));
                            
                            return (
                                <button 
                                    key={role.key}
                                    onClick={() => setConstructionSubTab(role.key)}
                                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                        isActive 
                                            ? role.activeClass 
                                            : (isUserWorkspace 
                                                ? 'bg-indigo-50/60 border border-indigo-200/50 text-indigo-600 hover:bg-indigo-50' 
                                                : 'text-gray-400 hover:text-gray-600')
                                    }`}
                                >
                                    <Icon size={14} />
                                    {role.label.split(' ')[0]}
                                    {isUserWorkspace && (
                                        <span className="ml-1 px-1.5 py-0.5 rounded-md bg-indigo-500 text-white font-black text-[7px] tracking-normal leading-none animate-pulse">
                                            YOU
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

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


                {/* Regulatory Gate: PBG Permit — only for new_build and structural renovation */}
                {phase.key === 'build' && ['new_build', 'renovation'].includes(project?.project_category) && (() => {
                    const isPBGApproved = project?.milestones?.some((m: any) => 
                        (m.content?.req_id === 'pbg_permit' || 
                         m.title.toUpperCase().includes('PBG') || 
                         m.title.toUpperCase().includes('IMB')) && 
                        m.approval_status === 'approved'
                    ) || !!project?.pbg_verified_at;
                    const hasSelectedContractor = project?.selected_kontraktor_id || project?.external_vendors?.find((v: any) => v.phase_role === 'kontraktor');
                    
                    // We only hard-block the execution of the build, not the bidding phase.
                    if (hasSelectedContractor && !isPBGApproved) {
                        const canOverride = user?.role_type === 'project_manager' || user?.id === project?.user_id;
                        return (
                            <div className="bg-red-50 border-2 border-red-100 rounded-[2rem] p-8 text-center space-y-4">
                                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                                    <ShieldCheck size={32} />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-lg font-black text-red-900 uppercase tracking-tight">PBG Permit Missing</h4>
                                    <p className="text-sm text-red-700 font-medium max-w-md mx-auto">
                                        Strict regulatory compliance requires the <span className="font-black underline">PBG (Building & Planning Permit)</span> to be officially issued before any physical site work begins.
                                    </p>
                                </div>
                                {!canOverride && (
                                    <div className="pt-4">
                                        <button 
                                            onClick={() => {
                                                const legalTab = document.querySelector<HTMLButtonElement>('button[data-phase-key="legal"]');
                                                if (legalTab) legalTab.click();
                                                else showToast('Please visit the Legalities phase to upload documents.', 'info');
                                            }}
                                            className="px-6 py-3 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg"
                                        >
                                            Check Permit Status
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    }
                    return null;
                })()}

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
                                        {engineeringSubTab === 'structural' && user?.role_type === 'structural' && isStructuralHired ? (
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
                                    <PhaseBidsList 
                                        bids={currentBids} 
                                        phaseKey={engineeringSubTab === 'interior' ? 'interior' : (engineeringSubTab !== 'architecture' ? 'engineering' : phase.key)} 
                                        projectId={project.id} 
                                        onRefresh={onRefresh} 
                                        isPMBidding={phase.key === 'management'}
                                        readOnly={isOwner && !!project.pm_id && !isHiredPM}
                                        onOpenChat={onOpenChat}
                                        projectContext={project}
                                        overrideType={engineeringSubTab !== 'architecture' && engineeringSubTab !== 'interior' ? engineeringSubTab : undefined}
                                        onRecommend={onRecommend}
                                        onSwitchTab={onSwitchTab}
                                    />
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
                                {!isMaterialsPhase && !currentHasPro && (!currentBids || currentBids.length === 0) && !hasDirectResourcing && (
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
            </motion.div>
        </AnimatePresence>
    );
}
