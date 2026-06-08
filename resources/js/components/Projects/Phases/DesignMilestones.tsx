import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
    Plus, Pencil, Check, Layers, X, Save, 
    Trash2, FileText, ArrowUpRight, Sparkles, 
    ShieldCheck, Calendar, Banknote, Image as ImageIcon,
    RefreshCw, Upload, Eye, ChevronRight, Clock, HardHat, Wrench
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import PaymentTriggerNotificationModal from './PaymentTriggerNotificationModal';
import AddonFeeModal from './AddonFeeModal';
import AddonMilestoneModal from './AddonMilestoneModal';

interface DesignMilestonesProps {
    project: any;
    currentUser: any;
    isArchitect: boolean;
    isPM: boolean;
    roleType?: string;
}

interface Milestone {
    id: number;
    title: string;
    description: string | null;
    image: string | null;
    type: 'generic' | 'schematic' | 'development' | 'construction';
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
    change_orders?: any[];
}

export default function DesignMilestones({ project, currentUser, isArchitect, isPM, roleType = 'design' }: DesignMilestonesProps) {
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [structuralMilestones, setStructuralMilestones] = useState<Milestone[]>([]);
    const [mepMilestones, setMepMilestones] = useState<Milestone[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const { showToast } = useToast();

    // Audit state
    const [auditState, setAuditState] = useState<Record<number, { status: 'approved' | 'revision_requested', note: string }>>({});
    const [isSubmittingAudit, setIsSubmittingAudit] = useState(false);
    const [openNotes, setOpenNotes] = useState<number[]>([]);
    
    // Confirmation Modal state
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        milestone: Milestone | null;
        termin: any | null;
    }>({
        isOpen: false,
        milestone: null,
        termin: null
    });
    
    // Notification Modal state
    const [unlockedTerminNotice, setUnlockedTerminNotice] = useState<any | null>(null);

    // Addon Modal state
    const [addonModal, setAddonModal] = useState<{
        isOpen: boolean;
        milestone: Milestone | null;
        isNewCreation: boolean; // Flag to distinguish between requesting fee for existing vs new milestone
    }>({
        isOpen: false,
        milestone: null,
        isNewCreation: false
    });

    const toggleNote = (id: number) => {
        setOpenNotes(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    // Form state
    const [formTitle, setFormTitle] = useState('');
    const [formType, setFormType] = useState<Milestone['type']>('generic');
    const [formDesc, setFormDesc] = useState('');
    const [formChecklist, setFormChecklist] = useState<{ label: string; checked: boolean }[]>([]);
    const [submitting, setSubmitting] = useState(false);
    
    // Gallery state
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isOwner = currentUser?.id === project?.user_id;

    const handleAuditSubmit = async (milestone: Milestone, status: 'approved' | 'revision_requested', noteOverride?: string) => {
        setIsSubmittingAudit(true);
        try {
            const payload = {
                role_type: roleType,
                milestones: [{ 
                    id: milestone.id, 
                    status, 
                    note: noteOverride !== undefined ? noteOverride : (auditState[milestone.id]?.note || '')
                }]
            };
            const res = await axios.post(`/projects/${project.id}/technical-audit-submit`, payload);
            
            if (status === 'approved') {
                const unlocked = res.data?.unlocked_termins || [];
                if (unlocked.length > 0) {
                    setUnlockedTerminNotice(unlocked[0]);
                } else {
                    showToast('Milestone Approved', 'success');
                }
            } else {
                showToast('Revision Requested', 'info');
            }
            
            fetchMilestones();
            setConfirmModal({ isOpen: false, milestone: null, termin: null });
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to submit audit', 'error');
        } finally {
            setIsSubmittingAudit(false);
        }
    };

    const handleApprovalClick = (m: Milestone) => {
        const linkedTermin = project.payment_termins?.find((t: any) => 
            t.milestone_id === m.id && 
            t.role_type === 'arsitek' &&
            t.status === 'locked'
        );

        if (linkedTermin) {
            setConfirmModal({ isOpen: true, milestone: m, termin: linkedTermin });
        } else {
            handleAuditSubmit(m, 'approved');
        }
    };

    const handleFeePMReview = async (m: Milestone, co: any) => {
        if (!window.confirm('Forward this fee proposal to the Owner for approval?')) return;
        setIsSubmittingAudit(true);
        try {
            await axios.post(`/projects/${project.id}/change-orders/${co.id}/pm-review`, {
                action: 'approve',
                pm_notes: 'Reviewed and forwarded by PM'
            });
            showToast('Fee proposal forwarded to Owner', 'success');
            fetchMilestones();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to forward fee', 'error');
        } finally {
            setIsSubmittingAudit(false);
        }
    };

    const handleFeeOwnerApprove = async (m: Milestone, co: any) => {
        if (!window.confirm('Approve this extra fee? This will generate a new payment item.')) return;
        setIsSubmittingAudit(true);
        try {
            await axios.post(`/projects/${project.id}/change-orders/${co.id}/owner-decide`, {
                action: 'approve',
                owner_notes: 'Approved by Owner'
            });
            showToast('Extra fee approved! Payment item generated.', 'success');
            fetchMilestones();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to approve fee', 'error');
        } finally {
            setIsSubmittingAudit(false);
        }
    };

    const handleEdit = (m: Milestone) => {
        setEditingId(m.id);
        setFormTitle(m.title);
        setFormDesc(m.description || '');
        setFormType(m.type);
        setFormChecklist(m.content?.checklist || []);
        setSelectedFiles([]);
        setShowForm(true);
    };

    const fetchMilestones = async () => {
        try {
            const [mainRes, structuralRes, mepRes] = await Promise.all([
                axios.get(`/projects/${project.id}/milestones`, { params: { phase_context: roleType } }),
                (project.requires_structural && roleType === 'design') ? axios.get(`/projects/${project.id}/milestones`, { params: { phase_context: 'structural' } }).catch(() => ({ data: { data: [] } })) : Promise.resolve({ data: { data: [] } }),
                (project.requires_mep && roleType === 'design') ? axios.get(`/projects/${project.id}/milestones`, { params: { phase_context: 'mep' } }).catch(() => ({ data: { data: [] } })) : Promise.resolve({ data: { data: [] } })
            ]);
            
            setMilestones((mainRes.data?.data || []).sort((a: any, b: any) => a.sort_order - b.sort_order));
            setStructuralMilestones((structuralRes.data?.data || []).sort((a: any, b: any) => a.sort_order - b.sort_order));
            setMepMilestones((mepRes.data?.data || []).sort((a: any, b: any) => a.sort_order - b.sort_order));
        } catch (error) { 
            console.error(error); 
        } finally { 
            setLoading(false); 
        }
    };

    useEffect(() => { fetchMilestones(); }, [project.id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        
        try {
            const formData = new FormData();
            formData.append('title', formTitle);
            formData.append('description', formDesc);
            formData.append('type', formType);
            formData.append('phase_context', roleType);
            formData.append('content', JSON.stringify({ checklist: formChecklist }));
            
            selectedFiles.forEach(file => {
                formData.append('gallery[]', file);
            });

            if (editingId) {
                formData.append('_method', 'PUT');
                await axios.post(`/projects/${project.id}/milestones/${editingId}`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                showToast('Phase updated', 'success');
            } else {
                await axios.post(`/projects/${project.id}/milestones`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                showToast('Phase added', 'success');
            }
            
            setShowForm(false);
            setEditingId(null);
            setFormTitle('');
            setFormDesc('');
            setSelectedFiles([]);
            fetchMilestones();
        } catch (err: any) { 
            const msg = err.response?.data?.message || 'Error saving phase';
            showToast(msg, 'error'); 
        } finally { 
            setSubmitting(false); 
        }
    };

    if (loading) return <div className="py-20 text-center text-slate-400 font-black uppercase text-[10px] tracking-widest">Loading Design Board...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">{roleType === 'design' ? 'Design' : (roleType === 'structural' ? 'Structural' : 'MEP')} Milestones</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Evolution of the project blueprint</p>
                </div>
                {isArchitect && !showForm && (
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => { setEditingId(null); setFormTitle(''); setFormDesc(''); setSelectedFiles([]); setShowForm(true); }} 
                            className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2 bg-slate-900 text-white hover:scale-105"
                        >
                            <Plus size={14} /> Add {roleType === 'design' ? 'Design' : (roleType === 'structural' ? 'Structural' : 'MEP')} Phase
                        </button>
                        {roleType === 'design' && (
                            <button 
                                onClick={() => setAddonModal({ isOpen: true, milestone: null, isNewCreation: true })} 
                                className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2 bg-purple-600 text-white hover:scale-105"
                            >
                                <Plus size={14} /> Add Revision / Add-on
                            </button>
                        )}
                    </div>
                )}
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} className="bg-slate-900 rounded-[2rem] p-10 space-y-8 animate-in zoom-in duration-300">
                    <div className="flex justify-between items-center text-white">
                        <h5 className="text-xs font-black uppercase tracking-[0.2em]">{editingId ? 'Edit Milestone' : 'New Milestone'}</h5>
                        <button type="button" onClick={() => setShowForm(false)} className="text-white/40 hover:text-white"><X size={18} /></button>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">Phase Title</label>
                            <input 
                                value={formTitle} 
                                onChange={e => setFormTitle(e.target.value)} 
                                placeholder="e.g. Schematic Design Final" 
                                className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-white text-sm outline-none focus:border-white focus:bg-white/10 transition-all font-bold" 
                                required 
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">Detailed Description</label>
                            <textarea 
                                value={formDesc} 
                                onChange={e => setFormDesc(e.target.value)} 
                                placeholder="What was achieved in this phase?" 
                                className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-white text-sm min-h-[120px] outline-none focus:border-white focus:bg-white/10 transition-all font-bold" 
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">Design Files / Gallery</label>
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full p-8 border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-white/20 hover:bg-white/5 transition-all group"
                            >
                                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/40 group-hover:text-white transition-colors">
                                    <Upload size={20} />
                                </div>
                                <div className="text-center">
                                    <p className="text-xs font-black text-white">Upload Images or Blueprints</p>
                                    <p className="text-[10px] text-white/40 font-bold mt-1">PNG, JPG or PDF (Max 10MB each)</p>
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
                                        <div key={i} className="px-3 py-1 bg-white/10 rounded-lg flex items-center gap-2">
                                            <ImageIcon size={10} className="text-white/40" />
                                            <span className="text-[9px] text-white font-bold">{file.name}</span>
                                            <button type="button" onClick={() => setSelectedFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300"><X size={10} /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <button type="submit" disabled={submitting} className="w-full py-5 bg-white text-slate-900 rounded-2xl font-black text-xs uppercase tracking-[0.4em] hover:bg-slate-100 disabled:opacity-50 transition-all flex items-center justify-center gap-3">
                        {submitting ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                        {submitting ? 'Processing...' : (editingId ? 'Update Design Phase' : 'Save Design Phase')}
                    </button>
                </form>
            )}

            <div className="space-y-4">
                {milestones.length === 0 && !showForm && (
                    <div className="py-20 text-center border-2 border-dashed border-slate-100 rounded-[2rem]">
                        <Layers className="mx-auto text-slate-200 mb-4" size={40} />
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">No design milestones yet.</p>
                    </div>
                )}
                
                {milestones.map((m) => (
                    <div key={m.id} className="flex gap-4 items-start relative w-full">
                        <div className="flex-1 relative">
                            {/* Sticky Note Tab (Right Edge of card, only visible when note is closed) */}
                            {isPM && m.approval_status !== 'approved' && !openNotes.includes(m.id) && !auditState[m.id]?.note ? (
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

                            <MilestoneCard m={m} />
                        </div>

                        {/* Sticky Note Beside the Card */}
                        {isPM && m.approval_status !== 'approved' && (openNotes.includes(m.id) || auditState[m.id]?.note) && (
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
                                                    setAuditState({...auditState, [m.id]: { status: 'revision_requested', note: '' }});
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
                                    value={auditState[m.id]?.note || ''}
                                    onChange={(e) => setAuditState({...auditState, [m.id]: { status: 'revision_requested', note: e.target.value }})}
                                    readOnly={!openNotes.includes(m.id)}
                                    className={`w-full h-24 p-2 bg-yellow-50/50 rounded-xl border border-yellow-200 text-yellow-900 placeholder-yellow-600/50 outline-none resize-none font-medium text-xs leading-relaxed transition-all ${
                                        !openNotes.includes(m.id) ? 'cursor-not-allowed select-none bg-yellow-50/10 border-dashed' : 'focus:bg-white'
                                    }`}
                                />
                                <div className="flex items-center justify-end gap-2">
                                    {!openNotes.includes(m.id) ? (
                                        <>
                                            <button 
                                                onClick={() => toggleNote(m.id)}
                                                className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-yellow-950 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                                            >
                                                Edit
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    if (window.confirm('Are you sure you want to delete this sticky note?')) {
                                                        setAuditState({...auditState, [m.id]: { status: 'revision_requested', note: '' }});
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
                                                onClick={() => toggleNote(m.id)}
                                                className="px-3 py-1.5 bg-yellow-200 hover:bg-yellow-300 text-yellow-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                            >
                                                Close
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    if (!auditState[m.id]?.note?.trim()) {
                                                        showToast('Please enter some text or close the note', 'error');
                                                        return;
                                                    }
                                                    toggleNote(m.id);
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

            {/* Specialist Integration Hub */}
            {roleType === 'design' && (project.requires_structural || project.requires_mep) && (
                <div className="space-y-6 pt-12 border-t border-slate-100 mt-12">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Specialist Integration Hub</h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Parallel Technical Progress Tracking</p>
                        </div>
                        <div className="flex items-center gap-4">
                            {project.structural_id && (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 rounded-lg border border-amber-100">
                                    <HardHat size={12} className="text-amber-500" />
                                    <span className="text-[9px] font-black text-amber-700 uppercase tracking-widest">Structural Eng. Active</span>
                                </div>
                            )}
                            {project.mep_id && (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
                                    <Wrench size={12} className="text-blue-500" />
                                    <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest">MEP Eng. Active</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Structural Progress Column */}
                        {project.requires_structural && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                                            <HardHat size={20} />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{project.structural_engineer?.user?.name || 'Awaiting Specialist'}</p>
                                            <p className="text-[8px] font-black text-amber-600 uppercase tracking-tighter">Structural Integrity Progress</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[14px] font-black text-slate-900">{structuralMilestones.filter(m => m.approval_status === 'approved').length} / {structuralMilestones.length}</p>
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Verified</p>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {structuralMilestones.length === 0 ? (
                                        <div className="p-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">No technical logs recorded</p>
                                        </div>
                                    ) : (
                                        structuralMilestones.map(m => (
                                            <SpecialistMilestoneCard key={m.id} m={m} role="structural" />
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {/* MEP Progress Column */}
                        {project.requires_mep && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                                            <Wrench size={20} />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{project.mep_engineer?.user?.name || 'Awaiting Specialist'}</p>
                                            <p className="text-[8px] font-black text-blue-600 uppercase tracking-tighter">MEP & Mechanical Progress</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[14px] font-black text-slate-900">{mepMilestones.filter(m => m.approval_status === 'approved').length} / {mepMilestones.length}</p>
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Verified</p>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {mepMilestones.length === 0 ? (
                                        <div className="p-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">No technical logs recorded</p>
                                        </div>
                                    ) : (
                                        mepMilestones.map(m => (
                                            <SpecialistMilestoneCard key={m.id} m={m} role="mep" />
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            {confirmModal.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200">
                        <div className="flex flex-col items-center text-center gap-4 mb-8">
                            <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-[2rem] flex items-center justify-center shadow-inner">
                                <ShieldCheck size={40} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900 tracking-tight">Approve Milestone?</h3>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Technical Verification</p>
                            </div>
                        </div>

                        <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 mb-8 space-y-4">
                            <div className="flex items-start gap-3">
                                <Layers className="text-slate-400 mt-0.5" size={16} />
                                <div className="text-left">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Milestone</p>
                                    <p className="text-sm font-black text-slate-900">{confirmModal.milestone?.title}</p>
                                </div>
                            </div>

                            {confirmModal.termin && (
                                <div className="pt-4 border-t border-slate-200/60">
                                    <div className="flex items-start gap-3">
                                        <Banknote className="text-emerald-500 mt-0.5" size={16} />
                                        <div className="text-left">
                                            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Trigger Payment</p>
                                            <p className="text-sm font-black text-slate-900">{confirmModal.termin?.label}</p>
                                            <p className="text-lg font-black text-emerald-600 mt-1">Rp {Number(confirmModal.termin?.amount).toLocaleString()}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2 pt-4 border-t border-slate-200/60">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Approval Note (Optional)</label>
                                <textarea 
                                    placeholder="Add a note for this approval..."
                                    value={auditState[confirmModal.milestone?.id || 0]?.note || ''}
                                    onChange={(e) => confirmModal.milestone && setAuditState({...auditState, [confirmModal.milestone.id]: { status: 'approved', note: e.target.value }})}
                                    className="w-full h-20 p-3 bg-white rounded-xl border border-slate-200 text-xs outline-none focus:border-emerald-500 font-medium"
                                />
                            </div>

                            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                                <p className="text-[10px] text-amber-700 font-bold leading-tight">
                                    {confirmModal.termin 
                                        ? "IMPORTANT: Approving this milestone will automatically unlock the linked payment for the project owner."
                                        : "Approving this technical milestone will verify the specialist's work as complete."}
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button 
                                onClick={() => setConfirmModal({ isOpen: false, milestone: null, termin: null })}
                                className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={() => confirmModal.milestone && handleAuditSubmit(confirmModal.milestone, 'approved')}
                                disabled={isSubmittingAudit}
                                className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl flex items-center justify-center gap-2"
                            >
                                {isSubmittingAudit ? <RefreshCw size={14} className="animate-spin" /> : 'Confirm & Approve'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Notification Modal */}
            <PaymentTriggerNotificationModal 
                isOpen={!!unlockedTerminNotice}
                onClose={() => setUnlockedTerminNotice(null)}
                termin={unlockedTerminNotice}
                project={project}
            />

            {addonModal.isOpen && addonModal.isNewCreation && (
                <AddonMilestoneModal 
                    project={project}
                    phaseContext="design"
                    onClose={() => setAddonModal({ isOpen: false, milestone: null, isNewCreation: false })}
                    onSuccess={fetchMilestones}
                />
            )}

            {addonModal.isOpen && !addonModal.isNewCreation && (
                <AddonFeeModal 
                    project={project}
                    milestone={addonModal.milestone}
                    onClose={() => setAddonModal({ isOpen: false, milestone: null, isNewCreation: false })}
                    onSuccess={fetchMilestones}
                />
            )}
        </div>
    );

    // Sub-components for cleaner rendering
    function MilestoneCard({ m }: { m: Milestone }) {
        return (
            <div key={m.id} className={`bg-white border-2 rounded-3xl p-8 group hover:border-slate-200 transition-all relative overflow-hidden ${
                openNotes.includes(m.id) || auditState[m.id]?.note ? 'border-yellow-300' : 'border-slate-50'
            }`}>
                <div className="flex items-start justify-between relative z-10">
                    <div className="flex-1 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                                <Layers size={18} />
                            </div>
                            <div>
                                <h5 className="text-[13px] font-black text-slate-900 uppercase tracking-widest">{m.title}</h5>
                                <div className="flex items-center gap-3 mt-1">
                                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${
                                        m.approval_status === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                        m.approval_status === 'revision' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                        'bg-amber-50 text-amber-600 border-amber-100'
                                    }`}>
                                        {m.approval_status || 'Drafting'}
                                    </span>
                                    {m.content?.is_addon && (
                                        <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border bg-purple-50 text-purple-600 border-purple-100">
                                            Revision / Add-on
                                        </span>
                                    )}
                                    <span className="text-[9px] text-slate-400 font-bold flex items-center gap-1">
                                        <Calendar size={10} />
                                        Added {new Date(m.pm_verified_at || Date.now()).toLocaleDateString()}
                                    </span>
                                    {m.change_orders && m.change_orders.length > 0 && (
                                        <div className="flex gap-2">
                                            {m.change_orders.map(co => (
                                                <span key={co.id} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${
                                                    co.status === 'owner_approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                    co.status === 'rejected' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                                    'bg-amber-50 text-amber-600 border-amber-100'
                                                }`}>
                                                    Fee: {(co.status || 'proposed').replace('_', ' ')} (Rp {Number(co.cost_impact).toLocaleString()})
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        
                        <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-2xl">{m.description}</p>
                        
                        {m.content?.gallery && m.content.gallery.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-2">
                                {m.content.gallery.map((img, i) => (
                                    <a 
                                        key={i} 
                                        href={img.startsWith('http') ? img : `/storage/${img}`} 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="w-16 h-16 rounded-xl border border-slate-200 overflow-hidden group/img relative"
                                    >
                                        {img.match(/\.(jpg|jpeg|png|gif|webp|\?)/i) ? (
                                            <img src={img.startsWith('http') ? img : `/storage/${img}`} className="w-full h-full object-cover group-hover/img:scale-110 transition-transform" />
                                        ) : (
                                            <div className="w-full h-full bg-slate-50 flex items-center justify-center">
                                                <FileText size={24} className="text-slate-300" />
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                                            <Eye size={12} className="text-white" />
                                        </div>
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-2 items-end">
                        {isArchitect && m.approval_status !== 'approved' && (
                            <button 
                                onClick={() => handleEdit(m)}
                                className="p-3 bg-slate-50 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
                            >
                                <Pencil size={14} />
                            </button>
                        )}

                        {isArchitect && m.content?.is_addon && (!m.change_orders || m.change_orders.length === 0) && (
                            <button 
                                onClick={() => setAddonModal({ isOpen: true, milestone: m })}
                                className="px-4 py-2 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all shadow-md shadow-amber-100 flex items-center gap-2"
                            >
                                <Banknote size={14} /> Request Fee
                            </button>
                        )}
                        
                        {(isOwner || isPM) && m.approval_status === 'approved' && project.payment_termins?.some((t: any) => t.milestone_id === m.id) && (
                            <button 
                                onClick={() => {
                                    const termin = project.payment_termins?.find((t: any) => t.milestone_id === m.id);
                                    if (termin) setUnlockedTerminNotice(termin);
                                }}
                                className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-md shadow-emerald-100 flex items-center gap-2"
                            >
                                <ArrowUpRight size={14} /> Share Payment Link
                            </button>
                        )}

                        {(() => {
                            const activeCO = m.change_orders?.[0];
                            const isFeePending = activeCO && activeCO.status !== 'owner_approved' && activeCO.status !== 'rejected';
                            
                            if (isFeePending) {
                                if (isPM && activeCO.status === 'proposed') {
                                    return (
                                        <button 
                                            disabled={isSubmittingAudit}
                                            onClick={() => handleFeePMReview(m, activeCO)}
                                            className="px-4 py-2 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all shadow-md shadow-amber-100 flex items-center gap-2"
                                        >
                                            {isSubmittingAudit ? <RefreshCw size={12} className="animate-spin" /> : <Check size={14} />}
                                            Review & Forward Fee
                                        </button>
                                    );
                                }
                                if (isOwner && activeCO.status === 'pm_reviewed') {
                                    return (
                                        <button 
                                            disabled={isSubmittingAudit}
                                            onClick={() => handleFeeOwnerApprove(m, activeCO)}
                                            className="px-4 py-2 bg-purple-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-700 transition-all shadow-md shadow-purple-100 flex items-center gap-2"
                                        >
                                            {isSubmittingAudit ? <RefreshCw size={12} className="animate-spin" /> : <Banknote size={14} />}
                                            Approve Extra Fee
                                        </button>
                                    );
                                }
                                return (
                                    <div className="px-4 py-2 bg-slate-100 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-200 flex items-center gap-2">
                                        <Clock size={12} /> Fee Under Review
                                    </div>
                                );
                            }

                            return (isOwner || isPM) && m.approval_status === 'pending' && (
                                <div className="flex gap-2 z-10 relative">
                                    <button 
                                        onClick={() => handleApprovalClick(m)}
                                        disabled={isSubmittingAudit}
                                        className="px-4 py-2 bg-white text-slate-900 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-all border border-slate-200 flex items-center justify-center gap-2"
                                    >
                                        {isSubmittingAudit ? <RefreshCw size={10} className="animate-spin" /> : 'Verify and Finalize'}
                                    </button>
                                    <button 
                                        onClick={() => {
                                            const currentNote = auditState[m.id]?.note;
                                            if (!currentNote?.trim()) {
                                                const note = window.prompt("Enter revision instructions for the Architect:");
                                                if (note === null) return;
                                                if (!note.trim()) {
                                                    showToast('Revision instructions are required.', 'error');
                                                    return;
                                                }
                                                setAuditState({...auditState, [m.id]: { status: 'revision_requested', note }});
                                                handleAuditSubmit(m, 'revision_requested', note);
                                            } else {
                                                handleAuditSubmit(m, 'revision_requested');
                                            }
                                        }}
                                        disabled={isSubmittingAudit}
                                        className="px-4 py-2 bg-white text-slate-900 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-all border border-slate-200 flex items-center justify-center gap-2"
                                    >
                                        {isSubmittingAudit ? <RefreshCw size={10} className="animate-spin" /> : 'Request Revision'}
                                    </button>
                                </div>
                            );
                        })()}
                    </div>
                </div>
                
                {/* Decorative background element */}
                <div className="absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none group-hover:scale-110 transition-transform">
                    <Layers size={100} />
                </div>
            </div>
        );
    }

    function SpecialistMilestoneCard({ m, role }: { m: Milestone, role: 'structural' | 'mep' }) {
        const accent = role === 'structural' ? 'amber' : 'blue';
        const Icon = role === 'structural' ? HardHat : Wrench;
        
        return (
            <div key={m.id} className={`p-4 rounded-2xl border bg-white shadow-sm hover:shadow-md transition-all ${m.approval_status === 'approved' ? 'border-emerald-100' : 'border-slate-100'}`}>
                <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-lg bg-${accent}-50 text-${accent}-500 flex items-center justify-center`}>
                                <Icon size={12} />
                            </div>
                            <h6 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{m.title}</h6>
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium line-clamp-2">{m.description}</p>
                        
                        <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest border ${
                                m.approval_status === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                m.approval_status === 'revision' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                'bg-amber-50 text-amber-600 border-amber-100'
                            }`}>
                                {m.approval_status || 'Draft'}
                            </span>
                            <span className="text-[7px] text-slate-400 font-bold uppercase">{new Date(m.created_at || Date.now()).toLocaleDateString()}</span>
                        </div>
                    </div>

                    {/* Verification Action for Lead Pro (Architect) or PM */}
                    {(isArchitect || isPM || isOwner) && m.approval_status !== 'approved' && (
                        <button 
                            onClick={() => handleApprovalClick(m)}
                            className={`p-2 rounded-lg bg-${accent}-50 text-${accent}-600 hover:bg-${accent}-500 hover:text-white transition-all`}
                        >
                            <Check size={14} />
                        </button>
                    )}
                    
                    {m.approval_status === 'approved' && (
                        <div className="p-2 text-emerald-500">
                            <ShieldCheck size={18} />
                        </div>
                    )}
                </div>
            </div>
        );
    }
}
