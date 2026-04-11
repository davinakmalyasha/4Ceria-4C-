import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, DollarSign, MapPin, Calendar, MessageSquare, Activity, FolderOpen } from 'lucide-react';
import { PhaseKey, getProjectPhases, Phase } from '../../types/phase.types';
import PhaseTimeline from './PhaseTimeline';
import PhaseContent from './PhaseContent';
import ProjectDetailTabs from './ProjectDetailTabs';

interface ProjectDetailPageProps {
    project: any;
    user: any;
    onBack: () => void;
    onRefresh: () => void;
}

export default function ProjectDetailPage({ project, user, onBack, onRefresh }: ProjectDetailPageProps) {
    const phases = useMemo(() => getProjectPhases(project?.needed_phases), [project?.needed_phases]);
    const [activePhase, setActivePhase] = useState<PhaseKey>(phases[0]?.key || 'design');
    const [bottomTab, setBottomTab] = useState<'qa' | 'activity' | 'files'>('qa');

    const currentPhase = phases.find(p => p.key === activePhase) || phases[0];

    return (
        <div className="w-full space-y-6">
            {/* Header */}
            <div className="flex items-start gap-4">
                <button onClick={onBack} className="mt-1 p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <div className="flex-1 min-w-0">
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight truncate">{project?.title}</h1>
                    <ProjectMetaRow project={project} />
                </div>
            </div>

            {/* Phase Timeline */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <PhaseTimeline phases={phases} activePhase={activePhase} onPhaseClick={setActivePhase} />
            </div>

            {/* Phase Content */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm min-h-[300px]">
                <PhaseContent phase={currentPhase} project={project} user={user} onRefresh={onRefresh} />
            </div>

            {/* Bottom Tabs (Q&A, Activity, Files) */}
            <ProjectDetailTabs project={project} activeTab={bottomTab} onTabChange={setBottomTab} />
        </div>
    );
}

function ProjectMetaRow({ project }: { project: any }) {
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
            <span className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
                <DollarSign size={12} className="text-emerald-500" />
                Rp {Number(project?.budget || 0).toLocaleString('id-ID')}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
                <MapPin size={12} className="text-red-400" />
                {project?.city || project?.lokasi || 'Unknown'}
            </span>
            {project?.deadline && (
                <span className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
                    <Calendar size={12} className="text-blue-400" />
                    {new Date(project.deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
            )}
        </div>
    );
}
