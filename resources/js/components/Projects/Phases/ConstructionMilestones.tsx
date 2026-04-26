import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Pencil, Check, X, Save, Trash2, Layers, Clock } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { CONSTRUCTION_MILESTONE_TYPES } from '../../../constants/ContractorStandardPresets';
import ExtensionRequestModal from './ExtensionRequestModal';

interface ConstructionMilestonesProps {
    project: any;
    currentUser: any;
    isContractor: boolean;
    isPM?: boolean;
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

export default function ConstructionMilestones({ project, currentUser, isContractor, isPM = false }: ConstructionMilestonesProps) {
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
    const [submitting, setSubmitting] = useState(false);
    const [showExtensionModal, setShowExtensionModal] = useState(false);

    // Material Request State
    const [requestingMaterialFor, setRequestingMaterialFor] = useState<Milestone | null>(null);
    const [materialForm, setMaterialForm] = useState({ name: '', quantity: '', unit: '', notes: '' });

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        const formData = new FormData();
        formData.append('title', formTitle);
        formData.append('type', formType);
        formData.append('description', formDesc);
        formData.append('phase_context', 'build');
        formData.append('content', JSON.stringify({ checklist: formChecklist }));
        formData.append('retained_gallery', JSON.stringify(existingGallery));
        newGalleryFiles.forEach(f => formData.append('gallery[]', f));
        
        try {
            if (editingId) {
                formData.append('_method', 'PUT');
                await axios.post(`/projects/${project.id}/milestones/${editingId}`, formData);
                showToast('Updated', 'success');
            } else {
                await axios.post(`/projects/${project.id}/milestones`, formData);
                showToast('Added', 'success');
            }
            resetForm(); fetchMilestones();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Error', 'error');
        } finally { setSubmitting(false); }
    };

    const handleApprove = async (m: Milestone) => {
        try {
            await axios.post(`/projects/${project.id}/milestones/${m.id}/approve`);
            showToast('Approved', 'success'); fetchMilestones();
        } catch (error) { showToast('Error', 'error'); }
    };

    const handleRequestRevision = async (m: Milestone) => {
        const notes = window.prompt("Detail revision:");
        if (!notes) return;
        try {
            await axios.post(`/projects/${project.id}/milestones/${m.id}/request-revision`, { revision_notes: notes });
            showToast('Requested', 'success'); fetchMilestones();
        } catch (error) { showToast('Error', 'error'); }
    };

    const handleSubmitPhase = async (m: Milestone) => {
        if (!window.confirm('Submit for review?')) return;
        try {
            await axios.put(`/projects/${project.id}/milestones/${m.id}`, { approval_status: 'pending' });
            showToast('Submitted', 'success'); fetchMilestones();
        } catch (error) { showToast('Error', 'error'); }
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
                        <button onClick={() => setShowExtensionModal(true)} className="px-4 py-2 bg-amber-50 text-amber-600 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Clock size={14} /> Extension</button>
                        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Plus size={14} /> Add Phase</button>
                    </div>
                )}
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} className="bg-slate-900 rounded-[2rem] p-6 space-y-4">
                    <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Phase Name" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-xs outline-none focus:border-white" required />
                    <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Description" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-xs min-h-[80px]" />
                    <button type="submit" disabled={submitting} className="w-full py-4 bg-white text-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest">{submitting ? 'Saving...' : 'Save Milestone'}</button>
                </form>
            )}

            <div className="space-y-4">
                {milestones.map((m, idx) => (
                    <div key={m.id} className="bg-white border-2 border-slate-100 rounded-2xl p-6 flex flex-col md:flex-row gap-6">
                        <div className="flex-1">
                            <h5 className="text-xs font-black text-slate-900 uppercase tracking-widest">{m.title}</h5>
                            <p className="text-[10px] text-slate-500 font-medium mt-1">{m.description}</p>
                            <div className="mt-4 flex gap-2">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${m.is_completed ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{m.approval_status || (m.is_completed ? 'Completed' : 'Active')}</span>
                            </div>
                            {isContractor && m.approval_status !== 'approved' && !m.is_completed && (
                                <button onClick={() => handleSubmitPhase(m)} className="mt-4 px-4 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">Submit for Review</button>
                            )}
                            {!isContractor && m.approval_status === 'pending' && (
                                <div className="mt-4 flex gap-2">
                                    <button onClick={() => handleRequestRevision(m)} className="px-4 py-2 border border-red-200 text-red-600 text-[10px] font-black uppercase tracking-widest rounded-xl">Revise</button>
                                    <button onClick={() => handleApprove(m)} className="px-4 py-2 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">Approve</button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {showExtensionModal && <ExtensionRequestModal project={project} onClose={() => setShowExtensionModal(false)} onSuccess={fetchMilestones} />}
        </div>
    );
}
