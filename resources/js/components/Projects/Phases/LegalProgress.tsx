import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    ShieldCheck, FileText, Upload, CheckCircle2, 
    X, Save, Download, Eye, AlertCircle, Clock, Plus, Loader2, Pencil
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { Project, ProjectMilestone } from '../../../types/project.types';
import { motion, AnimatePresence } from 'framer-motion';

interface LegalProgressProps {
    project: Project;
    currentUser: any;
    isNotaris: boolean;
    onUpdate?: () => void;
}

export default function LegalProgress({ project, currentUser, isNotaris, onUpdate }: LegalProgressProps) {
    const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
    const [loading, setLoading] = useState(true);
    const [submittingId, setSubmittingId] = useState<number | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDesc, setEditDesc] = useState('');
    
    const { showToast } = useToast();

    // Derived permissions
    const isOwner = currentUser?.id === project.user_id;
    const isPM = currentUser?.role_type === 'project_manager' && project.pm_id === currentUser?.id;
    const canApprove = isOwner || isPM;

    const fetchLegalMilestones = async () => {
        if (!project?.id) return;
        try {
            const res = await axios.get(`/projects/${project.id}/milestones`, {
                params: { phase_context: 'legal' }
            });
            const data = res.data?.data || [];
            // Filter and sort by milestones specifically for legal or tagged as legal
            setMilestones(data.filter((m: any) => m.type === 'legal' || m.phase_context === 'legal')
                        .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)));
        } catch (error) {
            console.error('Failed to fetch legal milestones', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLegalMilestones();
    }, [project.id]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, milestoneId: number) => {
        if (!e.target.files?.[0]) return;
        
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append('gallery[]', file);
        formData.append('approval_status', 'pending');
        formData.append('_method', 'PUT');

        setSubmittingId(milestoneId);
        try {
            await axios.post(`/projects/${project.id}/milestones/${milestoneId}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            showToast('Document submitted for review', 'success');
            fetchLegalMilestones();
            if (onUpdate) onUpdate();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to upload document', 'error');
        } finally {
            setSubmittingId(null);
            if (e.target) e.target.value = '';
        }
    };

    const handleCreateMilestone = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle) return;

        setIsCreating(true);
        try {
            await axios.post(`/projects/${project.id}/milestones`, {
                title: newTitle,
                description: newDesc,
                type: 'legal',
                phase_context: 'legal',
                sort_order: milestones.length
            });
            showToast('New progress step added', 'success');
            setIsAdding(false);
            setNewTitle('');
            setNewDesc('');
            fetchLegalMilestones();
            if (onUpdate) onUpdate();
        } catch (error) {
            showToast('Failed to add progress step', 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteMilestone = async (id: number) => {
        if (!window.confirm("Are you sure you want to remove this progress step?")) return;
        try {
            await axios.delete(`/projects/${project.id}/milestones/${id}`);
            showToast('Progress step removed', 'success');
            fetchLegalMilestones();
            if (onUpdate) onUpdate();
        } catch (error) {
            showToast('Failed to delete step', 'error');
        }
    };
    
    const handleStartEdit = (m: ProjectMilestone) => {
        setEditingId(m.id);
        setEditTitle(m.title);
        setEditDesc(m.description || '');
    };

    const handleUpdateMilestone = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingId || !editTitle) return;

        setIsCreating(true);
        try {
            await axios.post(`/projects/${project.id}/milestones/${editingId}`, {
                _method: 'PUT',
                title: editTitle,
                description: editDesc
            });
            showToast('Progress step updated', 'success');
            setEditingId(null);
            fetchLegalMilestones();
            if (onUpdate) onUpdate();
        } catch (error) {
            showToast('Failed to update step', 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const handleStatusUpdate = async (milestoneId: number, status: 'approved' | 'revision') => {
        let notes = '';
        if (status === 'revision') {
            notes = window.prompt('Please specify the revision notes:') || '';
            if (!notes) return;
        }

        setSubmittingId(milestoneId);
        try {
            await axios.post(`/projects/${project.id}/milestones/${milestoneId}`, {
                _method: 'PUT',
                approval_status: status,
                is_completed: status === 'approved',
                revision_notes: notes
            });
            showToast(status === 'approved' ? 'Certificate approved' : 'Revision requested', 'success');
            fetchLegalMilestones();
            if (onUpdate) onUpdate();
        } catch (error: any) {
            showToast('Failed to update status', 'error');
        } finally {
            setSubmittingId(null);
        }
    };

    const handleSealLegal = async () => {
        if (!window.confirm("Are you sure you want to officially seal and finalize the legal phase? This will hand over the deliverables and mark the phase as completed.")) return;

        setIsCreating(true);
        try {
            await axios.post(`/projects/${project.id}/seal-legal`);
            showToast('Legal phase sealed and finalized!', 'success');
            if (onUpdate) onRefreshData(); // Trigger full refresh
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to seal legal phase', 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const onRefreshData = () => {
        fetchLegalMilestones();
        if (onUpdate) onUpdate();
    }

    if (loading) return (
        <div className="py-20 text-center animate-pulse">
            <ShieldCheck className="mx-auto text-zinc-100 mb-4" size={40} />
            <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">Accessing Legal Progress...</p>
        </div>
    );

    const isLegalCompleted = project.completed_phases?.includes('legal') || !!project.legal_completed_at;

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-lg">
                        <ShieldCheck size={20} />
                    </div>
                    <div>
                        <h4 className="text-sm font-black text-zinc-900 uppercase tracking-widest leading-none mb-1">Legal Document Progress</h4>
                        <p className="text-[10px] text-zinc-400 font-bold uppercase">Processing status of hired certificates & permits</p>
                    </div>
                    {isLegalCompleted && (
                        <div className="ml-4 flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 animate-in fade-in slide-in-from-left duration-500">
                            <CheckCircle2 size={12} />
                            <span className="text-[9px] font-black uppercase tracking-widest">Phase Sealed</span>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {isNotaris && !isLegalCompleted && (
                        <>
                            <button 
                                onClick={handleSealLegal}
                                disabled={isCreating}
                                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all shadow-xl shadow-emerald-100"
                            >
                                {isCreating ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                                Seal & Finalize Legal Phase
                            </button>
                        </>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {isAdding && (
                    <motion.div 
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="bg-white border-2 border-zinc-900 rounded-[2rem] p-8 shadow-2xl shadow-zinc-200"
                    >
                        <form onSubmit={handleCreateMilestone} className="space-y-6">
                            <div className="flex justify-between items-center border-b border-zinc-100 pb-4 mb-4">
                                <h5 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">New Legal Task</h5>
                                <button type="button" onClick={() => setIsAdding(false)} className="text-zinc-400 hover:text-red-500 transition-colors">
                                    <X size={20} />
                                </button>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Task Title</label>
                                    <input 
                                        type="text" 
                                        value={newTitle}
                                        onChange={e => setNewTitle(e.target.value)}
                                        placeholder="e.g. Scanning Land Documents"
                                        className="w-full px-5 py-4 bg-zinc-50 border-2 border-transparent focus:border-zinc-900 focus:bg-white rounded-2xl text-sm font-bold outline-none transition-all"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Description (Optional)</label>
                                    <input 
                                        type="text" 
                                        value={newDesc}
                                        onChange={e => setNewDesc(e.target.value)}
                                        placeholder="Specific details about this step"
                                        className="w-full px-5 py-4 bg-zinc-50 border-2 border-transparent focus:border-zinc-900 focus:bg-white rounded-2xl text-sm font-bold outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end pt-4">
                                <button 
                                    type="submit" 
                                    disabled={isCreating}
                                    className="flex items-center gap-2 px-10 py-4 bg-zinc-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black shadow-xl shadow-zinc-100 disabled:opacity-50 transition-all"
                                >
                                    {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    {isCreating ? 'Creating Task...' : 'Create Legal Task'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="grid grid-cols-1 gap-4">
                {milestones.length === 0 ? (
                    <div className="py-24 text-center bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-[2.5rem]">
                        <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mx-auto mb-6 shadow-sm">
                            <FileText className="text-zinc-200" size={40} />
                        </div>
                        <h4 className="text-sm font-black text-zinc-900 uppercase tracking-widest">No Legal Milestones</h4>
                        <p className="text-xs text-zinc-400 font-bold max-w-xs mx-auto mt-2 uppercase tracking-tight leading-relaxed">
                            {isNotaris ? 'Start by adding your first progress step to verify documents.' : 'Legal deliverables will appear here after Notary acceptance.'}
                        </p>
                        
                        {isNotaris && (
                            <button 
                                onClick={() => setIsAdding(true)}
                                className="mt-8 px-8 py-3 bg-white border-2 border-zinc-900 text-zinc-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-900 hover:text-white transition-all shadow-sm"
                            >
                                Add Your First Step
                            </button>
                        )}
                    </div>
                ) : (
                    milestones.map((m, idx) => (
                        <div key={m.id} className={`group relative bg-white border-2 rounded-[2.5rem] p-6 lg:p-8 transition-all hover:shadow-2xl hover:shadow-zinc-100 ${
                            m.approval_status === 'approved' ? 'border-emerald-100 bg-emerald-50/10' : 'border-zinc-100'
                        }`}>
                            {editingId === m.id ? (
                                <form onSubmit={handleUpdateMilestone} className="space-y-4">
                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1">Title</label>
                                            <input 
                                                type="text" 
                                                value={editTitle}
                                                onChange={e => setEditTitle(e.target.value)}
                                                className="w-full px-4 py-3 bg-zinc-50 border-2 border-zinc-200 focus:border-zinc-900 rounded-xl text-sm font-bold outline-none transition-all"
                                                required
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1">Description</label>
                                            <input 
                                                type="text" 
                                                value={editDesc}
                                                onChange={e => setEditDesc(e.target.value)}
                                                className="w-full px-4 py-3 bg-zinc-50 border-2 border-zinc-200 focus:border-zinc-900 rounded-xl text-sm font-bold outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2 pt-2">
                                        <button 
                                            type="button" 
                                            onClick={() => setEditingId(null)}
                                            className="px-6 py-2 bg-zinc-100 text-zinc-500 rounded-xl text-[10px] font-black uppercase tracking-widest"
                                        >
                                            Cancel
                                        </button>
                                        <button 
                                            type="submit" 
                                            disabled={isCreating}
                                            className="px-6 py-2 bg-zinc-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                                        >
                                            {isCreating ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                            Save Changes
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                    <div className="flex items-start gap-4 flex-1">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                                            m.approval_status === 'approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-900 text-white'
                                        }`}>
                                            {m.approval_status === 'approved' ? <ShieldCheck size={28} /> : <FileText size={24} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3">
                                                <h4 className="text-lg font-black text-zinc-900 truncate">{m.title}</h4>
                                                {m.approval_status && (
                                                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter shrink-0 ${
                                                        m.approval_status === 'approved' ? 'bg-emerald-100 text-emerald-600' :
                                                        m.approval_status === 'pending' ? 'bg-amber-100 text-amber-600' :
                                                        m.approval_status === 'revision' ? 'bg-red-100 text-red-600' : 'bg-zinc-100 text-zinc-400'
                                                    }`}>
                                                        {m.approval_status.replace('_', ' ')}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-zinc-500 font-bold mt-1 leading-relaxed">{m.description}</p>
                                            
                                            {m.revision_notes && m.approval_status === 'revision' && (
                                                <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-2xl">
                                                    <p className="text-[10px] text-red-600 font-bold italic tracking-wide">Note: {m.revision_notes}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                        {/* Download/View Output */}
                                        {m.content?.gallery?.[0] && (
                                            <a 
                                                href={`/storage/${m.content.gallery[0]}`} 
                                                target="_blank" 
                                                rel="noreferrer"
                                                className="flex items-center gap-2 px-5 py-3 bg-zinc-100 text-zinc-900 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200 transition-colors"
                                            >
                                                <Download size={14} /> {m.approval_status === 'approved' ? 'View Certificate' : 'Review Draft'}
                                            </a>
                                        )}

                                        {/* Notary Action: Upload */}
                                        {isNotaris && m.approval_status !== 'approved' && (
                                            <div className="flex items-center gap-2">
                                                <div className="relative">
                                                    <input 
                                                        type="file" 
                                                        id={`upload-${m.id}`} 
                                                        className="hidden" 
                                                        onChange={(e) => handleFileUpload(e, m.id)}
                                                        disabled={submittingId === m.id}
                                                        accept=".pdf,image/*"
                                                    />
                                                    <motion.label 
                                                        whileHover={{ scale: 1.05 }}
                                                        whileTap={{ scale: 0.95 }}
                                                        htmlFor={`upload-${m.id}`}
                                                        className={`flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer shadow-lg shadow-zinc-200 ${submittingId === m.id ? 'opacity-50' : ''}`}
                                                    >
                                                        {submittingId === m.id ? (
                                                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                        ) : <Upload size={14} />}
                                                        {m.content?.gallery?.[0] ? 'Replace' : 'Upload proof'}
                                                    </motion.label>
                                                </div>

                                                {/* Edit Button */}
                                                <button 
                                                    onClick={() => handleStartEdit(m)}
                                                    className="p-3 text-zinc-300 hover:text-zinc-900 hover:bg-zinc-50 rounded-xl transition-all"
                                                >
                                                    <Pencil size={18} />
                                                </button>

                                                {/* Delete Button */}
                                                <button 
                                                    onClick={() => handleDeleteMilestone(m.id)}
                                                    className="p-3 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                                >
                                                    <X size={18} />
                                                </button>
                                            </div>
                                        )}

                                        {/* Client/PM Action: Approve/Reject */}
                                        {canApprove && m.approval_status === 'pending' && (
                                            <div className="flex items-center gap-2">
                                                <button 
                                                    onClick={() => handleStatusUpdate(m.id, 'revision')}
                                                    className="px-5 py-3 border-2 border-red-100 text-red-600 rounded-xl text-[10px] font-black uppercase hover:bg-red-50 transition-colors"
                                                >
                                                    Revision
                                                </button>
                                                <button 
                                                    onClick={() => handleStatusUpdate(m.id, 'approved')}
                                                    className="px-6 py-3 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-600 transition-colors shadow-xl shadow-emerald-100"
                                                >
                                                    Verify
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
