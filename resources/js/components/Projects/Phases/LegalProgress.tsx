import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    ShieldCheck, Plus, Clock, Save, FileText, CheckCircle2, 
    Loader2, X, Download, Upload, Pencil, ImageIcon, RefreshCw, Wallet, ExternalLink 
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { Project, ProjectMilestone } from '../../../types/project.types';
import { motion, AnimatePresence } from 'framer-motion';

interface LegalProgressProps {
    project: Project;
    currentUser: any;
    isNotaris: boolean;
    onUpdate?: () => void;
    onGoToPayments?: () => void;
}

export default function LegalProgress({ project, currentUser, isNotaris, onUpdate, onGoToPayments }: LegalProgressProps) {
    const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
    const [loading, setLoading] = useState(true);
    const [submittingId, setSubmittingId] = useState<number | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [termins, setTermins] = useState<any[]>([]);
    
    const { showToast } = useToast();

    const getStatusStyles = (status?: string) => {
        switch (status) {
            case 'approved': return 'bg-emerald-50 text-emerald-600 border border-emerald-100';
            case 'revision': return 'bg-red-50 text-red-600 border border-red-100';
            default: return 'bg-zinc-100 text-zinc-600 border border-zinc-200';
        }
    };

    // Derived permissions
    if (!project) {
        return (
            <div className="py-20 text-center animate-pulse">
                <Clock size={40} className="mx-auto text-zinc-100 mb-4" />
                <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">Hydrating Progress...</p>
            </div>
        );
    }

    const isOwner = currentUser?.id === project.user_id;
    const isPM = currentUser?.role_type === 'project_manager' && project.pm_id === currentUser?.id;
    const canApprove = isOwner || isPM;

    const fetchLegalMilestones = async () => {
        if (!project?.id) return;
        try {
            const res = await axios.get(`/projects/${project.id}/milestones`);
            const data = res.data?.data || [];
            
            // Filter specifically for legal or tagged as legal
            const legalItems = data.filter((m: any) => m.type === 'legal' || m.phase_context === 'legal');
            
            // Check if we have custom contract-signed milestones (non-drafting milestones)
            const hasContractMilestones = legalItems.some((m: any) => m.approval_status !== 'drafting');
            
            // If custom contract milestones exist, filter out drafting placeholders to eliminate redundancy
            const filtered = hasContractMilestones 
                ? legalItems.filter((m: any) => m.approval_status !== 'drafting')
                : legalItems;

            setMilestones(filtered.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)));
        } catch (error) {
            console.error('Failed to fetch legal milestones', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchTermins = async () => {
        try {
            const res = await axios.get(`/projects/${project.id}/payment-termins`);
            setTermins(res.data.data);
        } catch (error) {
            console.error('Failed to fetch termins', error);
        }
    };

    useEffect(() => {
        fetchLegalMilestones();
        fetchTermins();
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
            const formData = new FormData();
            formData.append('title', newTitle);
            formData.append('description', newDesc);
            formData.append('type', 'legal');
            formData.append('phase_context', 'legal');
            formData.append('sort_order', String(milestones.length));
            
            selectedFiles.forEach((file) => {
                formData.append('gallery[]', file);
            });

            await axios.post(`/projects/${project.id}/milestones`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            
            showToast('New progress step added', 'success');
            setIsAdding(false);
            setNewTitle('');
            setNewDesc('');
            setSelectedFiles([]);
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

    const handleLinkTermin = async (milestoneId: number, terminId: number) => {
        const selectedTermin = Array.isArray(termins) ? termins.find(t => t.id === terminId) : null;
        if (!selectedTermin) return;

        const confirmMsg = `Are you sure you want to link "${selectedTermin.label}" to this work phase?\n\n` + 
                          (selectedTermin.status === 'paid' ? "⚠️ Note: This payment is already PAID." : "This will link the payment release to the completion of this phase.");
        
        if (!window.confirm(confirmMsg)) return;

        try {
            await axios.post(`/projects/${project.id}/payment-termins/${terminId}/link-milestone`, {
                milestone_id: milestoneId
            });
            showToast('Payment linked to progress step', 'success');
            fetchTermins();
            fetchLegalMilestones();
        } catch (error) {
            showToast('Failed to link payment', 'error');
        }
    };

    const handleUnlinkTermin = async (terminId: number) => {
        try {
            await axios.post(`/projects/${project.id}/payment-termins/${terminId}/unlink-milestone`);
            showToast('Payment link removed', 'success');
            fetchTermins();
            fetchLegalMilestones();
        } catch (error) {
            showToast('Failed to unlink payment', 'error');
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
            {/* Payment Notice Banner for Owner */}
            {isOwner && !isNotaris && (() => {
                const unpaidLinkedMilestone = milestones.find(m => 
                    m.approval_status === 'approved' && 
                    termins.some(t => t.milestone_id === m.id && t.status !== 'paid')
                );
                
                if (unpaidLinkedMilestone) {
                    const linkedTermin = termins.find(t => t.milestone_id === unpaidLinkedMilestone.id);
                    if (!linkedTermin) return null;
                    
                    return (
                        <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-6 bg-blue-600 text-white rounded-[2rem] shadow-xl shadow-blue-100 flex flex-col md:flex-row items-center justify-between gap-6"
                        >
                            <div className="flex items-center gap-4 text-center md:text-left">
                                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
                                    <Wallet size={24} />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black uppercase tracking-widest">Payment Ready</h4>
                                    <p className="text-[10px] font-bold opacity-80 uppercase tracking-tight mt-1">
                                        Your progress for "{unpaidLinkedMilestone.title}" has been approved. 
                                        Please proceed with the {linkedTermin.label}.
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={onGoToPayments}
                                className="px-8 py-3 bg-white text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 transition-all flex items-center gap-2 shrink-0 shadow-lg"
                            >
                                Go to Payments Tab
                                <ExternalLink size={14} />
                            </button>
                        </motion.div>
                    );
                }
                return null;
            })()}

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
                            {project.legal_handover_submitted_at ? (
                                <div className="flex items-center gap-2 px-6 py-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 animate-in fade-in slide-in-from-right duration-500">
                                    <Clock size={14} className="animate-pulse" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">PENDING PM REVIEW</span>
                                </div>
                            ) : (
                                <button 
                                    onClick={handleSealLegal}
                                    disabled={isCreating}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all shadow-xl shadow-emerald-100"
                                >
                                    {isCreating ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                                    Seal & Finalize Legal Phase
                                </button>
                            )}
                        </>
                    )}
                    {isNotaris && !isLegalCompleted && (
                        <button 
                            onClick={() => setIsAdding(true)}
                            className="flex items-center gap-2 px-6 py-2.5 bg-white border-2 border-zinc-900 text-zinc-900 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-900 hover:text-white transition-all shadow-sm"
                        >
                            <Plus size={14} />
                            Add Progress Step
                        </button>
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
                                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Phase Title (e.g. AJB Process, Tax Filing)</label>
                                    <input 
                                        type="text" 
                                        required
                                        value={newTitle}
                                        onChange={e => setNewTitle(e.target.value)}
                                        placeholder="Enter the name of this legal phase"
                                        className="w-full px-5 py-4 bg-zinc-50 border-2 border-transparent focus:border-zinc-900 focus:bg-white rounded-2xl text-sm font-bold outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Plan Description / Scope</label>
                                    <input 
                                        type="text" 
                                        value={newDesc}
                                        onChange={e => setNewDesc(e.target.value)}
                                        placeholder="What will be done in this phase?"
                                        className="w-full px-5 py-4 bg-zinc-50 border-2 border-transparent focus:border-zinc-900 focus:bg-white rounded-2xl text-sm font-bold outline-none transition-all"
                                    />
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <div className="flex items-center justify-between ml-1">
                                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Initial Documentation (Optional)</label>
                                    <span className="text-[9px] font-bold text-zinc-300 uppercase italic">Can be added later during work</span>
                                </div>
                                <div 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full p-8 border-2 border-dashed border-zinc-200 rounded-[2rem] flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-zinc-300 hover:bg-zinc-50 transition-all group"
                                >
                                    <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-400 group-hover:text-zinc-600 transition-colors">
                                        <Upload size={20} />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xs font-black text-zinc-900">Add Initial Photos or Drafts</p>
                                        <p className="text-[10px] text-zinc-400 font-bold mt-1">PNG, JPG or PDF (Max 10MB each)</p>
                                    </div>
                                    <input 
                                        ref={fileInputRef}
                                        type="file" 
                                        multiple 
                                        accept="image/*,.pdf"
                                        className="hidden" 
                                        onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
                                    />
                                </div>
                                
                                {selectedFiles.length > 0 && (
                                    <div className="flex flex-wrap gap-2 p-2">
                                        {selectedFiles.map((file, i) => (
                                            <div key={i} className="px-3 py-1.5 bg-zinc-100 rounded-lg flex items-center gap-2">
                                                <ImageIcon size={12} className="text-zinc-500" />
                                                <span className="text-[10px] text-zinc-700 font-bold max-w-[150px] truncate">{file.name}</span>
                                                <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedFiles(prev => prev.filter((_, idx) => idx !== i)); }} className="text-red-400 hover:text-red-600"><X size={12} /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end pt-4">
                                <button 
                                    type="submit" 
                                    disabled={isCreating}
                                    className="flex items-center gap-2 px-10 py-4 bg-zinc-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black shadow-xl shadow-zinc-100 disabled:opacity-50 transition-all"
                                >
                                    {isCreating ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
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
                    milestones.map((m, idx) => {
                        const linkedTermin = Array.isArray(termins) ? termins.find(t => t.milestone_id === m.id) : null;
                        
                        // Strict Agreed Scope Validator: Agreed contract milestones contain services in content or are linked to payments.
                        // Manually added ad-hoc progress steps do not contain services.
                        const isAgreedMilestone = !!linkedTermin || (m.content && 'services' in m.content);

                        return (
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
                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                                        <div className="flex items-start gap-4 flex-1">
                                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                                                m.approval_status === 'approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-900 text-white'
                                            }`}>
                                                {m.approval_status === 'approved' ? <ShieldCheck size={28} /> : <FileText size={24} />}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <h4 className="text-lg font-black text-zinc-900">{m.title}</h4>
                                                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] ${getStatusStyles(m.approval_status)}`}>
                                                        {m.approval_status}
                                                    </span>
                                                    {(!m.content?.gallery || m.content.gallery.length === 0) && (
                                                        <span className="px-3 py-1 bg-zinc-50 text-zinc-400 border border-zinc-100 rounded-full text-[9px] font-black uppercase tracking-[0.1em]">
                                                            Planned Phase
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-zinc-500 font-medium">{m.description || 'No description provided.'}</p>
                                                
                                                {m.revision_notes && m.approval_status === 'revision' && (
                                                    <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-2xl">
                                                        <p className="text-[10px] text-red-600 font-bold italic tracking-wide">Note: {m.revision_notes}</p>
                                                    </div>
                                                )}

                                                {/* Linked Payment Termin Indicator */}
                                                {(() => {
                                                    if (!linkedTermin) {
                                                        // Show linking option if not linked and user is the Notary
                                                        const allNotaryTermins = Array.isArray(termins) 
                                                            ? termins.filter(t => t.role_type === 'notaris') 
                                                            : [];
                                                        if (isNotaris && allNotaryTermins.length > 0) {
                                                            return (
                                                                <div className="mt-3">
                                                                    <select 
                                                                        onChange={(e) => handleLinkTermin(m.id, parseInt(e.target.value))}
                                                                        className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none hover:bg-zinc-100 transition-all cursor-pointer text-zinc-500"
                                                                        defaultValue=""
                                                                    >
                                                                        <option value="" disabled>Link to Payment...</option>
                                                                        {allNotaryTermins.map(t => (
                                                                            <option 
                                                                                key={t.id} 
                                                                                value={t.id}
                                                                                disabled={!!t.milestone_id}
                                                                            >
                                                                                {t.label} (Rp {Number(t.amount).toLocaleString('id-ID')}) 
                                                                                {t.status === 'paid' ? ' — PAID' : ''}
                                                                                {t.milestone_id ? ' — (Linked to another phase)' : ''}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    }
                                                    return (
                                                        <div className="mt-3 flex items-center gap-2 group">
                                                            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50/50 border border-blue-100 text-blue-600 rounded-xl max-w-fit">
                                                                <Wallet size={12} className="shrink-0" />
                                                                <span className="text-[10px] font-bold uppercase tracking-widest">
                                                                    Linked to Payment: {linkedTermin.label} (Rp {Number(linkedTermin.amount).toLocaleString('id-ID')})
                                                                </span>
                                                            </div>
                                                            {isNotaris && !isAgreedMilestone && (
                                                                <button 
                                                                    onClick={() => {
                                                                        if (confirm('Are you sure you want to unlink this payment?')) {
                                                                            handleUnlinkTermin(linkedTermin.id);
                                                                        }
                                                                    }}
                                                                    className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                                    title="Remove Link"
                                                                >
                                                                    <X size={12} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })()}

                                                {/* Gallery Display */}
                                                {m.content?.gallery && m.content.gallery.length > 0 && (
                                                    <div className="mt-6 flex flex-wrap gap-4">
                                                        {m.content.gallery.map((img: string, i: number) => {
                                                            const isPdf = img.toLowerCase().endsWith('.pdf');
                                                            return (
                                                                <a 
                                                                    key={i} 
                                                                    href={`/storage/${img}`} 
                                                                    target="_blank" 
                                                                    rel="noreferrer"
                                                                    className="relative group overflow-hidden rounded-2xl border-2 border-zinc-100 hover:border-zinc-300 hover:shadow-xl transition-all"
                                                                >
                                                                    {isPdf ? (
                                                                        <div className="w-32 h-32 bg-zinc-50 flex flex-col items-center justify-center gap-2 text-zinc-400 group-hover:text-zinc-600 group-hover:bg-zinc-100 transition-all">
                                                                            <FileText size={24} />
                                                                            <span className="text-[9px] font-black uppercase tracking-widest">PDF Doc</span>
                                                                        </div>
                                                                    ) : (
                                                                        <img 
                                                                            src={`/storage/${img}`} 
                                                                            alt="Progress" 
                                                                            className="w-32 h-32 object-cover scale-100 group-hover:scale-110 transition-transform duration-500" 
                                                                        />
                                                                    )}
                                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                                                        <Download size={20} className="text-white drop-shadow-md" />
                                                                    </div>
                                                                </a>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 shrink-0">
                                            {/* Notary Action: Upload Additional */}
                                            {isNotaris && m.approval_status !== 'approved' && (
                                                <div className="flex items-center gap-2">
                                                    <div className="relative">
                                                        <input 
                                                            type="file" 
                                                            id={`upload-${m.id}`} 
                                                            className="hidden" 
                                                            multiple
                                                            onChange={(e) => handleFileUpload(e, m.id)}
                                                            disabled={submittingId === m.id}
                                                            accept=".pdf,image/*"
                                                        />
                                                        <motion.label 
                                                            whileHover={{ scale: 1.05 }}
                                                            whileTap={{ scale: 0.95 }}
                                                            htmlFor={`upload-${m.id}`}
                                                            className={`flex items-center gap-2 px-4 py-2.5 bg-zinc-100 text-zinc-600 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-zinc-200 hover:text-zinc-900 transition-colors ${submittingId === m.id ? 'opacity-50' : ''}`}
                                                        >
                                                            {submittingId === m.id ? (
                                                                <div className="w-3 h-3 border-2 border-zinc-400 border-t-zinc-900 rounded-full animate-spin" />
                                                            ) : <Plus size={14} />}
                                                            Add Files
                                                        </motion.label>
                                                    </div>

                                                    {/* Edit Button - Hidden for Agreed milestones */}
                                                    {!isAgreedMilestone && (
                                                        <button 
                                                            onClick={() => handleStartEdit(m)}
                                                            className="p-3 text-zinc-300 hover:text-zinc-900 hover:bg-zinc-50 rounded-xl transition-all"
                                                        >
                                                            <Pencil size={18} />
                                                        </button>
                                                    )}

                                                    {/* Delete Button - Hidden for Agreed milestones */}
                                                    {!isAgreedMilestone && (
                                                        <button 
                                                            onClick={() => handleDeleteMilestone(m.id)}
                                                            className="p-3 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                                        >
                                                            <X size={18} />
                                                        </button>
                                                    )}
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
                        );
                    })
                )}
            </div>
        </div>
    );
}
