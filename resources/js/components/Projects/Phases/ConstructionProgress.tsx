import React, { useState } from 'react';
import { Hammer, CalendarDays, FileText, BarChart3 } from 'lucide-react';
import ConstructionProgressStats from './ConstructionProgressStats';
import ConstructionMilestones from './ConstructionMilestones';
import DailySiteLog from './DailySiteLog';
import ChangeOrderPanel from './ChangeOrderPanel';

interface ConstructionProgressProps {
    project: any;
    currentUser: any;
    isContractor: boolean;
    isPM?: boolean;
}

type TabKey = 'milestones' | 'logs' | 'changes' | 'stats';

export default function ConstructionProgress({ project, currentUser, isContractor, isPM = false }: ConstructionProgressProps) {
    const [activeTab, setActiveTab] = useState<TabKey>('milestones');
    const isOwner = project.user_id === currentUser.id;

    const TABS = [
        { id: 'milestones', label: 'Milestones', icon: Hammer },
        { id: 'logs', label: 'Site Logs', icon: CalendarDays },
        { id: 'changes', label: 'Change Orders', icon: FileText },
        { id: 'stats', label: 'Analytics', icon: BarChart3 },
    ];

    return (
        <div className="space-y-8">
            {/* Minimal Tab Navigation */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-2xl w-fit">
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as TabKey)}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            <Icon size={14} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            <div className="min-h-[400px]">
                {activeTab === 'milestones' && (
                    <ConstructionMilestones 
                        project={project} 
                        currentUser={currentUser} 
                        isContractor={isContractor} 
                        isPM={isPM} 
                    />
                )}
                {activeTab === 'logs' && (
                    <DailySiteLog 
                        project={project} 
                        isContractor={isContractor} 
                    />
                )}
                {activeTab === 'changes' && (
                    <ChangeOrderPanel 
                        project={project} 
                        isPM={isPM} 
                        isOwner={isOwner} 
                        isPro={isContractor} 
                    />
                )}
                {activeTab === 'stats' && (
                    <ConstructionProgressStats 
                        project={project} 
                    />
                )}
            </div>
        </div>
    );
}
