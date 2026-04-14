import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    Plus, Check, Image, X, Save, Trash2, 
    Armchair, Palette, Lightbulb, Layers,
    ChevronDown, ChevronUp, MessageSquare
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

const ROOM_TYPES = [
    { value: 'living_room', label: 'Living Room', icon: '🛋️' },
    { value: 'kitchen', label: 'Kitchen', icon: '🍳' },
    { value: 'master_bedroom', label: 'Master Bedroom', icon: '🛏️' },
    { value: 'bedroom', label: 'Bedroom', icon: '🛏️' },
    { value: 'bathroom', label: 'Bathroom', icon: '🚿' },
    { value: 'dining_room', label: 'Dining Room', icon: '🍽️' },
    { value: 'home_office', label: 'Home Office', icon: '💻' },
    { value: 'laundry', label: 'Laundry', icon: '🧺' },
    { value: 'garage', label: 'Garage', icon: '🚗' },
    { value: 'outdoor', label: 'Outdoor / Garden', icon: '🌿' },
    { value: 'generic', label: 'Other', icon: '📦' },
];

interface InteriorProgressProps {
    project: any;
    currentUser: any;
    isInteriorDesigner: boolean;
}

interface Milestone {
    id: number;
    title: string;
    description: string | null;
    type: string;
    is_completed: boolean;
    approval_status?: 'in_progress' | 'pending' | 'approved' | 'revision';
    revision_notes?: string;
    content?: {
        gallery?: string[];
        furniture_list?: { name: string; price: number; link?: string }[];
    };
    sort_order: number;
    created_at: string;
}

export default function InteriorProgress({ project, currentUser, isInteriorDesigner }: InteriorProgressProps) {
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const { showToast } = useToast();

    // Form state
    const [formTitle, setFormTitle] = useState('');
    const [formType, setFormType] = useState('living_room');
    const [formDesc, setFormDesc] = useState('');
    const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
    const [submitting, setSubmitting] = useState(false);

    const isOwner = currentUser?.id === project?.user_id;

    const fetchMilestones = async () => {
        if (!project?.id) return;
        try {
            const res = await axios.get(`/api/projects/${project.id}/milestones`, {
                params: { phase_context: 'interior' }
            });
            const sorted = (res.data?.data || []).sort(
                (a: Milestone, b: Milestone) => a.sort_order - b.sort_order
            );
            setMilestones(sorted);
        } catch (error) {
            console.error('Failed to fetch interior milestones', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchMilestones(); }, [project?.id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('title', formTitle);
            formData.append('type', formType);
            formData.append('description', formDesc);
            formData.append('phase_context', 'interior');
            formData.append('approval_status', 'in_progress');
            galleryFiles.forEach(file => formData.append('gallery[]', file));

            await axios.post(`/api/projects/${project.id}/milestones`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            showToast('Room design milestone added!', 'success');
            setShowForm(false);
            setFormTitle('');
            setFormDesc('');
            setFormType('living_room');
            setGalleryFiles([]);
            fetchMilestones();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to add milestone', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleApprove = async (id: number) => {
        try {
            await axios.post(`/api/projects/${project.id}/milestones/${id}/approve`);
            showToast('Room design approved!', 'success');
            fetchMilestones();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed', 'error');
        }
    };

    const handleRequestRevision = async (id: number) => {
        const notes = prompt('What needs to be revised?');
        if (!notes) return;
        try {
            await axios.post(`/api/projects/${project.id}/milestones/${id}/request-revision`, {
                revision_notes: notes
            });
            showToast('Revision requested', 'info');
            fetchMilestones();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed', 'error');
        }
    };

    const handleSubmitForApproval = async (id: number) => {
        try {
            await axios.put(`/api/projects/${project.id}/milestones/${id}`, {
                approval_status: 'pending',
                is_completed: true
            });
            showToast('Submitted for client approval', 'success');
            fetchMilestones();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed', 'error');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this room design milestone?')) return;
        try {
            await axios.delete(`/api/projects/${project.id}/milestones/${id}`);
            showToast('Milestone deleted', 'info');
            fetchMilestones();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed', 'error');
        }
    };

    const completedCount = milestones.filter(m => m.approval_status === 'approved').length;
    const progressPercent = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-slate-200 border-t-purple-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Progress Bar */}
            <div className="p-6 bg-gradient-to-r from-purple-50 to-violet-50 rounded-2xl border border-purple-100">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Armchair size={18} className="text-purple-500" />
                        <h4 className="text-xs font-black uppercase tracking-widest text-purple-700">Interior Design Progress</h4>
                    </div>
                    <span className="text-lg font-black text-purple-900">{progressPercent}%</span>
                </div>
                <div className="w-full bg-purple-200 rounded-full h-2">
                    <div className="bg-purple-500 h-2 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                </div>
                <p className="text-[10px] font-bold text-purple-400 mt-2">{completedCount} of {milestones.length} rooms approved</p>
            </div>

            {/* Add Room Button (Interior Designer only) */}
            {isInteriorDesigner && (
                <button
                    onClick={() => setShowForm(!showForm)}
                    className={`w-full py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                        showForm 
                            ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' 
                            : 'bg-purple-500 text-white hover:bg-purple-600 shadow-lg shadow-purple-200'
                    }`}
                >
                    {showForm ? <><X size={16} /> Cancel</> : <><Plus size={16} strokeWidth={3} /> Add Room Design</>}
                </button>
            )}

            {/* Add Form */}
            {showForm && (
                <form onSubmit={handleSubmit} className="p-6 bg-white border border-slate-100 rounded-2xl space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] uppercase tracking-widest font-black text-slate-400 mb-1">Room Type</label>
                            <select value={formType} onChange={e => setFormType(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold">
                                {ROOM_TYPES.map(rt => (
                                    <option key={rt.value} value={rt.value}>{rt.icon} {rt.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase tracking-widest font-black text-slate-400 mb-1">Title</label>
                            <input type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)} required placeholder="e.g. Master Bedroom Design v1" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase tracking-widest font-black text-slate-400 mb-1">Description / Notes</label>
                        <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} rows={3} placeholder="Describe the design concept, color palette, furniture selections..." className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold resize-none" />
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase tracking-widest font-black text-slate-400 mb-1">Mood Board / Photos (max 8)</label>
                        <input type="file" multiple accept="image/*" onChange={e => setGalleryFiles(Array.from(e.target.files || []).slice(0, 8))} className="text-xs" />
                    </div>
                    <button type="submit" disabled={submitting} className="w-full py-3 bg-purple-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-purple-600 disabled:opacity-50">
                        {submitting ? 'Saving...' : 'Add Room Milestone'}
                    </button>
                </form>
            )}

            {/* Room Cards */}
            {milestones.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-purple-200 rounded-2xl">
                    <Palette size={40} className="mx-auto text-purple-300 mb-3" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">No room designs yet</p>
                    <p className="text-xs text-slate-400 mt-1">The interior designer will add room-by-room design milestones here.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {milestones.map(m => {
                        const roomType = ROOM_TYPES.find(rt => rt.value === m.type) || ROOM_TYPES[ROOM_TYPES.length - 1];
                        const isExpanded = expandedId === m.id;
                        const statusColor = m.approval_status === 'approved' ? 'emerald' : m.approval_status === 'revision' ? 'amber' : m.approval_status === 'pending' ? 'blue' : 'slate';

                        return (
                            <div key={m.id} className={`bg-white border rounded-2xl shadow-sm overflow-hidden transition-all ${
                                m.approval_status === 'approved' ? 'border-emerald-200' : 
                                m.approval_status === 'revision' ? 'border-amber-200' : 'border-slate-100'
                            }`}>
                                <button 
                                    onClick={() => setExpandedId(isExpanded ? null : m.id)}
                                    className="w-full p-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <span className="text-2xl">{roomType.icon}</span>
                                        <div className="text-left">
                                            <p className="text-sm font-black text-slate-900">{m.title}</p>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{roomType.label}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-${statusColor}-100 text-${statusColor}-700`}>
                                            {m.approval_status === 'approved' ? 'Approved' : 
                                             m.approval_status === 'revision' ? 'Needs Revision' : 
                                             m.approval_status === 'pending' ? 'Awaiting Approval' : 'In Progress'}
                                        </span>
                                        {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                                    </div>
                                </button>

                                {isExpanded && (
                                    <div className="px-5 pb-5 border-t border-slate-50 space-y-4">
                                        {m.description && (
                                            <p className="text-sm text-slate-600 mt-4">{m.description}</p>
                                        )}

                                        {/* Mood Board Gallery */}
                                        {m.content?.gallery && m.content.gallery.length > 0 && (
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Mood Board</p>
                                                <div className="grid grid-cols-4 gap-2">
                                                    {m.content.gallery.map((img, i) => (
                                                        <img key={i} src={`/storage/${img}`} alt="mood" className="w-full h-24 object-cover rounded-xl" />
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Revision Notes */}
                                        {m.approval_status === 'revision' && m.revision_notes && (
                                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">Revision Notes from Client</p>
                                                <p className="text-sm text-amber-800 font-bold">{m.revision_notes}</p>
                                            </div>
                                        )}

                                        {/* Action Buttons */}
                                        <div className="flex gap-2 pt-2">
                                            {/* Interior Designer: Submit for approval */}
                                            {isInteriorDesigner && m.approval_status !== 'approved' && m.approval_status !== 'pending' && (
                                                <button onClick={() => handleSubmitForApproval(m.id)} className="flex-1 py-2 bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600">
                                                    Submit for Approval
                                                </button>
                                            )}
                                            {/* Interior Designer: Delete */}
                                            {isInteriorDesigner && m.approval_status !== 'approved' && (
                                                <button onClick={() => handleDelete(m.id)} className="p-2 text-red-400 hover:text-red-600 transition-colors">
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                            {/* Owner: Approve / Request Revision */}
                                            {isOwner && m.approval_status === 'pending' && (
                                                <>
                                                    <button onClick={() => handleApprove(m.id)} className="flex-1 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 flex items-center justify-center gap-1">
                                                        <Check size={14} /> Approve
                                                    </button>
                                                    <button onClick={() => handleRequestRevision(m.id)} className="flex-1 py-2 bg-amber-100 text-amber-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-200 flex items-center justify-center gap-1">
                                                        <MessageSquare size={14} /> Request Revision
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
