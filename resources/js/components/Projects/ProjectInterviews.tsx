import React, { useMemo, useState } from 'react';
import { Users, Info, MessageCircle, ExternalLink, Check, ListChecks } from 'lucide-react';
import { BidReviewCard } from './Phases/BidReviewCard';
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
        const activeStatuses = ['shortlisted', 'invited', 'negotiating', 'contract_pending', 'awaiting_payment', 'accepted', 'active'];
        
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
                if (activeStatuses.includes(bid.status)) {
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
                    all.push({ ...bid, phaseKey: role.key });
                }
            });
        });
        return all;
    }, [project, user?.id]);

    const handleAction = async (bidId: number, action: 'shortlist' | 'accept' | 'decline' | 'recommend') => {
        const isArchitect = user?.role_type === 'arsitek';
        const currentBid = interviewBids.find(b => b.id === bidId);
        const isSpecialist = currentBid?.phaseKey === 'engineering';

        if (action === 'recommend' || (action === 'accept' && isArchitect && isSpecialist)) {
            const bid = interviewBids.find(b => b.id === bidId);
            if (bid && onRecommend) {
                const role = bid.structural_id ? 'structural' : 'mep';
                
                if (action === 'accept') {
                    if (!window.confirm("Are you sure you want to accept terms and recommend this specialist?")) return;
                    
                    try {
                        await axios.post(`/projects/${project.id}/bids/${bidId}/confirm-fee`, {
                            bid_type: role
                        });
                        showToast("Terms accepted. Now you can recommend this specialist.", "success");
                    } catch (err: any) {
                        showToast(err.response?.data?.message || "Action failed", "error");
                        return;
                    }
                }
                
                onRecommend(bidId, role);
            }
            return;
        }
        
        setActioningId(bidId);
        try {
            const isPMBidding = currentBid?.phaseKey === 'management';
            
            const isPM = user?.role_type === 'project_manager' && project.pm_id === user.id;
            
            let endpoint: string;
            if (action === 'accept') {
                const confirmMsg = isPM && !isPMBidding
                    ? "Are you sure you want to approve these terms and recommend this professional to the owner?"
                    : "Are you sure you want to hire this professional? This will allocate budget and finalize the contract.";

                if (!window.confirm(confirmMsg)) {
                    setActioningId(null);
                    return;
                }

                if (isPM && !isPMBidding) {
                    endpoint = `bids/${bidId}/confirm-fee`;
                } else {
                    endpoint = isPMBidding ? `pm-bids/${bidId}/accept` : 'accept-bid';
                }
            } else {
                if (!window.confirm("Are you sure you want to decline this professional?")) {
                    setActioningId(null);
                    return;
                }
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

                // For confirm-fee, bid_type is also needed
                await axios.post(`/projects/${project.id}/${endpoint}`, postData);
            }

            showToast(action === 'accept' ? (isPM && !isPMBidding ? 'Professional recommended to owner!' : 'Professional hired!') : 'Proposal declined.', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Action failed', 'error');
        } finally {
            setActioningId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-amber-50 border border-amber-100 rounded-[2rem] p-6 flex items-start gap-4 shadow-sm">
                <div className="p-3 bg-amber-100 text-amber-700 rounded-2xl">
                    <Info size={24} />
                </div>
                <div>
                    <h3 className="text-amber-900 font-black text-lg">Interview Workspace</h3>
                    <p className="text-amber-700 text-sm font-medium leading-relaxed max-w-2xl mt-1">
                        Review and chat with your shortlisted candidates. Use the internal chat or WhatsApp to discuss terms. 
                        Once you're satisfied, click "Hire" to finalize.
                    </p>
                </div>
            </div>

            {interviewBids.length > 0 ? (
                <div className="grid grid-cols-1 gap-6">
                    {interviewBids.map(bid => (
                        <div key={bid.id} className="relative">
                            <div className="absolute -top-3 left-6 px-4 py-1 bg-zinc-900 text-white text-[10px] font-black uppercase tracking-widest rounded-full z-10 shadow-lg">
                                {bid.phaseKey}
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
        </div>
    );
}
