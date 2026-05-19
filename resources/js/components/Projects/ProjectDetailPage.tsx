import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    ArrowLeft, DollarSign, MapPin, Calendar, 
    MessageSquare, Activity, FolderOpen, 
    LayoutDashboard, ClipboardList, ShieldCheck, FileText, CalendarRange, Box, HardHat, Users, CreditCard 
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

type TabId = 'overview' | 'budget' | 'process' | 'interviews' | 'payments' | 'qa' | 'activity' | 'files' | 'pm_legal' | 'engineering';

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

    const isOwner = user?.id === project?.user_id;
    const isHiredPM = project?.pm_id && user?.id === project?.pm_id;
    const isLeadArchitect = user?.role_type === 'arsitek' && project?.arsitek?.user_id === user?.id;
    const isLeadContractor = user?.role_type === 'kontraktor' && project?.kontraktor?.user_id === user?.id;
    const canManageSubs = isOwner || isLeadArchitect || isLeadContractor;
    const assignParentRole: ParentRole = isLeadContractor ? 'kontraktor' : 'arsitek';

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

    const currentPhase = phases.find(p => p.key === activePhase) || phases[0];

    const TABS = useMemo(() => {
        if (pendingContractBid) {
            return [
                { id: 'overview' as const, label: 'Overview', icon: LayoutDashboard }
            ];
        }

        const tabs = [
            { id: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
            { id: 'budget' as const, label: 'Budget', icon: DollarSign },
            { id: 'process' as const, label: 'Process', icon: ClipboardList },
            { id: 'interviews' as const, label: 'Interviews', icon: Users },
            { id: 'payments' as const, label: 'Payments', icon: CreditCard },
            { id: 'qa' as const, label: 'Q&A', icon: MessageSquare },
            { id: 'activity' as const, label: 'Activity', icon: Activity },
            { id: 'files' as const, label: 'Document Vault', icon: FolderOpen },
        ];

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

    // Auto-switch to payments tab if status is awaiting_payment, ONLY for owner or hired PM
    React.useEffect(() => {
        if (project?.status === 'awaiting_payment' && (isOwner || isHiredPM)) {
            setActiveTab('payments');
        }
    }, [project?.status, isOwner, isHiredPM]);

    return (
        <div className="w-full space-y-6">
            <InvitationBanner project={project} user={user} onRefresh={onRefresh} />
            
            {pendingContractBid && (
                <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8 bg-gradient-to-r from-emerald-950 to-zinc-950 rounded-[2.5rem] border border-emerald-500/20 p-8 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative"
                >
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[80px] rounded-full translate-x-1/2 -translate-y-1/2 pointer-events-none" />
                    
                    <div className="flex items-start gap-5 relative z-10">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 shadow-lg">
                            <ShieldCheck size={28} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-white tracking-tight uppercase">Contract Signature Required</h3>
                            <p className="text-emerald-200/80 text-sm font-medium mt-1 leading-relaxed max-w-xl">
                                You have been selected as the lead {pendingContractBid.bidType === 'arsitek' ? 'Architect' : pendingContractBid.bidType === 'kontraktor' ? 'Contractor' : pendingContractBid.bidType === 'notaris' ? 'Notary' : pendingContractBid.bidType === 'interior' ? 'Interior Designer' : pendingContractBid.bidType}! Please sign the contract to unlock your professional workspace.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto relative z-10 shrink-0">
                        <button
                            onClick={() => setIsSignModalOpen(true)}
                            className="w-full md:w-auto px-8 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-widest hover:shadow-lg hover:shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                        >
                            <ShieldCheck size={16} />
                            Sign Contract
                        </button>
                    </div>
                </motion.div>
            )}
            
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                    <button onClick={onBack} className="mt-1 p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight truncate">{project?.title}</h1>
                        <ProjectMetaRow project={project} />
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-2xl border border-gray-100">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                                activeTab === tab.id 
                                ? 'bg-white text-gray-900 shadow-sm border border-gray-100' 
                                : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            <tab.icon size={14} />
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Search Area / Content */}
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
                                onSwitchTab={setActiveTab}
                                onOpenChat={onOpenChat}
                                onSwitchToProcess={(phase) => {
                                    setActiveTab('process');
                                    setActivePhase(phase);
                                }} 
                            />

                            {/* Sub-Professionals Panel */}
                            <SubProfessionalPanel
                                subs={subs}
                                isLoading={subsLoading}
                                canManage={canManageSubs}
                                onAddClick={() => setShowAssignModal(true)}
                                onAccept={async (subId) => { await acceptSub(subId); refreshSubs(); }}
                                onDecline={async (subId) => { await declineSub(subId); refreshSubs(); }}
                                onRemove={async (subId) => { await removeSub(subId); refreshSubs(); }}
                                onHire={async (subId) => { await hireSub(subId); refreshSubs(); }}
                                onInterview={async (subId) => { await interviewSub(subId); refreshSubs(); }}
                                onRecommend={(sub) => setRecommendingSub(sub)}
                                currentUserId={user?.id}
                                isOwner={user?.id === project.user_id}
                                isPM={project.pm_id && user?.id === project.pm_id}
                            />

                        </motion.div>
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
                                                setActiveTab('interviews');
                                            }
                                        }}
                                        onRecommend={handleRecommendFromBid}
                                        subs={subs}
                                        onSwitchTab={setActiveTab}
                                    />
                                </div>
                            </motion.div>
                        </ErrorBoundary>
                    )}

                    {activeTab === 'interviews' && (
                        <ErrorBoundary name="ProjectInterviews">
                            <motion.div
                                key="interviews"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
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

                    {activeTab === 'payments' && (
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
                            <ProjectQA project={project} onRefresh={onRefresh} />
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

function ProjectMetaRow({ project }: { project: any }) {
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
            <span className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
                <DollarSign size={12} className="text-emerald-500" />
                Remaining: <span className="text-emerald-600 font-bold">Rp {Number(project?.budget_summary?.remaining ?? project?.budget ?? 0).toLocaleString('id-ID')}</span>
                <span className="text-[10px] text-gray-300 ml-1">/ Rp {Number(project?.budget || 0).toLocaleString('id-ID')}</span>
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
                <MapPin size={12} className="text-red-400" />
                {project?.city || project?.lokasi || 'Unknown'}
            </span>
            {project?.deadline && (
                <span className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
                    <Calendar size={12} className="text-blue-400" />
                    {new Date(project.deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
            )}
        </div>
    );
}
