import React, { useState } from 'react';
import { 
    Check, X, ExternalLink, ShieldCheck, 
    ArrowUpRight, User, Clock, FileText, 
    DollarSign, ArrowRight, Eye
} from 'lucide-react';
import FilePreviewModal from '../../Common/FilePreviewModal';

interface ApprovalCardProps {
    item: {
        type: string;
        id: any;
        title: string;
        desc: string;
        files?: string[];
        fileNames?: Record<string, string>;
        assignee?: string;
        terminText?: string;
        dueDate?: string;
        raw: any;
    };
    phaseKey: string;
    isLoading: boolean;
    onVerifyMilestone: (id: number, status: 'approved' | 'revision') => void;
    onVerifyHandover: (phase: string, action: 'approve' | 'reject') => void;
    onVerifyAddendum: (addendum: any, status: 'approved' | 'rejected') => void;
    onNavigateToPhase?: (phaseKey: any) => void;
}

export default function ApprovalCard({
    item,
    phaseKey,
    isLoading,
    onVerifyMilestone,
    onVerifyHandover,
    onVerifyAddendum,
    onNavigateToPhase,
}: ApprovalCardProps) {
    const hasSubmitted = item.files && item.files.length > 0;
    const [previewFile, setPreviewFile] = useState<{ path: string; name: string } | null>(null);

    return (
        <div className="bg-white border border-zinc-150 shadow-sm rounded-xl p-4 transition-all duration-300 hover:shadow-md hover:border-zinc-300 hover:-translate-y-0.5 space-y-3 flex flex-col justify-between min-h-[140px]">
            <div className="space-y-2">
                {/* Title and Navigation Arrow */}
                <div className="flex justify-between items-start gap-2">
                    <h5 className="text-xs font-bold text-zinc-900 leading-snug tracking-normal">
                        {item.title}
                    </h5>
                    <button 
                        onClick={() => onNavigateToPhase?.(phaseKey)}
                        className="text-zinc-400 hover:text-black p-1 hover:bg-zinc-100 rounded-lg transition-all shrink-0"
                        title={`Go to phase`}
                    >
                        <ArrowUpRight size={14} />
                    </button>
                </div>

                {/* Assignee Badge */}
                {item.assignee && (
                    <div className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-600 bg-zinc-100 border border-zinc-200/50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        <User size={10} className="text-zinc-500" />
                        {item.assignee}
                    </div>
                )}

                {/* Description */}
                {item.desc && (
                    <p className="text-xs text-zinc-500 leading-relaxed font-medium break-words">
                        {item.desc}
                    </p>
                )}

                {/* Payments Termin Trigger Badge */}
                {item.terminText && (
                    <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg w-fit">
                        <DollarSign size={11} className="text-emerald-600 shrink-0" />
                        <span>{item.terminText}</span>
                    </div>
                )}

                {/* Due Date Badge */}
                {item.dueDate && (
                    <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-bold bg-zinc-50 border border-zinc-150 px-2 py-0.5 rounded-md w-fit">
                        <Clock size={10} className="text-zinc-400" />
                        <span>Due: {new Date(item.dueDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                )}

                {/* File Attachments */}
                {item.files && item.files.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                        <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Attachments (Click to preview):</p>
                        <div className="flex flex-wrap gap-1.5">
                            {item.files.map((f: string, i: number) => {
                                const fileName = item.fileNames?.[f] || `File ${i + 1}`;
                                return (
                                    <button 
                                        key={f}
                                        type="button"
                                        onClick={() => setPreviewFile({ path: f, name: fileName })}
                                        className="group inline-flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5 transition-all shadow-xs hover:scale-[1.02] cursor-pointer"
                                    >
                                        <FileText size={11} className="text-indigo-500 group-hover:scale-110 transition-transform" />
                                        <span className="max-w-[130px] truncate">{fileName}</span>
                                        <Eye size={10} className="opacity-60 group-hover:opacity-100 transition-all shrink-0 ml-0.5" />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Action Buttons & Status Badges */}
            <div className="flex items-center gap-1.5 pt-2.5 border-t border-zinc-100">
                {item.type === 'milestone' && (() => {
                    if (item.raw.approval_status === 'revision') {
                        return (
                            <div className="w-full space-y-2">
                                <button 
                                    disabled 
                                    className="w-full h-8 bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-700 rounded-lg flex items-center justify-center gap-1 cursor-not-allowed"
                                >
                                    <Clock size={12} className="text-amber-600 animate-pulse shrink-0" /> 
                                    Revision Requested
                                </button>
                                {item.raw.revision_notes && (
                                    <div className="bg-amber-50/50 border border-amber-100 p-2.5 rounded-lg text-[10px] text-amber-800 leading-relaxed font-semibold">
                                        <span className="font-black block uppercase tracking-wider text-[8px] text-amber-600 mb-0.5">Notes Sent:</span>
                                        "{item.raw.revision_notes}"
                                    </div>
                                )}
                            </div>
                        );
                    }
                    if (item.raw.approval_status === 'approved') {
                        return (
                            <button 
                                disabled 
                                className="w-full h-8 bg-zinc-100 border border-zinc-200 text-[10px] font-bold text-zinc-450 rounded-lg flex items-center justify-center gap-1 cursor-not-allowed"
                            >
                                <Check size={12} className="text-zinc-400" /> 
                                Accepted
                            </button>
                        );
                    }
                    if (!hasSubmitted) {
                        return (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200/50 px-2.5 py-1 rounded-lg w-full text-center">
                                Awaiting Submission
                            </span>
                        );
                    }
                    return (
                        <>
                            <button 
                                disabled={isLoading} 
                                onClick={() => onVerifyMilestone(item.id, 'approved')} 
                                className="flex-1 h-8 bg-zinc-950 hover:bg-zinc-800 disabled:opacity-50 text-[10px] font-bold text-white rounded-lg flex items-center justify-center gap-1 transition-all active:scale-98 shadow-sm"
                            >
                                <Check size={12} /> 
                                Approve
                            </button>
                            <button 
                                disabled={isLoading} 
                                onClick={() => onVerifyMilestone(item.id, 'revision')} 
                                className="h-8 w-8 border border-zinc-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 text-zinc-500 rounded-lg flex items-center justify-center transition-all active:scale-98"
                                title="Request Revision"
                            >
                                <X size={12} />
                            </button>
                        </>
                    );
                })()}

                {item.type === 'handover' && item.raw.state === 'completed' && (
                    <button 
                        disabled 
                        className="w-full h-8 bg-zinc-100 border border-zinc-200 text-[10px] font-bold text-zinc-450 rounded-lg flex items-center justify-center gap-1 cursor-not-allowed"
                    >
                        <Check size={12} className="text-zinc-400" /> 
                        Accepted
                    </button>
                )}

                {item.type === 'handover' && item.raw.state === 'awaiting_pm' && (
                    <>
                        <button 
                            disabled={isLoading} 
                            onClick={() => onVerifyHandover(item.id as string, 'approve')} 
                            className="flex-1 h-8 bg-zinc-950 hover:bg-zinc-800 disabled:opacity-50 text-[10px] font-bold text-white rounded-lg flex items-center justify-center gap-1 transition-all active:scale-98 shadow-sm"
                        >
                            <Check size={12} /> 
                            Seal
                        </button>
                        <button 
                            disabled={isLoading} 
                            onClick={() => onVerifyHandover(item.id as string, 'reject')} 
                            className="h-8 w-8 border border-zinc-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 text-zinc-500 rounded-lg flex items-center justify-center transition-all active:scale-98"
                            title="Reject Handover"
                        >
                            <X size={12} />
                        </button>
                    </>
                )}

                {item.type === 'handover' && item.raw.state === 'awaiting_owner' && (
                    <span className="text-[10px] font-bold text-zinc-500 bg-zinc-100 border border-zinc-200/50 px-2.5 py-1 rounded-lg w-full text-center">
                        Owner Pending Seal
                    </span>
                )}

                {item.type === 'addendum' && item.raw.status === 'approved' && (
                    <button 
                        disabled 
                        className="w-full h-8 bg-zinc-100 border border-zinc-200 text-[10px] font-bold text-zinc-455 rounded-lg flex items-center justify-center gap-1 cursor-not-allowed"
                    >
                        <Check size={12} className="text-zinc-400" /> 
                        Accepted
                    </button>
                )}

                {item.type === 'addendum' && item.raw.status !== 'approved' && (
                    <>
                        <button 
                            disabled={isLoading} 
                            onClick={() => onVerifyAddendum(item.raw, 'approved')} 
                            className="flex-1 h-8 bg-zinc-950 hover:bg-zinc-800 disabled:opacity-50 text-[10px] font-bold text-white rounded-lg flex items-center justify-center gap-1 transition-all active:scale-98 shadow-sm"
                        >
                            <Check size={12} /> 
                            Authorize
                        </button>
                        <button 
                            disabled={isLoading} 
                            onClick={() => onVerifyAddendum(item.raw, 'rejected')} 
                            className="h-8 w-8 border border-zinc-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 text-zinc-500 rounded-lg flex items-center justify-center transition-all active:scale-98"
                            title="Reject Addendum"
                        >
                            <X size={12} />
                        </button>
                    </>
                )}

                {item.type === 'rec_bid' && (
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-250 px-2.5 py-1 rounded-lg w-full text-center flex items-center justify-center gap-1">
                        <ShieldCheck size={12} className="text-emerald-600" />
                        Rec Active
                    </span>
                )}
            </div>

            {/* Reusable File Preview Modal */}
            <FilePreviewModal
                isOpen={!!previewFile}
                onClose={() => setPreviewFile(null)}
                filePath={previewFile?.path || null}
                fileName={previewFile?.name || ''}
            />
        </div>
    );
}
