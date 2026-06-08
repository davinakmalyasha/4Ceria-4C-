import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Plus, Pencil, Check, X, Save, Trash2, Layers, Clock, ShieldCheck, RefreshCw, Banknote, Upload, Eye, Image as ImageIcon, FileText, Box } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { CONSTRUCTION_MILESTONE_TYPES } from '../../../constants/ContractorStandardPresets';
import ExtensionRequestModal from './ExtensionRequestModal';
import PaymentTriggerNotificationModal from './PaymentTriggerNotificationModal';
import AddonFeeModal from './AddonFeeModal';
import AddonMilestoneModal from './AddonMilestoneModal';

interface ConstructionMilestonesProps {
    project: any;
    currentUser: any;
    isContractor: boolean;
    isPM?: boolean;
    filterType?: string;
    onRefresh?: () => void;
}

interface Milestone {
    id: number;
    title: string;
    description: string | null;
    image: string | null;
    type: string;
    is_completed: boolean;
    approval_status?: 'in_progress' | 'pending' | 'approved' | 'revision';
    revision_notes?: string;
    content?: {
        gallery?: string[];
        links?: { label: string; url: string }[];
        checklist?: { label: string; checked: boolean }[];
        revision_history?: { note: string; date: string; version: number }[];
    };
    sort_order: number;
    created_at: string;
    change_orders?: any[];
}

export default function ConstructionMilestones({ project, currentUser, isContractor, isPM = false, filterType, onRefresh }: ConstructionMilestonesProps) {
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const { showToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const displayedMilestones = filterType 
        ? milestones.filter(m => m.type === filterType)
        : milestones;

    // Form state
    const [formTitle, setFormTitle] = useState('');
    const [formType, setFormType] = useState('generic');
    const [formDesc, setFormDesc] = useState('');
    const [existingGallery, setExistingGallery] = useState<string[]>([]);
    const [newGalleryFiles, setNewGalleryFiles] = useState<File[]>([]);
    const [formChecklist, setFormChecklist] = useState<{ label: string; checked: boolean }[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [showExtensionModal, setShowExtensionModal] = useState(false);
    const [isSubmittingAudit, setIsSubmittingAudit] = useState(false);

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
        isNewCreation: boolean;
    }>({
        isOpen: false,
        milestone: null,
        isNewCreation: false
    });

    const [requestingMaterialFor, setRequestingMaterialFor] = useState<Milestone | null>(null);
    const [materialForm, setMaterialForm] = useState({ name: '', quantity: '', unit: '', notes: '' });

    const activeSub = filterType ? project.sub_professionals?.find(
        (s: any) => s.sub_role === filterType && s.status === 'active'
    ) : null;
    const scopeNotes = activeSub?.scope_notes || 'No specific instructions provided.';
    const rate = activeSub?.rate || 0;

    const fetchMilestones = async () => {
        try {
            const res = await axios.get(`/projects/${project.id}/milestones`, { params: { phase_context: 'build' } });
            setMilestones((res.data?.data || []).sort((a: any, b: any) => a.sort_order - b.sort_order));
        } catch (error) { console.error(error); } finally { setLoading(false); }
    };

    useEffect(() => { fetchMilestones(); }, [project.id]);

    const resetForm = () => {
        setFormTitle(''); setFormType('generic'); setFormDesc('');
        setExistingGallery([]); setNewGalleryFiles([]); setFormChecklist([]);
        setEditingId(null); setShowForm(false);
    };

    const handleQuickAdd = (type: string, title: string, checklist: string[]) => {
        resetForm(); setFormType(type); setFormTitle(title);
        setFormChecklist(checklist.map(label => ({ label, checked: false })));
        setShowForm(true);
    };

    const handleEdit = (m: Milestone) => {
        setEditingId(m.id);
        setFormTitle(m.title);
        setFormDesc(m.description || '');
        setFormType(m.type);
        setFormChecklist(m.content?.checklist || []);
        setExistingGallery(m.content?.gallery || []);
        setNewGalleryFiles([]);
        setShowForm(true);
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('Are you sure you want to delete this milestone?')) return;
        try {
            await axios.delete(`/projects/${project.id}/milestones/${id}`);
            showToast('Milestone deleted successfully', 'success');
            fetchMilestones();
            if (onRefresh) onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Error deleting milestone', 'error');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        const formData = new FormData();
        formData.append('title', formTitle);
        formData.append('type', filterType || formType);
        formData.append('description', formDesc);
        formData.append('phase_context', 'build');
        formData.append('content', JSON.stringify({ checklist: formChecklist }));
        formData.append('retained_gallery', JSON.stringify(existingGallery));
        newGalleryFiles.forEach(f => formData.append('gallery[]', f));
        
        try {
            if (editingId) {
                formData.append('_method', 'PUT');
                await axios.post(`/projects/${project.id}/milestones/${editingId}`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                showToast('Updated', 'success');
            } else {
                await axios.post(`/projects/${project.id}/milestones`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                showToast('Added', 'success');
            }
            resetForm(); fetchMilestones();
            if (onRefresh) onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Error', 'error');
        } finally { setSubmitting(false); }
    };

    const handleAuditSubmit = async (milestone: Milestone, status: 'approved' | 'revision') => {
        setIsSubmittingAudit(true);
        try {
            const payload = {
                role_type: 'build',
                milestones: [{ 
                    id: milestone.id, 
                    status: status === 'approved' ? 'approved' : 'revision_requested', 
                    note: '' // Simplified for construction
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
            t.role_type === 'kontraktor' &&
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
            if (onRefresh) onRefresh();
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
            if (onRefresh) onRefresh();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to approve fee', 'error');
        } finally {
            setIsSubmittingAudit(false);
        }
    };

    const handleRequestRevision = async (m: Milestone) => {
        const notes = window.prompt("Detail revision:");
        if (!notes) return;
        handleAuditSubmit(m, 'revision');
    };


    if (loading) return <div className="py-20 text-center text-slate-400 font-bold uppercase text-[10px]">Loading Milestones...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Construction Milestones</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Physical progress tracking</p>
                </div>
                {isContractor && !showForm && (
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setShowExtensionModal(true)} 
                            className="px-4 py-2 bg-amber-50 text-amber-600 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all"
                        >
                            <Clock size={14} /> Extension
                        </button>
                        <button 
                            onClick={() => { setShowForm(true); }} 
                            className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2 bg-slate-900 text-white hover:scale-105"
                        >
                            <Plus size={14} /> Add Milestone
                        </button>
                        <button 
                            onClick={() => setAddonModal({ isOpen: true, milestone: null, isNewCreation: true })} 
                            className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2 bg-purple-600 text-white hover:scale-105"
                        >
                            <Plus size={14} /> Add Revision / Add-on
                        </button>
                    </div>
                )}
            </div>

            {showForm && !editingId && (
                <form onSubmit={handleSubmit} className="bg-slate-900 rounded-[2rem] p-6 space-y-4">
                    <div className="flex justify-between items-center text-white mb-2">
                        <h5 className="text-[10px] font-black uppercase tracking-[0.2em]">New Milestone</h5>
                        <button type="button" onClick={resetForm} className="text-white/40 hover:text-white"><X size={16} /></button>
                    </div>
                    <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Phase Name" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-xs outline-none focus:border-white" required />
                    <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Description" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-xs min-h-[80px]" />
                    
                    <div className="space-y-2">
                        <label className="text-[9px] font-black text-white/40 uppercase tracking-widest px-1">Files / Gallery</label>
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full p-6 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-white/20 hover:bg-white/5 transition-all group"
                        >
                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 group-hover:text-white transition-colors">
                                <Upload size={18} />
                            </div>
                            <div className="text-center">
                                <p className="text-[11px] font-black text-white">Upload Images or Progress Files</p>
                                <p className="text-[9px] text-white/40 font-bold mt-0.5">PNG, JPG or PDF</p>
                            </div>
                            <input 
                                ref={fileInputRef}
                                type="file" 
                                multiple 
                                className="hidden" 
                                onChange={(e) => setNewGalleryFiles(Array.from(e.target.files || []))}
                            />
                        </div>
                        
                        {newGalleryFiles.length > 0 && (
                            <div className="flex flex-wrap gap-2 p-1">
                                {newGalleryFiles.map((file, i) => (
                                    <div key={i} className="px-2.5 py-1 bg-white/10 rounded-lg flex items-center gap-2">
                                        <ImageIcon size={10} className="text-white/40" />
                                        <span className="text-[8px] text-white font-bold">{file.name}</span>
                                        <button type="button" onClick={() => setNewGalleryFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300">
                                            <X size={10} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    <button type="submit" disabled={submitting} className="w-full py-4 bg-white text-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest">{submitting ? 'Saving...' : 'Save Milestone'}</button>
                </form>
            )}

            {!showForm && displayedMilestones.length === 0 ? (
                <div className="max-w-2xl mx-auto mt-6">
                    <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 space-y-6 text-left shadow-sm">
                        <h5 className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                            Official Outcome / Progress Document
                        </h5>

                        {isContractor ? (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <input 
                                    type="file" 
                                    id="quick-start-upload" 
                                    className="hidden" 
                                    onChange={(e) => {
                                        if (e.target.files) {
                                            setNewGalleryFiles(Array.from(e.target.files));
                                            if (!formTitle) setFormTitle('Phase 1 - Initial Progress');
                                        }
                                    }}
                                />
                                
                                {newGalleryFiles.length === 0 ? (
                                    <label 
                                        htmlFor="quick-start-upload"
                                        className="w-full py-16 border-2 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-slate-350 hover:bg-slate-50 transition-all group"
                                    >
                                        <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:text-slate-500 transition-colors shadow-sm">
                                            <Upload size={28} />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-xs font-black text-slate-800 uppercase tracking-widest">Upload First Progress File</p>
                                            <p className="text-[9px] text-slate-400 font-bold mt-1 uppercase">PNG, JPG or PDF</p>
                                        </div>
                                    </label>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <FileText size={16} className="text-slate-550" />
                                                <span className="text-xs font-bold text-slate-850 truncate max-w-[200px]">{newGalleryFiles[0].name}</span>
                                            </div>
                                            <button 
                                                type="button" 
                                                onClick={() => setNewGalleryFiles([])} 
                                                className="p-1 hover:bg-slate-200 rounded text-red-500"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Milestone Title</label>
                                            <input 
                                                type="text" 
                                                value={formTitle} 
                                                onChange={e => setFormTitle(e.target.value)} 
                                                placeholder="e.g. Phase 1 - Foundation Work" 
                                                required 
                                                className="w-full px-5 py-3 bg-slate-50 border border-slate-200 focus:border-slate-900 rounded-xl text-xs font-bold outline-none transition-all"
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Notes / Description</label>
                                            <textarea 
                                                value={formDesc} 
                                                onChange={e => setFormDesc(e.target.value)} 
                                                placeholder="Describe the completed work..." 
                                                className="w-full px-5 py-3 bg-slate-50 border border-slate-200 focus:border-slate-900 rounded-xl text-xs font-medium outline-none transition-all resize-none h-20"
                                            />
                                        </div>

                                        <button 
                                            type="submit" 
                                            disabled={submitting} 
                                            className="w-full py-4 bg-slate-900 hover:bg-black text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-slate-100 flex items-center justify-center gap-2"
                                        >
                                            {submitting ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                                            {submitting ? 'Initializing...' : 'Save & Initialize Milestone'}
                                        </button>
                                    </div>
                                )}
                            </form>
                        ) : (
                            <div className="bg-slate-50 border border-slate-200 rounded-[2.5rem] p-16 text-center flex flex-col items-center justify-center">
                                <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center mb-6 text-slate-350 shadow-sm border border-slate-150/40">
                                    <Box size={28} />
                                </div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">
                                    Drawer is Empty
                                </p>
                                <p className="text-[9px] text-slate-400 font-bold mt-2 uppercase max-w-xs leading-relaxed">
                                    No progress documents have been uploaded for this construction step yet.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {displayedMilestones.map((m, idx) => (
                    <div key={m.id} className="bg-white border-2 border-slate-100 rounded-2xl p-6 flex flex-col md:flex-row gap-6">
                        {editingId === m.id ? (
                            <form onSubmit={handleSubmit} className="flex-1 space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Phase Name</label>
                                    <input 
                                        type="text" 
                                        value={formTitle}
                                        onChange={e => setFormTitle(e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-slate-900 rounded-xl text-xs font-bold outline-none transition-all"
                                        required
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Description</label>
                                    <textarea 
                                        value={formDesc}
                                        onChange={e => setFormDesc(e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-slate-900 rounded-xl text-xs font-bold outline-none transition-all min-h-[85px]"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Files / Gallery</label>
                                    <div 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full p-6 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-slate-350 hover:bg-slate-50 transition-all group"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:text-slate-600 transition-colors">
                                            <Upload size={18} />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[11px] font-black text-slate-750">Upload Images or Progress Files</p>
                                            <p className="text-[9px] text-slate-400 font-bold mt-0.5">PNG, JPG or PDF</p>
                                        </div>
                                        <input 
                                            ref={fileInputRef}
                                            type="file" 
                                            multiple 
                                            className="hidden" 
                                            onChange={(e) => setNewGalleryFiles(Array.from(e.target.files || []))}
                                        />
                                    </div>
                                    
                                    {newGalleryFiles.length > 0 && (
                                        <div className="flex flex-wrap gap-2 p-1">
                                            {newGalleryFiles.map((file, i) => (
                                                <div key={i} className="px-2.5 py-1 bg-slate-100 rounded-lg flex items-center gap-2 border border-slate-200">
                                                    <ImageIcon size={10} className="text-slate-500" />
                                                    <span className="text-[8px] text-slate-700 font-bold max-w-[150px] truncate">{file.name}</span>
                                                    <button type="button" onClick={() => setNewGalleryFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700">
                                                        <X size={10} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {existingGallery.length > 0 && (
                                        <div className="space-y-1 pt-2">
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider px-1">Current Attachments:</p>
                                            <div className="flex flex-wrap gap-2 p-1">
                                                {existingGallery.map((url, i) => {
                                                    const fileName = url.substring(url.lastIndexOf('/') + 1).split('?')[0];
                                                    return (
                                                        <div key={i} className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-2">
                                                            <span className="text-[8px] text-slate-600 font-bold max-w-[150px] truncate">{fileName}</span>
                                                            <button type="button" onClick={() => setExistingGallery(prev => prev.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700">
                                                                <Trash2 size={10} />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex justify-end gap-2 pt-2">
                                    <button 
                                        type="button" 
                                        onClick={resetForm}
                                        className="px-6 py-2 bg-slate-100 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit" 
                                        disabled={submitting}
                                        className="px-6 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center gap-2"
                                    >
                                        {submitting ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                                        {submitting ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <div className="flex-1">
                                <h5 className="text-xs font-black text-slate-900 uppercase tracking-widest">{m.title}</h5>
                                <p className="text-[10px] text-slate-500 font-medium mt-1">{m.description}</p>
                            
                            {m.content?.gallery && m.content.gallery.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-4">
                                    {m.content.gallery.map((img, i) => (
                                        <a 
                                            key={i} 
                                            href={img} 
                                            target="_blank" 
                                            rel="noreferrer"
                                            className="w-16 h-16 rounded-xl border border-slate-200 overflow-hidden group/img relative flex items-center justify-center bg-slate-50"
                                        >
                                            {img.match(/\.(jpg|jpeg|png|gif|webp|\?)/i) ? (
                                                <img src={img} className="w-full h-full object-cover group-hover/img:scale-110 transition-transform" />
                                            ) : (
                                                <div className="w-full h-full bg-slate-50 flex flex-col items-center justify-center p-1 text-center">
                                                    <FileText size={20} className="text-slate-400" />
                                                    <span className="text-[6px] text-slate-500 font-bold truncate w-full mt-1">
                                                        {img.substring(img.lastIndexOf('/') + 1).split('?')[0]}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                                                <Eye size={12} className="text-white" />
                                            </div>
                                        </a>
                                    ))}
                                </div>
                            )}

                            <div className="mt-4 flex gap-2">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${m.is_completed ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{m.approval_status || (m.is_completed ? 'Completed' : 'Active')}</span>
                                {m.content?.is_addon && (
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-purple-100 text-purple-600">Revision / Add-on</span>
                                )}
                                {m.change_orders && m.change_orders.length > 0 && (
                                    <div className="flex gap-2">
                                        {m.change_orders.map(co => (
                                            <span key={co.id} className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
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
                            {isContractor && m.approval_status !== 'approved' && !m.is_completed && (
                                <div className="mt-4 flex items-center gap-2">
                                    <button 
                                        type="button"
                                        onClick={() => handleEdit(m)}
                                        className="p-2.5 bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-all"
                                        title="Edit Milestone"
                                    >
                                        <Pencil size={12} />
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => handleDelete(m.id)}
                                        className="p-2.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl transition-all"
                                        title="Delete Milestone"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
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
                                                className="mt-4 px-4 py-2 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all shadow-md shadow-amber-100 flex items-center gap-2"
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
                                                className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-700 transition-all shadow-md shadow-purple-100 flex items-center gap-2"
                                            >
                                                {isSubmittingAudit ? <RefreshCw size={12} className="animate-spin" /> : <Banknote size={14} />}
                                                Approve Extra Fee
                                            </button>
                                        );
                                    }
                                    return (
                                        <div className="mt-4 px-4 py-2 bg-slate-100 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-200 flex items-center gap-2 w-fit">
                                            <Clock size={12} /> Fee Under Review
                                        </div>
                                    );
                                }

                                return !isContractor && m.approval_status === 'pending' && (
                                    <div className="mt-4 flex gap-2">
                                        <button 
                                            disabled={isSubmittingAudit}
                                            onClick={() => handleRequestRevision(m)} 
                                            className="px-4 py-2 border border-red-200 text-red-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-red-50 transition-all"
                                        >
                                            Revise
                                        </button>
                                        <button 
                                            disabled={isSubmittingAudit}
                                            onClick={() => handleApprovalClick(m)} 
                                            className="px-4 py-2 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100 flex items-center gap-2"
                                        >
                                            {isSubmittingAudit ? <RefreshCw size={12} className="animate-spin" /> : <Check size={14} />}
                                            Approve
                                        </button>
                                    </div>
                                );
                            })()}
                            
                            {isContractor && m.content?.is_addon && (!m.change_orders || m.change_orders.length === 0) && (
                                <button 
                                    onClick={() => setAddonModal({ isOpen: true, milestone: m })}
                                    className="mt-4 px-4 py-2 bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-amber-600 transition-all shadow-lg shadow-amber-100 flex items-center gap-2 w-fit"
                                >
                                    <Banknote size={14} /> Request Fee
                                </button>
                            )}

                            {m.approval_status === 'approved' && project.payment_termins?.some((t: any) => t.milestone_id === m.id) && (
                                <button 
                                    onClick={() => {
                                        const termin = project.payment_termins?.find((t: any) => t.milestone_id === m.id);
                                        if (termin) setUnlockedTerminNotice(termin);
                                    }}
                                    className="mt-4 px-4 py-2 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100 flex items-center gap-2 w-fit"
                                >
                                    <Check size={14} /> Share Payment Link
                                </button>
                            )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            )}

            {showExtensionModal && <ExtensionRequestModal project={project} onClose={() => setShowExtensionModal(false)} onSuccess={fetchMilestones} />}

            {/* Confirmation Modal */}
            {confirmModal.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-slate-100">
                        <div className="flex flex-col items-center text-center gap-4 mb-8">
                            <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-[2rem] flex items-center justify-center">
                                <ShieldCheck size={40} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900 tracking-tight">Approve Progress?</h3>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Construction Verification</p>
                            </div>
                        </div>

                        <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 mb-8 space-y-4">
                            <div className="flex items-start gap-3 text-left">
                                <Layers className="text-slate-400 mt-0.5" size={16} />
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Phase</p>
                                    <p className="text-sm font-black text-slate-900">{confirmModal.milestone?.title}</p>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-200/60 text-left">
                                <div className="flex items-start gap-3">
                                    <div className="p-2 bg-emerald-500 text-white rounded-lg">
                                        <Check size={16} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Unlocks Payment</p>
                                        <p className="text-sm font-black text-slate-900">{confirmModal.termin?.label}</p>
                                        <p className="text-lg font-black text-emerald-600">Rp {Number(confirmModal.termin?.amount).toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button 
                                onClick={() => setConfirmModal({ isOpen: false, milestone: null, termin: null })}
                                className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={() => confirmModal.milestone && handleAuditSubmit(confirmModal.milestone, 'approved')}
                                disabled={isSubmittingAudit}
                                className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl"
                            >
                                {isSubmittingAudit ? 'Processing...' : 'Confirm & Approve'}
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
                    phaseContext="build"
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
}
