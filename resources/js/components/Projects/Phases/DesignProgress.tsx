import React from 'react';
import DesignMilestones from './DesignMilestones';
import EngineeringManualLogs from './EngineeringManualLogs';

interface DesignProgressProps {
    project: any;
    currentUser: any;
    isArchitect: boolean;
    isPM: boolean;
    roleType?: string;
    onRefresh?: () => void;
}

export default function DesignProgress({ project, currentUser, isArchitect, isPM, roleType = 'design', onRefresh = () => {} }: DesignProgressProps) {
    // For Structural/MEP, determine if we show the manual logs or the standard milestone board
    const isEngineering = roleType === 'structural' || roleType === 'mep';
    const isHired4C = roleType === 'structural' ? project.is_structural_hired_4c : project.is_mep_hired_4c;
    const showManualLogs = isEngineering && !isHired4C;

    if (showManualLogs) {
        return <EngineeringManualLogs project={project} currentUser={currentUser} onRefresh={onRefresh} />;
    }

    return (
        <div className="min-h-[400px]">
            <DesignMilestones 
                project={project} 
                currentUser={currentUser} 
                isArchitect={isArchitect || (roleType !== 'design' && (project[`selected_${roleType}_id`] === currentUser?.id || project[`${roleType}_id`] === currentUser?.id))} 
                isPM={isPM} 
                roleType={roleType}
            />
        </div>
    );
}
