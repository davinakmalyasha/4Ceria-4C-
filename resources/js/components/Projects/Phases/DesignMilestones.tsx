import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    Plus, Pencil, Check, Layers, X, Save, 
    Trash2, FileText, ArrowUpRight, Sparkles, 
    ShieldCheck, Calendar, Banknote 
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

interface DesignMilestonesProps {
    project: any;
    currentUser: any;
    isArchitect: boolean;
    isPM: boolean;
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
    linked_termin?: any;
    content?: {
        gallery?: string[];
        links?: { label: string; url: string }[];
        checklist?: { label: string; checked: boolean }[];
        revision_history?: { note: string; date: string; version: number }[];
    };
    sort_order: number;
    is_completed: boolean;
    pm_verified_at?: string;
}

export default function DesignMilestones({ project, currentUser, isArchitect, isPM }: DesignMilestonesProps) {
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const { showToast } = useToast();

    // Form state... (re-implementing the robust form from original DesignProgress)
    const [formTitle, setFormTitle] = useState('');
    const [formType, setFormType] = useState<Milestone['type']>('generic');
    const [formDesc, setFormDesc] = useState('');
    const [formChecklist, setFormChecklist] = useState<{ label: string; checked: boolean }[]>([]);
    const [submitting, setSubmitting] = useState(false);

    const isOwner = currentUser?.id === project?.user_id;

    const fetchMilestones = async () => {
        try {
            const res = await axios.get(`/projects/${project.id}/milestones`, { params: { phase_context: 'design' } });
            setMilestones((res.data?.data || []).sort((a: any, b: any) => a.sort_order - b.sort_order));
        } catch (error) { console.error(error); } finally { setLoading(false); }
    };

    useEffect(() => { fetchMilestones(); }, [project.id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const payload = {
                title: formTitle,
                type: formType,
                description: formDesc,
                phase_context: 'design',
                content: { checklist: formChecklist }
            };
            if (editingId) {
                await axios.put(`/projects/${project.id}/milestones/${editingId}`, payload);
                showToast('Phase updated', 'success');
            } else {
                await axios.post(`/projects/${project.id}/milestones`, payload);
                showToast('Phase added', 'success');
            }
            setShowForm(false); fetchMilestones();
        } catch (err) { showToast('Error saving phase', 'error'); } finally { setSubmitting(false); }
    };

    const handleApprove = async (m: Milestone) => {
        try {
            await axios.post(`/projects/${project.id}/milestones/${m.id}/approve`);
            showToast('Approved', 'success'); fetchMilestones();
        } catch (error) { showToast('Error', 'error'); }
    };

    if (loading) return <div className="py-20 text-center text-slate-400 font-bold uppercase text-[10px]">Loading Design...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Design Milestones</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Evolution of the project blueprint</p>
                </div>
                {isArchitect && !showForm && (
                    <button onClick={() => { setEditingId(null); setFormTitle(''); setShowForm(true); }} className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg">
                        <Plus size={14} /> Add Phase
                    </button>
                )}
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} className="bg-slate-900 rounded-[2rem] p-8 space-y-6">
                    <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Phase Name" className="w-full px-5 py-3.5 bg-white/5 border-2 border-white/10 rounded-xl text-white text-xs outline-none focus:border-white" required />
                    <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Description" className="w-full px-5 py-3.5 bg-white/5 border-2 border-white/10 rounded-xl text-white text-xs min-h-[100px]" />
                    <button type="submit" disabled={submitting} className="w-full py-4 bg-white text-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest">{submitting ? 'Saving...' : 'Save Design Phase'}</button>
                </form>
            )}

            <div className="space-y-4">
                {milestones.map((m, idx) => (
                    <div key={m.id} className="bg-white border-2 border-slate-100 rounded-2xl p-6 group hover:shadow-lg transition-all">
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <h5 className="text-xs font-black text-slate-900 uppercase tracking-widest">{m.title}</h5>
                                <p className="text-[11px] text-slate-500 mt-1">{m.description}</p>
                                <div className="mt-4 flex gap-2">
                                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${m.is_completed ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                        {m.approval_status || (m.is_completed ? 'Completed' : 'Active')}
                                    </span>
                                </div>
                            </div>
                            {(isOwner || isPM) && m.approval_status === 'pending' && (
                                <button onClick={() => handleApprove(m)} className="px-4 py-2 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">Approve</button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
