import React, { useState } from 'react';
import { PhaseKey } from '../../../types/phase.types';
import axios from 'axios';
import { useToast } from '../../../context/ToastContext';
import { BidReviewCard } from './BidReviewCard';

interface PhaseBidsListProps {
    bids: any[];
    phaseKey: PhaseKey;
    projectId: number;
    onRefresh: () => void;
    isPMBidding?: boolean;
    readOnly?: boolean;
    projectContext?: any;
    onOpenChat?: (user: any) => void;
    overrideType?: 'structural' | 'mep' | string;
    onRecommend?: (bidId: number, role: string) => void;
    onSwitchTab?: (tab: 'interviews') => void;
}

const getBidType = (phaseKey: PhaseKey, isPMBidding?: boolean, overrideType?: string) => {
    if (overrideType) return overrideType;
    if (isPMBidding) return 'project_manager';
    switch(phaseKey) {
        case 'design': return 'arsitek';
        case 'build': return 'kontraktor';
        case 'legal': return 'notaris';
        case 'interior': return 'interior';
        case 'engineering': return 'structural'; // Default
        default: return '';
    }
};

export default function PhaseBidsList({ bids, phaseKey, projectId, onRefresh, isPMBidding, readOnly, projectContext, onOpenChat, overrideType, onRecommend, onSwitchTab }: PhaseBidsListProps) {
    const { showToast } = useToast();
    const [actioningId, setActioningId] = useState<number | null>(null);

    // Bids that are shortlisted, negotiating, or hired are moved to the "Interviews" or "Payments" tabs
    const visibleBids = bids.filter(b => ['pending', 'invited'].includes(b.status));

    const handleAction = async (bidId: number, action: 'shortlist' | 'accept' | 'decline' | 'recommend') => {
        if (!projectId || !bidId) {
            showToast("Critical Error: Missing Project or Bid ID. Please refresh.", "error");
            return;
        }

        if (action === 'recommend') {
            const role = getBidType(phaseKey, isPMBidding, overrideType);
            onRecommend?.(bidId, role);
            return;
        }

        if (action === 'accept') {
            const currentBid = bids.find(b => b.id === bidId);
            const budgetAmount = projectContext?.budget || 0;
            const bidType = getBidType(phaseKey, isPMBidding, overrideType);

            if (bidType === 'project_manager' && currentBid && budgetAmount > 0) {
                const amount = currentBid.fee_type === 'percentage' && currentBid.calculated_total 
                    ? Number(currentBid.calculated_total) 
                    : Number(currentBid.price);
                const perc = currentBid.fee_type === 'percentage' 
                    ? currentBid.price 
                    : ((amount / budgetAmount) * 100).toFixed(1);

                const confirmMsg = `FINANCIAL GUARDIAN WARNING:\n\nHiring this Project Manager will allocate Rp ${amount.toLocaleString('id-ID')} (${perc}% of your budget) for professional management services.\n\nThis will be atomically deducted from your Project Budget. Proceed?`;
                if (!window.confirm(confirmMsg)) return;
            } else if (bidType === 'notaris' && currentBid && budgetAmount > 0) {
                const proFee = currentBid.fee_percentage 
                    ? (budgetAmount * (Number(currentBid.fee_percentage) / 100)) 
                    : Number(currentBid.price);
                const taxEst = Number(currentBid.tax_estimate) || 0;
                const totalImpact = proFee + taxEst;

                const confirmMsg = `FINANCIAL GUARDIAN WARNING:\n\n` +
                    `Hiring this Notary will deduct the following from your budget:\n` +
                    `- Professional Fee: Rp ${proFee.toLocaleString('id-ID')}\n` +
                    `- Government Tax Est: Rp ${taxEst.toLocaleString('id-ID')}\n\n` +
                    `Total Impact: Rp ${totalImpact.toLocaleString('id-ID')}\n\n` +
                    `This will be atomically allocated from your Project Budget. Proceed?`;
                if (!window.confirm(confirmMsg)) return;
            } else {
                if (!window.confirm(`Are you sure you want to hire this professional?`)) return;
            }
        } else if (action === 'shortlist') {
            if (!window.confirm(`Shortlist this professional for interview? You can chat and discuss terms before committing to hire.`)) return;
        } else {
            if (!window.confirm(`Are you sure you want to decline this proposal?`)) return;
        }
        
        setActioningId(bidId);
        try {
            let endpoint: string;
            if (action === 'shortlist') {
                if (isPMBidding) {
                    endpoint = `pm-bids/${bidId}/shortlist`;
                } else {
                    endpoint = 'shortlist-bid';
                }
            } else if (action === 'accept') {
                endpoint = isPMBidding ? `pm-bids/${bidId}/accept` : 'accept-bid';
            } else {
                endpoint = isPMBidding ? `pm-bids/${bidId}/decline` : 'decline-bid';
            }

            if (isPMBidding) {
                await axios.post(`/projects/${projectId}/${endpoint}`);
            } else {
                await axios.post(`/projects/${projectId}/${endpoint}`, {
                    bid_id: bidId,
                    bid_type: getBidType(phaseKey, isPMBidding, overrideType)
                });
            }

            const toastMsg = action === 'shortlist' 
                ? 'Professional shortlisted! You can now discuss terms.' 
                : action === 'accept' 
                    ? 'Professional hired successfully!' 
                    : 'Proposal declined.';
            showToast(toastMsg, action === 'decline' ? 'info' : 'success');
            onRefresh();
            if (action === 'shortlist' && onSwitchTab) {
                onSwitchTab('interviews');
            }
        } catch (error: any) {
            console.error(`Failed to ${action} bid`, error);
            const errorMsg = error.response?.data?.error || error.response?.data?.message || `Failed to ${action} proposal.`;
            showToast(errorMsg, 'error');
        } finally {
            setActioningId(null);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                    {visibleBids.length} Candidate{visibleBids.length > 1 ? 's' : ''} Active
                </p>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
                {visibleBids.map((bid: any) => (
                    <BidReviewCard 
                        key={bid.id}
                        bid={bid}
                        phaseKey={phaseKey}
                        onAction={handleAction}
                        isActioning={actioningId === bid.id}
                        isPM={isPMBidding}
                        readOnly={readOnly}
                        onOpenChat={onOpenChat}
                        projectId={projectId}
                        onRefresh={onRefresh}
                        project={projectContext}
                    />
                ))}
            </div>

            {bids.length === 0 && (
                <div className="py-12 border-2 border-dashed border-gray-100 rounded-[2rem] flex flex-col items-center justify-center text-center">
                    <p className="text-sm font-bold text-gray-400">No proposals yet</p>
                    <p className="text-[10px] text-gray-300 uppercase tracking-widest mt-1">Waiting for professional bids...</p>
                </div>
            )}
        </div>
    );
}
