import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Pencil, Hammer, Package, Armchair, KeyRound, Check, Users } from 'lucide-react';
import { Phase, PhaseKey, getCategoryPhaseLabel } from '../../types/phase.types';

const ICON_MAP: Record<string, React.ElementType> = {
    Shield, Pencil, Hammer, Package, Sofa: Armchair, Key: KeyRound, Users
};

const PARALLEL_KEYS: PhaseKey[] = ['technical', 'design', 'build', 'materials', 'interior'];

interface PhaseTimelineProps {
    phases: Phase[];
    activePhase: PhaseKey;
    onPhaseClick: (key: PhaseKey) => void;
    projectCategory?: string;
    project?: any;
}

const getPhaseProgress = (phaseKey: PhaseKey, project: any): number => {
    if (!project) return 0;

    // Helper to calculate milestone percentage
    const getMilestonePercent = (filterFn: (m: any) => boolean, defaultVal: number = 0) => {
        const milestones = project.milestones || [];
        const filtered = milestones.filter(filterFn);
        if (filtered.length === 0) return defaultVal;
        const completed = filtered.filter((m: any) => m.is_completed || m.approval_status === 'approved').length;
        return Math.round((completed / filtered.length) * 100);
    };

    switch (phaseKey) {
        case 'management': {
            if (!project.pm_id) return 15;
            return getMilestonePercent(
                (m) => m.phase_context === 'management' || !!m.pm_id, 
                100
            );
        }
        case 'legal': {
            if (!project.selected_notaris_id) return 10;
            return getMilestonePercent(
                (m) => m.phase_context === 'legal' || m.type === 'legal', 
                40
            );
        }
        case 'technical': {
            const hasStructural = !!project.structural_id;
            const hasMep = !!project.mep_id;
            if (!hasStructural && !hasMep) return 0;
            
            const milestones = project.milestones || [];
            const technicalMilestones = milestones.filter(
                (m: any) => m.phase_context === 'technical' || m.phase_context === 'structural' || m.phase_context === 'mep'
            );
            if (technicalMilestones.length === 0) {
                return (hasStructural ? 50 : 0) + (hasMep ? 50 : 0);
            }
            const completed = technicalMilestones.filter((m: any) => m.is_completed || m.approval_status === 'approved').length;
            return Math.round((completed / technicalMilestones.length) * 100);
        }
        case 'design': {
            if (!project.selected_arsitek_id) return 10;
            return getMilestonePercent(
                (m) => m.phase_context === 'design',
                30
            );
        }
        case 'materials': {
            const orders = project.material_orders || [];
            if (orders.length === 0) return 0;
            const delivered = orders.filter((o: any) => o.status === 'delivered').length;
            return Math.round((delivered / orders.length) * 100);
        }
        case 'build': {
            if (!project.selected_kontraktor_id) return 10;
            return getMilestonePercent(
                (m) => m.phase_context === 'build',
                20
            );
        }
        case 'interior': {
            if (!project.selected_interior_id) return 10;
            return getMilestonePercent(
                (m) => m.phase_context === 'interior',
                20
            );
        }
        case 'handover': {
            return getMilestonePercent(
                (m) => m.phase_context === 'handover',
                0
            );
        }
        default:
            return 0;
    }
};

function PhaseButton({ 
    phase, 
    isActive, 
    onClick, 
    displayLabel,
    progress = 0 
}: { 
    phase: Phase; 
    isActive: boolean; 
    onClick: () => void; 
    displayLabel?: string;
    progress?: number; 
}) {
    const Icon = ICON_MAP[phase.icon] || Shield;
    const isDone = phase.status === 'completed';
    const isSkipped = phase.status === 'skipped';
    const isPhaseActive = phase.status === 'active';
    const isPending = phase.status === 'pending';

    // Show progress bar only if active or completed
    const showProgress = !isSkipped && !isPending && (isPhaseActive || isDone);

    return (
        <button
            onClick={() => !isSkipped && onClick()}
            disabled={isSkipped}
            className={`flex flex-col items-center gap-1 px-2 py-2 rounded-xl transition-all min-w-[72px] ${
                isSkipped ? 'opacity-30 cursor-not-allowed' :
                isActive ? 'bg-red-50/70 scale-105 shadow-sm border border-red-100/50' :
                isDone ? 'bg-emerald-50/50' :
                isPhaseActive ? 'hover:bg-slate-50/50 cursor-pointer' :
                'hover:bg-gray-50 cursor-pointer opacity-50'
            }`}
        >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                isDone ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' :
                isActive ? 'bg-[#FF2D20] text-white shadow-lg shadow-red-200' :
                isPhaseActive ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' :
                'bg-gray-100 text-gray-400'
            }`}>
                {isDone ? <Check size={16} strokeWidth={3} /> : <Icon size={16} />}
            </div>
            
            <div className="flex flex-col items-center gap-1 w-full text-center">
                <span className={`text-[9px] font-bold uppercase tracking-wide leading-none ${
                    isDone ? 'text-emerald-600' :
                    isActive ? 'text-[#FF2D20]' :
                    isPhaseActive ? 'text-slate-900' :
                    'text-gray-400'
                }`}>
                    {displayLabel || phase.label}
                </span>

                {/* Elegant Minimal Progress Bar */}
                {showProgress && (
                    <div className="w-full mt-1 px-1">
                        <div className="flex items-center justify-between text-[7.5px] font-black text-slate-400/80 mb-0.5 tracking-tight">
                            <span>PROGRESS</span>
                            <span>{isDone ? 100 : progress}%</span>
                        </div>
                        <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                                className={`h-full rounded-full transition-all duration-700 ${
                                    isDone ? 'bg-emerald-500' :
                                    isActive ? 'bg-[#FF2D20]' :
                                    'bg-slate-900'
                                }`}
                                style={{ width: `${isDone ? 100 : progress}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>
        </button>
    );
}

export default function PhaseTimeline({ phases, activePhase, onPhaseClick, projectCategory, project }: PhaseTimelineProps) {
    // Split phases into: pre-parallel, parallel group, post-parallel
    const preParallel = phases.filter(p => !PARALLEL_KEYS.includes(p.key) && p.key !== 'handover');
    const parallel = phases.filter(p => PARALLEL_KEYS.includes(p.key));
    const postParallel = phases.filter(p => p.key === 'handover');

    const lastPreDone = preParallel.length > 0 && preParallel[preParallel.length - 1].status === 'completed';
    const allParallelDone = parallel.length > 0 && parallel.every(p => p.status === 'completed');

    return (
        <div className="w-full overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-0 min-w-max px-2 py-3">
                {/* Pre-parallel phases (Legal, Design) */}
                {preParallel.map((phase, i) => {
                    const isDone = phase.status === 'completed';
                    return (
                        <React.Fragment key={phase.key}>
                            {i > 0 && (
                                <div className={`h-[2px] w-8 sm:w-12 flex-shrink-0 transition-colors duration-300 ${
                                    isDone || preParallel[i - 1]?.status === 'completed' ? 'bg-emerald-400' : 'bg-gray-200'
                                }`} />
                            )}
                            <PhaseButton 
                                phase={phase} 
                                isActive={phase.key === activePhase} 
                                onClick={() => onPhaseClick(phase.key)} 
                                displayLabel={projectCategory ? getCategoryPhaseLabel(phase.key, projectCategory).label : undefined}
                                progress={getPhaseProgress(phase.key, project)}
                            />
                        </React.Fragment>
                    );
                })}

                {/* Connector to parallel group */}
                {parallel.length > 0 && (
                    <>
                        <div className={`h-[2px] w-8 sm:w-12 flex-shrink-0 transition-colors duration-300 ${
                            lastPreDone ? 'bg-emerald-400' : 'bg-gray-200'
                        }`} />

                        {/* Parallel Group */}
                        <div className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-2xl border-2 border-dashed transition-colors ${
                            lastPreDone ? 'border-slate-300 bg-slate-50/50' : 'border-gray-200 bg-gray-50/30'
                        }`}>
                            <span className="text-[7.5px] font-black uppercase tracking-[0.2em] text-slate-400 mb-0.5">Parallel</span>
                            <div className="flex items-center gap-2">
                                {parallel.map((phase, i) => (
                                    <React.Fragment key={phase.key}>
                                        {i > 0 && <div className="w-[1px] h-8 bg-slate-200" />}
                                        <PhaseButton 
                                            phase={phase} 
                                            isActive={phase.key === activePhase} 
                                            onClick={() => onPhaseClick(phase.key)} 
                                            displayLabel={projectCategory ? getCategoryPhaseLabel(phase.key, projectCategory).label : undefined}
                                            progress={getPhaseProgress(phase.key, project)}
                                        />
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {/* Connector to post-parallel (Handover) */}
                {postParallel.map(phase => (
                    <React.Fragment key={phase.key}>
                        <div className={`h-[2px] w-8 sm:w-12 flex-shrink-0 transition-colors duration-300 ${
                            allParallelDone ? 'bg-emerald-400' : 'bg-gray-200'
                        }`} />
                        <PhaseButton 
                            phase={phase} 
                            isActive={phase.key === activePhase} 
                            onClick={() => onPhaseClick(phase.key)} 
                            displayLabel={projectCategory ? getCategoryPhaseLabel(phase.key, projectCategory).label : undefined}
                            progress={getPhaseProgress(phase.key, project)}
                        />
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
}
