import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    ArrowLeft, DollarSign, MapPin, Calendar, 
    MessageSquare, Activity, FolderOpen, 
    LayoutDashboard, ClipboardList, ShieldCheck, FileText, CalendarRange, Box, HardHat, Users, CreditCard, ListChecks, Lock 
} from 'lucide-react';
import { PhaseKey, getProjectPhases, Phase } from '../../types/phase.types';
import PhaseTimeline from './PhaseTimeline';
import PhaseContent from './PhaseContent';
import ProjectBrief from './ProjectBrief';
import ProjectQA from './ProjectQA';
import ProjectActivity from './ProjectActivity';
import { PMLegalHub } from './PMWorkspace/PMLegalHub';
import { ErrorBoundary } from '../Common/ErrorBoundary';
import EngineeringWorkspace from './EngineeringWorkspace';
import ProjectDeliverables from './Phases/ProjectDeliverables';
import ProjectBudgetManager from './ProjectBudgetManager';
import ProjectInterviews from './ProjectInterviews';
import ProjectPayments from './ProjectPayments';
import SubProfessionalPanel from '../SubProfessionals/SubProfessionalPanel';
import AssignSubModal from '../SubProfessionals/AssignSubModal';
import RecommendSubModal from '../SubProfessionals/RecommendSubModal';
import { useSubProfessionals } from '../../hooks/useSubProfessionals';
import { ParentRole, ProjectSubProfessional } from '../../types/sub_professional.types';
import { InvitationBanner } from './InvitationBanner';
import { ContractSignModal } from './Contracts/ContractSignModal';
import ProjectProposals from './ProjectProposals';
import { useProjectTabsData } from '../../hooks/useProjectTabsData';
import { ProcessTabSkeleton, BudgetTabSkeleton, TenderingTabSkeleton, QATabSkeleton, ActivityTabSkeleton, VaultTabSkeleton, OverviewTabSkeleton } from './ProjectDetailSkeletons';

type TabId = 'overview' | 'proposals' | 'budget' | 'process' | 'interviews' | 'payments' | 'qa' | 'activity' | 'files' | 'pm_legal' | 'engineering';

interface ProjectDetailPageProps {
    project: any;
    user: any;
    onBack: () => void;
    onRefresh: () => void;
    onOpenChat?: (user: any) => void;
    onViewProfile?: (pro: any, phaseKey: 'design' | 'build' | 'legal' | 'interior') => void;
    isProjectDetailLoading?: boolean;
}

export default function ProjectDetailPage({ project: projectProp, user, onBack, onRefresh, onOpenChat, onViewProfile, isProjectDetailLoading }: ProjectDetailPageProps) {
    const [activeTab, setActiveTab] = useState<TabId>('overview');
    const { tabData, loadingStates, fetchTab } = useProjectTabsData(projectProp?.id || null);

    const project = useMemo(() => {
        if (!projectProp) return null;
        return {
            ...projectProp,
            milestones: tabData.milestones !== null ? tabData.milestones : (projectProp.milestones || []),
            paymentTermins: tabData.paymentTermins !== null ? tabData.paymentTermins : (projectProp.paymentTermins || []),
            documents: tabData.documents !== null ? tabData.documents : (projectProp.documents || []),
            comments: tabData.comments !== null ? tabData.comments : (projectProp.comments || []),
            activityLogs: tabData.activityLogs !== null ? tabData.activityLogs : (projectProp.activityLogs || []),
            
            // Bids category
            bids_arsitek: tabData.bids?.bids_arsitek !== undefined ? tabData.bids.bids_arsitek : (projectProp.bids_arsitek || []),
            bids_kontraktor: tabData.bids?.bids_kontraktor !== undefined ? tabData.bids.bids_kontraktor : (projectProp.bids_kontraktor || []),
            bids_notaris: tabData.bids?.bids_notaris !== undefined ? tabData.bids.bids_notaris : (projectProp.bids_notaris || []),
            bids_interior: tabData.bids?.bids_interior !== undefined ? tabData.bids.bids_interior : (projectProp.bids_interior || []),
            bids_structural: tabData.bids?.bids_structural !== undefined ? tabData.bids.bids_structural : (projectProp.bids_structural || []),
            bids_mep: tabData.bids?.bids_mep !== undefined ? tabData.bids.bids_mep : (projectProp.bids_mep || []),
            bids_project_manager: tabData.bids?.bids_project_manager !== undefined ? tabData.bids.bids_project_manager : (projectProp.bids_project_manager || []),
        };
    }, [projectProp, tabData]);

    const phases = useMemo(() => getProjectPhases(project, project?.needed_phases), [project, project?.needed_phases]);
    const [activePhase, setActivePhase] = useState<PhaseKey>(phases[0]?.key || 'design');

    const handleRefresh = useCallback(() => {
        onRefresh();
        if (activeTab === 'process') {
            fetchTab('milestones', true);
            if (['technical', 'design', 'build', 'interior'].includes(activePhase)) {
                fetchTab('bids', true);
            }
        } else if (activeTab === 'proposals' || activeTab === 'interviews') {
            fetchTab('bids', true);
        } else if (activeTab === 'budget') {
            fetchTab('budget', true);
            fetchTab('paymentTermins', true);
        } else if (activeTab === 'payments') {
            fetchTab('paymentTermins', true);
        } else if (activeTab === 'qa') {
            fetchTab('comments', true);
        } else if (activeTab === 'activity') {
            fetchTab('activityLogs', true);
        } else if (activeTab === 'files' || activeTab === 'pm_legal') {
            fetchTab('documents', true);
        } else if (activeTab === 'engineering') {
            fetchTab('bids', true);
        }
    }, [onRefresh, activeTab, activePhase, fetchTab]);

    React.useEffect(() => {
        if (!projectProp?.id) return;

        if (activeTab === 'process') {
            fetchTab('milestones');
            if (['technical', 'design', 'build', 'interior'].includes(activePhase)) {
                fetchTab('bids');
            }
        } else if (activeTab === 'proposals' || activeTab === 'interviews') {
            fetchTab('bids');
        } else if (activeTab === 'budget') {
            fetchTab('budget');
            fetchTab('paymentTermins');
        } else if (activeTab === 'payments') {
            fetchTab('paymentTermins');
        } else if (activeTab === 'qa') {
            fetchTab('comments');
        } else if (activeTab === 'activity') {
            fetchTab('activityLogs');
        } else if (activeTab === 'files' || activeTab === 'pm_legal') {
            fetchTab('documents');
        } else if (activeTab === 'engineering') {
            fetchTab('bids');
        }
    }, [activeTab, activePhase, projectProp?.id, fetchTab]);

    const [showAssignModal, setShowAssignModal] = useState(false);
    const [recommendingSub, setRecommendingSub] = useState<ProjectSubProfessional | null>(null);
    const [isAssigning, setIsAssigning] = useState(false);
    const [isSignModalOpen, setIsSignModalOpen] = useState(false);
    const [proposalsSubTab, setProposalsSubTab] = useState<'pending' | 'interviews' | 'payments' | 'archived'>('pending');
    const [budgetSubTab, setBudgetSubTab] = useState<'overview' | 'payments'>('overview');

    const handleRecommendFromBid = (bidId: number, role: string) => {
        const bids = role === 'structural' ? project.bids_structural : (role === 'mep' ? project.bids_mep : []);
        const bid = (bids || []).find((b: any) => b.id === bidId);
        if (!bid) return;

        const budget = Number(project.budget) || 0;
        let negotiatedFee = 0;
        
        if (bid.fee_type === 'percentage') {
            // Trust calculated_total ONLY if it's a realistic IDR amount (not a raw percentage)
            if (Number(bid.calculated_total) > 1000) {
                negotiatedFee = Number(bid.calculated_total);
            } else {
                negotiatedFee = (Number(bid.price) / 100) * budget;
            }
        } else if (bid.fee_type === 'sqm') {
            const area = Number(project.project_dimensions?.building_area) || Number(project.project_dimensions?.land_area) || 1;
            negotiatedFee = Number(bid.calculated_total) || (Number(bid.price) * area);
        } else {
            negotiatedFee = Number(bid.calculated_total) || Number(bid.price);
        }
        
        const userId = bid?.bidder?.user?.id || 
                     bid?.structural_engineer?.user?.id || 
                     bid?.structuralEngineer?.user?.id || 
                     bid?.mep_engineer?.user?.id ||
                     bid?.mepEngineer?.user?.id;

        const sub = subs.find(s => s.user_id === userId);
        if (sub) {
            setRecommendingSub({ 
                ...sub, 
                rate: Number(negotiatedFee) 
            });
        }
    };

    const { 
        subs, subspecialties, isLoading: subsLoading, 
        assignSub, acceptSub, declineSub, removeSub, hireSub, interviewSub, recommendSub, shortlistSubBid,
        refresh: refreshSubs 
    } = useSubProfessionals(project?.id);

    const pendingContractBid = useMemo(() => {
        if (!project || !user) return null;
        const bidTypeMap: any = {
            arsitek: 'bids_arsitek',
            kontraktor: 'bids_kontraktor',
            notaris: 'bids_notaris',
            interior: 'bids_interior',
            structural: 'bids_structural',
            mep: 'bids_mep',
            project_manager: 'bids_project_manager'
        };
        const key = bidTypeMap[user.role_type];
        if (!key || !project[key] || !Array.isArray(project[key])) return null;

        const bid = project[key].find((b: any) => {
            const bidderUserId = b.bidder?.user_id || 
                                 b.bidder?.user?.id || 
                                 b.user_id || 
                                 b.pm?.user_id ||
                                 b.pm?.user?.id ||
                                 b.arsitek?.user_id || 
                                 b.kontraktor?.user_id || 
                                 b.notaris?.user_id || 
                                 b.interior?.user_id || 
                                 b.structural_engineer?.user_id || 
                                 b.mep_engineer?.user_id;
            return String(bidderUserId) === String(user.id) && b.status === 'contract_pending';
        });

        if (bid) {
            return { bid, bidType: user.role_type };
        }
        return null;
    }, [project, user]);

    const isOwner = user?.id === project?.user_id;
    const isHiredPM = useMemo(() => {
        return !!project?.pm_id && user?.id === project?.pm_id && !pendingContractBid;
    }, [project?.pm_id, user?.id, pendingContractBid]);
    const isLeadArchitect = user?.role_type === 'arsitek' && project?.arsitek?.user_id === user?.id;
    const isLeadContractor = user?.role_type === 'kontraktor' && project?.kontraktor?.user_id === user?.id;
    const canManageSubs = isOwner || isHiredPM || isLeadArchitect || isLeadContractor;
    const assignParentRole: ParentRole = isLeadContractor ? 'kontraktor' : 'arsitek';

    const isHiredPro = useMemo(() => {
        if (!project || !user) return false;
        return (
            (project.selected_arsitek_id && (user?.arsitek?.id === project.selected_arsitek_id || project.arsitek?.user_id === user.id)) ||
            (project.selected_kontraktor_id && (user?.kontraktor?.id === project.selected_kontraktor_id || project.kontraktor?.user_id === user.id)) ||
            (project.selected_notaris_id && (user?.notaris_profile?.id === project.selected_notaris_id || project.notaris?.user_id === user.id || user.notaris_profile?.id === project.selected_notaris_id || project.notaris?.user?.id === user.id)) ||
            (project.selected_interior_id && (user?.interior_profile?.id === project.selected_interior_id || project.interior_profile?.user_id === user.id || user.interior_profile?.id === project.selected_interior_id || project.interior?.user?.id === user.id)) ||
            (project.structural_id && (user.id === project.structural_engineer?.user_id || user.structural_engineer?.id === project.structural_id)) ||
            (project.mep_id && (user.id === project.mep_engineer?.user_id || user.mep_engineer?.id === project.mep_id)) ||
            (!!project.sub_professionals && project.sub_professionals.some((s: any) => s.user_id === user.id && s.status === 'active'))
        );
    }, [project, user]);


    const userBid = useMemo(() => {
        if (!project || !user) return null;
        const bidKeys = [
            'bids_arsitek',
            'bids_kontraktor',
            'bids_notaris',
            'bids_interior',
            'bids_structural',
            'bids_mep',
            'bids_project_manager'
        ];
        for (const key of bidKeys) {
            const bids = project[key] || [];
            const found = bids.find((b: any) => {
                const bidderUserId = b.user_id || 
                                     b.bidder?.user_id || 
                                     b.bidder?.user?.id ||
                                     b.pm?.user_id ||
                                     b.pm?.user?.id ||
                                     b.arsitek?.user_id || 
                                     b.kontraktor?.user_id || 
                                     b.notaris?.user_id || 
                                     b.interior?.user_id ||
                                     b.structural_engineer?.user_id || 
                                     b.mep_engineer?.user_id;
                return String(bidderUserId) === String(user.id);
            });
            if (found) return found;
        }
        return null;
    }, [project, user]);

    const isShortlistedPro = useMemo(() => {
        return !!userBid && ['shortlisted', 'negotiating', 'contract_pending'].includes(userBid.status);
    }, [userBid]);

    const handleSwitchTab = (tabId: TabId, subTab?: 'pending' | 'interviews' | 'payments' | 'archived') => {
        if (isOwner || isHiredPM) {
            if (tabId === 'interviews') {
                setActiveTab('proposals');
                setProposalsSubTab('interviews');
                return;
            }
            if (tabId === 'payments') {
                setActiveTab('budget');
                setBudgetSubTab('payments');
                return;
            }
        }
        setActiveTab(tabId);
        if (subTab) {
            setProposalsSubTab(subTab);
        }
    };



    const currentPhase = phases.find(p => p.key === activePhase) || phases[0];

    const TABS = useMemo(() => {
        const tabs = [
            { id: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
            { id: 'process' as const, label: 'Process', icon: ClipboardList },
        ];

        if (isOwner || isHiredPM) {
            tabs.push({ id: 'proposals' as const, label: 'Tendering Hub', icon: ListChecks });
        }

        tabs.push(
            { id: 'budget' as const, label: 'Budget', icon: DollarSign },
        );

        if (!isOwner && !isHiredPM) {
            tabs.push(
                { id: 'interviews' as const, label: 'Tendering Hub', icon: ListChecks },
                { id: 'payments' as const, label: 'Payments', icon: CreditCard }
            );
        }

        tabs.push(
            { id: 'qa' as const, label: 'Q&A', icon: MessageSquare },
            { id: 'activity' as const, label: 'Activity', icon: Activity },
            { id: 'files' as const, label: 'Document Vault', icon: FolderOpen },
        );

        // Dynamic PM Tabs removed from main header - moved to PMWorkspace (Process > Manajemen)

        if (project?.selected_notaris_id) {
            tabs.push({ id: 'pm_legal' as const, label: 'Legal Hub', icon: ShieldCheck });
        }

        if (project?.requires_structural || project?.requires_mep || project?.structural_id || project?.mep_id) {
            tabs.push({ id: 'engineering' as const, label: 'Engineering', icon: HardHat });
        }

        if (user?.role_type === 'kontraktor') {
            return tabs.filter(t => t.id !== 'budget' && t.id !== 'pm_legal' && t.id !== 'engineering');
        }

        if (['structural', 'mep', 'interior'].includes(user?.role_type)) {
            return tabs.filter(t => t.id !== 'interviews' && t.id !== 'budget');
        }

        if (!isOwner && !isHiredPM) {
            return tabs.filter(t => t.id !== 'budget');
        }
        
        return tabs;
    }, [user?.id, user?.role_type, project?.user_id, project?.pm_id, project?.accepted_pm_bid, isOwner, isHiredPM, pendingContractBid]);



    return (
        <div className="w-full space-y-6">
            <InvitationBanner project={project} user={user} onRefresh={onRefresh} />
            

            
            {/* Split layout: Vertical Nav + Content Area */}
            <div className="flex flex-col lg:flex-row gap-6 items-start">
                {/* Vertical Navigation Bar */}
                <div className="w-full lg:w-52 shrink-0 bg-white p-4 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-4 sticky top-6">
                    {/* Project Context Header */}
                    <div className="space-y-1.5 pb-3 border-b border-gray-100">
                        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-955 font-bold transition-colors">
                            <ArrowLeft size={14} />
                            <span>Back to Projects</span>
                        </button>
                        <div className="min-w-0">
                            <h2 className="text-base font-black text-gray-900 tracking-tight leading-tight truncate" title={project?.title}>{project?.title}</h2>
                        </div>
                    </div>

                    {/* Navigation Links */}
                    <div className="space-y-1">
                        <div className="px-2 pb-1.5">
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Workspace Menu</p>
                        </div>
                        {TABS.map(tab => {
                            const isTabDisabled = ((isShortlistedPro && !isHiredPro) || !!pendingContractBid) && tab.id !== 'interviews';
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => {
                                        if (!isTabDisabled) {
                                            setActiveTab(tab.id);
                                        }
                                    }}
                                    disabled={isTabDisabled}
                                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-xs font-bold transition-all ${
                                        activeTab === tab.id 
                                        ? 'bg-gray-900 text-white shadow-md' 
                                        : isTabDisabled
                                        ? 'text-gray-300 cursor-not-allowed opacity-50 bg-gray-50/50'
                                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <tab.icon size={15} />
                                        <span>{tab.label}</span>
                                    </div>
                                    {isTabDisabled && <Lock size={12} className="text-gray-400" />}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Tab Search Area / Content */}
                <div className="flex-1 w-full min-w-0">
                    <div className="min-h-[500px]">
                        <AnimatePresence mode="wait">
                            {activeTab === 'overview' && (
                                <motion.div
                                    key="overview"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                >
                                    {isProjectDetailLoading ? (
                                        <OverviewTabSkeleton />
                                    ) : (
                                        <ProjectBrief 
                                            project={project} 
                                            user={user}
                                            onRefresh={handleRefresh}
                                            onSwitchTab={handleSwitchTab}
                                            onOpenChat={onOpenChat}
                                            onSwitchToProcess={(phase) => {
                                                setActiveTab('process');
                                                setActivePhase(phase);
                                            }} 
                                        />
                                    )}
                                </motion.div>
                            )}

                            {activeTab === 'proposals' && (
                                <ErrorBoundary name="ProjectProposals">
                                    <motion.div
                                        key="proposals"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                    >
                                        {loadingStates.bids ? (
                                            <TenderingTabSkeleton />
                                        ) : (
                                            <ProjectProposals 
                                                project={project} 
                                                user={user}
                                                onRefresh={handleRefresh}
                                                onOpenChat={onOpenChat!}
                                                onSwitchTab={handleSwitchTab}
                                                onViewProfile={onViewProfile}
                                                onRecommend={handleRecommendFromBid}
                                                defaultSubTab={proposalsSubTab}
                                            />
                                        )}
                                    </motion.div>
                                </ErrorBoundary>
                            )}

                            {activeTab === 'process' && (
                                <ErrorBoundary name="ProjectProcess">
                                    <motion.div
                                        key="process"
                                        initial={{ opacity: 0, scale: 0.98 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.98 }}
                                        className="space-y-6"
                                    >
                                        {loadingStates.milestones ? (
                                            <ProcessTabSkeleton />
                                        ) : (
                                            <>
                                                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm">
                                                    <PhaseTimeline phases={phases} activePhase={activePhase} onPhaseClick={setActivePhase} projectCategory={project?.project_category} project={project} />
                                                </div>

                                                <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm min-h-[300px]">
                                                    <PhaseContent 
                                                        phase={currentPhase} 
                                                        project={project} 
                                                        user={user} 
                                                        onRefresh={handleRefresh} 
                                                        onPhaseComplete={setActivePhase}
                                                        onOpenChat={onOpenChat}
                                                        onViewProfile={onViewProfile}
                                                        onShortlist={async (bidId, role) => {
                                                            const ok = await shortlistSubBid(role, bidId);
                                                            if (ok) {
                                                                handleRefresh();
                                                                refreshSubs();
                                                                handleSwitchTab('interviews');
                                                            }
                                                        }}
                                                        onRecommend={handleRecommendFromBid}
                                                        subs={subs}
                                                        onSwitchTab={handleSwitchTab}
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </motion.div>
                                </ErrorBoundary>
                            )}

                            {activeTab === 'interviews' && !isOwner && !isHiredPM && (
                                <ErrorBoundary name="ProjectInterviews">
                                    <motion.div
                                        key="interviews"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="space-y-6"
                                    >
                                        {loadingStates.bids ? (
                                            <TenderingTabSkeleton />
                                        ) : (
                                            <ProjectInterviews 
                                                project={project} 
                                                onRefresh={handleRefresh}
                                                onOpenChat={onOpenChat!}
                                                onRecommend={handleRecommendFromBid}
                                            />
                                        )}
                                    </motion.div>
                                </ErrorBoundary>
                            )}

                            {activeTab === 'payments' && !isOwner && !isHiredPM && (
                                <motion.div
                                    key="payments"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                >
                                    {loadingStates.paymentTermins ? (
                                        <BudgetTabSkeleton />
                                    ) : (
                                        <ProjectPayments 
                                            project={project} 
                                            user={user}
                                            onRefresh={handleRefresh}
                                            onOpenChat={onOpenChat}
                                        />
                                    )}
                                </motion.div>
                            )}

                            {activeTab === 'budget' && (
                                <div className="space-y-6">
                                    {/* Budget Sub-tabs for Owner/PM */}
                                    {(isOwner || isHiredPM) && (
                                        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col lg:flex-row gap-4 items-center justify-between">
                                            <div className="flex bg-gray-50 p-1 rounded-2xl border border-gray-100 shrink-0 w-full lg:w-auto overflow-x-auto">
                                                <button
                                                    onClick={() => setBudgetSubTab('overview')}
                                                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                                        budgetSubTab === 'overview'
                                                        ? 'bg-white text-zinc-955 shadow-sm font-black'
                                                        : 'text-gray-400 hover:text-gray-700'
                                                    }`}
                                                >
                                                    Budget Overview & Ledger
                                                </button>
                                                <button
                                                    onClick={() => setBudgetSubTab('payments')}
                                                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                                        budgetSubTab === 'payments'
                                                        ? 'bg-white text-zinc-955 shadow-sm font-black'
                                                        : 'text-gray-400 hover:text-gray-700'
                                                    }`}
                                                >
                                                    Payments & Active
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {(((!isOwner && !isHiredPM) || budgetSubTab === 'overview') ? loadingStates.budget : loadingStates.paymentTermins) ? (
                                        <BudgetTabSkeleton />
                                    ) : (
                                        <AnimatePresence mode="wait">
                                            {((!isOwner && !isHiredPM) || budgetSubTab === 'overview') ? (
                                                <motion.div
                                                    key="budget-overview"
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -10 }}
                                                >
                                                    <ProjectBudgetManager 
                                                        project={project} 
                                                        user={user} 
                                                        budgetData={tabData.budget}
                                                        onRefresh={handleRefresh}
                                                    />
                                                </motion.div>
                                            ) : (
                                                <motion.div
                                                    key="budget-payments"
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -10 }}
                                                >
                                                    <ProjectPayments 
                                                        project={project} 
                                                        user={user}
                                                        onRefresh={handleRefresh}
                                                        onOpenChat={onOpenChat}
                                                    />
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    )}
                                </div>
                            )}

                            {activeTab === 'qa' && (
                                <motion.div
                                    key="qa"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                >
                                    {loadingStates.comments ? (
                                        <QATabSkeleton />
                                    ) : (
                                        <ProjectQA project={project} user={user} onRefresh={handleRefresh} />
                                    )}
                                </motion.div>
                            )}

                            {activeTab === 'activity' && (
                                <motion.div
                                    key="activity"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                >
                                    {loadingStates.activityLogs ? (
                                        <ActivityTabSkeleton />
                                    ) : (
                                        <ProjectActivity project={project} />
                                    )}
                                </motion.div>
                            )}

                            {activeTab === 'files' && (
                                <motion.div
                                    key="files"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                >
                                    {loadingStates.documents ? (
                                        <VaultTabSkeleton />
                                    ) : (
                                        <ProjectDeliverables 
                                            project={project} 
                                            currentUser={user} 
                                            isPro={
                                                user?.id === project.user_id || 
                                                user?.id === project.pm_id || 
                                                (project.selected_arsitek_id && (user?.arsitek?.id === project.selected_arsitek_id || project.arsitek?.user_id === user?.id)) ||
                                                (project.selected_kontraktor_id && (user?.kontraktor?.id === project.selected_kontraktor_id || project.kontraktor?.user_id === user?.id)) ||
                                                (project.selected_notaris_id && (user?.notaris_profile?.id === project.selected_notaris_id || project.notaris?.user_id === user?.id)) ||
                                                (project.selected_interior_id && (user?.interior_profile?.id === project.selected_interior_id || project.interior_profile?.user_id === user?.id)) ||
                                                (project.structural_id && (user?.structural_engineer?.id === project.structural_id || project.structural_engineer?.user_id === user?.id)) ||
                                                (project.mep_id && (user?.mep_engineer?.id === project.mep_id || project.mep_engineer?.user_id === user?.id)) ||
                                                (project.sub_professionals && project.sub_professionals.some((s: any) => s.user_id === user?.id && s.status === 'active'))
                                            } 
                                        />
                                    )}
                                </motion.div>
                            )}

                            {activeTab === 'pm_legal' && (
                                <motion.div
                                    key="pm_legal"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                >
                                    <ErrorBoundary name="LegalHub">
                                        {loadingStates.documents ? (
                                            <VaultTabSkeleton />
                                        ) : (
                                            <PMLegalHub 
                                                project={project} 
                                                user={user} 
                                                onRefresh={handleRefresh} 
                                                onSwitchToProcess={(phase, requirement) => {
                                                    setActiveTab('process');
                                                    setActivePhase(phase);
                                                }}
                                            />
                                        )}
                                    </ErrorBoundary>
                                </motion.div>
                            )}

                            {activeTab === 'engineering' && (
                                <motion.div
                                    key="engineering"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                >
                                    <ErrorBoundary name="EngineeringHub">
                                        {loadingStates.bids ? (
                                            <TenderingTabSkeleton />
                                        ) : (
                                            <EngineeringWorkspace 
                                                project={project} 
                                                user={user} 
                                                onRefresh={handleRefresh} 
                                                onOpenChat={onOpenChat}
                                                onRecommend={handleRecommendFromBid}
                                                onShortlist={async (bidId, role) => {
                                                    const ok = await shortlistSubBid(role, bidId);
                                                    if (ok) {
                                                        handleRefresh();
                                                        refreshSubs();
                                                    }
                                                }}
                                            />
                                        )}
                                    </ErrorBoundary>
                                </motion.div>
                            )}
                </AnimatePresence>
            </div>
        </div>
    </div>

            {/* Modals */}
            {showAssignModal && (
                <AssignSubModal 
                    parentRole={assignParentRole}
                    subspecialties={subspecialties}
                    availableProfessionals={[]}
                    isSubmitting={isAssigning}
                    onAssign={async (userId, subRole, scopeNotes) => {
                        setIsAssigning(true);
                        const ok = await assignSub({ 
                            user_id: userId, 
                            parent_role: assignParentRole, 
                            sub_role: subRole, 
                            scope_notes: scopeNotes 
                        });
                        setIsAssigning(false);
                        if (ok) {
                            setShowAssignModal(false);
                            onRefresh();
                        }
                    }}
                    onClose={() => setShowAssignModal(false)}
                />
            )}

            <RecommendSubModal 
                key={recommendingSub?.id}
                sub={recommendingSub}
                onClose={() => setRecommendingSub(null)}
                onRecommend={async (subId, fee, notes) => {
                    const ok = await recommendSub(subId, fee, notes);
                    if (ok) {
                        setRecommendingSub(null);
                        onRefresh();
                    }
                    return ok;
                }}
            />

            {isSignModalOpen && pendingContractBid && (
                <ContractSignModal 
                    isOpen={isSignModalOpen}
                    onClose={() => setIsSignModalOpen(false)}
                    project={project}
                    bid={pendingContractBid.bid}
                    bidType={pendingContractBid.bidType}
                    onSuccess={() => {
                        setIsSignModalOpen(false);
                        onRefresh();
                    }}
                />
            )}
        </div>
    );
}


