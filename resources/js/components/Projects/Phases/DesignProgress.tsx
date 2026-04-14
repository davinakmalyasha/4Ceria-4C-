import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Pencil, Check, Image, Layers, X, Save, Trash2, FileText, ArrowUpRight } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

interface DesignProgressProps {
    project: any;
    currentUser: any;
    isArchitect: boolean;
}

interface Milestone {
    id: number;
    title: string;
    description: string | null;
    image: string | null;
    type: 'generic' | 'schematic' | 'development' | 'construction';
    approval_status?: 'pending' | 'approved' | 'revision';
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

export default function DesignProgress({ project, currentUser, isArchitect }: DesignProgressProps) {
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const { showToast } = useToast();

    // Form state
    const [formTitle, setFormTitle] = useState('');
    const [formType, setFormType] = useState<Milestone['type']>('generic');
    const [formDesc, setFormDesc] = useState('');
    const [existingGallery, setExistingGallery] = useState<string[]>([]);
    const [newGalleryFiles, setNewGalleryFiles] = useState<File[]>([]);
    const [formChecklist, setFormChecklist] = useState<{ label: string; checked: boolean }[]>([]);
    const [formLinks, setFormLinks] = useState<{ label: string; url: string }[]>([]);
    const [submitting, setSubmitting] = useState(false);

    const fetchMilestones = async () => {
        if (!project?.id) return;
        try {
            const res = await axios.get(`/projects/${project.id}/milestones`);
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

    const loadChecklistForPhase = (type: Milestone['type']) => {
        if (type === 'schematic') return [{label: '3D Massing Concept', checked: false}, {label: 'Basic Floor Plan', checked: false}, {label: 'Material Moodboard', checked: false}];
        if (type === 'development') return [{label: 'Detailed Measurements', checked: false}, {label: 'Electrical/Plumbing Plans', checked: false}, {label: 'Material Specifications', checked: false}];
        if (type === 'construction') return [{label: 'Final Blueprints', checked: false}, {label: 'Structural Engineering Review', checked: false}];
        return [];
    };

    const handleQuickAdd = (type: Milestone['type'], title: string) => {
        resetForm();
        setFormType(type);
        setFormTitle(title);
        setFormChecklist(loadChecklistForPhase(type));
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
        
        // Add content metadata
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
            await axios.put(`/projects/${project.id}/milestones/${m.id}`, {
                is_completed: !m.is_completed,
            });
            fetchMilestones();
        } catch (error) {
            showToast('Failed to update status', 'error');
        }
    };

    const handleApprove = async (m: Milestone) => {
        try {
            await axios.post(`/projects/${project.id}/milestones/${m.id}/approve`);
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
            await axios.post(`/projects/${project.id}/milestones/${m.id}/request-revision`, {
                revision_notes: notes
            });
            showToast('Revision requested', 'success');
            fetchMilestones();
        } catch (error) {
            showToast('Failed to request revision', 'error');
        }
    };

    const handleToggleChecklistItem = async (m: Milestone, idx: number) => {
        if (!isArchitect || !m.content?.checklist || (m.approval_status !== 'in_progress' && m.approval_status !== 'revision')) return;
        
        try {
            const updatedChecklist = [...m.content.checklist];
            updatedChecklist[idx] = { ...updatedChecklist[idx], checked: !updatedChecklist[idx].checked };
            
            await axios.put(`/projects/${project.id}/milestones/${m.id}`, {
                content: { ...m.content, checklist: updatedChecklist }
            });
            fetchMilestones();
        } catch (error) {
            showToast('Failed to update checklist item', 'error');
        }
    };

    const handleSubmitPhase = async (m: Milestone) => {
        if (!window.confirm('Submit this phase for client review? You will not be able to edit checklist items until the client requests a revision.')) return;
        try {
            await axios.put(`/projects/${project.id}/milestones/${m.id}`, {
                approval_status: 'pending'
            });
            showToast('Phase submitted for review', 'success');
            fetchMilestones();
        } catch (error) {
            showToast('Failed to submit phase', 'error');
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('Delete this design phase?')) return;
        try {
            await axios.delete(`/projects/${project.id}/milestones/${id}`);
            showToast('Phase removed', 'success');
            fetchMilestones();
        } catch (error) {
            showToast('Failed to delete phase', 'error');
        }
    };

    if (loading) return (
        <div className="py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">
            Loading Design Progress...
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white">
                        <Layers size={20} />
                    </div>
                    <div>
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Design Progress</h4>
                        <p className="text-[10px] text-slate-400 font-bold">Visual timeline of your project's design evolution</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {isArchitect && !showForm && (
                        <>
                            <div className="hidden lg:flex items-center gap-2 mr-2 pr-4 border-r border-slate-100">
                                <button
                                    onClick={() => handleQuickAdd('schematic', 'M01: Schematic Design (SD)')}
                                    className="px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-all"
                                >
                                    + SD
                                </button>
                                <button
                                    onClick={() => handleQuickAdd('development', 'M02: Design Development (DD)')}
                                    className="px-3 py-2 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-amber-100 transition-all"
                                >
                                    + DD
                                </button>
                                <button
                                    onClick={() => handleQuickAdd('construction', 'M03: Construction Documents (CD)')}
                                    className="px-3 py-2 bg-red-50 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition-all"
                                >
                                    + CD
                                </button>
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

            {/* Add/Edit Form (Architect only) */}
            {showForm && (
                <form onSubmit={handleSubmit} className="bg-slate-900 rounded-[2rem] p-8 space-y-6 shadow-2xl">
                    <div className="flex items-center justify-between mb-2">
                        <h5 className="text-white font-black text-sm uppercase tracking-widest">
                            {editingId ? 'Edit Phase' : 'New Design Phase'}
                        </h5>
                        <button type="button" onClick={resetForm} className="text-slate-500 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Phase Type</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[
                                { id: 'generic', label: 'General', icon: Layers },
                                { id: 'schematic', label: 'SD', icon: Pencil },
                                { id: 'development', label: 'DD', icon: Layers },
                                { id: 'construction', label: 'CD', icon: FileText }
                            ].map((type) => (
                                <button
                                    key={type.id}
                                    type="button"
                                    onClick={() => setFormType(type.id as any)}
                                    className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl border-2 transition-all ${
                                        formType === type.id 
                                        ? 'bg-white border-white text-slate-900' 
                                        : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'
                                    }`}
                                >
                                    <type.icon size={14} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">{type.label}</span>
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
                            placeholder="e.g. Site Survey, Concept Design, 3D Modeling..."
                            className="w-full px-5 py-3.5 bg-white/5 border-2 border-white/10 rounded-xl text-sm text-white font-medium focus:border-white outline-none transition-all placeholder:text-slate-600"
                            required
                        />
                    </div>

                    <div className="space-y-2 pb-4 border-b border-white/10">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex justify-between">
                            Formal Deliverables (Checklist)
                            <button 
                                type="button" 
                                onClick={() => setFormChecklist([...formChecklist, { label: '', checked: false }])}
                                className="text-blue-400 hover:text-blue-300 transition-colors"
                            >
                                + Add Item
                            </button>
                        </label>
                        <div className="space-y-2">
                            {formChecklist.map((item, idx) => (
                                <div key={idx} className="flex gap-2 items-center">
                                    <div className="w-5 h-5 rounded border border-slate-600 flex items-center justify-center bg-white/5">
                                        {/* A dummy visual tick to show it's a checklist item */}
                                    </div>
                                    <input
                                        type="text"
                                        value={item.label}
                                        onChange={(e) => {
                                            const newC = [...formChecklist];
                                            newC[idx].label = e.target.value;
                                            setFormChecklist(newC);
                                        }}
                                        className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white"
                                        placeholder="Enter task name..."
                                        required
                                    />
                                    <button 
                                        type="button" 
                                        onClick={() => setFormChecklist(formChecklist.filter((_, i) => i !== idx))}
                                        className="p-2 text-slate-500 hover:text-red-500"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                            {formChecklist.length === 0 && (
                                <p className="text-xs text-slate-500 italic mt-2">No deliverables added. Click [+ Add Item] to define tasks for this phase.</p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</label>
                        <textarea
                            value={formDesc}
                            onChange={(e) => setFormDesc(e.target.value)}
                            placeholder="Describe what this phase involves..."
                            className="w-full px-5 py-3.5 bg-white/5 border-2 border-white/10 rounded-xl text-sm text-white font-medium focus:border-white outline-none transition-all resize-none h-24 placeholder:text-slate-600"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex justify-between">
                            External Presentation Links
                            <button 
                                type="button" 
                                onClick={() => setFormLinks([...formLinks, { label: '', url: '' }])}
                                className="text-blue-400 hover:text-blue-300 transition-colors"
                            >
                                + Add Link
                            </button>
                        </label>
                        <div className="space-y-3">
                            {formLinks.map((link, idx) => (
                                <div key={idx} className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Label (e.g. 3D Model)"
                                        value={link.label}
                                        onChange={(e) => {
                                            const newLinks = [...formLinks];
                                            newLinks[idx].label = e.target.value;
                                            setFormLinks(newLinks);
                                        }}
                                        className="w-1/3 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white"
                                    />
                                    <input
                                        type="url"
                                        placeholder="URL (e.g. https://drive...)"
                                        value={link.url}
                                        onChange={(e) => {
                                            const newLinks = [...formLinks];
                                            newLinks[idx].url = e.target.value;
                                            setFormLinks(newLinks);
                                        }}
                                        className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white"
                                    />
                                    <button 
                                        type="button" 
                                        onClick={() => setFormLinks(formLinks.filter((_, i) => i !== idx))}
                                        className="p-2 text-slate-500 hover:text-red-500"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex justify-between">
                            Design Gallery (Max 8)
                            <span className="text-slate-500 font-medium lowercase">{(existingGallery.length + newGalleryFiles.length)}/8 images</span>
                        </label>
                        
                        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3">
                            {/* Existing Images */}
                            {existingGallery.map((img, idx) => (
                                <div key={`existing-${idx}`} className="relative aspect-square group/img">
                                    <img src={`/storage/${img}`} className="w-full h-full object-cover rounded-xl border border-white/10" alt="" />
                                    <button 
                                        type="button"
                                        onClick={() => handleRemoveExisting(idx)}
                                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity shadow-lg"
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            ))}

                            {/* New Uploads */}
                            {newGalleryFiles.map((file, idx) => (
                                <div key={`new-${idx}`} className="relative aspect-square group/img">
                                    <img src={URL.createObjectURL(file)} className="w-full h-full object-cover rounded-xl border border-white/20" alt="" />
                                    <button 
                                        type="button"
                                        onClick={() => handleRemoveNew(idx)}
                                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity shadow-lg"
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            ))}

                            {/* Add Button */}
                            {(existingGallery.length + newGalleryFiles.length) < 8 && (
                                <label className="aspect-square flex flex-col items-center justify-center bg-white/5 border-2 border-dashed border-white/20 rounded-xl cursor-pointer hover:border-white/40 hover:bg-white/10 transition-all">
                                    <Plus size={16} className="text-slate-400 group-hover:text-white" />
                                    <input type="file" className="hidden" accept="image/*" multiple onChange={handleGalleryAdd} />
                                </label>
                            )}
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-4 bg-white text-slate-900 rounded-xl font-black text-xs uppercase tracking-[0.3em] hover:-translate-y-0.5 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {submitting ? (
                            <div className="w-5 h-5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                        ) : (
                            <><Save size={16} /> {editingId ? 'Update Phase' : 'Create Phase'}</>
                        )}
                    </button>
                </form>
            )}

            {/* Progress Cards */}
            {milestones.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-[2rem] bg-slate-50/50">
                    <Layers className="mx-auto text-slate-200 mb-3" size={40} />
                    <p className="text-sm font-black text-slate-300 uppercase tracking-widest">No design phases yet</p>
                    <p className="text-xs text-slate-400 mt-1">
                        {isArchitect ? 'Click "Add Phase" to start defining your design workflow.' : 'Your architect will post design phases here.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {milestones.map((m, index) => (
                        <div
                            key={m.id}
                            className={`group relative bg-white rounded-[1.5rem] border-2 overflow-hidden transition-all hover:shadow-lg ${
                                m.is_completed ? 'border-emerald-200' : 'border-slate-100'
                            }`}
                        >
                            <div className="absolute top-5 left-5 z-10">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${
                                    m.is_completed 
                                        ? 'bg-emerald-500 text-white' 
                                        : 'bg-slate-900 text-white'
                                }`}>
                                    {m.is_completed ? <Check size={16} /> : String(index + 1).padStart(2, '0')}
                                </div>
                            </div>

                            <div className={`flex flex-col ${(m.content?.gallery?.length || m.image) ? 'md:flex-row' : ''}`}>
                                {(m.content?.gallery?.length || m.image) && (
                                    <div className="md:w-80 shrink-0 bg-slate-50 border-r border-slate-100">
                                        <div className="grid grid-cols-2 gap-0.5 h-full min-h-[200px]">
                                            {(m.content?.gallery?.length ? m.content.gallery : [m.image]).slice(0, 4).map((img, i, arr) => (
                                                <div 
                                                    key={i} 
                                                    className={`relative overflow-hidden ${arr.length === 1 ? 'col-span-2 row-span-2' : arr.length === 2 ? 'row-span-2' : ''}`}
                                                >
                                                    <img
                                                        src={`/storage/${img}`}
                                                        alt=""
                                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                    />
                                                    {i === 3 && (m.content?.gallery?.length || 0) > 4 && (
                                                        <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center backdrop-blur-[2px]">
                                                            <span className="text-white font-black text-sm">+{m.content!.gallery!.length - 4}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="flex-1 p-6 pl-16">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1">
                                            <h5 className={`text-base font-black tracking-tight ${
                                                m.is_completed ? 'text-emerald-700' : 'text-slate-900'
                                            }`}>
                                                {m.title}
                                            </h5>
                                            {m.description && (
                                                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed font-medium">
                                                    {m.description}
                                                </p>
                                            )}
                                            <div className="flex items-center gap-3 mt-3">
                                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                                    m.is_completed 
                                                        ? 'bg-emerald-100 text-emerald-700' 
                                                        : 'bg-amber-50 text-amber-600'
                                                }`}>
                                                    {m.is_completed ? 'Completed' : 
                                                     (m.approval_status === 'pending' && m.revision_notes ? 'Resubmitted' : 
                                                      m.approval_status === 'pending' ? 'Reviewing' : 'In Progress')}
                                                </span>
                                                {m.type && m.type !== 'generic' && (
                                                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                                        m.type === 'schematic' ? 'bg-blue-100 text-blue-700' :
                                                        m.type === 'development' ? 'bg-amber-100 text-amber-700' :
                                                        'bg-red-100 text-red-700'
                                                    }`}>
                                                        {m.type === 'schematic' ? 'SD' : 
                                                         m.type === 'development' ? 'DD' : 'CD'}
                                                    </span>
                                                )}
                                                {m.approval_status === 'revision' && m.revision_notes && (
                                                    <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-xl">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">Revision Requested</span>
                                                        </div>
                                                        <p className="text-xs text-red-800 italic">"{m.revision_notes}"</p>
                                                    </div>
                                                )}
                                                {m.approval_status === 'pending' && m.revision_notes && !isArchitect && (
                                                    <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                                                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest text-[#2d5ff5]">Resubmitted with Updates</span>
                                                        </div>
                                                        <p className="text-[10px] text-blue-400 font-bold uppercase mb-1">Your previous feedback:</p>
                                                        <p className="text-xs text-blue-800 italic opacity-70">"{m.revision_notes}"</p>
                                                    </div>
                                                )}
                                                {m.content?.revision_history && m.content.revision_history.length > 0 && (
                                                    <div className="mt-4 pt-4 border-t border-slate-100/50">
                                                        <div className="flex items-center gap-2 mb-3">
                                                            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">History of Past Revisions ({m.content.revision_history.length})</span>
                                                        </div>
                                                        <div className="space-y-3 pl-3 border-l border-slate-100">
                                                            {m.content.revision_history.map((rev, ridx) => (
                                                                <div key={ridx} className="relative">
                                                                    <div className="flex items-center justify-between gap-4 mb-0.5">
                                                                        <span className="text-[9px] font-bold text-slate-400">Version {rev.version}</span>
                                                                        <span className="text-[8px] font-medium text-slate-300 italic">{new Date(rev.date).toLocaleDateString()}</span>
                                                                    </div>
                                                                    <p className="text-[11px] text-slate-500 leading-relaxed italic line-clamp-2 hover:line-clamp-none transition-all cursor-default">
                                                                        "{rev.note}"
                                                                    </p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="w-full">
                                                {m.content?.checklist && m.content.checklist.length > 0 ? (
                                                    <div className="mt-4 space-y-2">
                                                        {m.content.checklist.map((item, idx) => (
                                                            <div 
                                                                key={idx} 
                                                                className={`flex items-center gap-2 ${isArchitect && (m.approval_status === 'in_progress' || m.approval_status === 'revision') ? 'cursor-pointer group' : ''}`}
                                                                onClick={() => {
                                                                    if (isArchitect && (m.approval_status === 'in_progress' || m.approval_status === 'revision')) {
                                                                        handleToggleChecklistItem(m, idx);
                                                                    }
                                                                }}
                                                            >
                                                                <div className={`flex-shrink-0 w-3.5 h-3.5 rounded-sm flex items-center justify-center transition-colors ${
                                                                    item.checked 
                                                                        ? 'bg-emerald-100 text-emerald-600' 
                                                                        : isArchitect && (m.approval_status === 'in_progress' || m.approval_status === 'revision') 
                                                                            ? 'bg-slate-50 border border-slate-300 group-hover:border-emerald-400' 
                                                                            : 'bg-slate-100 border border-slate-200'
                                                                }`}>
                                                                    {item.checked && <Check size={10} strokeWidth={3} />}
                                                                </div>
                                                                <span className={`text-[11px] transition-colors ${
                                                                    item.checked 
                                                                        ? 'text-slate-600 font-medium' 
                                                                        : isArchitect && (m.approval_status === 'in_progress' || m.approval_status === 'revision') 
                                                                            ? 'text-slate-500 group-hover:text-slate-900' 
                                                                            : 'text-slate-400'
                                                                }`}>
                                                                    {item.label}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    isArchitect && m.approval_status === 'in_progress' && (
                                                        <div className="mt-4 p-3 border border-dashed border-slate-200 rounded-xl bg-slate-50">
                                                            <p className="text-[10px] text-slate-500 text-center uppercase tracking-widest font-black">No Checklist Items Added</p>
                                                            <p className="text-[10px] text-slate-400 text-center mt-1">Please click the Edit (pencil) icon to define deliverables for this phase.</p>
                                                        </div>
                                                    )
                                                )}
                                            </div>

                                            {m.content?.links && m.content.links.length > 0 && (
                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    {m.content.links.map((link, lidx) => (
                                                        <a
                                                            key={lidx}
                                                            href={link.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 hover:border-slate-200 transition-all group/link"
                                                        >
                                                            <ArrowUpRight size={12} className="text-slate-400 group-hover/link:text-blue-500 transition-colors" />
                                                            {link.label || 'View Link'}
                                                        </a>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {isArchitect && (
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <div className="mr-2 flex items-center gap-1">
                                                {m.type === 'schematic' && <Pencil size={12} className="text-blue-400" />}
                                                {m.type === 'development' && <Layers size={12} className="text-amber-400" />}
                                                {m.type === 'construction' && <FileText size={12} className="text-red-400" />}
                                            </div>
                                            
                                            {m.type === 'generic' ? (
                                                <button
                                                    onClick={() => handleToggleComplete(m)}
                                                    className={`p-2 rounded-lg transition-colors ${
                                                        m.is_completed
                                                            ? 'text-amber-500 hover:bg-amber-50'
                                                            : 'text-emerald-500 hover:bg-emerald-50'
                                                    }`}
                                                    title={m.is_completed ? 'Mark as In Progress' : 'Mark as Completed'}
                                                >
                                                    <Check size={16} />
                                                </button>
                                            ) : (
                                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${
                                                    m.approval_status === 'approved' ? 'bg-emerald-50 text-emerald-600' :
                                                    m.approval_status === 'revision' ? 'bg-red-50 text-red-600' : 
                                                    m.approval_status === 'in_progress' ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-400'
                                                }`}>
                                                    {m.approval_status ? m.approval_status.replace('_', ' ') : 'in progress'}
                                                </span>
                                            )}

                                            <button
                                                onClick={() => handleEdit(m)}
                                                className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors ml-2"
                                                title="Edit"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(m.id)}
                                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Delete"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    )}

                                    {m.type !== 'generic' && isArchitect && (m.approval_status === 'in_progress' || m.approval_status === 'revision') && (
                                        <div className="flex flex-col gap-2 w-full mt-4 lg:w-auto lg:mt-0 lg:ml-auto">
                                            <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest text-right">
                                                {m.approval_status === 'revision' ? 'Fixing Revision' : 'Draft / Working Phase'}
                                            </p>
                                            <div className="flex gap-2 justify-end">
                                                <button 
                                                    onClick={() => handleSubmitPhase(m)}
                                                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-[10px] uppercase font-black tracking-widest rounded-xl shadow-md transition-colors flex items-center gap-2"
                                                >
                                                    <Check size={14} /> {m.approval_status === 'revision' ? 'Resubmit Phase' : 'Submit Phase for Review'}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {m.type !== 'generic' && !isArchitect && m.approval_status === 'pending' && (
                                        <div className="flex flex-col gap-2 w-full mt-4 lg:w-auto lg:mt-0 lg:ml-auto">
                                            <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest text-right">
                                                {m.revision_notes ? 'Review Updated Design' : 'Requires Your Sign-Off'}
                                            </p>
                                            <div className="flex gap-2 justify-end">
                                                <button 
                                                    onClick={() => handleRequestRevision(m)}
                                                    className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-[10px] uppercase font-black tracking-widest rounded-xl transition-colors"
                                                >
                                                    Request Revision
                                                </button>
                                                <button 
                                                    onClick={() => handleApprove(m)}
                                                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] uppercase font-black tracking-widest rounded-xl shadow-md transition-colors"
                                                >
                                                    Approve Design
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
