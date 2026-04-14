import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Pencil, CheckCircle, Save, X, Lock, Coins, Layers, Layout, Target, Settings, ShieldCheck, Clock } from 'lucide-react';
import { 
    ARCHITECT_STYLES, 
    ARCHITECT_SERVICE_SCOPES, 
    ARCHITECT_DELIVERABLES,
    ARCHITECT_FEE_TYPES
} from '../../../constants/ArchitectStandardPresets';
import { useToast } from '../../../context/ToastContext';

interface DesignBriefManagerProps {
    project: any;
    isArchitect: boolean;
    onRefresh: () => void;
}

export default function DesignBriefManager({ project, isArchitect, onRefresh }: DesignBriefManagerProps) {
    const { showToast } = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isLocking, setIsLocking] = useState(false);

    const brief = project.design_details || {};
    const isLocked = !!project.design_locked_at;

    // Form States
    const [theme, setTheme] = useState(brief.style || ARCHITECT_STYLES[0]);
    const [scopes, setScopes] = useState<string[]>(brief.scopes || ['schematic']);
    const [deliverables, setDeliverables] = useState<string[]>(brief.deliverables || ['3d_render']);
    const [revisions, setRevisions] = useState(brief.revisions || '3');
    const [feeType, setFeeType] = useState(brief.fee_type || 'fixed');
    const [notes, setNotes] = useState(brief.notes || '');

    const handleSave = async () => {
        setIsLoading(true);
        try {
            await axios.put(`/api/projects/${project.id}`, {
                design_details: {
                    style: theme, scopes, deliverables,
                    revisions, fee_type: feeType, notes,
                    updated_at: new Date().toISOString()
                }
            });
            showToast('Design specification updated successfully!', 'success');
            setIsEditing(false);
            onRefresh();
        } catch (error) {
            showToast('Failed to update design specifications.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLock = async () => {
        if (!window.confirm(
            'PERMANENT ACTION: Lock this design brief?\n\n' +
            'Once locked, no further edits can be made. ' +
            'Make sure you\'ve discussed everything with the client first.\n\n' +
            'This signals that planning is complete and work can begin.'
        )) return;

        setIsLocking(true);
        try {
            await axios.post(`/api/projects/${project.id}/lock-brief`, { phase: 'design' });
            showToast('Design Brief locked! You can now start working.', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to lock brief.', 'error');
        } finally {
            setIsLocking(false);
        }
    };

    // ─── LOCKED STATE: Read-only sealed card ───
    if (isLocked) {
        return (
            <div className="space-y-6">
                <div className="bg-zinc-900 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-zinc-800 rounded-full blur-[100px] opacity-20 -translate-y-1/2 translate-x-1/2" />
                    <div className="relative flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-zinc-800 rounded-2xl flex items-center justify-center text-emerald-400 shadow-inner">
                                <Lock size={28} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white tracking-tight">Design Brief — Locked</h3>
                                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mt-1 flex items-center gap-2">
                                    <Clock size={10} /> Sealed on {new Date(project.design_locked_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                                </p>
                            </div>
                        </div>
                        <div className="px-5 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                            <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                <ShieldCheck size={14} /> Immutable
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-5 bg-zinc-800/50 rounded-2xl border border-zinc-700/50">
                            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Theme / Style</p>
                            <p className="text-sm font-black text-white">{brief.style || 'Not Set'}</p>
                        </div>
                        <div className="p-5 bg-zinc-800/50 rounded-2xl border border-zinc-700/50">
                            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Revision Limit</p>
                            <p className="text-sm font-black text-white">{brief.revisions || 'Standard'} Iterations</p>
                        </div>
                        <div className="p-5 bg-zinc-800/50 rounded-2xl border border-zinc-700/50">
                            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Fee Model</p>
                            <p className="text-sm font-black text-white">{ARCHITECT_FEE_TYPES.find(f => f.id === brief.fee_type)?.label || 'Contractual'}</p>
                        </div>
                    </div>

                    <div className="mt-6 space-y-3">
                        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Deliverables</p>
                        <div className="flex flex-wrap gap-2">
                            {ARCHITECT_DELIVERABLES.filter(d => brief.deliverables?.includes(d.id)).map(d => (
                                <span key={d.id} className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-xl text-[10px] font-bold text-zinc-300 flex items-center gap-1.5">
                                    <CheckCircle size={10} className="text-emerald-400" /> {d.label}
                                </span>
                            ))}
                        </div>
                    </div>

                    {brief.notes && (
                        <div className="mt-6 pt-6 border-t border-zinc-800">
                            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-2">Notes</p>
                            <p className="text-sm text-zinc-400 font-medium italic leading-relaxed">"{brief.notes}"</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ─── EDITABLE STATE: Form mode ───
    if (isEditing) {
        return (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-slate-900 rounded-[2.5rem] p-10 shadow-2xl space-y-10">
                <div className="flex items-center justify-between border-b border-white/5 pb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-900">
                            <Settings size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-white tracking-tight">Configure Design Brief</h3>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-0.5">Defining the global standards for this project</p>
                        </div>
                    </div>
                    <button onClick={() => setIsEditing(false)} className="text-slate-500 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <Target size={14} /> Architectural Identity
                            </label>
                            <select value={theme} onChange={(e) => setTheme(e.target.value)}
                                className="w-full px-6 py-4 bg-white/5 border-2 border-white/10 rounded-2xl font-bold text-sm text-white focus:border-white outline-none transition-all">
                                {ARCHITECT_STYLES.map(s => <option key={s} value={s} className="bg-slate-900">{s}</option>)}
                            </select>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <Layers size={14} /> Revision Protocol
                            </label>
                            <div className="relative">
                                <input type="number" value={revisions} onChange={(e) => setRevisions(e.target.value)}
                                    className="w-full px-6 py-4 bg-white/5 border-2 border-white/10 rounded-2xl font-bold text-sm text-white focus:border-white outline-none transition-all" />
                                <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-500 uppercase tracking-widest">Iterations</span>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <Coins size={14} /> Fee Model Agreed
                            </label>
                            <select value={feeType} onChange={(e) => setFeeType(e.target.value)}
                                className="w-full px-6 py-4 bg-white/5 border-2 border-white/10 rounded-2xl font-bold text-sm text-white focus:border-white outline-none transition-all">
                                {ARCHITECT_FEE_TYPES.map(f => <option key={f.id} value={f.id} className="bg-slate-900">{f.label}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-8">
                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Included Professional Services</label>
                            <div className="grid grid-cols-1 gap-3">
                                {ARCHITECT_SERVICE_SCOPES.map(scope => (
                                    <button key={scope.id}
                                        onClick={() => setScopes(prev => prev.includes(scope.id) ? prev.filter(x => x !== scope.id) : [...prev, scope.id])}
                                        className={`flex items-start gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
                                            scopes.includes(scope.id) ? 'border-white bg-white/10 text-white' : 'border-white/5 bg-transparent text-slate-500 hover:border-white/20'
                                        }`}>
                                        <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 ${scopes.includes(scope.id) ? 'border-white bg-white text-slate-900' : 'border-white/20'}`}>
                                            {scopes.includes(scope.id) && <CheckCircle size={12} />}
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-black uppercase tracking-tight">{scope.label}</p>
                                            <p className="text-[9px] font-medium leading-tight mt-1 opacity-60">{scope.description}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Technical Deliverables</label>
                    <div className="flex flex-wrap gap-2">
                        {ARCHITECT_DELIVERABLES.map(del => (
                            <button key={del.id}
                                onClick={() => setDeliverables(prev => prev.includes(del.id) ? prev.filter(x => x !== del.id) : [...prev, del.id])}
                                className={`px-5 py-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                                    deliverables.includes(del.id) ? 'bg-white border-white text-slate-900' : 'bg-transparent border-white/10 text-slate-500 hover:border-white/30 hover:text-white'
                                }`}>
                                {del.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Collaborative Notes</label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                        placeholder="Enter specific notes about site surveys, client requests, or local regulations..."
                        className="w-full p-6 bg-white/5 border-2 border-white/10 rounded-2xl font-medium text-sm text-white focus:border-white outline-none transition-all resize-none h-32 placeholder:text-slate-600" />
                </div>

                <button onClick={handleSave} disabled={isLoading}
                    className="w-full py-5 bg-white text-slate-900 rounded-2xl font-black text-xs uppercase tracking-[0.4em] shadow-xl hover:-translate-y-1 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                    {isLoading ? <div className="w-5 h-5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" /> : <><Save size={18} /> Save Design Specification</>}
                </button>
            </motion.div>
        );
    }

    // ─── DEFAULT STATE: Read-only with edit + lock buttons ───
    return (
        <div className="bg-white border-2 border-slate-100 rounded-[2.5rem] p-8 shadow-sm space-y-8 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-bl-[5rem] -mr-12 -mt-12 -z-10" />
            
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg">
                        <Layout size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-gray-900 tracking-tight">Rencana Desain (Brief)</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-0.5">Official Project Specifications</p>
                    </div>
                </div>
                {isArchitect && (
                    <button onClick={() => setIsEditing(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95">
                        <Pencil size={14} /> Edit Specifications
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-5 bg-slate-50/50 rounded-3xl border border-slate-100 space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Theme / Style</p>
                    <p className="text-sm font-black text-slate-900">{brief.style || 'Belum Ditentukan'}</p>
                </div>
                <div className="p-5 bg-slate-50/50 rounded-3xl border border-slate-100 space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Revision Limit</p>
                    <p className="text-sm font-black text-slate-900">{brief.revisions || 'Standard'} Iterations</p>
                </div>
                <div className="p-5 bg-slate-50/50 rounded-3xl border border-slate-100 space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fee Model</p>
                    <p className="text-sm font-black text-slate-900">{ARCHITECT_FEE_TYPES.find(f => f.id === brief.fee_type)?.label || 'Contractual'}</p>
                </div>
            </div>

            <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Deliverables Checklist</h4>
                <div className="flex flex-wrap gap-2">
                    {ARCHITECT_DELIVERABLES.map(d => (
                        <div key={d.id}
                            className={`px-4 py-2.5 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${
                                brief.deliverables?.includes(d.id) 
                                ? 'bg-slate-900 border-slate-900 text-white shadow-md' 
                                : 'bg-white border-slate-50 text-slate-200'
                            }`}>
                            <CheckCircle size={14} className={brief.deliverables?.includes(d.id) ? 'text-white' : 'text-slate-100'} />
                            {d.label}
                        </div>
                    ))}
                </div>
            </div>

            {brief.notes && (
                <div className="pt-6 border-t border-slate-50">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Architect's Notes</h4>
                    <div className="bg-amber-50/50 p-5 rounded-2xl border border-amber-100/50">
                        <p className="text-sm text-amber-900 font-medium leading-relaxed italic">"{brief.notes}"</p>
                    </div>
                </div>
            )}

            {/* Lock Plan Button — Only for Architect, before lock */}
            {isArchitect && (
                <div className="pt-6 border-t-2 border-dashed border-slate-100">
                    <div className="bg-amber-50 border-2 border-amber-100 rounded-[2rem] p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600">
                                <Lock size={24} />
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-amber-900 uppercase tracking-widest">Ready to Start?</h4>
                                <p className="text-[10px] text-amber-700 font-bold leading-tight max-w-sm">
                                    Lock this plan once you and the client have agreed on all specifications. This action is permanent.
                                </p>
                            </div>
                        </div>
                        <button onClick={handleLock} disabled={isLocking}
                            className="w-full md:w-auto px-10 py-4 bg-amber-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-amber-600 active:scale-95 transition-all shadow-lg shadow-amber-100 disabled:opacity-50 flex items-center justify-center gap-3">
                            {isLocking ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Lock size={16} /> Lock Plan & Start Work</>}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
