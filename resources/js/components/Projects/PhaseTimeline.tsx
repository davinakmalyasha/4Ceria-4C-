import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Pencil, Hammer, Package, Armchair, KeyRound, Check } from 'lucide-react';
import { Phase, PhaseKey } from '../../types/phase.types';

const ICON_MAP: Record<string, React.ElementType> = {
    Shield, Pencil, Hammer, Package, Sofa: Armchair, Key: KeyRound,
};

interface PhaseTimelineProps {
    phases: Phase[];
    activePhase: PhaseKey;
    onPhaseClick: (key: PhaseKey) => void;
}

export default function PhaseTimeline({ phases, activePhase, onPhaseClick }: PhaseTimelineProps) {
    return (
        <div className="w-full overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-0 min-w-max px-2 py-4">
                {phases.map((phase, i) => {
                    const Icon = ICON_MAP[phase.icon] || Shield;
                    const isActive = phase.key === activePhase;
                    const isDone = phase.status === 'completed';
                    const isSkipped = phase.status === 'skipped';

                    return (
                        <React.Fragment key={phase.key}>
                            {i > 0 && (
                                <div className={`h-[2px] w-8 sm:w-12 flex-shrink-0 transition-colors duration-300 ${
                                    isDone || phases[i - 1]?.status === 'completed' ? 'bg-emerald-400' : 'bg-gray-200'
                                }`} />
                            )}
                            <button
                                onClick={() => !isSkipped && onPhaseClick(phase.key)}
                                disabled={isSkipped}
                                className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-2xl transition-all min-w-[72px] ${
                                    isSkipped ? 'opacity-30 cursor-not-allowed' :
                                    isActive ? 'bg-red-50 scale-105' :
                                    isDone ? 'bg-emerald-50' :
                                    'hover:bg-gray-50 cursor-pointer'
                                }`}
                            >
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                                    isDone ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' :
                                    isActive ? 'bg-[#FF2D20] text-white shadow-lg shadow-red-200' :
                                    'bg-gray-100 text-gray-400'
                                }`}>
                                    {isDone ? <Check size={18} strokeWidth={3} /> : <Icon size={18} />}
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-wide ${
                                    isDone ? 'text-emerald-600' :
                                    isActive ? 'text-[#FF2D20]' :
                                    'text-gray-400'
                                }`}>
                                    {phase.label}
                                </span>
                            </button>
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
}
