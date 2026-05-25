import React from 'react';
import { ArrowRight, CheckCircle2, Circle, PlayCircle } from 'lucide-react';
import { getProjectPhases, Phase, PhaseKey } from '../../types/phase.types';

interface Props {
    projects: any[];
    onViewProject?: (project: any) => void;
    setActiveTab: (tab: string) => void;
    onViewAll: () => void;
}

const TAB_MAP: Record<PhaseKey, string> = {
    management: 'project_manager',
    legal: 'notaris',
    technical: 'find-engineers',
    design: 'architects',
    build: 'constructors',
    materials: 'marketplace-materials',
    interior: 'interior',
    handover: 'projects',
};

export default function OverviewProjectTimeline({ projects, onViewProject, setActiveTab, onViewAll }: Props) {
    if (!projects || projects.length === 0) return null;

    const handlePhaseClick = (e: React.MouseEvent, phase: Phase) => {
        e.stopPropagation();
        const tab = TAB_MAP[phase.key];
        if (tab) setActiveTab(tab);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Project Pipelines</p>
                <button onClick={onViewAll} className="flex items-center gap-1 text-[11px] font-bold text-[#FF2D20] hover:underline">
                    View active timelines <ArrowRight size={12} />
                </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {projects.slice(0, 2).map((project) => {
                    const phases = getProjectPhases(project, project.needed_phases);
                    return (
                        <div
                            key={project.id}
                            onClick={() => onViewProject?.(project)}
                            className="bg-white/80 border border-neutral-100 hover:border-neutral-200 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all cursor-pointer select-none space-y-4"
                        >
                            <div className="flex justify-between items-center">
                                <div>
                                    <h4 className="font-extrabold text-neutral-800 text-sm">{project.title}</h4>
                                    <p className="text-[10px] text-neutral-400 font-bold mt-0.5">{project.lokasi || 'No location set'}</p>
                                </div>
                                <span className="px-2 py-0.5 bg-red-50 text-red-600 border border-red-100 text-[10px] font-black uppercase rounded-lg">
                                    {project.status?.replace(/_/g, ' ')}
                                </span>
                            </div>

                            <div className="flex items-center justify-between relative pt-2">
                                <div className="absolute top-[21px] left-2 right-2 h-0.5 bg-neutral-100 -z-10" />
                                {phases.map((phase) => {
                                    const isActive = phase.status === 'active';
                                    const isDone = phase.status === 'completed';
                                    return (
                                        <button
                                            key={phase.key}
                                            onClick={(e) => handlePhaseClick(e, phase)}
                                            className="flex flex-col items-center gap-1.5 focus:outline-none group relative z-10 transition-transform active:scale-90"
                                            title={`${phase.label}: ${phase.description}`}
                                        >
                                            {isDone ? (
                                                <CheckCircle2 size={16} className="text-emerald-500 fill-emerald-50 bg-white rounded-full" />
                                            ) : isActive ? (
                                                <PlayCircle size={16} className="text-[#FF2D20] bg-white rounded-full animate-pulse" />
                                            ) : (
                                                <Circle size={16} className="text-neutral-300 bg-white rounded-full fill-neutral-50 group-hover:text-neutral-400" />
                                            )}
                                            <span
                                                className={`text-[9px] font-black tracking-tight whitespace-nowrap transition-colors ${
                                                    isActive ? 'text-[#FF2D20]' : isDone ? 'text-emerald-600' : 'text-neutral-400'
                                                }`}
                                            >
                                                {phase.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
