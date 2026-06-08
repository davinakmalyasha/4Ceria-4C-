import React from 'react';
import ConstructionMilestones from './ConstructionMilestones';

interface SubContractorWorkspaceProps {
    project: any;
    currentUser: any;
    activeSub: any;
    activeSubRole: string;
    roleLabel: string;
    scopeNotes?: string;
    rate: number;
    isContractor?: boolean;
}

export default function SubContractorWorkspace({
    project,
    currentUser,
    activeSub,
    activeSubRole,
    roleLabel,
    scopeNotes,
    rate,
    isContractor = false
}: SubContractorWorkspaceProps): React.ReactElement {
    // Check if the current user is this specific sub-contractor OR the lead contractor (team lead)
    const canManage = Number(currentUser?.id) === Number(activeSub?.user_id) || isContractor;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <ConstructionMilestones
                project={project}
                currentUser={currentUser}
                isContractor={canManage}
                filterType={activeSubRole}
            />
        </div>
    );
}
