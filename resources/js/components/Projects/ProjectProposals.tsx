import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ListChecks, Search, Users, Briefcase, Filter, CreditCard } from 'lucide-react';
import { BidReviewCard } from './Phases/BidReviewCard';
import ConfirmModal from './ConfirmModal';
import ProjectInterviews from './ProjectInterviews';
// ProjectPayments relocated to Budget tab
import { useToast } from '../../context/ToastContext';
import axios from 'axios';

interface ProjectProposalsProps {
    project: any;
    user: any;
    onRefresh: () => void;
    onOpenChat: (user: any) => void;
    onSwitchTab: (tab: any) => void;
    onViewProfile?: (pro: any, phaseKey: any) => void;
    onRecommend?: (bidId: number, role: 'structural' | 'mep') => void;
    defaultSubTab?: 'pending' | 'interviews' | 'payments' | 'archived';
}

export default function ProjectProposals({ 
    project, 
    user, 
    onRefresh, 
    onOpenChat, 
    onSwitchTab, 
    onViewProfile, 
    onRecommend,
    defaultSubTab = 'pending'
}: ProjectProposalsProps) {
    const { showToast } = useToast();
    const isOwner = user?.id === project?.user_id;
    const [actioningId, setActioningId] = useState<number | null>(null);
    const [activeSubTab, setActiveSubTab] = useState<'pending' | 'interviews' | 'payments' | 'archived'>(defaultSubTab);
    const [roleFilter, setRoleFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [confirmState, setConfirmState] = useState<{
        isOpen: boolean;
        bidId: number | null;
        action: 'shortlist' | 'accept' | 'decline' | 'recommend' | null;
        title: string;
        description: string;
        variant: 'info' | 'success' | 'danger';
    }>({
        isOpen: false,
        bidId: null,
        action: null,
        title: '',
        description: '',
        variant: 'info'
    });

    React.useEffect(() => {
        if (defaultSubTab) {
            setActiveSubTab(defaultSubTab);
        }
    }, [defaultSubTab]);

    // Combine all bids from different roles on the project
    const allProposals = useMemo(() => {
        const list: any[] = [];
        
        const formatBid = (bid: any, phaseKey: string, roleLabel: string, bidType: string) => ({
            ...bid,
            phaseKey,
            roleLabel,
            bidType,
            proName: bid.arsitek?.nama || bid.kontraktor?.nama || bid.notaris?.nama || bid.interior?.nama || bid.pm?.nama || bid.structural?.nama || bid.mep?.nama || bid.bidder?.name || bid.user?.name || 'Professional'
        });

        (project.bids_arsitek || []).forEach((b: any) => list.push(formatBid(b, 'design', 'Architect', 'arsitek')));
        (project.bids_kontraktor || []).forEach((b: any) => list.push(formatBid(b, 'build', 'Contractor', 'kontraktor')));
        (project.bids_notaris || []).forEach((b: any) => list.push(formatBid(b, 'legal', 'Notary', 'notaris')));
        (project.bids_interior || []).forEach((b: any) => list.push(formatBid(b, 'interior', 'Interior Designer', 'interior')));
        (project.bids_project_manager || []).forEach((b: any) => list.push(formatBid(b, 'management', 'Project Manager', 'project_manager')));
        (project.bids_structural || []).forEach((b: any) => list.push(formatBid(b, 'engineering', 'Structural Engineer', 'structural')));
        (project.bids_mep || []).forEach((b: any) => list.push(formatBid(b, 'engineering', 'MEP Specialist', 'mep')));

        return list;
    }, [project]);

    // Handle shortlist/reject/hire actions from proposals list
    const handleAction = async (bidId: number, action: 'shortlist' | 'accept' | 'decline' | 'recommend') => {
        const currentBid = allProposals.find(b => b.id === bidId);
        if (!currentBid) return;

        let title = '';
        let description = '';
        let variant: 'info' | 'success' | 'danger' = 'info';

        if (action === 'shortlist') {
            title = 'Shortlist Candidate';
            description = `Shortlist ${currentBid.proName} for interview? You will be able to discuss terms before finalized hiring.`;
            variant = 'info';
        } else if (action === 'accept') {
            const isPM = user?.role_type === 'project_manager';
            title = isPM ? 'Recommend Professional' : 'Hire Professional';
            description = isPM 
                ? `Are you sure you want to recommend ${currentBid.proName} to the owner? This will forward the terms to the owner for final approval.`
                : `Are you sure you want to hire ${currentBid.proName}? This will generate contract documents.`;
            variant = 'success';
        } else if (action === 'decline') {
            title = 'Decline Proposal';
            description = `Are you sure you want to decline this proposal?`;
            variant = 'danger';
        } else {
            return;
        }

        setConfirmState({
            isOpen: true,
            bidId,
            action,
            title,
            description,
            variant
        });
    };

    const executeConfirmAction = async () => {
        const { bidId, action } = confirmState;
        if (!bidId || !action) return;

        setConfirmState(prev => ({ ...prev, isOpen: false }));
        setActioningId(bidId);
        try {
            const currentBid = allProposals.find(b => b.id === bidId);
            if (!currentBid) return;

            const isPMBidding = currentBid.phaseKey === 'management';
            let endpoint: string;

            if (action === 'shortlist') {
                endpoint = isPMBidding ? `pm-bids/${bidId}/shortlist` : 'shortlist-bid';
            } else if (action === 'accept') {
                endpoint = isPMBidding ? `pm-bids/${bidId}/accept` : 'accept-bid';
            } else {
                endpoint = isPMBidding ? `pm-bids/${bidId}/decline` : 'decline-bid';
            }

            if (isPMBidding) {
                await axios.post(`/projects/${project.id}/${endpoint}`);
            } else {
                await axios.post(`/projects/${project.id}/${endpoint}`, {
                    bid_id: bidId,
                    bid_type: currentBid.bidType
                });
            }

            showToast(
                action === 'shortlist' 
                    ? 'Candidate shortlisted! You can view them in the Interviews sub-tab.' 
                    : action === 'accept' 
                        ? (user?.role_type === 'project_manager' ? 'Successfully recommended to the owner!' : 'Professional hired successfully!') 
                        : 'Proposal declined.', 
                action === 'decline' ? 'info' : 'success'
            );
            onRefresh();

            if (action === 'shortlist') {
                setActiveSubTab('interviews');
            }
        } catch (error: any) {
            console.error(`Failed to execute proposal action ${action}`, error);
            showToast(error.response?.data?.message || `Failed to ${action} candidate.`, 'error');
        } finally {
            setActioningId(null);
        }
    };

    // Filter proposals based on active sub-tab, role, and search queries
    const filteredProposals = useMemo(() => {
        return allProposals.filter(bid => {
            const isFilled = 
                (bid.bidType === 'arsitek' && !!project.selected_arsitek_id && project.selected_arsitek_id !== bid.arsitek_id) ||
                (bid.bidType === 'kontraktor' && !!project.selected_kontraktor_id && project.selected_kontraktor_id !== bid.kontraktor_id) ||
                (bid.bidType === 'notaris' && !!project.selected_notaris_id && project.selected_notaris_id !== bid.notaris_id) ||
                (bid.bidType === 'interior' && !!project.selected_interior_id && project.selected_interior_id !== bid.interior_id) ||
                (bid.bidType === 'project_manager' && !!project.pm_id && project.pm_id !== bid.pm_id) ||
                (bid.bidType === 'structural' && !!project.structural_id && project.structural_id !== bid.structural_id) ||
                (bid.bidType === 'mep' && !!project.mep_id && project.mep_id !== bid.mep_id);

            // Tab filtering
            const isArchived = ['rejected', 'declined', 'cancelled', 'accepted', 'active', 'awaiting_payment'].includes(bid.status) || isFilled;
            const isPending = ['pending', 'invited'].includes(bid.status) && !isFilled;

            if (activeSubTab === 'pending' && !isPending) return false;
            if (activeSubTab === 'archived' && !isArchived) return false;

            // Role filtering
            if (roleFilter !== 'all' && bid.bidType !== roleFilter) return false;

            // Search query matching
            if (searchQuery.trim() !== '') {
                const query = searchQuery.toLowerCase();
                const nameMatch = bid.proName.toLowerCase().includes(query);
                const proposalMatch = (bid.proposal || '').toLowerCase().includes(query);
                if (!nameMatch && !proposalMatch) return false;
            }

            return true;
        });
    }, [allProposals, activeSubTab, roleFilter, searchQuery, project]);

    // Metric Summary Calculation
    const metrics = useMemo(() => {
        const getIsRoleFilled = (bid: any) => {
            return (bid.bidType === 'arsitek' && !!project.selected_arsitek_id && project.selected_arsitek_id !== bid.arsitek_id) ||
                   (bid.bidType === 'kontraktor' && !!project.selected_kontraktor_id && project.selected_kontraktor_id !== bid.kontraktor_id) ||
                   (bid.bidType === 'notaris' && !!project.selected_notaris_id && project.selected_notaris_id !== bid.notaris_id) ||
                   (bid.bidType === 'interior' && !!project.selected_interior_id && project.selected_interior_id !== bid.interior_id) ||
                   (bid.bidType === 'project_manager' && !!project.pm_id && project.pm_id !== bid.pm_id) ||
                   (bid.bidType === 'structural' && !!project.structural_id && project.structural_id !== bid.structural_id) ||
                   (bid.bidType === 'mep' && !!project.mep_id && project.mep_id !== bid.mep_id);
        };

        const total = allProposals.length;
        const pending = allProposals.filter(b => ['pending', 'invited'].includes(b.status) && !getIsRoleFilled(b)).length;
        const shortlisted = allProposals.filter(b => ['shortlisted', 'negotiating', 'contract_pending'].includes(b.status) && !getIsRoleFilled(b)).length;
        const active = allProposals.filter(b => ['awaiting_payment', 'accepted', 'active'].includes(b.status) || (
            (b.bidType === 'arsitek' && project.selected_arsitek_id && String(b.arsitek_id) === String(project.selected_arsitek_id)) ||
            (b.bidType === 'kontraktor' && project.selected_kontraktor_id && String(b.kontraktor_id) === String(project.selected_kontraktor_id)) ||
            (b.bidType === 'notaris' && project.selected_notaris_id && String(b.notaris_id) === String(project.selected_notaris_id)) ||
            (b.bidType === 'interior' && project.selected_interior_id && String(b.interior_id) === String(project.selected_interior_id)) ||
            (b.bidType === 'project_manager' && project.pm_id && String(b.pm_id) === String(project.pm_id)) ||
            (b.bidType === 'structural' && project.structural_id && String(b.structural_id) === String(project.structural_id)) ||
            (b.bidType === 'mep' && project.mep_id && String(b.mep_id) === String(project.mep_id))
        )).length;
        return { total, pending, shortlisted, active };
    }, [allProposals, project]);

    const tabCounts = useMemo(() => {
        const getIsRoleFilled = (bid: any) => {
            return (bid.bidType === 'arsitek' && !!project.selected_arsitek_id && project.selected_arsitek_id !== bid.arsitek_id) ||
                   (bid.bidType === 'kontraktor' && !!project.selected_kontraktor_id && project.selected_kontraktor_id !== bid.kontraktor_id) ||
                   (bid.bidType === 'notaris' && !!project.selected_notaris_id && project.selected_notaris_id !== bid.notaris_id) ||
                   (bid.bidType === 'interior' && !!project.selected_interior_id && project.selected_interior_id !== bid.interior_id) ||
                   (bid.bidType === 'project_manager' && !!project.pm_id && project.pm_id !== bid.pm_id) ||
                   (bid.bidType === 'structural' && !!project.structural_id && project.structural_id !== bid.structural_id) ||
                   (bid.bidType === 'mep' && !!project.mep_id && project.mep_id !== bid.mep_id);
        };

        const pendingCount = allProposals.filter(b => ['pending', 'invited'].includes(b.status) && !getIsRoleFilled(b)).length;
        const archivedCount = allProposals.filter(b => ['rejected', 'declined', 'cancelled', 'accepted', 'active', 'awaiting_payment'].includes(b.status) || getIsRoleFilled(b)).length;

        const roles = [
            { key: 'design', bids: project.bids_arsitek || [] },
            { key: 'build', bids: project.bids_kontraktor || [] },
            { key: 'legal', bids: project.bids_notaris || [] },
            { key: 'interior', bids: project.bids_interior || [] },
            { key: 'management', bids: project.bids_project_manager || [] },
            { key: 'engineering', bids: [...(project.bids_structural || []), ...(project.bids_mep || [])] },
        ];

        const interviewStatuses = ['shortlisted', 'invited', 'negotiating', 'contract_pending'];
        const isHiredPM = project.pm_id && (user?.project_manager?.id === project.pm_id || user?.id === project.pm_id);
        
        const isHiredArsitek = (user?.role_type === 'arsitek') && (
            (project.selected_arsitek_id && user?.arsitek?.id === project.selected_arsitek_id) ||
            (project.arsitek?.user_id === user?.id) ||
            (project.arsitek?.user?.id === user?.id)
        );

        let interviewsCount = 0;
        roles.forEach(role => {
            role.bids.forEach((bid: any) => {
                const isRoleFilledBySomeoneElse = 
                    (role.key === 'design' && !!project.selected_arsitek_id && project.selected_arsitek_id !== bid.arsitek_id) ||
                    (role.key === 'build' && !!project.selected_kontraktor_id && project.selected_kontraktor_id !== bid.kontraktor_id) ||
                    (role.key === 'legal' && !!project.selected_notaris_id && project.selected_notaris_id !== bid.notaris_id) ||
                    (role.key === 'interior' && !!project.selected_interior_id && project.selected_interior_id !== bid.interior_id) ||
                    (role.key === 'management' && !!project.pm_id && project.pm_id !== bid.pm_id) ||
                    (role.key === 'engineering' && (
                        bid.structural_id 
                            ? (!!project.structural_id && project.structural_id !== bid.structural_id)
                            : (!!project.mep_id && project.mep_id !== bid.mep_id)
                    ));

                if (interviewStatuses.includes(bid.status) && !isRoleFilledBySomeoneElse) {
                    if (!isOwner && !isHiredPM) {
                        const proId = bid.bidder?.id || bid.bidder_id || bid.arsitek_id || bid.kontraktor_id || bid.notaris_id || bid.interior_id || bid.pm_id || bid.structural_id || bid.mep_id;
                        const proUserId = bid.bidder?.user?.id || bid.bidder?.user_id || bid.user_id || bid.arsitek?.user_id || bid.kontraktor?.user_id || bid.notaris?.user_id || bid.interior?.user_id || bid.pm_id || bid.structural_engineer?.user_id || bid.mep_engineer?.user_id;
                        
                        const isOwnBid = (user?.id === proUserId) || (
                            (role.key === 'design' && user?.arsitek?.id === proId) ||
                            (role.key === 'build' && user?.kontraktor?.id === proId) ||
                            (role.key === 'legal' && user?.notaris_profile?.id === proId) ||
                            (role.key === 'engineering' && (user?.structural_engineer?.id === proId || user?.mep_engineer?.id === proId)) ||
                            (role.key === 'interior' && user?.interior_profile?.id === proId) ||
                            (role.key === 'management' && user?.project_manager?.id === proId)
                        );
                        const isSpecialist = role.key === 'engineering';

                        if (isHiredArsitek && isSpecialist) {
                            // Allow lead architect
                        } else if (!isOwnBid) {
                            return;
                        }
                    }
                    interviewsCount++;
                }
            });
        });

        const pmRoles = [
            { key: 'design', bids: project.bids_arsitek || [], roleType: 'arsitek' },
            { key: 'build', bids: project.bids_kontraktor || [], roleType: 'kontraktor' },
            { key: 'legal', bids: project.bids_notaris || [], roleType: 'notaris' },
            { key: 'interior', bids: project.bids_interior || [], roleType: 'interior' },
            { key: 'management', bids: project.bids_project_manager || [], roleType: 'project_manager' },
            { key: 'engineering', bids: (project.bids_structural || []).concat(project.bids_mep || []), roleType: 'engineering' },
        ];

        const isProjectPM = user?.id && project?.pm_id && String(user.id) === String(project.pm_id);
        const isGlobalPM = user?.role_type === 'project_manager';

        const finalPaymentsGroups = [];
        const paymentRoleTypesSeen = new Set<string>();

        pmRoles.forEach(role => {
            const roleBids = role.bids && Array.isArray(role.bids) ? role.bids : [];
            roleBids.forEach((bid: any) => {
                const isSignedByPro = !!bid.pro_signature_url;
                const isSignedByClient = !!bid.client_signature_url;
                const isReadyForPayment = ['accepted', 'awaiting_payment', 'active', 'completed'].includes(bid.status) && 
                    (!isSignedByPro || isSignedByClient);

                if (isReadyForPayment) {
                    const bidProId = bid.bidder?.user?.id ? String(bid.bidder.user.id) : null;
                    const isProForThisGroup = user?.id && bidProId && String(user.id) === bidProId;
                    const hasAccess = isOwner || isProForThisGroup || isProjectPM || isGlobalPM;

                    if (hasAccess) {
                        finalPaymentsGroups.push(bid);
                        paymentRoleTypesSeen.add(role.roleType);
                    }
                }
            });
        });

        if (project.addendums && Array.isArray(project.addendums)) {
            project.addendums.forEach((addendum: any) => {
                if (Number(addendum.amount) <= 0) return;
                if (addendum.status === 'approved_unpaid' || addendum.status === 'verifying' || addendum.status === 'paid') {
                    const isSpecialistSelf = user?.role_type === addendum.role_type || (addendum.assigned_user_id && user?.id === addendum.assigned_user_id);
                    const targetRoleType = (isSpecialistSelf)
                        ? addendum.role_type
                        : ((addendum.role_type === 'structural' || addendum.role_type === 'mep' || addendum.role_type === 'interior')
                            ? 'arsitek'
                            : addendum.role_type);

                    if (!paymentRoleTypesSeen.has(targetRoleType)) {
                        const proUserId = addendum.assigned_user_id || addendum.user_id;
                        const isProForThisGroup = user?.id && proUserId && String(user.id) === String(proUserId);
                        const hasAccess = isOwner || isProForThisGroup || isProjectPM || isGlobalPM;

                        if (hasAccess) {
                            finalPaymentsGroups.push(addendum);
                            paymentRoleTypesSeen.add(targetRoleType);
                        }
                    }
                }
            });
        }

        const paymentsCount = finalPaymentsGroups.length;

        return {
            pending: pendingCount,
            interviews: interviewsCount,
            payments: paymentsCount,
            archived: archivedCount
        };
    }, [allProposals, project, user, isOwner]);

    const ROLE_LABELS = [
        { value: 'all', label: 'All Roles' },
        { value: 'arsitek', label: 'Architect' },
        { value: 'kontraktor', label: 'Contractor' },
        { value: 'project_manager', label: 'Project Manager' },
        { value: 'interior', label: 'Interior Designer' },
        { value: 'structural', label: 'Structural Engineer' },
        { value: 'mep', label: 'MEP Specialist' },
        { value: 'notaris', label: 'Notary' },
    ];

    const showFilters = activeSubTab === 'pending' || activeSubTab === 'archived';

    return (
        <div className="space-y-6">
            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-white px-5 py-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-zinc-50 text-zinc-600 flex items-center justify-center shrink-0">
                        <Briefcase size={18} />
                    </div>
                    <div>
                        <span className="text-[10px] text-gray-400 font-bold block uppercase tracking-wide">Total Submissions</span>
                        <span className="text-xl font-black text-gray-955 mt-0.5 block">{metrics.total} Proposal{metrics.total !== 1 ? 's' : ''}</span>
                    </div>
                </div>

                <div className="bg-white px-5 py-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                        <Users size={18} />
                    </div>
                    <div>
                        <span className="text-[10px] text-gray-400 font-bold block uppercase tracking-wide">Awaiting Review</span>
                        <span className="text-xl font-black text-gray-955 mt-0.5 block">{metrics.pending} Pending Bids</span>
                    </div>
                </div>

                <div className="bg-white px-5 py-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <ListChecks size={18} />
                    </div>
                    <div>
                        <span className="text-[10px] text-gray-400 font-bold block uppercase tracking-wide">In Interviews</span>
                        <span className="text-xl font-black text-gray-955 mt-0.5 block">{metrics.shortlisted} Candidates</span>
                    </div>
                </div>

                <div className="bg-white px-5 py-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <CreditCard size={18} />
                    </div>
                    <div>
                        <span className="text-[10px] text-gray-400 font-bold block uppercase tracking-wide">Hired / Active</span>
                        <span className="text-xl font-black text-gray-955 mt-0.5 block">{metrics.active} Professionals</span>
                    </div>
                </div>
            </div>

            {/* Filter and Search Controls / Sub Tabs */}
            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col lg:flex-row gap-4 items-center justify-between">
                {/* Sub Tab Filter Buttons */}
                <div className="flex bg-gray-50 p-1 rounded-2xl border border-gray-100 shrink-0 w-full lg:w-auto overflow-x-auto">
                    {(['pending', 'interviews', 'archived'] as const).map(tab => {
                        const count = tabCounts[tab];
                        const label = tab === 'pending' ? 'Pending Bids' : tab === 'interviews' ? 'Interviews' : 'Archived';
                        return (
                            <button
                                key={tab}
                                onClick={() => setActiveSubTab(tab)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                    activeSubTab === tab 
                                    ? 'bg-white text-zinc-955 shadow-sm font-black' 
                                    : 'text-gray-400 hover:text-gray-700'
                                }`}
                            >
                                <span>{label}</span>
                                {count > 0 && (
                                    <span className={`px-1.5 py-0.5 text-[9px] font-black rounded-md ${
                                        activeSubTab === tab
                                        ? 'bg-slate-900 text-white'
                                        : 'bg-gray-200 text-gray-600'
                                    }`}>
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {showFilters && (
                    <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto items-center">
                        {/* Search Bar */}
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                            <input
                                type="text"
                                placeholder="Search proposals..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-11 pr-5 py-2 bg-gray-50 border border-gray-150 rounded-2xl text-xs font-semibold placeholder:text-gray-400 outline-none focus:bg-white focus:border-red-500 transition-all"
                            />
                        </div>

                        {/* Category Selector */}
                        <div className="relative w-full sm:w-44 shrink-0 flex items-center gap-2">
                            <Filter size={13} className="text-gray-400" />
                            <select
                                value={roleFilter}
                                onChange={(e) => setRoleFilter(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-150 rounded-2xl text-xs font-bold text-gray-700 outline-none cursor-pointer hover:bg-gray-100/60 focus:bg-white transition-all"
                            >
                                {ROLE_LABELS.map(role => (
                                    <option key={role.value} value={role.value}>
                                        {role.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* Content Area depends on Active Sub Tab */}
            <div className="space-y-6">
                <AnimatePresence mode="wait">
                    {activeSubTab === 'interviews' && (
                        <motion.div key="interviews" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                            <ProjectInterviews 
                                project={project} 
                                onRefresh={onRefresh}
                                onOpenChat={onOpenChat}
                                onRecommend={onRecommend}
                            />
                        </motion.div>
                    )}



                    {showFilters && (
                        <motion.div key={activeSubTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                            {filteredProposals.length > 0 ? (
                                <div className="grid grid-cols-1 gap-6">
                                    {filteredProposals.map(bid => (
                                        <div key={bid.id} className="relative">
                                            {/* Role Header Accent Badge */}
                                            <div className="absolute -top-3 left-6 px-4 py-1 bg-zinc-900 text-white text-[9px] font-black uppercase tracking-widest rounded-full z-10 shadow-lg flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                                                {bid.roleLabel}
                                            </div>

                                            <BidReviewCard
                                                bid={bid}
                                                phaseKey={bid.phaseKey}
                                                bidType={bid.bidType}
                                                onAction={handleAction}
                                                isActioning={actioningId === bid.id}
                                                isPM={bid.phaseKey === 'management'}
                                                readOnly={isOwner && !!project.pm_id && bid.phaseKey !== 'management'}
                                                onOpenChat={onOpenChat}
                                                onRefresh={onRefresh}
                                                projectId={project.id}
                                                project={project}
                                            />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-24 bg-white border border-gray-100 rounded-[3rem] flex flex-col items-center justify-center text-center shadow-sm">
                                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center text-gray-200 mb-4">
                                        <ListChecks size={40} />
                                    </div>
                                    <h3 className="text-gray-400 font-black text-xl">No Proposals Found</h3>
                                    <p className="text-gray-300 text-xs mt-2 max-w-xs uppercase tracking-widest font-bold leading-relaxed">
                                        No bids matched your current filters. Check another tab or wait for professionals to submit proposals.
                                    </p>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <ConfirmModal
                isOpen={confirmState.isOpen}
                title={confirmState.title}
                description={confirmState.description}
                variant={confirmState.variant}
                onConfirm={executeConfirmAction}
                onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
                isLoading={actioningId !== null}
            />
        </div>
    );
}
