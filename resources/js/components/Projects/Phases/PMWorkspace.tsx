import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
    LayoutDashboard, ClipboardList, 
    DollarSign, MessageSquare, BarChart3,
    CheckCircle2, Clock, AlertCircle, XCircle,
    UserPlus, ShieldAlert, Check,
    ShieldCheck, FileText, CalendarRange, Box
} from 'lucide-react';
import axios from 'axios';
import { useToast } from '../../../context/ToastContext';
import ProjectRequirements from '../ProjectRequirements';
import PMQualityControl from '../PMWorkspace/PMQualityControl';
import PMReports from '../PMWorkspace/PMReports';
import PMSchedule from '../PMWorkspace/PMSchedule';
import PMProcurement from '../PMWorkspace/PMProcurement';

interface PMWorkspaceProps {
    project: any;
    user: any;
    onRefresh: () => void;
    phaseKey?: string;
}

export default function PMWorkspace({ project, user, onRefresh, phaseKey }: PMWorkspaceProps) {
    const { showToast } = useToast();
    const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'qa' | 'reports' | 'schedule' | 'logistics'>('dashboard');
    const [reportFilter, setReportFilter] = useState<string | undefined>(undefined);
    
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

    const handleVerifyTechnical = async (addendumId: number, status: 'approved' | 'rejected') => {
        try {
            await axios.post(`/projects/${project.id}/verify-engineering/${addendumId}`, { status });
            showToast(`Engineering request ${status} successfully.`, 'success');
            onRefresh();
        } catch (error) {
            showToast('Failed to process engineering request.', 'error');
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
                        onClick={() => setActiveSubTab('qa')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            activeSubTab === 'qa' 
                            ? 'bg-white text-slate-900 shadow-sm border border-slate-100' 
                            : 'text-slate-400 hover:text-slate-600'
                        }`}
                    >
                        <ShieldCheck size={14} />
                        QA/QC
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
                    <button
                        onClick={() => setActiveSubTab('logistics')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            activeSubTab === 'logistics' 
                            ? 'bg-white text-slate-900 shadow-sm border border-slate-100' 
                            : 'text-slate-400 hover:text-slate-600'
                        }`}
                    >
                        <Box size={14} />
                        Logistics
                    </button>
                </div>
            )}

            {activeSubTab === 'dashboard' ? (
                <div className="space-y-8">
                    {/* Unified Handover Review Board */}
                    {pendingHandovers.length > 0 && (
                        <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl border-4 border-emerald-500/50 ring-8 ring-emerald-500/10">
                            <div className="absolute top-0 right-0 p-6 opacity-5 animate-pulse">
                                <CheckCircle2 size={150} />
                            </div>
                            
                            <div className="relative z-10 space-y-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/40">
                                        <ClipboardList size={24} className="text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black tracking-tight text-emerald-400">Handover Queue</h3>
                                        <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Phase completion waiting for your verification</p>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {pendingHandovers.map((handover: any) => (
                                        <div key={handover.phase} className="p-5 bg-white/5 border border-white/10 rounded-[1.5rem] flex items-center justify-between group hover:bg-white/10 transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 ${handover.state === 'awaiting_owner' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform`}>
                                                    <ShieldAlert size={24} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-white">{handover.title}</p>
                                                    <p className={`text-[11px] font-medium ${handover.state === 'awaiting_owner' ? 'text-blue-400' : 'text-emerald-400'}`}>
                                                        {handover.state === 'awaiting_owner' ? '✅ PM Sealed — Awaiting Owner Confirmation' : 'Awaiting Technical Review'}
                                                    </p>
                                                </div>
                                            </div>
                                            {handover.state === 'awaiting_pm' ? (
                                                <div className="flex items-center gap-2">
                                                    <button 
                                                        onClick={() => handleVerifyHandover(handover.phase, 'approve')}
                                                        disabled={isLoading}
                                                        className="h-10 px-6 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 text-white"
                                                    >
                                                        <Check size={14} /> Seal
                                                    </button>
                                                    <button 
                                                        onClick={() => handleVerifyHandover(handover.phase, 'reject')}
                                                        disabled={isLoading}
                                                        className="h-10 w-10 flex items-center justify-center disabled:opacity-50 bg-white/10 hover:bg-red-500/20 text-white/30 hover:text-red-500 rounded-xl transition-all"
                                                        title="Request Revision"
                                                    >
                                                        <XCircle size={18} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="px-4 py-2 bg-blue-500/20 text-blue-300 rounded-xl text-[10px] font-black uppercase tracking-widest">
                                                    Owner Pending
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Pending Engineering Requests & Specialist Info Board */}
                    {totalAlertsCount > 0 && (
                        <div className="bg-slate-950 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl border-4 border-amber-500/50 ring-8 ring-amber-500/10">
                            <div className="absolute top-0 right-0 p-6 opacity-10 animate-pulse">
                                <ShieldAlert size={120} />
                            </div>
                            
                            <div className="relative z-10 space-y-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center animate-bounce shadow-lg shadow-amber-500/40">
                                        <Clock size={24} className="text-black" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black tracking-tight text-amber-400">Authorization Required</h3>
                                        <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Technician Hiring Requests pending your signature</p>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Professional Addendum Requests */}
                                    {pendingAddendums.map((req: any) => (
                                        <div key={`req-${req.id}`} className="p-5 bg-white/5 border border-white/10 rounded-[1.5rem] flex items-center justify-between group hover:bg-white/10 transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                                    <UserPlus size={24} />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm font-black text-white">{req.title}</p>
                                                        <span className="px-2 py-0.5 bg-white/10 text-[8px] font-black uppercase tracking-widest text-slate-400 rounded-md">
                                                            {req.role_type}
                                                        </span>
                                                    </div>
                                                    <p className="text-[11px] text-white/40 font-medium truncate max-w-[180px]">{req.description}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button 
                                                    onClick={() => handleVerifyTechnical(req.id, 'approved')}
                                                    className="h-10 px-6 bg-emerald-500 hover:bg-emerald-600 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-500/20"
                                                >
                                                    Authorize
                                                </button>
                                                <button 
                                                    onClick={() => handleVerifyTechnical(req.id, 'rejected')}
                                                    className="h-10 w-10 flex items-center justify-center bg-white/10 hover:bg-red-500/20 text-white/30 hover:text-red-500 rounded-xl transition-all"
                                                >
                                                    <XCircle size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Recommended Specialist Bids — READ-ONLY for PM */}
                                    {recommendedBids.map((bid: any) => (
                                        <div key={`bid-${bid.id}`} className="p-5 bg-white/5 border border-white/10 rounded-[1.5rem] flex items-center justify-between group hover:bg-white/10 transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center">
                                                    <ShieldCheck size={24} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-white">Recommended {bid.bid_type === 'structural' ? 'Structural' : 'MEP'} Specialist</p>
                                                    <p className="text-[11px] text-white/40 font-medium truncate max-w-[220px]">
                                                        {bid.structural_engineer?.user?.name || bid.mep_engineer?.user?.name || 'Engineer'} — Recommended by Architect
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="px-4 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-black uppercase tracking-widest rounded-xl">
                                                Awaiting Owner Authorization
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
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
                    {showBoM && (
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
                                    user={user}
                                    hideInventoryActions={true} 
                                />
                            </div>
                        </div>
                    )}

                    {/* PM Workflow Notes */}
                    <div className="bg-neutral-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl">
                        <div className="relative z-10 space-y-8">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div>
                                    <h3 className="text-xl font-black mb-2 flex items-center gap-2">
                                        <LayoutDashboard size={24} className="text-red-500" />
                                        Operational Directive
                                    </h3>
                                    <p className="text-neutral-400 text-sm max-w-xl leading-relaxed">
                                        As the Project Manager, you have full oversight across all professional tracks. 
                                        Use the **Budget** tab for financial audits and the **QA** tab for vendor coordination.
                                    </p>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-white/5 text-[10px] text-neutral-500 font-bold uppercase tracking-[0.2em]">
                                Project Governance Protocol v4.0.2
                            </div>
                        </div>
                        <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                    </div>
                </div>
            ) : (
                <div className="animate-in slide-in-from-bottom-4 duration-500">
                    {activeSubTab === 'qa' && <PMQualityControl project={project} user={user} onRefresh={onRefresh} />}
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
                    {activeSubTab === 'logistics' && <PMProcurement project={project} user={user} />}
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
