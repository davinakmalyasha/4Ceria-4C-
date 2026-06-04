import React, { useMemo } from 'react';
import { Info } from 'lucide-react';
import { Phase } from '../../../types/phase.types';
import SummaryProCard from './SummaryProCard';
import SummaryFinancials from './SummaryFinancials';
import SummaryTerminList from './SummaryTerminList';
import PhaseBidsList from './PhaseBidsList';

interface PhaseReadOnlySummaryProps {
    phase: Phase;
    project: any;
    currentRoleKey: string;
    currentHasPro: boolean;
    isPublished: boolean;
    currentBids?: any[];
    onOpenChat?: (user: any) => void;
    onRefresh?: () => void;
}

export default function PhaseReadOnlySummary({
    phase, project, currentRoleKey, currentHasPro, isPublished, currentBids, onOpenChat, onRefresh
}: PhaseReadOnlySummaryProps) {
    const acceptedBid = useMemo(() => {
        if (!currentBids) return null;
        return currentBids.find((b: any) => 
            ['accepted', 'contract_pending', 'active', 'awaiting_payment'].includes(b.status)
        );
    }, [currentBids]);

    const pro = useMemo(() => {
        const proKeyMap: Record<string, string> = {
            project_manager: 'project_manager',
            notaris: 'notaris',
            arsitek: 'arsitek',
            kontraktor: 'kontraktor',
            interior: 'interior',
            structural: 'structural_engineer',
            mep: 'mep_engineer',
        };
        const key = proKeyMap[currentRoleKey];
        return (key && project?.[key]) || acceptedBid?.bidder || acceptedBid?.structural_engineer || acceptedBid?.mep_engineer || acceptedBid?.pm;
    }, [currentRoleKey, project, acceptedBid]);

    const termins = useMemo(() => {
        return (project?.payment_termins || []).filter((t: any) => t.role_type === currentRoleKey);
    }, [project?.payment_termins, currentRoleKey]);

    const roleLabels: Record<string, string> = {
        project_manager: 'Project Manager',
        notaris: 'Notary Legal Specialist',
        arsitek: 'Architectural Designer',
        kontraktor: 'Lead Contractor',
        interior: 'Interior Designer',
        structural: 'Structural Engineer',
        mep: 'MEP Specialist',
    };

    const pendingBids = useMemo(() => {
        if (!currentBids) return [];
        return currentBids.filter(b => ['pending', 'invited'].includes(b.status));
    }, [currentBids]);

    return (
        <div className="space-y-6">
            {currentHasPro ? (
                <>
                    <SummaryProCard pro={pro} roleLabel={roleLabels[currentRoleKey] || 'Professional'} onOpenChat={onOpenChat} />
                    <SummaryFinancials termins={termins} />
                    <SummaryTerminList termins={termins} />
                </>
            ) : (
                <div className="space-y-6">
                    <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-8 text-center space-y-3">
                        <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center mx-auto shadow-inner">
                            <Info size={24} />
                        </div>
                        <div className="space-y-1">
                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Phase Managed by PM</h4>
                            <p className="text-xs text-slate-500 font-medium max-w-md mx-auto leading-relaxed">
                                {isPublished 
                                    ? "This phase is published. The Project Manager handles shortlisting and selection."
                                    : "The Project Manager is preparing to broadcast this phase to the bidding board."}
                            </p>
                        </div>
                    </div>

                    {pendingBids.length > 0 && (
                        <div className="mt-8 pt-6 border-t border-slate-100 space-y-4">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Submitted Proposals</h4>
                            <PhaseBidsList
                                bids={currentBids || []}
                                phaseKey={phase.key}
                                projectId={project.id}
                                onRefresh={onRefresh || (() => {})}
                                readOnly={true}
                                onOpenChat={onOpenChat}
                                projectContext={project}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
