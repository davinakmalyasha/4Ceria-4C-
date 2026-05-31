import React, { useState, useMemo } from 'react';
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

type TabId = 'overview' | 'proposals' | 'budget' | 'process' | 'interviews' | 'payments' | 'qa' | 'activity' | 'files' | 'pm_legal' | 'engineering';

interface ProjectDetailPageProps {
    project: any;
    user: any;
    onBack: () => void;
    onRefresh: () => void;
    onOpenChat?: (user: any) => void;
    onViewProfile?: (pro: any, phaseKey: 'design' | 'build' | 'legal' | 'interior') => void;
}

export default function ProjectDetailPage({ project, user, onBack, onRefresh, onOpenChat, onViewProfile }: ProjectDetailPageProps) {
    const phases = useMemo(() => getProjectPhases(project, project?.needed_phases), [project, project?.needed_phases]);
    const [activeTab, setActiveTab] = useState<TabId>('overview');
    const [activePhase, setActivePhase] = useState<PhaseKey>(phases[0]?.key || 'design');
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [recommendingSub, setRecommendingSub] = useState<ProjectSubProfessional | null>(null);
    const [isAssigning, setIsAssigning] = useState(false);
    const [isSignModalOpen, setIsSignModalOpen] = useState(false);
    const [proposalsSubTab, setProposalsSubTab] = useState<'pending' | 'interviews' | 'payments' | 'archived'>('pending');

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
                                 b.arsitek?.user_id || 
                                 b.kontraktor?.user_id || 
                                 b.notaris?.user_id || 
                                 b.interior?.user_id || 
                                 b.pm_id || 
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
            (project.selected_arsitek_id && (user.id === project.selected_arsitek_id || project.arsitek?.user_id === user.id)) ||
            (project.selected_kontraktor_id && (user.id === project.selected_kontraktor_id || project.kontraktor?.user_id === user.id)) ||
            (project.selected_notaris_id && (user.id === project.selected_notaris_id || project.notaris?.user_id === user.id)) ||
            (project.selected_interior_id && (user.id === project.selected_interior_id || project.interior_profile?.user_id === user.id)) ||
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
                setActiveTab('proposals');
                setProposalsSubTab('payments');
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
        ];

        if (isOwner || isHiredPM) {
            tabs.push({ id: 'proposals' as const, label: 'Tendering Hub', icon: ListChecks });
        }

        tabs.push(
            { id: 'budget' as const, label: 'Budget', icon: DollarSign },
            { id: 'process' as const, label: 'Process', icon: ClipboardList },
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

        if (['structural', 'mep', 'interior'].includes(user?.role_type)) {
            return tabs.filter(t => t.id !== 'interviews' && t.id !== 'budget');
        }

        if (!isOwner && !isHiredPM) {
            return tabs.filter(t => t.id !== 'budget');
        }
        
        return tabs;
    }, [user?.id, user?.role_type, project?.user_id, project?.pm_id, project?.accepted_pm_bid, isOwner, isHiredPM, pendingContractBid]);

    // Auto-switch to Tendering Hub (proposals) -> payments sub-tab if status is awaiting_payment, ONLY for owner or hired PM
    React.useEffect(() => {
        if (project?.status === 'awaiting_payment') {
            if (isOwner || isHiredPM) {
                setActiveTab('proposals');
                setProposalsSubTab('payments');
            } else {
                setActiveTab('payments');
            }
        }
    }, [project?.status, isOwner, isHiredPM]);

    // Auto-redirect shortlisted professionals to the Tendering Hub (interviews) tab
    React.useEffect(() => {
        const shouldRedirect = (isShortlistedPro && !isHiredPro) || !!pendingContractBid;
        if (shouldRedirect && activeTab !== 'interviews') {
            setActiveTab('interviews');
        }
    }, [isShortlistedPro, isHiredPro, pendingContractBid]);

    return (
        <div className="w-full space-y-6">
            <InvitationBanner project={project} user={user} onRefresh={onRefresh} />
            

            
            {/* Split layout: Vertical Nav + Content Area */}
            <div className="flex flex-col lg:flex-row gap-8 items-start">
                {/* Vertical Navigation Bar */}
                <div className="w-full lg:w-64 shrink-0 bg-white p-4 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-4 sticky top-6">
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
                                    <ProjectBrief 
                                        project={project} 
                                        user={user}
                                        onRefresh={onRefresh}
                                        onSwitchTab={handleSwitchTab}
                                        onOpenChat={onOpenChat}
                                        onSwitchToProcess={(phase) => {
                                            setActiveTab('process');
                                            setActivePhase(phase);
                                        }} 
                                    />
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
                                        <ProjectProposals 
                                            project={project} 
                                            user={user}
                                            onRefresh={onRefresh}
                                            onOpenChat={onOpenChat!}
                                            onSwitchTab={handleSwitchTab}
                                            onViewProfile={onViewProfile}
                                            onRecommend={handleRecommendFromBid}
                                            defaultSubTab={proposalsSubTab}
                                        />
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
                                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm">
                                    <PhaseTimeline phases={phases} activePhase={activePhase} onPhaseClick={setActivePhase} projectCategory={project?.project_category} project={project} />
                                </div>

                                <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm min-h-[300px]">
                                    <PhaseContent 
                                        phase={currentPhase} 
                                        project={project} 
                                        user={user} 
                                        onRefresh={onRefresh} 
                                        onPhaseComplete={setActivePhase}
                                        onOpenChat={onOpenChat}
                                        onViewProfile={onViewProfile}
                                        onShortlist={async (bidId, role) => {
                                            const ok = await shortlistSubBid(role, bidId);
                                            if (ok) {
                                                onRefresh();
                                                refreshSubs();
                                                handleSwitchTab('interviews');
                                            }
                                        }}
                                        onRecommend={handleRecommendFromBid}
                                        subs={subs}
                                        onSwitchTab={handleSwitchTab}
                                    />
                                </div>
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

                                <ProjectInterviews 
                                    project={project} 
                                    onRefresh={onRefresh}
                                    onOpenChat={onOpenChat!}
                                    onRecommend={handleRecommendFromBid}
                                />
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
                            <ProjectPayments 
                                project={project} 
                                user={user}
                                onRefresh={onRefresh}
                            />
                        </motion.div>
                    )}

                    {activeTab === 'budget' && (
                        <motion.div
                            key="budget"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <ProjectBudgetManager project={project} user={user} />
                        </motion.div>
                    )}

                    {activeTab === 'qa' && (
                        <motion.div
                            key="qa"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <ProjectQA project={project} user={user} onRefresh={onRefresh} />
                        </motion.div>
                    )}

                    {activeTab === 'activity' && (
                        <motion.div
                            key="activity"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <ProjectActivity project={project} />
                        </motion.div>
                    )}

                    {activeTab === 'files' && (
                        <motion.div
                            key="files"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <ProjectDeliverables 
                                project={project} 
                                currentUser={user} 
                                isPro={user?.id === project.selected_arsitek_id || user?.id === project.selected_notaris_id || user?.id === project.selected_kontraktor_id || user?.id === project.pm_id || user?.id === project.user_id} 
                            />
                        </motion.div>
                    )}

                    {/* PM Tabs relocated to PMWorkspace */}

                    {activeTab === 'pm_legal' && (
                        <motion.div
                            key="pm_legal"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <ErrorBoundary name="LegalHub">
                                <PMLegalHub 
                                    project={project} 
                                    user={user} 
                                    onRefresh={onRefresh} 
                                    onSwitchToProcess={(phase, requirement) => {
                                        setActiveTab('process');
                                        setActivePhase(phase);
                                        // We could also pass requirement state if LegalVault supports it
                                    }}
                                />
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
                                <EngineeringWorkspace 
                                    project={project} 
                                    user={user} 
                                    onRefresh={onRefresh} 
                                    onOpenChat={onOpenChat}
                                    onRecommend={handleRecommendFromBid}
                                    onShortlist={async (bidId, role) => {
                                        const ok = await shortlistSubBid(role, bidId);
                                        if (ok) {
                                            onRefresh();
                                            refreshSubs();
                                        }
                                    }}
                                />
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


