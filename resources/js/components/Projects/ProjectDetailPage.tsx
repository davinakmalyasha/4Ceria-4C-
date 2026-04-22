import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    ArrowLeft, DollarSign, MapPin, Calendar, 
    MessageSquare, Activity, FolderOpen, 
    LayoutDashboard, ClipboardList, ShieldCheck, FileText, CalendarRange, Box, HardHat 
} from 'lucide-react';
import { PhaseKey, getProjectPhases, Phase } from '../../types/phase.types';
import PhaseTimeline from './PhaseTimeline';
import PhaseContent from './PhaseContent';
import ProjectBrief from './ProjectBrief';
import ProjectQA from './ProjectQA';
import ProjectActivity from './ProjectActivity';
import ProjectFiles from './ProjectFiles';
import ProjectBudgetManager from './ProjectBudgetManager';
import PMQualityControl from './PMWorkspace/PMQualityControl';
import PMReports from './PMWorkspace/PMReports';
import PMSchedule from './PMWorkspace/PMSchedule';
import PMProcurement from './PMWorkspace/PMProcurement';
import { PMLegalHub } from './PMWorkspace/PMLegalHub';
import EngineeringWorkspace from './EngineeringWorkspace';

type TabId = 'overview' | 'budget' | 'process' | 'qa' | 'activity' | 'files' | 'pm_qa' | 'pm_reports' | 'pm_schedule' | 'pm_logistics' | 'pm_legal' | 'engineering';

interface ProjectDetailPageProps {
    project: any;
    user: any;
    onBack: () => void;
    onRefresh: () => void;
    onOpenChat?: (user: any) => void;
    onViewProfile?: (pro: any, phaseKey: 'design' | 'build' | 'legal' | 'interior') => void;
}

export default function ProjectDetailPage({ project, user, onBack, onRefresh, onOpenChat, onViewProfile }: ProjectDetailPageProps) {
    const phases = useMemo(() => getProjectPhases(project, project?.needed_phases), [project, project?.needed_phases]);
    const [activeTab, setActiveTab] = useState<TabId>('overview');
    const [activePhase, setActivePhase] = useState<PhaseKey>(phases[0]?.key || 'design');

    const currentPhase = phases.find(p => p.key === activePhase) || phases[0];

    const TABS = useMemo(() => {
        const tabs = [
            { id: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
            { id: 'budget' as const, label: 'Budget', icon: DollarSign },
            { id: 'process' as const, label: 'Process', icon: ClipboardList },
            { id: 'qa' as const, label: 'Q&A', icon: MessageSquare },
            { id: 'activity' as const, label: 'Activity', icon: Activity },
            { id: 'files' as const, label: 'Files', icon: FolderOpen },
        ];

        // Dynamic PM Tabs
        if (project.pm_id && project.accepted_pm_bid) {
            const scopes = project.accepted_pm_bid.scopes || [];
            const deliverables = project.accepted_pm_bid.deliverables || [];

            if (scopes.includes('quality_control') || deliverables.includes('qc_checklist')) {
                tabs.push({ id: 'pm_qa', label: 'PM: QA/QC', icon: ShieldCheck });
            }
            if (deliverables.includes('weekly_report')) {
                tabs.push({ id: 'pm_reports', label: 'PM: Reports', icon: FileText });
            }
            if (scopes.includes('scheduling')) {
                tabs.push({ id: 'pm_schedule', label: 'PM: Schedule', icon: CalendarRange });
            }
            if (scopes.includes('material_logistics') || deliverables.includes('order_management')) {
                tabs.push({ id: 'pm_logistics' as const, label: 'PM: Logistics', icon: Box });
            }
        }

        if (project.selected_notaris_id) {
            tabs.push({ id: 'pm_legal' as const, label: 'Legal Hub', icon: ShieldCheck });
        }

        if (project.requires_structural || project.requires_mep || project.structural_id || project.mep_id) {
            tabs.push({ id: 'engineering' as const, label: 'Engineering', icon: HardHat });
        }

        // Hide budget for professionals (contractors, architects, and notaries)
        // Keep budget for PM and Owner
        if (['kontraktor', 'arsitek', 'notaris'].includes(user?.role_type)) {
            return tabs.filter(t => t.id !== 'budget');
        }
        
        return tabs;
    }, [user?.role_type, project.pm_id, project.accepted_pm_bid]);

    return (
        <div className="w-full space-y-6">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                    <button onClick={onBack} className="mt-1 p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight truncate">{project?.title}</h1>
                        <ProjectMetaRow project={project} />
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-2xl border border-gray-100">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                                activeTab === tab.id 
                                ? 'bg-white text-gray-900 shadow-sm border border-gray-100' 
                                : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            <tab.icon size={14} />
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Search Area / Content */}
            <div className="min-h-[500px]">
                <AnimatePresence mode="wait">
                    {activeTab === 'overview' && (
                        <motion.div
                            key="overview"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <ProjectBrief 
                                project={project} 
                                user={user}
                                onRefresh={onRefresh}
                                onSwitchTab={setActiveTab}
                                onOpenChat={onOpenChat}
                                onSwitchToProcess={(phase) => {
                                    setActiveTab('process');
                                    setActivePhase(phase);
                                }} 
                            />
                        </motion.div>
                    )}

                    {activeTab === 'process' && (
                        <motion.div
                            key="process"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            className="space-y-6"
                        >
                            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm">
                                <PhaseTimeline phases={phases} activePhase={activePhase} onPhaseClick={setActivePhase} />
                            </div>

                            <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm min-h-[300px]">
                                <PhaseContent 
                                    phase={currentPhase} 
                                    project={project} 
                                    user={user} 
                                    onRefresh={onRefresh} 
                                    onPhaseComplete={setActivePhase}
                                    onOpenChat={onOpenChat}
                                    onViewProfile={onViewProfile}
                                />
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'budget' && (
                        <motion.div
                            key="budget"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <ProjectBudgetManager project={project} user={user} />
                        </motion.div>
                    )}

                    {activeTab === 'qa' && (
                        <motion.div
                            key="qa"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <ProjectQA project={project} onRefresh={onRefresh} />
                        </motion.div>
                    )}

                    {activeTab === 'activity' && (
                        <motion.div
                            key="activity"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <ProjectActivity project={project} />
                        </motion.div>
                    )}

                    {activeTab === 'files' && (
                        <motion.div
                            key="files"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <ProjectFiles project={project} />
                        </motion.div>
                    )}

                    {activeTab === 'pm_qa' && (
                        <motion.div
                            key="pm_qa"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <PMQualityControl project={project} user={user} onRefresh={onRefresh} />
                        </motion.div>
                    )}

                    {activeTab === 'pm_reports' && (
                        <motion.div
                            key="pm_reports"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <PMReports project={project} user={user} onRefresh={onRefresh} />
                        </motion.div>
                    )}

                    {activeTab === 'pm_schedule' && (
                        <motion.div
                            key="pm_schedule"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <PMSchedule project={project} user={user} />
                        </motion.div>
                    )}

                    {activeTab === 'pm_logistics' && (
                        <motion.div
                            key="pm_logistics"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <PMProcurement project={project} user={user} />
                        </motion.div>
                    )}

                    {activeTab === 'pm_legal' && (
                        <motion.div
                            key="pm_legal"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <PMLegalHub 
                                project={project} 
                                user={user} 
                                onRefresh={onRefresh} 
                                onSwitchToProcess={(phase, requirement) => {
                                    setActiveTab('process');
                                    setActivePhase(phase);
                                    // We could also pass requirement state if LegalVault supports it
                                }}
                            />
                        </motion.div>
                    )}

                    {activeTab === 'engineering' && (
                        <motion.div
                            key="engineering"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <EngineeringWorkspace project={project} user={user} onRefresh={onRefresh} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
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
