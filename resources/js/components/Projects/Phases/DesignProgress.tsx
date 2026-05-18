import React, { useState } from 'react';
import { Layers, FileText, CheckCircle2 } from 'lucide-react';
import DesignMilestones from './DesignMilestones';
import DocumentVault from './DocumentVault';
import EngineeringManualLogs from './EngineeringManualLogs';

interface DesignProgressProps {
    project: any;
    currentUser: any;
    isArchitect: boolean;
    isPM: boolean;
    roleType?: string;
    onRefresh?: () => void;
}

type TabKey = 'milestones' | 'vault';

export default function DesignProgress({ project, currentUser, isArchitect, isPM, roleType = 'design', onRefresh = () => {} }: DesignProgressProps) {
    const [activeTab, setActiveTab] = useState<TabKey>('milestones');

    // For Structural/MEP, determine if we show the manual logs or the standard milestone board
    const isEngineering = roleType === 'structural' || roleType === 'mep';
    const isHired4C = roleType === 'structural' ? project.is_structural_hired_4c : project.is_mep_hired_4c;
    const showManualLogs = isEngineering && !isHired4C;

    if (showManualLogs) {
        return <EngineeringManualLogs project={project} currentUser={currentUser} onRefresh={onRefresh} />;
    }

    return (
        <div className="space-y-8">
            {/* Tab Navigation */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-2xl w-fit">
                <button
                    onClick={() => setActiveTab('milestones')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        activeTab === 'milestones' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                    }`}
                >
                    <Layers size={14} />
                    Milestones
                </button>
                <button
                    onClick={() => setActiveTab('vault')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        activeTab === 'vault' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                    }`}
                >
                    <FileText size={14} />
                    Document Vault
                </button>
            </div>

            <div className="min-h-[400px]">
                {activeTab === 'milestones' && (
                    <DesignMilestones 
                        project={project} 
                        currentUser={currentUser} 
                        isArchitect={isArchitect || (roleType !== 'design' && (project[`selected_${roleType}_id`] === currentUser?.id || project[`${roleType}_id`] === currentUser?.id))} 
                        isPM={isPM} 
                        roleType={roleType}
                    />
                )}
                {activeTab === 'vault' && (() => {
                    const isOwner = currentUser?.id === project?.user_id;
                    const isHired = isArchitect || (roleType !== 'design' && (project[`selected_${roleType}_id`] === currentUser?.id || project[`${roleType}_id`] === currentUser?.id));
                    const canDownload = isOwner || isPM || isHired;
                    
                    return (
                        <DocumentVault 
                            project={project} 
                            isPro={isHired} 
                            targetRole={roleType === 'design' ? 'architect' : roleType}
                            canDownload={canDownload}
                        />
                    );
                })()}
            </div>
        </div>
    );
}
