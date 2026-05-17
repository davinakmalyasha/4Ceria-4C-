import React, { useState, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Pencil, CheckCircle, Save, X, Lock, Info, Hammer, Users, Calendar, 
    Settings, Target, Clock, ShieldCheck, ChevronDown, ChevronRight, Calculator,
    Shield, CheckSquare, Plus, Trash2, Building2, Link, Copy, Unlink, AlertTriangle
} from 'lucide-react';
import { 
    CONSTRUCTION_METHODS, 
    SAFETY_PROTOCOLS,
    CONSTRUCTION_MILESTONE_TYPES,
    RAB_CATEGORIES,
    WORKFORCE_ROLES,
    WORK_DAY_OPTIONS,
    CONTRACTOR_BID_EQUIPMENT
} from '../../../constants/ContractorStandardPresets';
import { useToast } from '../../../context/ToastContext';

interface ConstructionBriefManagerProps {
    project: any;
    isContractor: boolean;
    isOwner?: boolean;
    isPM?: boolean;
    onRefresh: () => void;
}

export default function ConstructionBriefManager({ project, isContractor, isOwner, isPM, onRefresh }: ConstructionBriefManagerProps) {
    const { showToast } = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isLocking, setIsLocking] = useState(false);
    const [activeSection, setActiveSection] = useState<number | null>(1);

    const brief = project.construction_details || {};
    const isLocked = !!project.construction_locked_at;
    const contractPrice = project.hired_contract_price || 0;

    // Share Link State
    const [shareUrl, setShareUrl] = useState<string | null>(project.share_token ? `${window.location.origin}/brief/${project.share_token}` : null);
    const [shareLoading, setShareLoading] = useState(false);

    // Form States
    const [method, setMethod] = useState(brief.method || 'conventional');
    const [workScope, setWorkScope] = useState<string[]>(brief.work_scope || CONSTRUCTION_MILESTONE_TYPES.map(m => m.id));
    const [scopeNotes, setScopeNotes] = useState(brief.scope_notes || '');
    
    const [rab, setRab] = useState<{category: string; percentage: number}[]>(
        brief.rab || RAB_CATEGORIES.map(c => ({ category: c.id, percentage: c.defaultPct }))
    );

    const [scheduleStart, setScheduleStart] = useState(brief.schedule_start || brief.work_schedule_start || '');
    const [scheduleEnd, setScheduleEnd] = useState(brief.schedule_end || brief.work_schedule_end || '');
    const [workDays, setWorkDays] = useState(brief.work_days || 'mon_sat');
    const [workHoursStart, setWorkHoursStart] = useState(brief.work_hours_start || '07:00');
    const [workHoursEnd, setWorkHoursEnd] = useState(brief.work_hours_end || '17:00');
    const [breakTime, setBreakTime] = useState(brief.break_time || '12:00 - 13:00');

    const [workforce, setWorkforce] = useState<{mandor: number; tukang: number; kuli: number}>(
        brief.workforce || { mandor: 1, tukang: 5, kuli: 4 }
    );
    const [equipment, setEquipment] = useState<string[]>(brief.equipment || []);

    const [safetyProtocols, setSafetyProtocols] = useState<string[]>(brief.safety_protocols || ['hardhat', 'safety_vest', 'safety_boots']);
    
    // Subcontractors
    const [subcontractors, setSubcontractors] = useState<{scope: string; name: string; cost: number; type: string}[]>(
        brief.subcontractors || []
    );

    const [siteNotes, setSiteNotes] = useState(brief.site_notes || '');

    const totalRab = useMemo(() => rab.reduce((acc, curr) => acc + curr.percentage, 0), [rab]);

    const handleSave = async () => {
        if (totalRab !== 100) {
            showToast('RAB cost breakdown must total exactly 100%.', 'error');
            setActiveSection(2);
            return;
        }

        setIsLoading(true);
        try {
            await axios.put(`/projects/${project.id}`, {
                construction_details: {
                    method,
                    work_scope: workScope,
                    scope_notes: scopeNotes,
                    rab,
                    schedule_start: scheduleStart,
                    schedule_end: scheduleEnd,
                    work_days: workDays,
                    work_hours_start: workHoursStart,
                    work_hours_end: workHoursEnd,
                    break_time: breakTime,
                    workforce,
                    equipment,
                    safety_protocols: safetyProtocols,
                    subcontractors,
                    site_notes: siteNotes,
                    updated_at: new Date().toISOString()
                }
            });
            showToast('Construction specification updated successfully!', 'success');
            setIsEditing(false);
            setIsReconstructing(false);
            onRefresh();
        } catch (error) {
            showToast('Failed to update construction specifications.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async () => {
        // Validation: Ensure everything is ready
        if (totalRab !== 100) {
            showToast('Cannot submit: RAB must total 100%.', 'error');
            setActiveSection(3);
            return;
        }

        if (!scheduleStart || !scheduleEnd) {
            showToast('Cannot submit: Please select Start and End dates in Section 2.', 'error');
            setActiveSection(2);
            return;
        }

        if (!window.confirm('Submit this master plan to the Project Manager / Owner for review?')) return;

        setIsLocking(true);
        try {
            // AUTO-SAVE BEFORE SUBMITTING
            await axios.put(`/projects/${project.id}`, {
                construction_details: {
                    method,
                    work_scope: workScope,
                    scope_notes: scopeNotes,
                    rab,
                    schedule_start: scheduleStart,
                    schedule_end: scheduleEnd,
                    work_days: workDays,
                    work_hours_start: workHoursStart,
                    work_hours_end: workHoursEnd,
                    break_time: breakTime,
                    workforce,
                    equipment,
                    safety_protocols: safetyProtocols,
                    subcontractors,
                    site_notes: siteNotes,
                }
            });

            await axios.post(`/projects/${project.id}/lock-brief`, { phase: 'build' });
            showToast('Construction Plan submitted for review!', 'success');
            onRefresh();
        } catch (error: any) {
             showToast(error.response?.data?.message || 'Failed to submit plan.', 'error');
        } finally {
            setIsLocking(false);
        }
    };

    const handleApprove = async () => {
        if (!window.confirm('Approve this master plan and LOCK it permanently? This authorizes the contractor to proceed.')) return;
        try {
            await axios.post(`/projects/${project.id}/approve-construction-brief`);
            showToast('Plan approved and locked!', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to approve plan.', 'error');
        }
    };

    const handleRevise = async () => {
        const notes = window.prompt("Enter revision notes for the contractor:");
        if (!notes) return;
        try {
            await axios.post(`/projects/${project.id}/revise-construction-brief`, { notes });
            showToast('Revision requested.', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to request revision.', 'error');
        }
    };

    const handleKickoff = async () => {
        if (!window.confirm('Issue official Notice to Proceed to the Contractor? This starts the project timeline.')) return;
        setIsLoading(true);
        try {
            await axios.post(`/projects/${project.id}/kickoff`, { role: 'kontraktor' });
            showToast('Notice to Proceed issued!', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to issue NTP.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // Data Repair Helper (For Project 75)
    const isPlanEmpty = isLocked && (
        !project.construction_details || 
        Object.keys(project.construction_details).length < 2 ||
        !project.construction_details.schedule_start ||
        !project.construction_details.schedule_end
    );
    const [isReconstructing, setIsReconstructing] = useState(false);

    // Subcontractor Helpers
    const addSubcontractor = () => {
        setSubcontractors([...subcontractors, { scope: '', name: '', cost: 0, type: '' }]);
    };
    const removeSubcontractor = (idx: number) => {
        setSubcontractors(subcontractors.filter((_, i) => i !== idx));
    };
    const updateSubcontractor = (idx: number, field: string, value: any) => {
        const updated = [...subcontractors];
        updated[idx] = { ...updated[idx], [field]: value };
        setSubcontractors(updated);
    };

    // Rab Helpers
    const updateRab = (idx: number, val: number) => {
        const updated = [...rab];
        updated[idx].percentage = val;
        setRab(updated);
    };

    // Share Link Handlers
    const handleGenerateLink = async () => {
        setShareLoading(true);
        try {
            const res = await axios.post(`/projects/${project.id}/share-token`);
            setShareUrl(res.data.share_url);
            navigator.clipboard.writeText(res.data.share_url);
            showToast('Link generated & copied to clipboard!', 'success');
            onRefresh();
        } catch {
            showToast('Failed to generate share link.', 'error');
        } finally {
            setShareLoading(false);
        }
    };

    const handleRevokeLink = async () => {
        if (!window.confirm('Revoke share link? Workers will no longer be able to view the brief.')) return;
        try {
            await axios.delete(`/projects/${project.id}/share-token`);
            setShareUrl(null);
            showToast('Share link revoked.', 'success');
            onRefresh();
        } catch {
            showToast('Failed to revoke link.', 'error');
        }
    };

    const handleCopyLink = () => {
        if (shareUrl) {
            navigator.clipboard.writeText(shareUrl);
            showToast('Link copied!', 'success');
        }
    };

    // ─── LOCKED STATE (Client & sealed view) ───
    if (isLocked && !isReconstructing) {
        // Detect if the plan was locked without data (Data Bug fix)
        if (isPlanEmpty && isContractor) {
            return (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-[2.5rem] p-10 text-center space-y-6">
                    <div className="w-20 h-20 bg-amber-100 rounded-3xl flex items-center justify-center text-amber-600 mx-auto shadow-sm">
                        <AlertTriangle size={40} />
                    </div>
                    <div className="max-w-md mx-auto space-y-2">
                        <h3 className="text-xl font-black text-amber-900">Missing Plan Data</h3>
                        <p className="text-sm font-medium text-amber-700 leading-relaxed">
                            This project was locked before the Master Plan data was synchronized. Use the button below to reconstruct the plan details.
                        </p>
                    </div>
                    <button onClick={() => setIsReconstructing(true)} className="px-8 py-4 bg-amber-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-amber-600/20 hover:bg-amber-700 transition-all">
                        Reconstruct Plan Data
                    </button>
                </div>
            );
        }

        const rabMap = new Map((brief.rab || []).map((r: any) => [r.category, r.percentage]) || []);
        
        return (
            <div className="space-y-6">
                <div className="bg-zinc-900 rounded-[2.5rem] p-8 lg:p-12 shadow-2xl relative overflow-hidden text-white/90">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-zinc-800 rounded-full blur-[120px] opacity-30 -translate-y-1/2 translate-x-1/2" />
                    
                    {/* Header */}
                    <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-12">
                        <div className="flex items-center gap-5">
                            <div className="w-16 h-16 bg-zinc-800/80 rounded-2xl flex items-center justify-center text-emerald-400 shadow-inner border border-zinc-700/50">
                                <Lock size={32} />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-white tracking-tight">Project Construction Brief</h3>
                                <p className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.2em] mt-1.5 flex items-center gap-2">
                                    <Clock size={12} /> Sealed & Immutable • {new Date(project.construction_locked_at).toLocaleDateString()}
                                </p>
                            </div>
                        </div>
                        <div className="px-5 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl shrink-0">
                            <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                <ShieldCheck size={14} /> Execution Ready
                            </span>
                        </div>
                    </div>

                    {!project.kontraktor_kickoff_at && (
                        <div className="relative mb-12 p-8 bg-amber-500/10 border border-amber-500/20 rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-6">
                            <div className="flex items-center gap-5">
                                <div className="w-14 h-14 bg-amber-500/20 rounded-2xl flex items-center justify-center text-amber-500">
                                    <Clock size={28} className="animate-pulse" />
                                </div>
                                <div>
                                    <h4 className="text-lg font-black text-amber-500 tracking-tight uppercase">Standby: Awaiting NTP</h4>
                                    <p className="text-[11px] font-medium text-amber-200/60 leading-relaxed max-w-md mt-1">
                                        The plan is locked, but construction cannot start until the official Notice to Proceed is issued.
                                    </p>
                                    {!project.legal_handover_submitted_at && (isOwner || isPM) && (
                                        <p className="text-[9px] font-black text-red-400 uppercase mt-2">
                                            Warning: Notary has not finalized legal documents.
                                        </p>
                                    )}
                                </div>
                            </div>
                            
                            {(isOwner || isPM) && (
                                <button onClick={handleKickoff} disabled={isLoading} className="w-full md:w-auto px-8 py-4 bg-amber-500 text-zinc-900 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-400 transition-all shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2">
                                    {isLoading ? <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" /> : <><CheckCircle size={16} /> Issue Notice to Proceed</>}
                                </button>
                            )}
                        </div>
                    )}

                    <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-12">
                        {/* Sec 1: Scope of Work */}
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] border-b border-zinc-800 pb-2">1. Scope of Work</h4>
                            <div className="grid grid-cols-2 gap-3">
                                {CONSTRUCTION_MILESTONE_TYPES.map(m => (
                                    <div key={m.id} className="flex items-center gap-2">
                                        {(brief.work_scope || []).includes(m.id) 
                                            ? <CheckSquare size={16} className="text-emerald-400" />
                                            : <div className="w-4 h-4 border border-zinc-700 rounded-sm" />
                                        }
                                        <span className={`text-sm font-bold ${ (brief.work_scope || []).includes(m.id) ? 'text-zinc-200' : 'text-zinc-600 line-through' }`}>
                                            {m.label}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            {brief.scope_notes && <p className="text-xs text-zinc-400 italic mt-2 p-3 bg-zinc-800/30 rounded-xl leading-relaxed">"{brief.scope_notes}"</p>}
                        </div>

                        {/* Sec 2: Timeline */}
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] border-b border-zinc-800 pb-2">2. Timeline & Schedule</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-zinc-800/40 rounded-2xl border border-zinc-700/30">
                                    <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Start Date</p>
                                    <p className="text-sm font-black text-white">{brief.schedule_start ? new Date(brief.schedule_start).toLocaleDateString() : 'TBD'}</p>
                                </div>
                                <div className="p-4 bg-zinc-800/40 rounded-2xl border border-zinc-700/30">
                                    <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">End Date</p>
                                    <p className="text-sm font-black text-white">{brief.schedule_end ? new Date(brief.schedule_end).toLocaleDateString() : 'TBD'}</p>
                                </div>
                                <div className="col-span-2 p-4 bg-zinc-800/40 rounded-2xl border border-zinc-700/30 flex justify-between items-center">
                                    <div>
                                        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Work Days</p>
                                        <p className="text-sm font-black text-white">{WORK_DAY_OPTIONS.find(d => d.id === brief.work_days)?.label || brief.work_days}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Work Hours</p>
                                        <p className="text-sm font-black text-white">{brief.work_hours_start} - {brief.work_hours_end}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Sec 3: RAB / Cost Summary */}
                        <div className="space-y-5 lg:col-span-2">
                            <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] border-b border-zinc-800 pb-2">3. Cost Allocation (RAB) — Rp 1.5B (Example)</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                                {RAB_CATEGORIES.map(cat => {
                                    const pct = rabMap.get(cat.id) || 0;
                                    return (
                                        <div key={cat.id} className="space-y-2">
                                            <div className="flex justify-between items-end">
                                                <span className="text-xs font-bold text-zinc-300">{cat.label}</span>
                                                <span className="text-xs font-black text-white">{pct}%</span>
                                            </div>
                                            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Sec 4: Workforce & Equipment */}
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] border-b border-zinc-800 pb-2">4. Workforce & Equipment</h4>
                            <div className="grid grid-cols-3 gap-2 mb-4">
                                <div className="p-3 bg-zinc-800/40 rounded-xl text-center">
                                    <p className="text-lg font-black text-emerald-400">{brief.workforce?.mandor || 0}</p>
                                    <p className="text-[9px] font-black text-zinc-500 uppercase mt-1">Foremen</p>
                                </div>
                                <div className="p-3 bg-zinc-800/40 rounded-xl text-center">
                                    <p className="text-lg font-black text-emerald-400">{brief.workforce?.tukang || 0}</p>
                                    <p className="text-[9px] font-black text-zinc-500 uppercase mt-1">Skilled</p>
                                </div>
                                <div className="p-3 bg-zinc-800/40 rounded-xl text-center">
                                    <p className="text-lg font-black text-emerald-400">{brief.workforce?.kuli || 0}</p>
                                    <p className="text-[9px] font-black text-zinc-500 uppercase mt-1">Laborers</p>
                                </div>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-zinc-500 uppercase mb-2">Heavy Equipment:</p>
                                <div className="flex flex-wrap gap-2">
                                    {(brief.equipment || []).map((e: string) => (
                                        <span key={e} className="px-2.5 py-1 bg-zinc-800 rounded-lg text-xs font-bold text-zinc-300">{e}</span>
                                    ))}
                                    {(!brief.equipment || brief.equipment.length === 0) && <span className="text-xs text-zinc-600">None declared</span>}
                                </div>
                            </div>
                        </div>

                        {/* Sec 5: Subcontractors & Safety */}
                        <div className="space-y-8">
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] border-b border-zinc-800 pb-2">5. Supply Chain & K3L</h4>
                                <div>
                                    <p className="text-[10px] font-black text-zinc-500 uppercase mb-2">Subcontractors:</p>
                                    {brief.subcontractors && brief.subcontractors.length > 0 ? (
                                        <div className="space-y-2">
                                            {brief.subcontractors.map((sub: any, i: number) => (
                                                <div key={i} className="flex justify-between items-center p-3 bg-zinc-800/30 border border-zinc-700/30 rounded-xl">
                                                    <div>
                                                        <p className="text-xs font-bold text-zinc-200">{sub.name}</p>
                                                        <p className="text-[10px] font-bold text-zinc-500">{CONSTRUCTION_MILESTONE_TYPES.find(m => m.id === sub.scope)?.label || sub.scope}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs font-bold text-zinc-500 italic">100% In-house Execution</p>
                                    )}
                                </div>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-zinc-500 uppercase mb-2 mt-4">Safety Protocols:</p>
                                <div className="flex flex-wrap gap-2">
                                    {SAFETY_PROTOCOLS.filter(p => (brief.safety_protocols || []).includes(p.id)).map(p => (
                                        <span key={p.id} className="px-2.5 py-1 bg-emerald-950/30 border border-emerald-900/50 rounded-lg text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                                            <Shield size={10} /> {p.label}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                        
                        {brief.site_notes && (
                            <div className="lg:col-span-2 space-y-2">
                                <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">6. Site Specific Notes</h4>
                                <div className="p-4 bg-amber-950/20 border border-amber-900/30 rounded-2xl">
                                    <p className="text-sm font-medium text-amber-200/80 leading-relaxed italic">"{brief.site_notes}"</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Share Link Section */}
                    {isContractor && (
                        <div className="relative mt-10 pt-8 border-t border-zinc-800">
                            <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-4">Share With Workers</h4>
                            {shareUrl ? (
                                <div className="flex flex-col sm:flex-row items-stretch gap-3">
                                    <div className="flex-1 flex items-center gap-3 bg-zinc-800/60 rounded-xl px-4 py-3 border border-zinc-700/50 min-w-0">
                                        <Link size={14} className="text-emerald-400 shrink-0" />
                                        <span className="text-xs font-bold text-zinc-300 truncate">{shareUrl}</span>
                                    </div>
                                    <button onClick={handleCopyLink} className="px-5 py-3 bg-white text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-zinc-100 transition-colors shrink-0">
                                        <Copy size={14} /> Copy
                                    </button>
                                    <button onClick={handleRevokeLink} className="px-5 py-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-red-500/20 transition-colors shrink-0">
                                        <Unlink size={14} /> Revoke
                                    </button>
                                </div>
                            ) : (
                                <button onClick={handleGenerateLink} disabled={shareLoading} className="w-full sm:w-auto px-8 py-4 bg-white text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-zinc-100 transition-colors disabled:opacity-50">
                                    {shareLoading ? <div className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" /> : <><Link size={14} /> Generate Share Link</>}
                                </button>
                            )}
                            <p className="text-[10px] text-zinc-600 mt-3">Workers can view the brief on their phone — no login needed.</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ─── EDITING STATE (Contractor Only) ───
    if (isEditing) {
        return (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-slate-900 rounded-[2.5rem] p-8 md:p-12 shadow-2xl space-y-10 text-white">
                <div className="flex items-center justify-between border-b border-white/10 pb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-900 shadow-lg">
                            <Settings size={24} />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-white tracking-tight">Contractor Master Plan</h3>
                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mt-0.5">Prepare before locking</p>
                        </div>
                    </div>
                    <button onClick={() => setIsEditing(false)} className="text-slate-500 hover:text-white transition-colors bg-white/5 p-2 rounded-xl">
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Section 1: Scope */}
                    <SectionAccordion 
                        num={1} title="Scope & Methods" active={activeSection === 1} onClick={() => setActiveSection(activeSection === 1 ? null : 1)}>
                        <div className="space-y-6">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Construction Method</label>
                                <select value={method} onChange={e => setMethod(e.target.value)} className="w-full px-5 py-4 bg-white/5 border-2 border-white/10 rounded-2xl font-bold text-sm text-white focus:border-white outline-none transition-all">
                                    {CONSTRUCTION_METHODS.map(m => <option key={m.id} value={m.id} className="bg-slate-900">{m.label}</option>)}
                                </select>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Included Work Phases</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {CONSTRUCTION_MILESTONE_TYPES.map(m => (
                                        <button key={m.id} onClick={() => {
                                            setWorkScope(prev => prev.includes(m.id) ? prev.filter(x => x !== m.id) : [...prev, m.id])
                                        }} className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${workScope.includes(m.id) ? 'bg-white/10 border-white/30 text-white' : 'border-white/5 text-slate-500 hover:border-white/20'}`}>
                                            <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border ${workScope.includes(m.id) ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-600'}`}>
                                                {workScope.includes(m.id) && <CheckSquare size={12} />}
                                            </div>
                                            <span className="text-xs font-bold leading-tight">{m.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Scope Exclusions / Notes</label>
                                <textarea value={scopeNotes} onChange={e => setScopeNotes(e.target.value)} placeholder="E.g. Groundwork only, no landscaping included." className="w-full px-5 py-4 bg-white/5 border-2 border-white/10 rounded-2xl font-medium text-sm text-white focus:border-white outline-none transition-all h-24 resize-none" />
                            </div>
                        </div>
                    </SectionAccordion>

                    {/* Section 2: Timeline */}
                    <SectionAccordion 
                        num={2} title="Timeline & Schedule" active={activeSection === 2} onClick={() => setActiveSection(activeSection === 2 ? null : 2)}>
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Start Date</label>
                                    <input type="date" value={scheduleStart} onChange={e => setScheduleStart(e.target.value)} className="w-full px-5 py-4 bg-white/5 border-2 border-white/10 rounded-2xl font-bold text-sm text-white focus:border-white outline-none" />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">End Date / Handover</label>
                                    <input type="date" value={scheduleEnd} onChange={e => setScheduleEnd(e.target.value)} className="w-full px-5 py-4 bg-white/5 border-2 border-white/10 rounded-2xl font-bold text-sm text-white focus:border-white outline-none" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Work Days</label>
                                    <select value={workDays} onChange={e => setWorkDays(e.target.value)} className="w-full px-5 py-4 bg-white/5 border-2 border-white/10 rounded-2xl font-bold text-sm text-white focus:border-white outline-none appearance-none">
                                        {WORK_DAY_OPTIONS.map(o => <option key={o.id} value={o.id} className="bg-slate-900">{o.label}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Daily Hours</label>
                                    <div className="flex items-center gap-2">
                                        <input type="time" value={workHoursStart} onChange={e => setWorkHoursStart(e.target.value)} className="w-full px-4 py-4 bg-white/5 border-2 border-white/10 rounded-2xl font-bold text-sm text-white" />
                                        <span className="text-slate-500">to</span>
                                        <input type="time" value={workHoursEnd} onChange={e => setWorkHoursEnd(e.target.value)} className="w-full px-4 py-4 bg-white/5 border-2 border-white/10 rounded-2xl font-bold text-sm text-white" />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Break Time</label>
                                    <input type="text" value={breakTime} onChange={e => setBreakTime(e.target.value)} placeholder="12:00 - 13:00" className="w-full px-5 py-4 bg-white/5 border-2 border-white/10 rounded-2xl font-bold text-sm text-white" />
                                </div>
                            </div>
                        </div>
                    </SectionAccordion>

                    {/* Section 3: Cost RAB */}
                    <SectionAccordion 
                        num={3} title="Cost Breakdown (RAB)" active={activeSection === 3} onClick={() => setActiveSection(activeSection === 3 ? null : 3)}>
                        <div className="space-y-6">
                            <div className="flex justify-between items-center p-4 bg-slate-950 rounded-2xl border border-slate-800">
                                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Total Must Be 100%</span>
                                <span className={`text-xl font-black ${totalRab === 100 ? 'text-emerald-400' : 'text-red-400'}`}>{totalRab}%</span>
                            </div>
                            <div className="grid gap-4">
                                {rab.map((item, idx) => {
                                    const cat = RAB_CATEGORIES.find(c => c.id === item.category);
                                    return (
                                        <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
                                            <div className="flex-1">
                                                <p className="text-sm font-bold text-white mb-1">{cat?.label}</p>
                                                <p className="text-[10px] text-slate-500">{cat?.description}</p>
                                            </div>
                                            <div className="flex items-center gap-4 shrink-0">
                                                <div className="w-full sm:w-48 h-2 bg-slate-800 rounded-full overflow-hidden">
                                                    <div className="h-full bg-blue-500" style={{ width: `${item.percentage}%`}} />
                                                </div>
                                                <div className="relative w-24">
                                                    <input type="number" min="0" max="100" value={item.percentage} onChange={e => updateRab(idx, Number(e.target.value))} className="w-full px-4 py-2.5 bg-slate-900 border-2 border-white/10 rounded-xl text-center font-black text-sm text-white focus:border-white outline-none" />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-black">%</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </SectionAccordion>

                    {/* Section 4: Workforce & Equipment */}
                    <SectionAccordion 
                        num={4} title="Workforce & Tools" active={activeSection === 4} onClick={() => setActiveSection(activeSection === 4 ? null : 4)}>
                        <div className="space-y-8">
                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Human Resources</label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    {WORKFORCE_ROLES.map(role => (
                                        <div key={role.id} className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                                            <p className="text-xs font-bold text-slate-300 mb-2">{role.label}</p>
                                            <div className="flex items-center justify-between bg-slate-900 rounded-xl p-1 border border-white/5">
                                                <button onClick={() => setWorkforce({...workforce, [role.id]: Math.max(0, workforce[role.id as keyof typeof workforce] - 1)})} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-white/10 rounded-lg">-</button>
                                                <span className="font-black text-sm w-10 text-center">{workforce[role.id as keyof typeof workforce]}</span>
                                                <button onClick={() => setWorkforce({...workforce, [role.id]: workforce[role.id as keyof typeof workforce] + 1})} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-white/10 rounded-lg">+</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Heavy Equipment To Deploy</label>
                                <div className="flex flex-wrap gap-2">
                                    {CONTRACTOR_BID_EQUIPMENT.map(eq => (
                                        <button key={eq} onClick={() => setEquipment(prev => prev.includes(eq) ? prev.filter(x => x !== eq) : [...prev, eq])} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border-2 ${equipment.includes(eq) ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/30'}`}>
                                            {eq}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </SectionAccordion>

                    {/* Section 5: Subcontractors & Safety */}
                    <SectionAccordion 
                        num={5} title="Supply Chain & K3L Safety" active={activeSection === 5} onClick={() => setActiveSection(activeSection === 5 ? null : 5)}>
                        <div className="space-y-8">
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subcontractor Plan</label>
                                    <button onClick={addSubcontractor} className="text-[10px] font-black text-emerald-400 uppercase hover:text-emerald-300 flex items-center gap-1"><Plus size={12}/> Add Sub</button>
                                </div>
                                {subcontractors.length === 0 ? (
                                    <div className="p-6 bg-white/5 border border-white/10 border-dashed rounded-2xl text-center">
                                        <p className="text-xs text-slate-500 font-bold">No subcontractors planned. 100% In-house.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {subcontractors.map((sub, idx) => (
                                            <div key={idx} className="p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col md:flex-row gap-3 relative group">
                                                <button onClick={() => removeSubcontractor(idx)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X size={12}/></button>
                                                <select value={sub.scope} onChange={e => updateSubcontractor(idx, 'scope', e.target.value)} className="md:w-1/3 px-4 py-3 bg-slate-900 border-2 border-white/5 rounded-xl text-xs font-bold text-white outline-none">
                                                    <option value="">Select Phase...</option>
                                                    {CONSTRUCTION_MILESTONE_TYPES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                                                </select>
                                                <input type="text" value={sub.name} onChange={e => updateSubcontractor(idx, 'name', e.target.value)} placeholder="Subcontractor Name" className="md:w-1/3 px-4 py-3 bg-slate-900 border-2 border-white/5 rounded-xl text-xs font-bold text-white outline-none placeholder:text-slate-600" />
                                                <input type="text" value={sub.type} onChange={e => updateSubcontractor(idx, 'type', e.target.value)} placeholder="Type/Trade (e.g. Electrical)" className="md:w-1/3 px-4 py-3 bg-slate-900 border-2 border-white/5 rounded-xl text-xs font-bold text-white outline-none placeholder:text-slate-600" />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            
                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mandatory Safety Protocols</label>
                                <div className="flex flex-wrap gap-2">
                                    {SAFETY_PROTOCOLS.map(protocol => (
                                        <button key={protocol.id}
                                            onClick={() => setSafetyProtocols(prev => prev.includes(protocol.id) ? prev.filter(x => x !== protocol.id) : [...prev, protocol.id])}
                                            className={`px-4 py-2.5 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                                                safetyProtocols.includes(protocol.id) ? 'bg-amber-500 border-amber-500 text-slate-900' : 'bg-transparent border-white/10 text-slate-500 hover:border-white/30'
                                            }`}>
                                            {protocol.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </SectionAccordion>

                    {/* Section 6: Specific Notes */}
                    <SectionAccordion 
                        num={6} title="Site Notes & Constraints" active={activeSection === 6} onClick={() => setActiveSection(activeSection === 6 ? null : 6)}>
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Operational Constraints</label>
                            <textarea value={siteNotes} onChange={e => setSiteNotes(e.target.value)} placeholder="E.g. High-density residential area, noisy work limited to 10:00-15:00." className="w-full px-5 py-4 bg-white/5 border-2 border-white/10 rounded-2xl font-medium text-sm text-white focus:border-white outline-none h-32 resize-none placeholder:text-slate-600" />
                        </div>
                    </SectionAccordion>

                </div>

                <div className="pt-6 mt-8 border-t border-white/10">
                    <button onClick={handleSave} disabled={isLoading}
                        className="w-full py-5 bg-white text-slate-900 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.4em] shadow-[0_0_40px_rgba(255,255,255,0.1)] hover:shadow-[0_0_60px_rgba(255,255,255,0.2)] hover:-translate-y-1 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                        {isLoading ? <div className="w-5 h-5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" /> : <><Save size={18} /> {isReconstructing ? 'Finalize Reconstruction' : 'Update Master Plan'}</>}
                    </button>
                    {isReconstructing && (
                        <button onClick={() => setIsReconstructing(false)} className="w-full py-4 text-slate-500 font-bold text-[10px] uppercase tracking-widest mt-2">
                            Cancel Repair
                        </button>
                    )}
                </div>
            </motion.div>
        );
    }

    // ─── DEFAULT STATE: Read-only unlocked view with edit + submit + review options ───
    const briefStatus = project.construction_brief_status || 'draft';

    return (
        <div className="bg-white border-2 border-slate-100 rounded-[2.5rem] p-8 md:p-10 shadow-sm space-y-8 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-48 h-48 bg-slate-50 rounded-bl-[8rem] -mr-16 -mt-16 -z-10" />
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-slate-900 rounded-[1.25rem] flex items-center justify-center text-white shadow-xl shadow-slate-200">
                        <Building2 size={24} />
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">Contractor Master Plan</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Pre-construction configuration</p>
                    </div>
                </div>
                {isContractor && briefStatus !== 'pending_review' && (
                    <button onClick={() => setIsEditing(true)}
                        className="flex items-center justify-center gap-2 px-6 py-3.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 border border-slate-200">
                        <Pencil size={14} /> Edit Plan Details
                    </button>
                )}
            </div>

            {briefStatus === 'pending_review' && (
                <div className="bg-blue-50 border-2 border-blue-200 p-8 text-center rounded-3xl">
                    <ShieldCheck className="w-12 h-12 text-blue-500 mx-auto mb-4" />
                    <h4 className="text-xl font-black text-blue-900 mb-2">Master Plan Under Review</h4>
                    <p className="text-sm font-bold text-blue-700 max-w-lg mx-auto leading-relaxed">
                        {isContractor ? "The plan has been submitted and is awaiting approval from the Project Manager or Owner." : "The contractor has submitted the master plan. Please review it carefully before approving."}
                    </p>

                    {(isOwner || isPM) && (
                        <div className="mt-8 flex flex-col md:flex-row items-center justify-center gap-4">
                            <button onClick={handleApprove}
                                className="w-full md:w-auto px-8 py-4 bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-emerald-500/20 hover:bg-emerald-600 transition-all flex items-center justify-center gap-2">
                                <CheckCircle size={16} /> Approve & Lock Plan
                            </button>
                            <button onClick={handleRevise}
                                className="w-full md:w-auto px-8 py-4 bg-white border-2 border-red-200 text-red-500 rounded-xl text-xs font-black uppercase tracking-[0.2em] hover:bg-red-50 transition-all flex items-center justify-center gap-2">
                                <AlertTriangle size={16} /> Request Revision
                            </button>
                        </div>
                    )}
                </div>
            )}

            {briefStatus === 'revision_requested' && (
                <div className="bg-red-50 border-2 border-red-200 p-6 text-left rounded-3xl">
                    <div className="flex items-center gap-3 mb-2">
                        <AlertTriangle className="text-red-500" size={20} />
                        <h4 className="text-sm font-black text-red-900 tracking-tight">Revision Requested</h4>
                    </div>
                    <p className="text-xs font-medium text-red-800 leading-relaxed italic border-l-2 border-red-300 pl-3">
                        "{project.construction_brief_revision_notes}"
                    </p>
                </div>
            )}

            {briefStatus !== 'pending_review' && (
                <div className="bg-slate-50/50 border-2 border-dashed border-slate-200 p-8 text-center rounded-3xl">
                    <p className="text-sm font-bold text-slate-600 max-w-lg mx-auto leading-relaxed">
                        The detailed construction plan is currently in <span className="font-black text-slate-900">Draft Mode</span>. 
                        {isContractor ? " Configure the comprehensive 6-sections Master Plan by clicking Edit above. Once you're ready, submit the draft for pm review." : " The contractor is currently drafting the master plan. It will be visible here once locked."}
                    </p>
                </div>
            )}

            {/* Submit Plan Button (Contractor only) */}
            {isContractor && briefStatus !== 'pending_review' && (
                <div className="pt-6 border-t border-slate-100">
                    <div className="bg-amber-50 border-2 border-amber-100/60 rounded-[2rem] p-6 lg:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
                        <div className="flex items-center gap-5">
                            <div className="w-14 h-14 bg-amber-100 rounded-[1.25rem] flex items-center justify-center text-amber-600 shrink-0">
                                <CheckSquare size={28} />
                            </div>
                            <div>
                                <h4 className="text-base font-black text-amber-900 tracking-tight">Submit for Review</h4>
                                <p className="text-[11px] text-amber-700/80 font-bold leading-relaxed max-w-md mt-1">
                                    Submit the Master Plan to the Project Manager for approval. Once approved and locked, construction tracking operations will unlock.
                                </p>
                            </div>
                        </div>
                        <button onClick={handleSubmit} disabled={isLocking}
                            className="w-full md:w-auto px-10 py-4 lg:py-5 bg-amber-500 text-white rounded-2xl text-[10px] lg:text-xs font-black uppercase tracking-[0.2em] hover:bg-amber-600 active:scale-95 transition-all shadow-xl shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-3 shrink-0">
                            {isLocking ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><CheckSquare size={16} /> Submit Plan</>}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// Subcomponent for accordion UI
function SectionAccordion({ num, title, active, onClick, children }: any) {
    return (
        <div className="border border-white/10 rounded-[1.5rem] overflow-hidden bg-white/5 transition-all duration-300">
            <button type="button" onClick={onClick} className={`w-full flex items-center justify-between p-5 md:p-6 transition-colors ${active ? 'bg-white/5' : 'hover:bg-white/5'}`}>
                <div className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black transition-colors ${active ? 'bg-white text-slate-900' : 'bg-slate-800 text-slate-400'}`}>
                        {num}
                    </div>
                    <span className="font-black text-sm uppercase tracking-widest">{title}</span>
                </div>
                <div className={`transition-transform duration-300 ${active ? 'rotate-180' : ''}`}>
                    <ChevronDown size={20} className={active ? 'text-white' : 'text-slate-500'} />
                </div>
            </button>
            <AnimatePresence>
                {active && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="p-5 md:p-6 pt-0 border-t border-white/5">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
