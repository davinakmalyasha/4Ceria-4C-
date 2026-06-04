import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
    LayoutDashboard, ClipboardList, 
    DollarSign, MessageSquare, BarChart3,
    CheckCircle2, Clock, AlertCircle, XCircle,
    UserPlus, ShieldAlert, Check,
    ShieldCheck, FileText, CalendarRange, Box,
    ExternalLink
} from 'lucide-react';
import axios from 'axios';
import { useToast } from '../../../context/ToastContext';
import ProjectRequirements from '../ProjectRequirements';
import PMSchedule from '../PMWorkspace/PMSchedule';
import PMGroupedApprovals from './PMGroupedApprovals';
import ConfirmModal from '../ConfirmModal';

interface PMWorkspaceProps {
    project: any;
    user: any;
    onRefresh: () => void;
    phaseKey?: string;
    onNavigateToPhase?: (phaseKey: any) => void;
}

export default function PMWorkspace({ project, user, onRefresh, phaseKey, onNavigateToPhase }: PMWorkspaceProps) {
    const { showToast } = useToast();
    const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'schedule'>('dashboard');
    const [confirmState, setConfirmState] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        confirmText?: string;
        cancelText?: string;
        variant?: 'info' | 'success' | 'danger' | 'warning';
        showInput?: boolean;
        inputPlaceholder?: string;
        onConfirm: (notes?: string) => void;
    }>({
        isOpen: false,
        title: '',
        description: '',
        onConfirm: () => {},
    });
    
    if (!project || !user) {
        return (
            <div className="py-20 text-center animate-pulse">
                <LayoutDashboard size={40} className="mx-auto text-zinc-100 mb-4" />
                <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">Hydrating Management Hub...</p>
            </div>
        );
    }

    const isManagementPhase = phaseKey === 'management';
    
    const milestones = project?.milestones || [];
    const completedCount = milestones.filter((m: any) => m.is_completed).length;
    const progress = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

    const [isLoading, setIsLoading] = useState(false);

    const pendingMilestones = milestones.filter((m: any) => 
        m.approval_status === 'pending' || m.approval_status === 'approved' || m.approval_status === 'revision'
    );

    const groupedMilestones = pendingMilestones.reduce((acc: any, m: any) => {
        const phase = m.phase_context || 'other';
        if (!acc[phase]) acc[phase] = [];
        acc[phase].push(m);
        return acc;
    }, {});

    const activePhases = ['management', 'legal', 'design', 'build', 'interior', 'other'].filter(
        phase => groupedMilestones[phase] && groupedMilestones[phase].length > 0
    );

    const getProfessionalDetails = (m: any) => {
        if (m.notaris_id) return { role: 'Notaris', name: project.notaris?.user?.name || 'Notary' };
        if (m.arsitek_id) return { role: 'Arsitek', name: project.arsitek?.user?.name || 'Architect' };
        if (m.kontraktor_id) return { role: 'Kontraktor', name: project.kontraktor?.user?.name || 'Contractor' };
        if (m.interior_id) return { role: 'Interior', name: project.interior?.user?.name || 'Interior Designer' };
        if (m.structural_id) return { role: 'Struktur', name: project.structural_engineer?.user?.name || 'Structural Engineer' };
        if (m.mep_id) return { role: 'MEP', name: project.mep_engineer?.user?.name || 'MEP Engineer' };
        return { role: 'Professional', name: 'General' };
    };

    const getPhaseLabel = (phase?: string) => {
        switch (phase) {
            case 'legal': return 'Legalitas';
            case 'design': return 'Desain';
            case 'build': return 'Konstruksi';
            case 'interior': return 'Interior';
            case 'management': return 'Manajemen';
            default: return phase || 'Umum';
        }
    };

    const handleVerifyMilestone = async (milestoneId: number, status: 'approved' | 'revision') => {
        if (isLoading) return;
        
        const executeUpdate = async (notes = '') => {
            setIsLoading(true);
            try {
                await axios.post(`/projects/${project.id}/milestones/${milestoneId}`, {
                    _method: 'PUT',
                    approval_status: status,
                    is_completed: status === 'approved',
                    revision_notes: notes
                });
                showToast(status === 'approved' ? 'Deliverable verified & approved.' : 'Revision requested.', 'success');
                onRefresh();
            } catch (error: any) {
                showToast(error.response?.data?.message || 'Failed to update deliverable status.', 'error');
            } finally {
                setIsLoading(false);
                setConfirmState(prev => ({ ...prev, isOpen: false }));
            }
        };

        if (status === 'revision') {
            setConfirmState({
                isOpen: true,
                title: 'Request Revision?',
                description: 'Please specify the details/revision notes that the professional needs to address:',
                confirmText: 'Request Revision',
                cancelText: 'Cancel',
                variant: 'warning',
                showInput: true,
                inputPlaceholder: 'Type revision notes here...',
                onConfirm: (notes) => executeUpdate(notes)
            });
        } else {
            setConfirmState({
                isOpen: true,
                title: 'Approve Step/Milestone?',
                description: 'Are you sure you want to approve this deliverable step? Doing so will mark it as complete.',
                confirmText: 'Approve',
                cancelText: 'Cancel',
                variant: 'success',
                onConfirm: () => executeUpdate()
            });
        }
    };
    
    const showBoM = phaseKey && !['management', 'legal'].includes(phaseKey);

    const pendingAddendums = project?.addendums?.filter((a: any) => 
        a.status === 'pending_approval' || a.status === 'approved'
    ) || [];

    // Read-only: PM is notified of recommendations, not a gate
    const recommendedBids = [
        ...(project?.bids_structural || []).filter((b: any) => b.is_recommended && !['contract_pending', 'accepted'].includes(b.status)),
        ...(project?.bids_mep || []).filter((b: any) => b.is_recommended && !['contract_pending', 'accepted'].includes(b.status))
    ].map(b => ({ ...b, bid_type: b.structural_id ? 'structural' : 'mep' }));

    const totalAlertsCount = pendingAddendums.length + recommendedBids.length;

    const pendingHandovers: { phase: string; title: string; submittedAt: string; state: 'awaiting_pm' | 'awaiting_owner' | 'completed' }[] = [];
    const completed = project.completed_phases || [];

    // Design handover
    if (project.design_handover_submitted_at) {
        pendingHandovers.push({ phase: 'design', title: 'Architecture & Engineering', submittedAt: project.design_handover_submitted_at,
            state: completed.includes('design') ? 'completed' : (project.design_completed_at ? 'awaiting_owner' : 'awaiting_pm') });
    }
    // Construction handover
    if (project.construction_handover_submitted_at) {
        pendingHandovers.push({ phase: 'build', title: 'Construction & Build', submittedAt: project.construction_handover_submitted_at,
            state: completed.includes('build') ? 'completed' : (project.construction_completed_at ? 'awaiting_owner' : 'awaiting_pm') });
    }
    // Interior handover
    if (project.interior_handover_submitted_at) {
        pendingHandovers.push({ phase: 'interior', title: 'Interior & Furnishing', submittedAt: project.interior_handover_submitted_at,
            state: completed.includes('interior') ? 'completed' : (project.interior_completed_at ? 'awaiting_owner' : 'awaiting_pm') });
    }

    const handleVerifyAddendum = async (addendum: any, status: 'approved' | 'rejected') => {
        if (isLoading) return;

        const executeUpdate = async () => {
            setIsLoading(true);
            try {
                if (addendum.type === 'specialist_request') {
                    await axios.post(`/projects/${project.id}/verify-engineering/${addendum.id}`, { status });
                    showToast(`Specialist request ${status} successfully.`, 'success');
                } else {
                    const action = status === 'approved' ? 'approve' : 'reject';
                    await axios.post(`/projects/${project.id}/addendums/${addendum.id}/${action}`);
                    showToast(`Addendum ${status} successfully.`, 'success');
                }
                onRefresh();
            } catch (error: any) {
                showToast(error.response?.data?.message || 'Failed to update addendum status.', 'error');
            } finally {
                setIsLoading(false);
                setConfirmState(prev => ({ ...prev, isOpen: false }));
            }
        };

        setConfirmState({
            isOpen: true,
            title: status === 'approved' ? 'Authorize Addendum?' : 'Reject Addendum?',
            description: status === 'approved'
                ? `Are you sure you want to authorize this addendum: "${addendum.title}"?`
                : `Are you sure you want to reject this addendum: "${addendum.title}"?`,
            confirmText: status === 'approved' ? 'Authorize' : 'Reject',
            cancelText: 'Cancel',
            variant: status === 'approved' ? 'success' : 'danger',
            onConfirm: executeUpdate
        });
    };

    const handleVerifyHandover = async (phase: string, action: 'approve' | 'reject') => {
        if (isLoading) return;
        
        const executeUpdate = async (notes = '') => {
            setIsLoading(true);
            try {
                if (action === 'approve') {
                    await axios.post(`/projects/${project.id}/handover/approve`, { phase });
                    showToast(`${phase.toUpperCase()} handover approved & sealed.`, 'success');
                } else {
                    await axios.post(`/projects/${project.id}/handover/reject`, { phase, notes });
                    showToast(`${phase.toUpperCase()} handover revision requested.`, 'success');
                }
                onRefresh();
            } catch (error: any) {
                showToast(error.response?.data?.message || 'Failed to verify handover.', 'error');
            } finally {
                setIsLoading(false);
                setConfirmState(prev => ({ ...prev, isOpen: false }));
            }
        };

        if (action === 'reject') {
            setConfirmState({
                isOpen: true,
                title: 'Reject Handover / Request Revision?',
                description: `Please specify the reason/revision notes for requesting a revision on the ${phase.toUpperCase()} handover:`,
                confirmText: 'Request Revision',
                cancelText: 'Cancel',
                variant: 'warning',
                showInput: true,
                inputPlaceholder: 'Type reason for rejection here...',
                onConfirm: (notes) => executeUpdate(notes)
            });
        } else {
            setConfirmState({
                isOpen: true,
                title: 'Seal & Approve Handover?',
                description: `Are you sure you want to seal and approve the handover for the ${phase.toUpperCase()} phase? This will lock current configurations.`,
                confirmText: 'Seal Phase',
                cancelText: 'Cancel',
                variant: 'success',
                onConfirm: () => executeUpdate()
            });
        }
    };

    const handleAuthorizePhase = async (phase: string, authorize: boolean) => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            await axios.post(`/projects/${project.id}/authorize-phase`, { phase, authorize });
            showToast(`Phase ${phase} ${authorize ? 'authorized' : 'authorization revoked'}.`, 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to update phase authorization.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* PM Sub-Navigation - Only in Management Phase */}
            {isManagementPhase && (
                <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-2xl border border-slate-100 w-fit">
                    <button
                        onClick={() => setActiveSubTab('dashboard')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            activeSubTab === 'dashboard' 
                            ? 'bg-white text-slate-900 shadow-sm border border-slate-100' 
                            : 'text-slate-400 hover:text-slate-600'
                        }`}
                    >
                        <LayoutDashboard size={14} />
                        Dashboard
                    </button>

                    <button
                        onClick={() => setActiveSubTab('schedule')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            activeSubTab === 'schedule' 
                            ? 'bg-white text-slate-900 shadow-sm border border-slate-100' 
                            : 'text-slate-400 hover:text-slate-600'
                        }`}
                    >
                        <CalendarRange size={14} />
                        Schedule & Reports
                    </button>
                </div>
            )}

            {activeSubTab === 'dashboard' ? (
                <div className="space-y-8">
                    {/* Unified Grouped Approvals Board */}
                    {(pendingHandovers.length > 0 || pendingMilestones.length > 0 || pendingAddendums.length > 0 || recommendedBids.length > 0) && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 border-b border-zinc-100 pb-2">
                                <span className="w-2 h-2 rounded-full bg-zinc-900 animate-pulse" />
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-900">Pending Approvals Board</h3>
                            </div>
                            <PMGroupedApprovals
                                project={project}
                                pendingMilestones={pendingMilestones}
                                pendingHandovers={pendingHandovers}
                                pendingAddendums={pendingAddendums}
                                recommendedBids={recommendedBids}
                                isLoading={isLoading}
                                onVerifyMilestone={handleVerifyMilestone}
                                onVerifyHandover={handleVerifyHandover}
                                onVerifyAddendum={handleVerifyAddendum}
                                onNavigateToPhase={onNavigateToPhase}
                            />
                        </div>
                    )}



                    {/* Procurement / BoM Integration */}
                    {showBoM && (() => {
                        const isOwner = user?.id === project?.user_id;
                        const isPM = user?.role_type === 'project_manager' && project?.pm_id === user?.id;
                        const isHiredContractor = user?.role_type === 'kontraktor' && project?.selected_kontraktor_id === user?.id;
                        const canMutateBOM = isOwner || isPM || isHiredContractor;
                        
                        return (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-black text-gray-900">Procurement & Resources</h3>
                                        <p className="text-sm text-gray-400">Bill of Materials and supply tracking</p>
                                    </div>
                                </div>
                                
                                <div className="bg-white rounded-3xl border border-gray-100 p-1 shadow-sm overflow-hidden">
                                    <ProjectRequirements 
                                        project={project} 
                                        onUpdate={onRefresh}
                                        canMutate={canMutateBOM}
                                        currentUser={user}
                                    />
                                </div>
                            </div>
                        );
                    })()}

                    {/* PM Workflow Notes */}
                    {phaseKey !== 'materials' && (
                        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="space-y-1 max-w-xl">
                                <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                                    <ShieldCheck size={14} className="text-gray-500" />
                                    Phase Authorizations
                                </h3>
                                <p className="text-xs text-gray-400 font-medium">
                                    Control project phase transitions. Hired professionals (Architects and Contractors) can only begin execution once their respective phase is officially authorized.
                                </p>
                            </div>
                            
                            <div className="flex items-center gap-6 bg-gray-50 p-4 rounded-2xl border border-gray-100/50 shrink-0">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black uppercase text-gray-700 tracking-wider">Design</span>
                                    <button 
                                        onClick={() => handleAuthorizePhase('design', !project.design_authorized_at)}
                                        disabled={isLoading}
                                        className={`w-10 h-5 rounded-full transition-colors relative ${project.design_authorized_at ? 'bg-zinc-900' : 'bg-gray-300'}`}
                                    >
                                        <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-transform ${project.design_authorized_at ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>

                                <div className="h-6 w-px bg-gray-200" />

                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black uppercase text-gray-700 tracking-wider">Construction</span>
                                    <button 
                                        onClick={() => handleAuthorizePhase('build', !project.construction_authorized_at)}
                                        disabled={isLoading}
                                        className={`w-10 h-5 rounded-full transition-colors relative ${project.construction_authorized_at ? 'bg-zinc-900' : 'bg-gray-300'}`}
                                    >
                                        <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-transform ${project.construction_authorized_at ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="animate-in slide-in-from-bottom-4 duration-500">
                    {activeSubTab === 'schedule' && (
                        <PMSchedule 
                            project={project} 
                            user={user} 
                            onRefresh={onRefresh} 
                        />
                    )}
                </div>
            )}

            <ConfirmModal
                isOpen={confirmState.isOpen}
                title={confirmState.title}
                description={confirmState.description}
                confirmText={confirmState.confirmText}
                cancelText={confirmState.cancelText}
                variant={confirmState.variant}
                showInput={confirmState.showInput}
                inputPlaceholder={confirmState.inputPlaceholder}
                isLoading={isLoading}
                onConfirm={confirmState.onConfirm}
                onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
}

function StatCard({ label, value, subtext, icon: Icon, color, bg }: any) {
    return (
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex items-start gap-4">
            <div className={`p-3 rounded-2xl ${bg} ${color}`}>
                <Icon size={24} />
            </div>
            <div>
                <p className="text-sm font-bold text-gray-400">{label}</p>
                <p className="text-2xl font-black text-gray-900 leading-tight my-0.5">{value}</p>
                <p className="text-xs font-medium text-gray-400">{subtext}</p>
            </div>
        </div>
    );
}
