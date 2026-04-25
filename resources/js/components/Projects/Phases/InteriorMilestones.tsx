import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    Plus, Check, Image, X, Save, Trash2, 
    ChevronDown, ChevronUp, MessageSquare,
    ShoppingBag, DollarSign, Info, Armchair
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

interface InteriorMilestonesProps {
    project: any;
    currentUser: any;
    isInteriorDesigner: boolean;
    isPM?: boolean;
}

export default function InteriorMilestones({ project, currentUser, isInteriorDesigner, isPM = false }: InteriorMilestonesProps) {
    const [milestones, setMilestones] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const { showToast } = useToast();

    // Form state
    const [formTitle, setFormTitle] = useState('');
    const [formType, setFormType] = useState('living_room');
    const [formDesc, setFormDesc] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const isOwner = currentUser?.id === project?.user_id;

    const fetchMilestones = async () => {
        try {
            const res = await axios.get(`/projects/${project.id}/milestones`, { params: { phase_context: 'interior' } });
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
                phase_context: 'interior'
            };
            await axios.post(`/projects/${project.id}/milestones`, payload);
            showToast('Room design added', 'success');
            setShowForm(false); fetchMilestones();
        } catch (err) { showToast('Error adding room', 'error'); } finally { setSubmitting(false); }
    };

    const handleApprove = async (id: number) => {
        try {
            await axios.post(`/projects/${project.id}/milestones/${id}/approve`);
            showToast('Approved', 'success'); fetchMilestones();
        } catch (err) { showToast('Error', 'error'); }
    };

    if (loading) return <div className="py-20 text-center text-slate-400 font-bold uppercase text-[10px]">Loading Rooms...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Room Designs</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Room-by-room design development</p>
                </div>
                {isInteriorDesigner && !showForm && (
                    <button onClick={() => setShowForm(true)} className="px-5 py-2.5 bg-purple-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-purple-100">
                        <Plus size={14} /> Add Room
                    </button>
                )}
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} className="bg-white border-2 border-purple-100 rounded-[2rem] p-6 space-y-4 shadow-xl">
                    <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="e.g. Master Bedroom v2" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black outline-none focus:border-purple-500" required />
                    <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Concept notes..." className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium outline-none focus:border-purple-500 min-h-[80px]" />
                    <button type="submit" disabled={submitting} className="w-full py-4 bg-purple-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest">{submitting ? 'Saving...' : 'Confirm Room Design'}</button>
                </form>
            )}

            <div className="space-y-3">
                {milestones.map(m => (
                    <div key={m.id} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden group">
                        <button onClick={() => setExpandedId(expandedId === m.id ? null : m.id)} className="w-full p-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
                                    <Armchair size={20} />
                                </div>
                                <div className="text-left">
                                    <p className="text-xs font-black text-slate-900">{m.title}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{m.type}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-slate-100`}>{m.approval_status || 'In Progress'}</span>
                                {expandedId === m.id ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                            </div>
                        </button>
                        {expandedId === m.id && (
                            <div className="p-5 pt-0 border-t border-slate-50">
                                <p className="text-xs text-slate-600 leading-relaxed mt-4">{m.description || 'No description provided.'}</p>
                                {(isOwner || isPM) && m.approval_status === 'pending' && (
                                    <button onClick={() => handleApprove(m.id)} className="mt-4 w-full py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">Approve Room Design</button>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
