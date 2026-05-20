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
import PMReports from '../PMWorkspace/PMReports';
import PMSchedule from '../PMWorkspace/PMSchedule';
import PMGroupedApprovals from './PMGroupedApprovals';

interface PMWorkspaceProps {
    project: any;
    user: any;
    onRefresh: () => void;
    phaseKey?: string;
}

export default function PMWorkspace({ project, user, onRefresh, phaseKey }: PMWorkspaceProps) {
    const { showToast } = useToast();
    const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'reports' | 'schedule'>('dashboard');
    const [reportFilter, setReportFilter] = useState<string | undefined>(undefined);
    const [selectedPhaseFilter, setSelectedPhaseFilter] = useState<string>('all');
    
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
        m.approval_status === 'pending' && 
        !m.is_completed
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
        let notes = '';
        if (status === 'revision') {
            notes = window.prompt("Specify revision notes for the professional:") || '';
            if (!notes.trim()) return;
        }

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
        }
    };
    
    const showBoM = phaseKey && !['management', 'legal'].includes(phaseKey);

    const pendingAddendums = project?.addendums?.filter((a: any) => 
        a.status === 'pending_approval'
    ) || [];

    // Read-only: PM is notified of recommendations, not a gate
    const recommendedBids = [
        ...(project?.bids_structural || []).filter((b: any) => b.is_recommended && !['contract_pending', 'accepted'].includes(b.status)),
        ...(project?.bids_mep || []).filter((b: any) => b.is_recommended && !['contract_pending', 'accepted'].includes(b.status))
    ].map(b => ({ ...b, bid_type: b.structural_id ? 'structural' : 'mep' }));

    const totalAlertsCount = pendingAddendums.length + recommendedBids.length;

    const pendingHandovers: { phase: string; title: string; submittedAt: string; state: 'awaiting_pm' | 'awaiting_owner' }[] = [];
    const completed = project.completed_phases || [];

    // Legal handover
    if (project.legal_handover_submitted_at && !completed.includes('legal')) {
        pendingHandovers.push({ phase: 'legal', title: 'Legal & Permits', submittedAt: project.legal_handover_submitted_at,
            state: project.legal_completed_at ? 'awaiting_owner' : 'awaiting_pm' });
    }
    // Design handover
    if (project.design_handover_submitted_at && !completed.includes('design')) {
        pendingHandovers.push({ phase: 'design', title: 'Architecture & Engineering', submittedAt: project.design_handover_submitted_at,
            state: project.design_completed_at ? 'awaiting_owner' : 'awaiting_pm' });
    }
    // Construction handover
    if (project.construction_handover_submitted_at && !completed.includes('build')) {
        pendingHandovers.push({ phase: 'build', title: 'Construction & Build', submittedAt: project.construction_handover_submitted_at,
            state: project.construction_completed_at ? 'awaiting_owner' : 'awaiting_pm' });
    }
    // Interior handover
    if (project.interior_handover_submitted_at && !completed.includes('interior')) {
        pendingHandovers.push({ phase: 'interior', title: 'Interior & Furnishing', submittedAt: project.interior_handover_submitted_at,
            state: project.interior_completed_at ? 'awaiting_owner' : 'awaiting_pm' });
    }

    const handleVerifyAddendum = async (addendum: any, status: 'approved' | 'rejected') => {
        if (isLoading) return;
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
        }
    };

    const handleVerifyHandover = async (phase: string, action: 'approve' | 'reject') => {
        if (isLoading) return;
        
        let notes = '';
        if (action === 'reject') {
            notes = window.prompt("Reason for requesting revision:") || '';
            if (!notes.trim()) return;
        }

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
                        onClick={() => setActiveSubTab('reports')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            activeSubTab === 'reports' 
                            ? 'bg-white text-slate-900 shadow-sm border border-slate-100' 
                            : 'text-slate-400 hover:text-slate-600'
                        }`}
                    >
                        <FileText size={14} />
                        Reports
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
                        Schedule
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
                            />
                        </div>
                    )}

                    {/* Quick Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <StatCard 
                            label="Milestone Progress" 
                            value={`${progress}%`} 
                            subtext={`${completedCount}/${milestones.length} completed`}
                            icon={BarChart3}
                            color="text-blue-600"
                            bg="bg-blue-50"
                        />
                        <StatCard 
                            label="Active Issues" 
                            value={project?.comments?.length || 0} 
                            subtext="Open discussions"
                            icon={MessageSquare}
                            color="text-red-600"
                            bg="bg-red-50"
                        />
                        <StatCard 
                            label="Budget Status" 
                            value="Stable" 
                            subtext="View budget tab"
                            icon={DollarSign}
                            color="text-emerald-600"
                            bg="bg-emerald-50"
                        />
                    </div>

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
                        <div className="bg-neutral-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl">
                            <div className="relative z-10 space-y-8">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                    <div>
                                        <h3 className="text-xl font-black mb-2 flex items-center gap-2">
                                            <LayoutDashboard size={24} className="text-red-500" />
                                            Operational Directive
                                        </h3>
                                        <p className="text-neutral-400 text-sm max-w-xl leading-relaxed mb-6">
                                            As the Project Manager, you have full oversight across all professional tracks. 
                                            Use the **Budget** tab for financial audits and the **Reports** tab for project coordination.
                                        </p>

                                        {/* Phase Authorization Switches */}
                                        <div className="flex flex-col gap-4 bg-neutral-800/50 p-6 rounded-2xl border border-white/5 w-fit">
                                            <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                                                <ShieldCheck size={14} className="text-emerald-500" />
                                                Phase Authorizations
                                            </h4>
                                            
                                            <div className="flex items-center justify-between gap-12">
                                                <div>
                                                    <p className="text-sm font-bold text-white">Design Phase</p>
                                                    <p className="text-[10px] text-neutral-400">Permit Architect to begin drawing</p>
                                                </div>
                                                <button 
                                                    onClick={() => handleAuthorizePhase('design', !project.design_authorized_at)}
                                                    disabled={isLoading}
                                                    className={`w-12 h-6 rounded-full transition-colors relative ${project.design_authorized_at ? 'bg-emerald-500' : 'bg-neutral-600'}`}
                                                >
                                                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${project.design_authorized_at ? 'translate-x-7' : 'translate-x-1'}`} />
                                                </button>
                                            </div>

                                            <div className="flex items-center justify-between gap-12">
                                                <div>
                                                    <p className="text-sm font-bold text-white">Construction Phase</p>
                                                    <p className="text-[10px] text-neutral-400">Permit Contractor to begin building</p>
                                                </div>
                                                <button 
                                                    onClick={() => handleAuthorizePhase('build', !project.construction_authorized_at)}
                                                    disabled={isLoading}
                                                    className={`w-12 h-6 rounded-full transition-colors relative ${project.construction_authorized_at ? 'bg-emerald-500' : 'bg-neutral-600'}`}
                                                >
                                                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${project.construction_authorized_at ? 'translate-x-7' : 'translate-x-1'}`} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-white/5 text-[10px] text-neutral-500 font-bold uppercase tracking-[0.2em]">
                                    Project Governance Protocol v4.0.2
                                </div>
                            </div>
                            <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="animate-in slide-in-from-bottom-4 duration-500">
                    {activeSubTab === 'reports' && (
                        <PMReports 
                            project={project} 
                            user={user} 
                            onRefresh={onRefresh} 
                            initialFilter={reportFilter}
                            onClearFilter={() => setReportFilter(undefined)}
                        />
                    )}
                    {activeSubTab === 'schedule' && (
                        <PMSchedule 
                            project={project} 
                            user={user} 
                            onRefresh={onRefresh} 
                            onNavigateToReports={(phase) => {
                                setReportFilter(phase);
                                setActiveSubTab('reports');
                            }}
                        />
                    )}
                </div>
            )}
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
