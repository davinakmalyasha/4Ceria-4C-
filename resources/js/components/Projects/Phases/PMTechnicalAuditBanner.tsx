import React from 'react';
import { ShieldCheck, RefreshCw, Cloud } from 'lucide-react';
import { Project } from '../../../types/project.types';

interface PMTechnicalAuditBannerProps {
    project: Project;
    isLoading: boolean;
    isAutoSaving: boolean;
    auditNote: string;
    setAuditNote: (val: string) => void;
    onVerify: () => void;
    onReject: () => void;
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onDeleteAttachment: (index: number) => void;
    fileInputRef: React.RefObject<HTMLInputElement>;
}

export default function PMTechnicalAuditBanner({
    project, isLoading, isAutoSaving, onVerify, onReject
}: PMTechnicalAuditBannerProps) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 border-t border-b border-zinc-100">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-zinc-50 border border-zinc-100 text-zinc-400 rounded-xl flex items-center justify-center flex-shrink-0">
                    <ShieldCheck size={20} />
                </div>
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-zinc-800">
                            Technical Audit (Iteration #{project.planning_iteration || 1})
                        </span>
                        {isAutoSaving ? (
                            <div className="flex items-center gap-1 text-zinc-400 bg-zinc-50 border border-zinc-100 px-2 py-0.5 rounded-full text-[9px] font-medium">
                                <RefreshCw size={10} className="animate-spin text-zinc-400" />
                                <span>Syncing</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1 text-zinc-400 bg-zinc-50 border border-zinc-100 px-2 py-0.5 rounded-full text-[9px] font-medium">
                                <Cloud size={10} />
                                <span>Saved</span>
                            </div>
                        )}
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                        Verify design specifications, deliverables, and payment schedule.
                    </p>
                </div>
            </div>

            {/* Exactly 2 Clean Buttons, No Bold, Simple Casing, Perfect Alignment */}
            <div className="flex items-center gap-2 flex-shrink-0">
                <button
                    onClick={onVerify}
                    disabled={isLoading || isAutoSaving}
                    className="px-4 py-2 bg-zinc-950 hover:bg-black text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50 active:scale-[0.98]"
                >
                    {isLoading ? 'Verifying...' : 'Verify & Finalize'}
                </button>
                
                <button
                    onClick={onReject}
                    disabled={isLoading}
                    className="px-4 py-2 bg-white hover:bg-red-50/50 border border-zinc-200 hover:border-red-200 text-zinc-500 hover:text-red-650 text-xs font-medium rounded-lg transition-all"
                >
                    Request Revision
                </button>
            </div>
        </div>
    );
}
