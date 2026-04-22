import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import { Phase, PhaseKey, PHASE_ROLE_MAP } from '../../types/phase.types';
import PhaseAssignedPro from './Phases/PhaseAssignedPro';
import PhaseBidsList from './Phases/PhaseBidsList';
import { ProjectBidForm } from './Details/ProjectBidForm';
import StructuralWorkspace from './Phases/StructuralWorkspace';
import MepWorkspace from './Phases/MepWorkspace';
import PMWorkspace from './Phases/PMWorkspace';
import LegalRequirementsConfig from './Phases/LegalRequirementsConfig';
import LegalBriefManager from './Phases/LegalBriefManager';
import PhaseInitiationPanel from './Phases/PhaseInitiationPanel';

interface PhaseContentProps {
    phase: Phase;
    project: any;
    user: any;
    onRefresh: () => void;
    onPhaseComplete?: (nextPhase: PhaseKey) => void;
    onOpenChat?: (user: any) => void;
    onViewProfile?: (pro: any, phaseKey: PhaseKey) => void;
}

export default function PhaseContent({ 
    phase, project, user, onRefresh, 
    onPhaseComplete, onOpenChat, onViewProfile 
}: PhaseContentProps) {
    if (!phase) return null;

    if (user?.role_type === 'structural') {
        return <StructuralWorkspace project={project} user={user} onRefresh={onRefresh} />;
    }

    if (user?.role_type === 'mep') {
        return <MepWorkspace project={project} user={user} onRefresh={onRefresh} currentPhase={phase.key} />;
    }

    const isHiredPM = project.pm_id && user?.id === project.pm_id;

    if (user?.role_type === 'project_manager' && !isHiredPM) {
        return <PMWorkspace project={project} user={user} onRefresh={onRefresh} />;
    }

    const config = PHASE_ROLE_MAP[phase.key];
    const isOwner = user?.id === project?.user_id;
    const canManage = isOwner || isHiredPM;
    
    // Check if phase role is published to bidding board
    const roleKey = config.profileKey || (phase.key === 'management' ? 'project_manager' : '');
    const isPublished = project.published_bidding_roles?.includes(roleKey);
    
    // Check for external vendor for this phase
    const externalVendor = project.external_vendors?.find(v => v.phase_role === roleKey);
    
    const hasPro = (config.selectedKey && project?.[config.selectedKey]) || externalVendor;
    const isMaterialsPhase = phase.key === 'materials';
    const bids = config.bidKey ? (project?.[config.bidKey] || []) : [];

    // Check if current user is a professional matching this phase
    const isMatchingPro = user?.role_type === config.profileKey;
    const proProfile = 
        user?.role_type === 'arsitek' ? user?.arsitek : 
        user?.role_type === 'kontraktor' ? user?.kontraktor :
        user?.role_type === 'notaris' ? user?.notaris_profile :
        user?.role_type === 'interior' ? user?.interior_profile :
        null;
    
    const hasAlreadyBid = project?.has_submitted_bid || false;

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={phase.key}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-6"
            >
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-black text-gray-900">{phase.label}</h3>
                        <p className="text-sm text-gray-400 mt-0.5">{phase.description}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        phase.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                        phase.status === 'active' ? 'bg-red-50 text-[#FF2D20]' :
                        'bg-gray-100 text-gray-400'
                    }`}>
                        {phase.status}
                    </span>
                </div>

                {/* Regulatory Gate: Land Verification (AJB) must be approved before Architect can proceed */}
                {phase.key === 'design' && (() => {
                    const isLandApproved = project?.milestones?.some((m: any) => 
                        (m.title.toUpperCase().includes('AJB') || m.title.toUpperCase().includes('LAND VERIFICATION')) && 
                        m.approval_status === 'approved'
                    );

                    if (!isLandApproved) {
                        const canOverride = user?.role_type === 'project_manager' || user?.id === project?.user_id;
                        return (
                            <div className="bg-amber-50 border-2 border-amber-100 rounded-[2rem] p-8 text-center space-y-4">
                                <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                                    <ShieldCheck size={32} />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-lg font-black text-amber-900 uppercase tracking-tight">Land Verification Required</h4>
                                    <p className="text-sm text-amber-700 font-medium max-w-md mx-auto">
                                        Regulatory safety protocols require the <span className="font-black underline">AJB (Land Deed)</span> to be verified by a Notary and the PM before Design Work begins.
                                    </p>
                                </div>
                                {!canOverride && (
                                    <div className="pt-4">
                                        <button 
                                            onClick={() => document.querySelector<HTMLButtonElement>('button[data-tab-id="legalities"]')?.click()}
                                            className="px-6 py-3 bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-700 transition-all shadow-lg"
                                        >
                                            Check Legal Progress
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    }
                    return null;
                })()}

                {/* Regulatory Gate: PBG Permit must be approved before Construction can proceed */}
                {phase.key === 'build' && (() => {
                    const isPBGApproved = project?.milestones?.some((m: any) => 
                        m.content?.req_id === 'pbg_permit' && 
                        m.approval_status === 'approved'
                    ) || !!project?.pbg_verified_at;
                    const hasSelectedContractor = project?.selected_kontraktor_id || project?.external_vendors?.find((v: any) => v.phase_role === 'kontraktor');
                    
                    // We only hard-block the execution of the build, not the bidding phase.
                    if (hasSelectedContractor && !isPBGApproved) {
                        const canOverride = user?.role_type === 'project_manager' || user?.id === project?.user_id;
                        return (
                            <div className="bg-red-50 border-2 border-red-100 rounded-[2rem] p-8 text-center space-y-4">
                                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                                    <ShieldCheck size={32} />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-lg font-black text-red-900 uppercase tracking-tight">PBG Permit Missing</h4>
                                    <p className="text-sm text-red-700 font-medium max-w-md mx-auto">
                                        Strict regulatory compliance requires the <span className="font-black underline">PBG (Building & Planning Permit)</span> to be officially issued before any physical site work begins.
                                    </p>
                                </div>
                                {!canOverride && (
                                    <div className="pt-4">
                                        <button 
                                            onClick={() => document.querySelector<HTMLButtonElement>('button[data-tab-id="legalities"]')?.click()}
                                            className="px-6 py-3 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg"
                                        >
                                            Check Permit Status
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    }
                    return null;
                })()}

                {phase.key === 'handover' ? (
                    <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-10 text-center">
                        <p className="text-gray-400 font-semibold">Final inspection & handover will appear when all other phases are complete.</p>
                    </div>
                ) : (
                    <>
                        {/* Phase Gate for Owner/PM: If not published, no pro, no external vendor */}
                        {!hasPro && !isMaterialsPhase && canManage && !isPublished && roleKey && (
                            <div className="mb-8">
                                <PhaseInitiationPanel 
                                    projectId={project.id} 
                                    phaseKey={phase.key} 
                                    phaseLabel={phase.label} 
                                    onRefresh={onRefresh} 
                                />
                            </div>
                        )}

                        {/* Existing Logic: Only show if published or has pro/vendor */}
                        {(hasPro || isMaterialsPhase || isPublished || !roleKey) && (
                            <>
                        {(hasPro || isMaterialsPhase || (phase.key === 'interior' && user?.role_type === 'kontraktor' && project.selected_kontraktor_id === user?.id)) && (
                            <PhaseAssignedPro 
                                project={project} 
                                phaseKey={phase.key} 
                                user={user}
                                config={config} 
                                isContractor={user?.role_type === 'kontraktor' && project.selected_kontraktor_id === user?.id}
                                onRefresh={onRefresh}
                                onPhaseComplete={onPhaseComplete}
                                onOpenChat={onOpenChat} 
                                onViewProfile={onViewProfile} 
                            />
                        )}
                        {!hasPro && phase.key === 'legal' && canManage && (
                            <div className="mb-8">
                                <LegalRequirementsConfig project={project} onUpdate={onRefresh} />
                            </div>
                        )}
                        {!hasPro && canManage && bids.length > 0 && (!project.pm_id || isHiredPM || phase.key === 'management') && (
                            <PhaseBidsList 
                                bids={bids} 
                                phaseKey={phase.key} 
                                projectId={project.id} 
                                onRefresh={onRefresh} 
                                isPMBidding={phase.key === 'management'}
                                readOnly={isOwner && !!project.pm_id && !isHiredPM}
                            />
                        )}
                        {!hasPro && isOwner && bids.length > 0 && project.pm_id && !isHiredPM && (
                            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-8 text-center text-gray-400">
                                <p className="font-bold text-sm">Proposals are being managed by your Project Manager.</p>
                                <p className="text-[10px] uppercase tracking-widest mt-1">Visit the Overview tab to see global progress</p>
                            </div>
                        )}
                        {isHiredPM && (
                            <div className="mt-8 border-t border-gray-100 pt-8">
                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Operations Directive (PM Only)</h4>
                                <PMWorkspace project={project} user={user} onRefresh={onRefresh} phaseKey={phase.key} />
                            </div>
                        )}
                        {!hasPro && bids.length === 0 && (
                            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-8 text-center text-gray-400">
                                <p className="font-black text-sm uppercase tracking-widest">Waiting for Proposals</p>
                                <p className="text-[10px] mt-1">This project is visible to {phase.label} professionals.</p>
                            </div>
                        )}

                        {!hasPro && isMatchingPro && !hasAlreadyBid && (
                            <div className="mt-8">
                                <ProjectBidForm 
                                    project={project} 
                                    user={user} 
                                    onSuccess={onRefresh} 
                                />
                            </div>
                        )}

                        {!hasPro && isMatchingPro && hasAlreadyBid && (
                            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-8 text-center mt-8">
                                <p className="text-emerald-700 font-black text-sm uppercase tracking-widest">You have submitted a proposal for this phase.</p>
                            </div>
                        )}
                        </>
                        )}
                    </>
                )}
            </motion.div>
        </AnimatePresence>
    );
}
