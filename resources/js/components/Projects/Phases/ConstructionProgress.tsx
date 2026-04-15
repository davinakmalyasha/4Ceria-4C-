import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Pencil, Check, Image, Layers, X, Save, Trash2, FileText, ArrowUpRight, Hammer } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { CONSTRUCTION_MILESTONE_TYPES } from '../../../constants/ContractorStandardPresets';

interface ConstructionProgressProps {
    project: any;
    currentUser: any;
    isContractor: boolean;
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
}

export default function ConstructionProgress({ project, currentUser, isContractor }: ConstructionProgressProps) {
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const { showToast } = useToast();

    // Form state
    const [formTitle, setFormTitle] = useState('');
    const [formType, setFormType] = useState('generic');
    const [formDesc, setFormDesc] = useState('');
    const [existingGallery, setExistingGallery] = useState<string[]>([]);
    const [newGalleryFiles, setNewGalleryFiles] = useState<File[]>([]);
    const [formChecklist, setFormChecklist] = useState<{ label: string; checked: boolean }[]>([]);
    const [formLinks, setFormLinks] = useState<{ label: string; url: string }[]>([]);
    const [submitting, setSubmitting] = useState(false);

    const fetchMilestones = async () => {
        if (!project?.id) return;
        try {
            const res = await axios.get(`/api/projects/${project.id}/milestones`);
            const sorted = (res.data?.data || []).sort(
                (a: Milestone, b: Milestone) => a.sort_order - b.sort_order
            );
            setMilestones(sorted);
        } catch (error) {
            console.error('Failed to fetch milestones', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchMilestones(); }, [project?.id]);

    const resetForm = () => {
        setFormTitle('');
        setFormType('generic');
        setFormDesc('');
        setExistingGallery([]);
        setNewGalleryFiles([]);
        setFormChecklist([]);
        setFormLinks([]);
        setEditingId(null);
        setShowForm(false);
    };

    const handleQuickAdd = (type: string, title: string, checklist: string[]) => {
        resetForm();
        setFormType(type);
        setFormTitle(title);
        setFormChecklist(checklist.map(label => ({ label, checked: false })));
        setShowForm(true);
    };

    const handleGalleryAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length + existingGallery.length + newGalleryFiles.length > 8) {
            showToast('Maximum 8 images allowed per phase.', 'error');
            return;
        }
        setNewGalleryFiles([...newGalleryFiles, ...files]);
    };

    const handleRemoveExisting = (index: number) => {
        setExistingGallery(existingGallery.filter((_, i) => i !== index));
    };

    const handleRemoveNew = (index: number) => {
        setNewGalleryFiles(newGalleryFiles.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formTitle.trim()) return;

        setSubmitting(true);
        const formData = new FormData();
        formData.append('title', formTitle);
        formData.append('type', formType);
        formData.append('description', formDesc);
        formData.append('sort_order', String(milestones.length));
        
        formData.append('content', JSON.stringify({
            links: formLinks,
            checklist: formChecklist
        }));

        formData.append('retained_gallery', JSON.stringify(existingGallery));
        newGalleryFiles.forEach((file) => {
            formData.append('gallery[]', file);
        });
        
        try {
            if (editingId) {
                formData.append('_method', 'PUT');
                await axios.post(`/api/projects/${project.id}/milestones/${editingId}`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                showToast('Construction phase updated', 'success');
            } else {
                await axios.post(`/api/projects/${project.id}/milestones`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                showToast('Construction phase added', 'success');
            }
            resetForm();
            fetchMilestones();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to save phase', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = (m: Milestone) => {
        setEditingId(m.id);
        setFormTitle(m.title);
        setFormType(m.type || 'generic');
        setFormDesc(m.description || '');
        setFormChecklist(m.content?.checklist || []);
        setFormLinks(m.content?.links || []);
        
        const gallery = m.content?.gallery || [];
        if (!gallery.length && m.image) {
            setExistingGallery([m.image]);
        } else {
            setExistingGallery(gallery);
        }
        setNewGalleryFiles([]);
        setShowForm(true);
    };

    const handleToggleComplete = async (m: Milestone) => {
        try {
            await axios.put(`/api/projects/${project.id}/milestones/${m.id}`, {
                is_completed: !m.is_completed,
            });
            fetchMilestones();
        } catch (error) {
            showToast('Failed to update status', 'error');
        }
    };

    const handleApprove = async (m: Milestone) => {
        try {
            await axios.post(`/api/projects/${project.id}/milestones/${m.id}/approve`);
            showToast('Phase approved successfully', 'success');
            fetchMilestones();
        } catch (error) {
            showToast('Failed to approve phase', 'error');
        }
    };

    const handleRequestRevision = async (m: Milestone) => {
        const notes = window.prompt("Please detail what needs to be revised:");
        if (!notes) return;
        
        try {
            await axios.post(`/api/projects/${project.id}/milestones/${m.id}/request-revision`, {
                revision_notes: notes
            });
            showToast('Revision requested', 'success');
            fetchMilestones();
        } catch (error) {
            showToast('Failed to request revision', 'error');
        }
    };

    const handleToggleChecklistItem = async (m: Milestone, idx: number) => {
        if (!isContractor || !m.content?.checklist || (m.approval_status !== 'in_progress' && m.approval_status !== 'revision')) return;
        
        try {
            const updatedChecklist = [...m.content.checklist];
            updatedChecklist[idx] = { ...updatedChecklist[idx], checked: !updatedChecklist[idx].checked };
            
            await axios.put(`/api/projects/${project.id}/milestones/${m.id}`, {
                content: { ...m.content, checklist: updatedChecklist }
            });
            fetchMilestones();
        } catch (error) {
            showToast('Failed to update checklist item', 'error');
        }
    };

    const handleSubmitPhase = async (m: Milestone) => {
        if (!window.confirm('Submit this phase for client review?')) return;
        try {
            await axios.put(`/api/projects/${project.id}/milestones/${m.id}`, {
                approval_status: 'pending'
            });
            showToast('Phase submitted for review', 'success');
            fetchMilestones();
        } catch (error) {
            showToast('Failed to submit phase', 'error');
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('Delete this construction phase?')) return;
        try {
            await axios.delete(`/api/projects/${project.id}/milestones/${id}`);
            showToast('Phase removed', 'success');
            fetchMilestones();
        } catch (error) {
            showToast('Failed to delete phase', 'error');
        }
    };

    if (loading) return (
        <div className="py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">
            Loading Construction Progress...
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white">
                        <Hammer size={20} />
                    </div>
                    <div>
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Construction Progress</h4>
                        <p className="text-[10px] text-slate-400 font-bold">Monitor construction milestones and physical progress</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {isContractor && !showForm && (
                        <>
                            <div className="hidden lg:flex items-center gap-2 mr-2 pr-4 border-r border-slate-100">
                                {CONSTRUCTION_MILESTONE_TYPES.slice(0, 3).map((type) => (
                                    <button
                                        key={type.id}
                                        onClick={() => handleQuickAdd(type.id, type.label, type.checklist)}
                                        className={`px-3 py-2 bg-slate-50 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all`}
                                    >
                                        + {type.shortLabel}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => { resetForm(); setShowForm(true); }}
                                className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg"
                            >
                                <Plus size={14} /> Add Phase
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Add/Edit Form */}
            {showForm && (
                <form onSubmit={handleSubmit} className="bg-slate-900 rounded-[2rem] p-8 space-y-6 shadow-2xl">
                    <div className="flex items-center justify-between mb-2">
                        <h5 className="text-white font-black text-sm uppercase tracking-widest">
                            {editingId ? 'Edit Construction Phase' : 'New Construction Phase'}
                        </h5>
                        <button type="button" onClick={resetForm} className="text-slate-500 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Phase Type</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                            <button
                                type="button"
                                onClick={() => setFormType('generic')}
                                className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl border-2 transition-all ${
                                    formType === 'generic' ? 'bg-white border-white text-slate-900' : 'bg-white/5 border-white/10 text-slate-400'
                                }`}
                            >
                                <Layers size={14} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Generic</span>
                            </button>
                            {CONSTRUCTION_MILESTONE_TYPES.map((type) => (
                                <button
                                    key={type.id}
                                    type="button"
                                    onClick={() => {
                                        setFormType(type.id);
                                        if (!formTitle) setFormTitle(type.label);
                                        if (formChecklist.length === 0) setFormChecklist(type.checklist.map(l => ({ label: l, checked: false })));
                                    }}
                                    className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl border-2 transition-all ${
                                        formType === type.id ? 'bg-white border-white text-slate-900' : 'bg-white/5 border-white/10 text-slate-400'
                                    }`}
                                >
                                    <span className="text-[10px] font-black uppercase tracking-widest">{type.shortLabel}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Phase Name</label>
                        <input
                            type="text"
                            value={formTitle}
                            onChange={(e) => setFormTitle(e.target.value)}
                            className="w-full px-5 py-3.5 bg-white/5 border-2 border-white/10 rounded-xl text-sm text-white font-medium focus:border-white outline-none transition-all"
                            required
                        />
                    </div>

                    <div className="space-y-2 pb-4 border-b border-white/10">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex justify-between">
                            Checklist Items
                            <button type="button" onClick={() => setFormChecklist([...formChecklist, { label: '', checked: false }])} className="text-blue-400 hover:text-blue-300">
                                + Add Item
                            </button>
                        </label>
                        <div className="space-y-2">
                            {formChecklist.map((item, idx) => (
                                <div key={idx} className="flex gap-2 items-center">
                                    <input
                                        type="text"
                                        value={item.label}
                                        onChange={(e) => {
                                            const newC = [...formChecklist];
                                            newC[idx].label = e.target.value;
                                            setFormChecklist(newC);
                                        }}
                                        className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white"
                                        placeholder="Task name..."
                                        required
                                    />
                                    <button type="button" onClick={() => setFormChecklist(formChecklist.filter((_, i) => i !== idx))} className="p-2 text-slate-500 hover:text-red-500">
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</label>
                        <textarea
                            value={formDesc}
                            onChange={(e) => setFormDesc(e.target.value)}
                            className="w-full px-5 py-3.5 bg-white/5 border-2 border-white/10 rounded-xl text-sm text-white h-24 transition-all"
                        />
                    </div>

                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex justify-between">
                            Site Gallery (Max 8)
                            <span className="text-slate-500">{(existingGallery.length + newGalleryFiles.length)}/8</span>
                        </label>
                        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3">
                            {existingGallery.map((img, idx) => (
                                <div key={`existing-${idx}`} className="relative aspect-square">
                                    <img src={`/storage/${img}`} className="w-full h-full object-cover rounded-xl border border-white/10" alt="" />
                                    <button type="button" onClick={() => handleRemoveExisting(idx)} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg"><X size={10} /></button>
                                </div>
                            ))}
                            {newGalleryFiles.map((file, idx) => (
                                <div key={`new-${idx}`} className="relative aspect-square">
                                    <img src={URL.createObjectURL(file)} className="w-full h-full object-cover rounded-xl border border-white/20" alt="" />
                                    <button type="button" onClick={() => handleRemoveNew(idx)} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg"><X size={10} /></button>
                                </div>
                            ))}
                            {(existingGallery.length + newGalleryFiles.length) < 8 && (
                                <label className="aspect-square flex flex-col items-center justify-center bg-white/5 border-2 border-dashed border-white/20 rounded-xl cursor-pointer hover:border-white/40">
                                    <Plus size={16} className="text-slate-400" />
                                    <input type="file" className="hidden" accept="image/*" multiple onChange={handleGalleryAdd} />
                                </label>
                            )}
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-4 bg-white text-slate-900 rounded-xl font-black text-xs uppercase tracking-[0.3em] flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {submitting ? <div className="w-5 h-5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" /> : <><Save size={16} /> {editingId ? 'Update Phase' : 'Create Phase'}</>}
                    </button>
                </form>
            )}

            {/* Progress Cards */}
            <div className="space-y-4">
                {milestones.length === 0 ? (
                    <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-[2rem] bg-slate-50/50">
                        <Layers className="mx-auto text-slate-200 mb-3" size={40} />
                        <p className="text-sm font-black text-slate-300 uppercase tracking-widest">No construction phases yet</p>
                    </div>
                ) : (
                    milestones.map((m, index) => (
                        <div
                            key={m.id}
                            className={`group relative bg-white rounded-[1.5rem] border-2 overflow-hidden transition-all hover:shadow-lg ${
                                m.is_completed ? 'border-emerald-200' : 'border-slate-100'
                            }`}
                        >
                            <div className="absolute top-5 left-5 z-10 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black bg-slate-900 text-white">
                                {m.is_completed ? <Check size={16} /> : String(index + 1).padStart(2, '0')}
                            </div>

                            <div className={`flex flex-col ${(m.content?.gallery?.length || m.image) ? 'md:flex-row' : ''}`}>
                                {(m.content?.gallery?.length || m.image) && (
                                    <div className="md:w-80 shrink-0 bg-slate-50 border-r border-slate-100 min-h-[200px]">
                                        <div className="grid grid-cols-2 gap-0.5 h-full">
                                            {(m.content?.gallery?.length ? m.content.gallery : [m.image]).slice(0, 4).map((img, i) => (
                                                <img key={i} src={`/storage/${img}`} className="w-full h-full object-cover" alt="" />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="flex-1 p-6 pl-16">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h5 className="text-base font-black text-slate-900">{m.title}</h5>
                                            <div className="flex items-center gap-3 mt-1.5">
                                                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                                    m.is_completed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                                }`}>
                                                    {m.approval_status || (m.is_completed ? 'Completed' : 'In Progress')}
                                                </span>
                                                {m.type !== 'generic' && (
                                                    <span className="px-2.5 py-0.5 bg-slate-900 text-white rounded-full text-[9px] font-black uppercase tracking-widest">
                                                        {m.type.toUpperCase()}
                                                    </span>
                                                )}
                                            </div>
                                            
                                            {m.content?.checklist && m.content.checklist.length > 0 && (
                                                <div className="mt-4 space-y-1.5">
                                                    {m.content.checklist.map((item, idx) => (
                                                        <div 
                                                            key={idx} 
                                                            className="flex items-center gap-2 cursor-pointer"
                                                            onClick={() => handleToggleChecklistItem(m, idx)}
                                                        >
                                                            <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${item.checked ? 'bg-emerald-100 border-emerald-200 text-emerald-600' : 'bg-slate-50 border-slate-200'}`}>
                                                                {item.checked && <Check size={10} strokeWidth={3} />}
                                                            </div>
                                                            <span className={`text-[11px] ${item.checked ? 'text-slate-500 line-through' : 'text-slate-700 font-medium'}`}>{item.label}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {isContractor && (
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleEdit(m)} className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-lg"><Pencil size={16} /></button>
                                                <button onClick={() => handleDelete(m.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {isContractor && m.approval_status !== 'approved' && !m.is_completed && (
                                        <button 
                                            onClick={() => handleSubmitPhase(m)}
                                            className="mt-6 px-4 py-2 bg-slate-900 text-white text-[10px] uppercase font-black tracking-widest rounded-xl flex items-center gap-2 hover:bg-slate-800 transition-colors"
                                        >
                                            <Check size={14} /> Submit for Review
                                        </button>
                                    )}

                                    {!isContractor && m.approval_status === 'pending' && (
                                        <div className="mt-6 flex gap-2">
                                            <button onClick={() => handleRequestRevision(m)} className="px-4 py-2 border border-red-200 text-red-600 text-[10px] uppercase font-black tracking-widest rounded-xl hover:bg-red-50 transition-colors">Request Revision</button>
                                            <button onClick={() => handleApprove(m)} className="px-4 py-2 bg-emerald-500 text-white text-[10px] uppercase font-black tracking-widest rounded-xl hover:bg-emerald-600 transition-colors shadow-md">Approve Phase</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
