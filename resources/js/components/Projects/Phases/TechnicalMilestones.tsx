import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
    Plus, Pencil, Check, Layers, X, Save, 
    Trash2, FileText, ArrowUpRight, Sparkles, 
    ShieldCheck, Calendar, Banknote, Image as ImageIcon,
    RefreshCw, Upload, Eye, ChevronRight, HardHat, Wrench, AlertTriangle, Sofa
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { motion, AnimatePresence } from 'framer-motion';

interface TechnicalMilestonesProps {
    project: any;
    currentUser: any;
    roleType: 'structural' | 'mep' | 'interior';
    isSpecialist: boolean;
    isPM: boolean;
    auditData?: Record<number, { status: 'approved' | 'revision_requested', note: string }>;
    onReviewChange?: (id: number, status: 'approved' | 'revision_requested', note: string) => void;
    hasSubmittedDeliverables?: boolean;
    isApproved?: boolean;
}

interface Milestone {
    id: number;
    title: string;
    description: string | null;
    image: string | null;
    type: string;
    approval_status?: 'pending' | 'approved' | 'revision';
    revision_notes?: string;
    start_date?: string | null;
    due_date?: string | null;
    content?: {
        gallery?: string[];
        checklist?: { label: string; checked: boolean }[];
    };
    sort_order: number;
    is_completed: boolean;
    pm_verified_at?: string;
    structural_id?: number;
    mep_id?: number;
    review_note?: string;
    review_status?: 'pending' | 'approved' | 'revision_requested';
}

export default function TechnicalMilestones({ 
    project, currentUser, roleType, isSpecialist, isPM,
    auditData = {}, onReviewChange,
    hasSubmittedDeliverables = false,
    isApproved = false
}: TechnicalMilestonesProps) {
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [openNotes, setOpenNotes] = useState<number[]>([]);
    const { showToast } = useToast();

    const toggleNote = (id: number) => {
        setOpenNotes(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    // Form state
    const [formTitle, setFormTitle] = useState('');
    const [formDesc, setFormDesc] = useState('');
    const [submitting, setSubmitting] = useState(false);
    
    // Gallery state
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isOwner = currentUser?.id === project?.user_id;
    const accentColor = roleType === 'structural' ? 'amber' : (roleType === 'mep' ? 'blue' : 'rose');
    const Icon = roleType === 'structural' ? HardHat : (roleType === 'mep' ? Wrench : Sofa);

    const fetchMilestones = async () => {
        try {
            const res = await axios.get(`/projects/${project.id}/milestones`, { 
                params: { phase_context: roleType } 
            });
            setMilestones((res.data?.data || []).sort((a: any, b: any) => a.sort_order - b.sort_order));
        } catch (error) { 
            console.error(error); 
        } finally { 
            setLoading(false); 
        }
    };

    useEffect(() => { fetchMilestones(); }, [project, roleType]);

    const handleEdit = (m: Milestone) => {
        setEditingId(m.id);
        setFormTitle(m.title);
        setFormDesc(m.description || '');
        setSelectedFiles([]);
        setShowForm(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        
        try {
            const formData = new FormData();
            formData.append('title', formTitle);
            formData.append('description', formDesc);
            formData.append('phase_context', roleType);
            
            // Explicitly target the correct specialist ID if being added by Architect
            if (roleType === 'structural' && project.structural_id) {
                formData.append('target_structural_id', project.structural_id.toString());
            } else if (roleType === 'mep' && project.mep_id) {
                formData.append('target_mep_id', project.mep_id.toString());
            } else if (roleType === 'interior' && project.selected_interior_id) {
                formData.append('target_interior_id', project.selected_interior_id.toString());
            }
            
            selectedFiles.forEach(file => {
                formData.append('gallery[]', file);
            });

            if (editingId) {
                formData.append('_method', 'PUT');
                await axios.post(`/projects/${project.id}/milestones/${editingId}`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                showToast('Update saved', 'success');
            } else {
                await axios.post(`/projects/${project.id}/milestones`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                showToast('Progress logged', 'success');
            }
            
            setShowForm(false);
            setEditingId(null);
            setFormTitle('');
            setFormDesc('');
            setSelectedFiles([]);
            fetchMilestones();
        } catch (err: any) { 
            const errorMsg = err.response?.data?.message || 'Error saving progress';
            showToast(errorMsg, 'error'); 
        } finally { 
            setSubmitting(false); 
        }
    };

    const handleApprove = async (m: Milestone) => {
        const isArchitect = currentUser?.id === project?.arsitek?.user_id;
        const confirmMessage = isArchitect
            ? `Are you sure you want to approve the technical review for this progress log "${m.title}"?`
            : m.approval_status === 'reviewed'
                ? `You are about to verify the technical progress log entry: "${m.title}".\n\nNote: This will mark this specific progress log as completed and unlock any linked payments. This does NOT approve the final integrated design of the professional (which is approved via the main workspace panel).\n\nAre you sure you want to proceed?`
                : `You are about to verify the technical progress log entry: "${m.title}" and SKIP the Architect review.\n\nNote: This will mark this specific progress log as completed and unlock any linked payments. This does NOT approve the final integrated design of the professional (which is approved via the main workspace panel).\n\nAre you sure you want to proceed?`;

        if (!window.confirm(confirmMessage)) return;

        try {
            setLoading(true);
            await axios.post(`/projects/${project.id}/milestones/${m.id}/approve`);
            showToast('Technical Milestone Approved', 'success'); 
            fetchMilestones();
        } catch (error) { 
            showToast('Verification failed', 'error'); 
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('Delete this technical log?')) return;
        try {
            await axios.delete(`/projects/${project.id}/milestones/${id}`);
            showToast('Log deleted', 'success');
            fetchMilestones();
        } catch (error) {
            showToast('Delete failed', 'error');
        }
    };

    if (loading) return (
        <div className="py-12 text-center">
            <RefreshCw className="animate-spin mx-auto text-slate-300 mb-2" size={20} />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Loading Technical Logs...</p>
        </div>
    );

    const activeSubPro = (project.sub_professionals || []).find((sp: any) => sp.sub_role === roleType);
    const isHiredAndActive = activeSubPro?.status === 'active';
    const isUnlocked = isApproved || isHiredAndActive;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Technical Progress Logs</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        Audit trail for {roleType} integrity • Note: Verifying logs requires the specialist to finalize/submit their deliverables first.
                    </p>
                </div>
                {isSpecialist && !showForm && (
                    <button 
                        disabled={!isUnlocked}
                        onClick={() => { setEditingId(null); setFormTitle(''); setFormDesc(''); setSelectedFiles([]); setShowForm(true); }} 
                        className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                            isUnlocked 
                            ? 'bg-slate-900 text-white hover:scale-105 shadow-lg cursor-pointer' 
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                        }`}
                        title={!isUnlocked ? "Cannot log technical progress before the specialist is hired and active." : undefined}
                    >
                        <Plus size={14} /> Log Technical Progress
                    </button>
                )}
            </div>

            <AnimatePresence>
                {showForm && (
                    <motion.form 
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        onSubmit={handleSubmit} 
                        className="bg-slate-900 rounded-[2rem] p-8 space-y-6 border border-white/5"
                    >
                        <div className="flex justify-between items-center text-white">
                            <h5 className="text-xs font-black uppercase tracking-[0.2em]">{editingId ? 'Edit Technical Log' : 'New Technical Log'}</h5>
                            <button type="button" onClick={() => setShowForm(false)} className="text-white/40 hover:text-white"><X size={18} /></button>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">Log Title</label>
                                <input 
                                    value={formTitle} 
                                    onChange={e => setFormTitle(e.target.value)} 
                                    placeholder="e.g. Foundation Rebar Inspection" 
                                    className="w-full px-5 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm outline-none focus:border-white focus:bg-white/10 transition-all font-bold" 
                                    required 
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">Observation Details</label>
                                <textarea 
                                    value={formDesc} 
                                    onChange={e => setFormDesc(e.target.value)} 
                                    placeholder="Describe the current progress or findings..." 
                                    className="w-full px-5 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm min-h-[100px] outline-none focus:border-white focus:bg-white/10 transition-all font-bold" 
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">Site Photos / Proof</label>
                                <div 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full p-6 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-white/20 hover:bg-white/5 transition-all group"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 group-hover:text-white transition-colors">
                                        <Upload size={18} />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-[10px] font-black text-white uppercase tracking-widest">Upload Images</p>
                                    </div>
                                    <input 
                                        ref={fileInputRef}
                                        type="file" 
                                        multiple 
                                        className="hidden" 
                                        onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
                                    />
                                </div>
                                
                                {selectedFiles.length > 0 && (
                                    <div className="flex flex-wrap gap-2 p-2">
                                        {selectedFiles.map((file, i) => (
                                            <div key={i} className="px-3 py-1 bg-white/10 rounded-lg flex items-center gap-2 border border-white/5">
                                                <ImageIcon size={10} className="text-white/40" />
                                                <span className="text-[9px] text-white font-bold">{file.name}</span>
                                                <button type="button" onClick={() => setSelectedFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300"><X size={10} /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <button type="submit" disabled={submitting} className="w-full py-4 bg-white text-slate-900 rounded-xl font-black text-xs uppercase tracking-[0.4em] hover:bg-slate-100 disabled:opacity-50 transition-all flex items-center justify-center gap-3">
                            {submitting ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
                            {submitting ? 'Logging...' : 'Save Technical Log'}
                        </button>
                    </motion.form>
                )}
            </AnimatePresence>

            <div className="space-y-4">
                {milestones.length === 0 && !showForm && (
                    <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-[2rem] bg-slate-50/50">
                        <Icon className="mx-auto text-slate-200 mb-3 opacity-50" size={32} />
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">No technical logs recorded yet.</p>
                    </div>
                )}
                
                {milestones.map((m) => (
                    <div key={m.id} className="flex gap-4 items-start relative w-full">
                        <div className={`flex-1 bg-white border-2 rounded-3xl p-6 group transition-all relative shadow-sm hover:shadow-md ${
                            openNotes.includes(m.id) || auditData[m.id]?.note ? 'border-yellow-300' : 'border-slate-50 hover:border-slate-200'
                        }`}>
                            {/* Sticky Note Tab (Right Edge of card, only visible when note is closed) */}
                            {(currentUser?.role_type === 'project_manager' || currentUser?.id === project.user_id || currentUser?.id === project.arsitek?.user_id) && m.review_status !== 'approved' && m.review_status !== 'verified' && !openNotes.includes(m.id) && !auditData[m.id]?.note ? (
                                <div className="absolute -right-3 top-6 z-10">
                                    <button 
                                        onClick={() => toggleNote(m.id)}
                                        className="w-10 h-10 bg-yellow-300 hover:bg-yellow-400 border border-yellow-400 rounded-l-lg rounded-r-md flex items-center justify-center shadow-lg transition-all group/note"
                                        title="Add Sticky Note"
                                    >
                                        <FileText size={16} className="text-yellow-700" />
                                        <Plus size={10} className="absolute bottom-1 right-1 text-yellow-800 font-black" />
                                    </button>
                                </div>
                            ) : null}

                            <div className="flex items-start justify-between relative z-10 pr-6">
                                <div className="flex-1 space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl bg-${accentColor}-50 flex items-center justify-center text-${accentColor}-500`}>
                                            <Icon size={18} />
                                        </div>
                                        <div>
                                            <h5 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">{m.title}</h5>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                {/* Multi-Stage Status Stepper */}
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`w-1.5 h-1.5 rounded-full ${m.approval_status === 'approved' ? 'bg-emerald-500' : m.approval_status === 'reviewed' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                                                    <span className={`px-2 py-0.5 rounded-[4px] text-[8px] font-black uppercase tracking-widest border ${
                                                        m.approval_status === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                                        m.approval_status === 'reviewed' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                                        m.approval_status === 'revision' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                                        'bg-amber-50 text-amber-600 border-amber-100'
                                                    }`}>
                                                        {m.approval_status === 'reviewed' ? 'Reviewed by Architect' : (m.approval_status || 'Under Review')}
                                                    </span>
                                                </div>
                                                <span className="text-[9px] text-slate-400 font-bold flex items-center gap-1">
                                                    <Calendar size={10} />
                                                    {new Date(m.created_at || Date.now()).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <p className="text-xs text-slate-600 font-medium leading-relaxed max-w-2xl">{m.description}</p>
                                    
                                    {m.content?.gallery && m.content.gallery.length > 0 && (
                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {m.content.gallery.map((img, i) => (
                                                <a 
                                                    key={i} 
                                                    href={`/storage/${img}`} 
                                                    target="_blank" 
                                                    rel="noreferrer"
                                                    className="w-20 h-20 rounded-xl border border-slate-100 overflow-hidden group/img relative bg-slate-50"
                                                >
                                                    <img src={`/storage/${img}`} className="w-full h-full object-cover group-hover/img:scale-110 transition-transform" />
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                                                        <Eye size={14} className="text-white" />
                                                    </div>
                                                </a>
                                            ))}
                                        </div>
                                    )}

                                    {/* Existing Review Feedback */}
                                    {m.review_note && (
                                        <div className={`mt-3 p-3 rounded-xl border ${m.review_status === 'approved' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
                                            <div className="flex items-center gap-2 mb-1">
                                                <AlertTriangle size={12} />
                                                <span className="text-[9px] font-black uppercase tracking-widest">Audit Feedback</span>
                                            </div>
                                            <p className="text-[10px] font-medium italic">"{m.review_note}"</p>
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col gap-2 items-end">
                                    {isSpecialist && m.approval_status !== 'approved' && (
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => handleEdit(m)}
                                                className="p-2.5 bg-slate-50 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all"
                                            >
                                                <Pencil size={12} />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(m.id)}
                                                className="p-2.5 bg-rose-50 text-rose-300 hover:text-rose-600 hover:bg-rose-100 rounded-lg transition-all"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    )}
                                    {/* Lead Pro Review (Architect) */}
                                    {currentUser?.id === project?.arsitek?.user_id && m.approval_status === 'pending' && (m.structural_id || m.mep_id) && (
                                        <div className="flex flex-col items-end gap-1.5 animate-in fade-in duration-300">
                                            <button 
                                                onClick={() => handleApprove(m)} 
                                                disabled={loading || !hasSubmittedDeliverables}
                                                className={`px-5 py-2.5 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-2 shadow-lg ${
                                                    !hasSubmittedDeliverables 
                                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' 
                                                    : 'bg-blue-500 hover:bg-blue-600 shadow-blue-100'
                                                }`}
                                            >
                                                <ShieldCheck size={14} /> Review Design
                                            </button>
                                            {!hasSubmittedDeliverables && (
                                                <span className="text-[8px] text-amber-500 font-black uppercase tracking-widest flex items-center gap-1">
                                                    <AlertTriangle size={10} /> Awaiting deliverables submission
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    
                                    {m.approval_status === 'approved' && (
                                        <div className="flex flex-col items-end gap-1">
                                            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-xl">
                                                <ShieldCheck size={14} className="text-emerald-500" />
                                                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Verified & Completed</span>
                                            </div>
                                            {m.lead_pro_verified_at && (
                                                <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">Approved by Architect on {new Date(m.lead_pro_verified_at).toLocaleDateString()}</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Sticky Note Beside the Card */}
                        {m.review_status !== 'approved' && m.review_status !== 'verified' && (openNotes.includes(m.id) || auditData[m.id]?.note) && (
                            <div className="w-80 bg-yellow-100 border-2 border-yellow-300 rounded-3xl p-4 shadow-lg shrink-0 relative animate-in slide-in-from-right-4 duration-200 flex flex-col gap-3">
                                <div className="flex items-center justify-between border-b border-yellow-200 pb-2">
                                    <span className="text-[10px] font-black text-yellow-800 uppercase tracking-widest flex items-center gap-1.5">
                                        <FileText size={12} /> Milestone Note
                                    </span>
                                    <button 
                                        onClick={() => {
                                            if (openNotes.includes(m.id)) {
                                                toggleNote(m.id);
                                            } else {
                                                if (window.confirm('Are you sure you want to delete this sticky note?')) {
                                                    onReviewChange?.(m.id, 'revision_requested', '');
                                                    showToast('Sticky note deleted!', 'info');
                                                }
                                            }
                                        }}
                                        className="text-yellow-700 hover:text-red-500 transition-colors"
                                        title={openNotes.includes(m.id) ? "Close Note" : "Delete Note"}
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                                <textarea 
                                    placeholder="Type your sticky note for this log here..."
                                    value={auditData[m.id]?.note || ''}
                                    onChange={(e) => onReviewChange?.(m.id, 'revision_requested', e.target.value)}
                                    readOnly={!openNotes.includes(m.id)}
                                    className={`w-full h-24 p-2 bg-yellow-50/50 rounded-xl border border-yellow-200 text-yellow-900 placeholder-yellow-600/50 outline-none resize-none font-medium text-xs leading-relaxed transition-all ${
                                        !openNotes.includes(m.id) ? 'cursor-not-allowed select-none bg-yellow-50/10 border-dashed' : 'focus:bg-white'
                                    }`}
                                />
                                <div className="flex items-center justify-end gap-2">
                                    {!openNotes.includes(m.id) ? (
                                        <>
                                            <button 
                                                onClick={() => {
                                                    toggleNote(m.id);
                                                }}
                                                className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-yellow-950 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                                            >
                                                Edit
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    if (window.confirm('Are you sure you want to delete this sticky note?')) {
                                                        onReviewChange?.(m.id, 'revision_requested', '');
                                                        showToast('Sticky note deleted!', 'info');
                                                    }
                                                }}
                                                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                                            >
                                                Delete
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button 
                                                onClick={() => {
                                                    if (openNotes.includes(m.id)) {
                                                        toggleNote(m.id);
                                                    }
                                                }}
                                                className="px-3 py-1.5 bg-yellow-200 hover:bg-yellow-300 text-yellow-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                            >
                                                Close
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    if (!auditData[m.id]?.note?.trim()) {
                                                        showToast('Please enter some text or close the note', 'error');
                                                        return;
                                                    }
                                                    if (openNotes.includes(m.id)) {
                                                        toggleNote(m.id);
                                                    }
                                                    showToast('Sticky note pinned to milestone!', 'success');
                                                }}
                                                className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-yellow-950 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                                            >
                                                Pin Note
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
