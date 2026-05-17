import React, { useState } from 'react';
import { Armchair, Palette, FileText } from 'lucide-react';
import InteriorMilestones from './InteriorMilestones';
import MaterialSwatchBoard from './MaterialSwatchBoard';
import DocumentVault from './DocumentVault';

interface InteriorProgressProps {
    project: any;
    currentUser: any;
    isInteriorDesigner: boolean;
    isPM?: boolean;
}

type TabKey = 'milestones' | 'swatches' | 'vault';

export default function InteriorProgress({ project, currentUser, isInteriorDesigner, isPM = false }: InteriorProgressProps) {
    const [activeTab, setActiveTab] = useState<TabKey>('milestones');
    const isOwner = project.user_id === currentUser.id;

    const TABS = [
        { id: 'milestones', label: 'Room Designs', icon: Armchair },
        { id: 'swatches', label: 'Swatch Board', icon: Palette },
        { id: 'vault', label: 'Blueprints', icon: FileText },
    ];

    return (
        <div className="space-y-8">
            {/* Tab Navigation */}
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
                    <InteriorMilestones 
                        project={project} 
                        currentUser={currentUser} 
                        isInteriorDesigner={isInteriorDesigner} 
                        isPM={isPM} 
                    />
                )}
                {activeTab === 'swatches' && (
                    <MaterialSwatchBoard 
                        project={project} 
                        isPro={isInteriorDesigner} 
                        isOwner={isOwner} 
                    />
                )}
                {activeTab === 'vault' && (
                    <DocumentVault 
                        project={project} 
                        isPro={isInteriorDesigner} 
                        targetRole="interior"
                    />
                )}
            </div>
        </div>
    );
}
