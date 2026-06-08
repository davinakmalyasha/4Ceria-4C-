import React, { useMemo, useState } from 'react';
import { Users, Info, MessageCircle, ExternalLink, Check, ListChecks } from 'lucide-react';
import { BidReviewCard } from './Phases/BidReviewCard';
import ConfirmModal from './ConfirmModal';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

interface ProjectInterviewsProps {
    project: any;
    onRefresh: () => void;
    onOpenChat: (user: any) => void;
    onRecommend?: (subId: number, role: 'structural' | 'mep') => void;
}

export default function ProjectInterviews({ project, onRefresh, onOpenChat, onRecommend }: ProjectInterviewsProps) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [actioningId, setActioningId] = useState<number | null>(null);
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

    // Filter all relevant bids (shortlisted, invited, negotiating)
    const interviewBids = useMemo(() => {
        const roles = [
            { key: 'design', bids: project.bids_arsitek || [] },
            { key: 'build', bids: project.bids_kontraktor || [] },
            { key: 'legal', bids: project.bids_notaris || [] },
            { key: 'interior', bids: project.bids_interior || [] },
            { key: 'management', bids: project.bids_project_manager || [] },
            { key: 'engineering', bids: [...(project.bids_structural || []), ...(project.bids_mep || [])] },
        ];

        const all: any[] = [];
        const activeStatuses = ['shortlisted', 'invited', 'negotiating', 'contract_pending'];
        
        const isOwner = user?.id === project.user_id;
        const isHiredPM = project.pm_id && (user?.project_manager?.id === project.pm_id || user?.id === project.pm_id);
        
        // Robust Architect Identification
        const isHiredArsitek = (user?.role_type === 'arsitek') && (
            (project.selected_arsitek_id && user?.arsitek?.id === project.selected_arsitek_id) ||
            (project.arsitek?.user_id === user?.id) ||
            (project.arsitek?.user?.id === user?.id)
        );

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

                if (activeStatuses.includes(bid.status) && !isRoleFilledBySomeoneElse) {
                    // Privacy Filter: 
                    // Owners & PMs see EVERYTHING.
                    // Hired Architects see their own bids AND specialists (engineering).
                    // Others only see their OWN bid.
                    if (!isOwner && !isHiredPM) {
                        const proId = bid.bidder?.id || bid.bidder_id || bid.arsitek_id || bid.kontraktor_id || bid.notaris_id || bid.interior_id || bid.pm_id || bid.structural_id || bid.mep_id;
                        const proUserId = bid.bidder?.user?.id || bid.bidder?.user_id || bid.user_id || bid.arsitek?.user_id || bid.kontraktor?.user_id || bid.notaris?.user_id || bid.interior?.user_id || bid.pm_id || bid.structural_engineer?.user_id || bid.mep_engineer?.user_id;
                        
                        // Check if the current user is the professional of THIS bid
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
                            // Allow lead architect to see specialists
                        } else if (!isOwnBid) {
                            return;
                        }
                    }
                    const getRoleLabel = (b: any, key: string) => {
                        if (key === 'design') return 'Architect';
                        if (key === 'build') return 'Contractor';
                        if (key === 'legal') return 'Notary';
                        if (key === 'interior') return 'Interior Designer';
                        if (key === 'management') return 'Project Manager';
                        if (key === 'engineering') return b.structural_id ? 'Structural Engineer' : 'MEP Specialist';
                        return 'Professional';
                    };
                    all.push({ ...bid, phaseKey: role.key, roleLabel: getRoleLabel(bid, role.key) });
                }
            });
        });
        return all;
    }, [project, user?.id]);

    const handleAction = async (bidId: number, action: 'shortlist' | 'accept' | 'decline' | 'recommend') => {
        const currentBid = interviewBids.find(b => b.id === bidId);
        if (!currentBid) return;

        let title = '';
        let description = '';
        let variant: 'info' | 'success' | 'danger' = 'info';

        if (action === 'recommend') {
            if (onRecommend) {
                const role = currentBid.structural_id ? 'structural' : 'mep';
                onRecommend(bidId, role);
            }
            return;
        }

        if (action === 'accept') {
            const isArchitect = user?.role_type === 'arsitek';
            const isSpecialist = currentBid.phaseKey === 'engineering';
            const isPM = user?.role_type === 'project_manager';

            if (isArchitect && isSpecialist) {
                title = 'Recommend Specialist';
                description = 'Are you sure you want to accept terms and recommend this specialist?';
            } else if (isPM) {
                title = 'Recommend Professional';
                description = 'Are you sure you want to recommend this professional to the owner? This will forward the terms to the owner for final approval.';
            } else {
                title = 'Hire Professional';
                description = 'Are you sure you want to hire this professional? This will generate the contract for their signature.';
            }
            variant = 'success';
        } else if (action === 'decline') {
            title = 'Decline Professional';
            description = 'Are you sure you want to decline this professional?';
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
            const currentBid = interviewBids.find(b => b.id === bidId);
            if (!currentBid) return;

            const isArchitect = user?.role_type === 'arsitek';
            const isSpecialist = currentBid.phaseKey === 'engineering';

            if (action === 'accept' && isArchitect && isSpecialist) {
                const role = currentBid.structural_id ? 'structural' : 'mep';
                try {
                    await axios.post(`/projects/${project.id}/bids/${bidId}/confirm-fee`, {
                        bid_type: role
                    });
                    showToast("Terms accepted. Now you can recommend this specialist.", "success");
                    if (onRecommend) {
                        onRecommend(bidId, role);
                    }
                } catch (err: any) {
                    showToast(err.response?.data?.message || "Action failed", "error");
                } finally {
                    setActioningId(null);
                }
                return;
            }

            const isPMBidding = currentBid.phaseKey === 'management';
            let endpoint: string;
            if (action === 'accept') {
                endpoint = isPMBidding ? `pm-bids/${bidId}/accept` : 'accept-bid';
            } else {
                endpoint = isPMBidding ? `pm-bids/${bidId}/decline` : 'decline-bid';
            }

            if (isPMBidding) {
                await axios.post(`/projects/${project.id}/${endpoint}`);
            } else {
                const bidTypeMap: any = {
                    design: 'arsitek',
                    build: 'kontraktor',
                    legal: 'notaris',
                    interior: 'interior',
                    engineering: currentBid.structural_id ? 'structural' : 'mep'
                };

                const postData: any = {
                    bid_id: bidId,
                    bid_type: bidTypeMap[currentBid.phaseKey]
                };

                await axios.post(`/projects/${project.id}/${endpoint}`, postData);
            }

            showToast(
                action === 'accept' 
                    ? (user?.role_type === 'project_manager' ? 'Successfully recommended to the owner!' : 'Professional hired!') 
                    : 'Proposal declined.', 
                'success'
            );
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Action failed', 'error');
        } finally {
            setActioningId(null);
        }
    };

    return (
        <div className="space-y-6">
            {interviewBids.length > 0 ? (
                <div className="grid grid-cols-1 gap-6">
                    {interviewBids.map(bid => (
                        <div key={bid.id} className="relative">
                            <div className="absolute -top-3 left-6 px-4 py-1 bg-zinc-900 text-white text-[9px] font-black uppercase tracking-widest rounded-full z-10 shadow-lg flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                                {bid.roleLabel}
                            </div>
                            <BidReviewCard 
                                bid={bid}
                                phaseKey={bid.phaseKey}
                                onAction={handleAction}
                                isActioning={actioningId === bid.id}
                                isPM={bid.phaseKey === 'management'}
                                onOpenChat={onOpenChat}
                                onRefresh={onRefresh}
                                projectId={project.id}
                                project={project}
                            />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="py-20 border-2 border-dashed border-gray-100 rounded-[3rem] flex flex-col items-center justify-center text-center">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center text-gray-200 mb-4">
                        <Users size={40} />
                    </div>
                    <h3 className="text-gray-400 font-black text-xl">No Active Interviews</h3>
                    <p className="text-gray-300 text-sm mt-2 max-w-xs uppercase tracking-widest font-bold">
                        Shortlist professionals from the "Process" tab to start interviewing.
                    </p>
                </div>
            )}

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
