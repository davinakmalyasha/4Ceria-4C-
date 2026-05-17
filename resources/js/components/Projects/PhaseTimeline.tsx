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
}

function PhaseButton({ phase, isActive, onClick, displayLabel }: { phase: Phase; isActive: boolean; onClick: () => void; displayLabel?: string }) {
    const Icon = ICON_MAP[phase.icon] || Shield;
    const isDone = phase.status === 'completed';
    const isSkipped = phase.status === 'skipped';
    const isPhaseActive = phase.status === 'active';

    return (
        <button
            onClick={() => !isSkipped && onClick()}
            disabled={isSkipped}
            className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-2xl transition-all min-w-[72px] ${
                isSkipped ? 'opacity-30 cursor-not-allowed' :
                isActive ? 'bg-red-50 scale-105' :
                isDone ? 'bg-emerald-50' :
                isPhaseActive ? 'hover:bg-gray-50 cursor-pointer' :
                'hover:bg-gray-50 cursor-pointer opacity-50'
            }`}
        >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                isDone ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' :
                isActive ? 'bg-[#FF2D20] text-white shadow-lg shadow-red-200' :
                isPhaseActive ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' :
                'bg-gray-100 text-gray-400'
            }`}>
                {isDone ? <Check size={18} strokeWidth={3} /> : <Icon size={18} />}
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wide ${
                isDone ? 'text-emerald-600' :
                isActive ? 'text-[#FF2D20]' :
                isPhaseActive ? 'text-slate-900' :
                'text-gray-400'
            }`}>
                {displayLabel || phase.label}
            </span>
        </button>
    );
}

export default function PhaseTimeline({ phases, activePhase, onPhaseClick, projectCategory }: PhaseTimelineProps) {
    // Split phases into: pre-parallel, parallel group, post-parallel
    const preParallel = phases.filter(p => !PARALLEL_KEYS.includes(p.key) && p.key !== 'handover');
    const parallel = phases.filter(p => PARALLEL_KEYS.includes(p.key));
    const postParallel = phases.filter(p => p.key === 'handover');

    const lastPreDone = preParallel.length > 0 && preParallel[preParallel.length - 1].status === 'completed';
    const allParallelDone = parallel.length > 0 && parallel.every(p => p.status === 'completed');

    return (
        <div className="w-full overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-0 min-w-max px-2 py-4">
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
                            <PhaseButton phase={phase} isActive={phase.key === activePhase} onClick={() => onPhaseClick(phase.key)} displayLabel={projectCategory ? getCategoryPhaseLabel(phase.key, projectCategory).label : undefined} />
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
                        <div className={`flex flex-col items-center gap-1 px-3 py-2 rounded-3xl border-2 border-dashed transition-colors ${
                            lastPreDone ? 'border-slate-300 bg-slate-50/50' : 'border-gray-200 bg-gray-50/30'
                        }`}>
                            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Parallel</span>
                            <div className="flex items-center gap-2">
                                {parallel.map((phase, i) => (
                                    <React.Fragment key={phase.key}>
                                        {i > 0 && <div className="w-[1px] h-8 bg-slate-200" />}
                                        <PhaseButton phase={phase} isActive={phase.key === activePhase} onClick={() => onPhaseClick(phase.key)} displayLabel={projectCategory ? getCategoryPhaseLabel(phase.key, projectCategory).label : undefined} />
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
                        <PhaseButton phase={phase} isActive={phase.key === activePhase} onClick={() => onPhaseClick(phase.key)} displayLabel={projectCategory ? getCategoryPhaseLabel(phase.key, projectCategory).label : undefined} />
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
}
