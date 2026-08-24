import React, { useMemo } from 'react';
import { Info, FolderOpen, FileText, Download } from 'lucide-react';
import { Phase } from '../../../types/phase.types';
import SummaryProCard from './SummaryProCard';
import SummaryFinancials from './SummaryFinancials';
import SummaryTerminList from './SummaryTerminList';
import PhaseBidsList from './PhaseBidsList';
import SummaryProBento from './SummaryProBento';

interface PhaseReadOnlySummaryProps {
    phase: Phase;
    project: any;
    currentRoleKey: string;
    currentHasPro: boolean;
    isPublished: boolean;
    currentBids?: any[];
    onOpenChat?: (user: any) => void;
    onRefresh?: () => void;
    user: any;
}

export default function PhaseReadOnlySummary({
    phase, project, currentRoleKey, currentHasPro, isPublished, currentBids, onOpenChat, onRefresh, user
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

    const showFinancials = useMemo(() => {
        if (!user) return false;
        const isOwner = user.id === project?.user_id;
        const isHiredPM = project?.pm_id && user.id === project?.pm_id;
        const isSelf = user.role_type === currentRoleKey || (
            (currentRoleKey === 'structural' && user.role_type === 'structural') ||
            (currentRoleKey === 'mep' && user.role_type === 'mep')
        );
        return isOwner || isHiredPM || isSelf;
    }, [user, project, currentRoleKey]);

    const subDocs = useMemo(() => {
        const categoryMap: Record<string, string> = {
            structural: 'structural_calc',
            mep: 'mep_layout',
            interior: 'interior_design',
            arsitek: 'blueprint',
        };
        const cat = categoryMap[currentRoleKey];
        if (!cat) return [];
        return (project?.documents || []).filter((d: any) => d.category === cat);
    }, [project?.documents, currentRoleKey]);

    return (
        <div className="space-y-6">
            {currentHasPro ? (
                <>
                    <SummaryProCard pro={pro} roleLabel={roleLabels[currentRoleKey] || 'Professional'} onOpenChat={onOpenChat} />
                    {showFinancials ? (
                        <>
                            <SummaryFinancials termins={termins} />
                            <SummaryTerminList termins={termins} />
                        </>
                    ) : (
                        <SummaryProBento termins={termins} roleLabel={roleLabels[currentRoleKey] || 'Professional'} pro={pro} />
                    )}

                    {/* Deliverables / Documents List */}
                    {['structural', 'mep', 'interior', 'arsitek'].includes(currentRoleKey) && (
                        <div className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 bg-slate-50 text-slate-600 rounded-2xl flex items-center justify-center border border-slate-100">
                                    <FolderOpen size={18} />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-slate-950 uppercase tracking-tight">
                                        {roleLabels[currentRoleKey] || 'Professional'} Deliverables
                                    </h4>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                        Uploaded drawings and technical documents
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {subDocs.length > 0 ? (
                                    subDocs.map((doc: any) => (
                                        <a 
                                            key={doc.id}
                                            href={doc.file_path}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex justify-between items-center px-5 py-4 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-all border border-slate-100 group min-w-0"
                                        >
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <FileText size={18} className="text-slate-400 group-hover:text-slate-950 transition-colors shrink-0" />
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-xs font-bold text-slate-700 truncate" title={doc.file_name}>
                                                        {doc.file_name}
                                                    </span>
                                                    {doc.version_label && (
                                                        <span className="text-[9px] text-slate-400 font-semibold truncate max-w-[180px] mt-0.5">
                                                            {doc.version_label}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0 ml-2">
                                                <span className="font-mono text-[8px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-black">
                                                    v{doc.version}
                                                </span>
                                                <Download size={14} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
                                            </div>
                                        </a>
                                    ))
                                ) : (
                                    <div className="col-span-full p-8 bg-slate-50 text-slate-400 rounded-2xl border border-dashed border-slate-200 text-xs text-center font-bold flex flex-col items-center justify-center gap-2">
                                        <FileText size={24} className="text-slate-350" />
                                        <span>No deliverables or drawings have been uploaded for this role yet.</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
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
                            <div className="bg-slate-50 border border-slate-150/40 rounded-2xl p-6 text-center text-slate-500 text-xs font-semibold">
                                Submitted proposals for this phase are managed in the Tendering Hub.
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
