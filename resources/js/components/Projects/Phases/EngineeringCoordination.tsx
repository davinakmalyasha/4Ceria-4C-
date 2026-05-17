import React, { useState, useRef } from 'react';
import axios from 'axios';
import {
    Upload, Download, CheckCircle2, AlertTriangle,
    FileText, X, ShieldCheck, RotateCcw, Clock, HardHat, Sparkles, RefreshCw, Plus
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

import TechnicalMilestones from './TechnicalMilestones';
import StickyNotesLayer from './StickyNotesLayer';
import { Project } from '../../../types/project.types';

interface EngineeringCoordinationProps {
    project: Project;
    user: any;
    roleType: 'structural' | 'mep';
    isArchitect: boolean;
    onRefresh: () => void;
}

export default function EngineeringCoordination({ project, user, roleType, isArchitect, onRefresh }: EngineeringCoordinationProps) {
    const { showToast } = useToast();
    const [isUploading, setIsUploading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [openNoteIds, setOpenNoteIds] = useState<{documents: number[], milestones: number[]}>({documents: [], milestones: []});
    const cacheKey = `draft_audit_${project.id}_${roleType}`;
    const approvedAt = roleType === 'structural' ? project.structural_approved_at : project.mep_approved_at;

    const [auditData, setAuditData] = useState<{
        milestones: Record<number, { status: 'approved' | 'revision_requested', note: string }>,
        documents: Record<number, { status: 'approved' | 'revision_requested', note: string }>
    }>(() => {
        try {
            const cached = localStorage.getItem(`draft_audit_${project.id}_${roleType}`);
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (e) {
            console.error('Failed to parse cached audit data', e);
        }
        return { milestones: {}, documents: {} };
    });

    React.useEffect(() => {
        if (approvedAt) {
            localStorage.removeItem(cacheKey);
            return;
        }
        try {
            localStorage.setItem(cacheKey, JSON.stringify(auditData));
        } catch (e) {
            console.error('Failed to save audit data to cache', e);
        }
    }, [auditData, cacheKey, approvedAt]);

    const toggleNote = (type: 'documents' | 'milestones', id: number) => {
        setOpenNoteIds(prev => {
            const current = prev[type];
            if (current.includes(id)) {
                return { ...prev, [type]: current.filter(i => i !== id) };
            } else {
                return { ...prev, [type]: [...current, id] };
            }
        });
    };

    const fileRef = useRef<HTMLInputElement>(null);
    const deliverableFileRef = useRef<HTMLInputElement>(null);
    const [isUploadingDeliverable, setIsUploadingDeliverable] = useState(false);

    const updateItemReview = (type: 'milestones' | 'documents', id: number, status: 'approved' | 'revision_requested', note: string) => {
        setAuditData(prev => ({
            ...prev,
            [type]: {
                ...prev[type],
                [id]: { status, note }
            }
        }));
    };

    const handleAuditSubmit = async () => {
        const milestonesArray = Object.entries(auditData.milestones).map(([id, data]) => ({ id: Number(id), ...data }));
        const documentsArray = Object.entries(auditData.documents).map(([id, data]) => ({ id: Number(id), ...data }));

        if (milestonesArray.length === 0 && documentsArray.length === 0) {
            showToast('Please add at least one sticky note before requesting revision.', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            await axios.post(`/projects/${project.id}/technical-audit-submit`, {
                role_type: roleType,
                milestones: milestonesArray,
                documents: documentsArray
            });
            showToast('Revision notes sent to specialist!', 'success');
            setAuditData({ milestones: {}, documents: {} });
            setOpenNoteIds({documents: [], milestones: []});
            try {
                localStorage.removeItem(cacheKey);
            } catch (e) {}
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to submit revision notes.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };


    const engineer = roleType === 'structural' ? project.structural_engineer : project.mep_engineer;
    const profile = roleType === 'structural' ? project.structural_profile : project.mep_profile;
    const handoffCategory = 'technical_handoff';
    const deliverableCategory = roleType === 'structural' ? 'structural_calc' : 'mep_layout';

    const handoffDocs = (project.documents || []).filter(
        (d: any) => d.category === handoffCategory && d.target_role === roleType
    );
    const deliverableDocs = (project.documents || []).filter(
        (d: any) => d.category === deliverableCategory
    );
    const hasSubmittedDeliverables = deliverableDocs.some(
        (doc: any) => doc.status === 'under_review' || doc.status === 'verified'
    );

    const handleUploadBaseDesign = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', handoffCategory);
        formData.append('target_role', roleType);

        setIsUploading(true);
        try {
            await axios.post(`/projects/${project.id}/documents`, formData);
            showToast('Handoff design uploaded for engineer.', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Upload failed.', 'error');
        } finally {
            setIsUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const handleUploadDeliverable = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', deliverableCategory);

        setIsUploadingDeliverable(true);
        try {
            await axios.post(`/projects/${project.id}/documents`, formData);
            showToast('Technical deliverable uploaded successfully.', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Upload failed.', 'error');
        } finally {
            setIsUploadingDeliverable(false);
            if (deliverableFileRef.current) deliverableFileRef.current.value = '';
        }
    };

    const isSpecialist = user?.role_type === roleType;
    const canUploadDeliverables = isSpecialist || (isArchitect && profile?.type === 'internal_team');
    
    const isOwner = Number(user?.id) === Number(project.user_id);
    const isPM = (user?.role_type === 'project_manager' || user?.role_type === 'pm') && Number(project.pm_id) === Number(user?.id);
    const canReview = isPM || isOwner || isArchitect;

    const hasPendingSubmission = deliverableDocs.some((doc: any) => doc.status === 'under_review');

    const handleApproveDesign = async () => {
        if (!window.confirm(`Are you sure you want to approve this ${roleType === 'structural' ? 'structural' : 'MEP'} design integration?\n\nThis will automatically verify all specialist progress logs and unlock any linked payment terms.`)) return;
        setIsSubmitting(true);
        try {
            const hasNotes = Object.keys(auditData.documents).length > 0 || Object.keys(auditData.milestones).length > 0;

            if (hasNotes) {
                const milestonesArray = Object.entries(auditData.milestones)
                    .filter(([_, data]) => data.note?.trim())
                    .map(([id, data]) => ({
                        id: Number(id),
                        status: 'approved',
                        note: data.note
                    }));

                const documentsArray = Object.entries(auditData.documents)
                    .filter(([_, data]) => data.note?.trim())
                    .map(([id, data]) => ({
                        id: Number(id),
                        status: 'approved',
                        note: data.note
                    }));

                await axios.post(`/projects/${project.id}/technical-audit-submit`, {
                    role_type: roleType,
                    milestones: milestonesArray,
                    documents: documentsArray
                });
            } else {
                await axios.post(`/projects/${project.id}/documents/approve-design`, {
                    role_type: roleType
                });
            }

            showToast(`${roleType === 'structural' ? 'Structural' : 'MEP'} Design Integration approved!`, 'success');
            setAuditData({ milestones: {}, documents: {} });
            setOpenNoteIds({documents: [], milestones: []});
            try {
                localStorage.removeItem(cacheKey);
            } catch (e) {}
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to approve design.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleReviseDesign = async () => {
        // If they have typed sticky notes, submit them!
        const hasNotes = Object.keys(auditData.documents).length > 0 || Object.keys(auditData.milestones).length > 0;
        
        if (hasNotes) {
            await handleAuditSubmit();
            return;
        }

        // Fallback to legacy prompt if no sticky notes were used
        const note = window.prompt(`Enter revision instructions for the ${roleType === 'structural' ? 'Structural' : 'MEP'} Engineer:`);
        if (note === null) return;
        if (!note.trim()) {
            showToast('Revision instructions are required.', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            await axios.post(`/projects/${project.id}/documents/revise-design`, {
                role_type: roleType,
                note
            });
            showToast('Revision requested successfully.', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to request revision.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const accentColor = roleType === 'structural' ? 'indigo' : 'amber';

    return (
        <div className="space-y-4">
            {/* Engineer Info */}
            <div className={`flex items-center gap-3 p-3 bg-${accentColor}-50 rounded-2xl border border-${accentColor}-100`}>
                <div className={`w-10 h-10 rounded-full bg-${accentColor}-200 border-2 border-white flex items-center justify-center overflow-hidden`}>
                    <img src={`https://ui-avatars.com/api/?name=${profile?.name || engineer?.user?.name || engineer?.name || (roleType === 'structural' ? 'Structural' : 'MEP')}&background=${roleType === 'structural' ? '6366f1' : 'f59e0b'}&color=fff`} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-slate-900 truncate">
                        {profile?.name || engineer?.user?.name || engineer?.name || (roleType === 'structural' ? 'Structural Engineer' : 'MEP Engineer')}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                        <p className={`text-[9px] text-${accentColor}-600 font-black uppercase tracking-widest`}>
                            {profile?.type === 'internal_team' ? 'Architect Team' : 'Hired Specialist'}
                        </p>
                        {profile?.payment_status && (
                            <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest ${
                                profile.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-600' : 
                                (profile.payment_status === 'verifying' || profile.payment_status === 'authorized' || profile.payment_status === 'awaiting_payment') ? 'bg-amber-100 text-amber-600' : 
                                'bg-red-100 text-red-600'
                            }`}>
                                {profile.payment_status === 'authorized' ? 'approved' : 
                                 profile.payment_status === 'awaiting_payment' ? 'awaiting payment' : 
                                 profile.payment_status}
                            </span>
                        )}
                    </div>
                </div>
                {(() => {
                    if (approvedAt) return (
                        <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                            <CheckCircle2 size={12} /> Integrated
                        </span>
                    );
                    if (handoffDocs.length === 0) return (
                        <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                            <Clock size={12} /> Awaiting Handoff
                        </span>
                    );
                    if (deliverableDocs.length === 0) return (
                        <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                            <HardHat size={12} /> Calculating
                        </span>
                    );
                    return (
                        <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1 border border-indigo-200">
                            <ShieldCheck size={12} /> Reviewing
                        </span>
                    );
                })()}
            </div>

            {/* Phase 1: Inputs Section */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Project Inputs & Context</p>
                    {isArchitect && (
                        <label className="cursor-pointer group">
                            <span className={`text-[9px] font-black text-${accentColor}-500 uppercase tracking-widest hover:text-${accentColor}-700 transition-colors flex items-center gap-1.5`}>
                                <Upload size={12} />
                                {isUploading ? 'Uploading...' : (handoffDocs.length > 0 ? 'Update Files' : 'Upload Reference Files')}
                            </span>
                            <input ref={fileRef} type="file" className="hidden" onChange={handleUploadBaseDesign} disabled={isUploading} />
                        </label>
                    )}
                </div>

                {handoffDocs.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                        {handoffDocs.map((doc: any) => (
                            <div key={doc.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:border-slate-200 transition-all">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                                        <FileText size={14} />
                                    </div>
                                    <div className="min-w-0">
                                        <span className="text-xs font-bold text-slate-700 truncate block">{doc.file_name}</span>
                                        <span className="text-[8px] text-slate-400 font-bold uppercase">Technical Input</span>
                                    </div>
                                </div>
                                <a href={doc.file_path} target="_blank" rel="noreferrer" className="p-2 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-lg transition-all">
                                    <Download size={14} />
                                </a>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="p-4 bg-slate-50/50 border-2 border-dashed border-slate-100 rounded-2xl text-center">
                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest italic">
                            No technical reference files uploaded yet.
                        </p>
                    </div>
                )}
            </div>

            {/* Phase 2: Deliverables Section */}
            <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Deliverables & Milestones</p>
                    {canUploadDeliverables && (
                        <label className="cursor-pointer group">
                            <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest hover:text-emerald-700 transition-colors flex items-center gap-1.5">
                                <Upload size={12} />
                                {isUploadingDeliverable ? 'Uploading...' : 'Upload Deliverable'}
                            </span>
                            <input ref={deliverableFileRef} type="file" className="hidden" onChange={handleUploadDeliverable} disabled={isUploadingDeliverable} />
                        </label>
                    )}
                </div>
                {deliverableDocs.length > 0 ? (
                    <div className="space-y-3">
                        {deliverableDocs.map((doc: any) => (
                            <div key={doc.id} className="flex gap-4 items-start relative w-full">
                                <div className={`flex-1 p-4 bg-white border-2 rounded-2xl transition-all relative ${
                                    openNoteIds.documents.includes(doc.id) || auditData.documents[doc.id]?.note ? 'border-yellow-300' : 
                                    doc.status === 'revision_requested' ? 'border-rose-100 bg-rose-50/30' : 'border-slate-50 hover:border-slate-200'
                                }`}>
                                    {/* Sticky Note Tab (Right Edge of card, only visible when note is closed) */}
                                    {canReview && doc.status !== 'approved' && doc.status !== 'verified' && !openNoteIds.documents.includes(doc.id) && !auditData.documents[doc.id]?.note && (
                                        <div className="absolute -right-3 top-6 z-10">
                                            <button 
                                                onClick={() => toggleNote('documents', doc.id)}
                                                className="w-10 h-10 bg-yellow-300 hover:bg-yellow-400 border border-yellow-400 rounded-l-lg rounded-r-md flex items-center justify-center shadow-lg transition-all group"
                                                title="Add Sticky Note"
                                            >
                                                <FileText size={16} className="text-yellow-700" />
                                                <Plus size={10} className="absolute bottom-1 right-1 text-yellow-800 font-black" />
                                            </button>
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between gap-3 pr-8">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                                doc.status === 'revision_requested' ? 'bg-rose-100 text-rose-500' : 'bg-emerald-100 text-emerald-500'
                                            }`}>
                                                <FileText size={16} />
                                            </div>
                                            <div className="min-w-0">
                                                <span className="text-xs font-black text-slate-900 truncate block">{doc.file_name}</span>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
                                                        doc.status === 'approved' ? 'bg-emerald-100 text-emerald-600' :
                                                        doc.status === 'revision_requested' ? 'bg-rose-100 text-rose-600' :
                                                        'bg-slate-100 text-slate-600'
                                                    }`}>
                                                        {doc.status || 'Pending Review'}
                                                    </span>
                                                    {doc.reviewed_at && (
                                                        <span className="text-[8px] text-slate-400 font-bold">{new Date(doc.reviewed_at).toLocaleDateString()}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <a href={doc.file_path} target="_blank" rel="noreferrer" className="p-2 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-lg transition-all">
                                            <Download size={14} />
                                        </a>
                                    </div>

                                    {/* Legacy Note Display */}
                                    {doc.review_note && !openNoteIds.documents.includes(doc.id) && !auditData.documents[doc.id]?.note && (
                                        <div className="mt-3 p-2 bg-slate-50 rounded-lg border border-slate-100 pr-8">
                                            <p className="text-[9px] text-slate-500 font-medium italic">"{doc.review_note}"</p>
                                        </div>
                                    )}
                                </div>

                                {/* Sticky Note Beside the Card */}
                                {canReview && doc.status !== 'approved' && doc.status !== 'verified' && (openNoteIds.documents.includes(doc.id) || auditData.documents[doc.id]?.note) && (
                                    <div className="w-80 bg-yellow-100 border-2 border-yellow-300 rounded-3xl p-4 shadow-lg shrink-0 relative animate-in slide-in-from-right-4 duration-200 flex flex-col gap-3">
                                        <div className="flex items-center justify-between border-b border-yellow-200 pb-2">
                                            <span className="text-[10px] font-black text-yellow-800 uppercase tracking-widest flex items-center gap-1.5">
                                                <FileText size={12} /> Sticky Note
                                            </span>
                                            <button 
                                                onClick={() => {
                                                    if (openNoteIds.documents.includes(doc.id)) {
                                                        toggleNote('documents', doc.id);
                                                    } else {
                                                        if (window.confirm('Are you sure you want to delete this sticky note?')) {
                                                            updateItemReview('documents', doc.id, 'revision_requested', '');
                                                            showToast('Sticky note deleted!', 'info');
                                                        }
                                                    }
                                                }}
                                                className="text-yellow-700 hover:text-red-500 transition-colors"
                                                title={openNoteIds.documents.includes(doc.id) ? "Close Note" : "Delete Note"}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                        <textarea 
                                            placeholder="Type your revision instructions..."
                                            value={auditData.documents[doc.id]?.note || ''}
                                            onChange={(e) => updateItemReview('documents', doc.id, 'revision_requested', e.target.value)}
                                            readOnly={!openNoteIds.documents.includes(doc.id)}
                                            className={`w-full h-24 p-2 bg-yellow-50/50 rounded-xl border border-yellow-200 text-yellow-900 placeholder-yellow-600/50 outline-none resize-none font-medium text-xs leading-relaxed transition-all ${
                                                !openNoteIds.documents.includes(doc.id) ? 'cursor-not-allowed select-none bg-yellow-50/10 border-dashed' : 'focus:bg-white'
                                            }`}
                                        />
                                        <div className="flex items-center justify-end gap-2">
                                            {!openNoteIds.documents.includes(doc.id) ? (
                                                <>
                                                    <button 
                                                        onClick={() => {
                                                            toggleNote('documents', doc.id);
                                                        }}
                                                        className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-yellow-950 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button 
                                                        onClick={() => {
                                                            if (window.confirm('Are you sure you want to delete this sticky note?')) {
                                                                updateItemReview('documents', doc.id, 'revision_requested', '');
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
                                                        onClick={() => {
                                                            if (openNoteIds.documents.includes(doc.id)) {
                                                                toggleNote('documents', doc.id);
                                                            }
                                                        }}
                                                        className="px-3 py-1.5 bg-yellow-200 hover:bg-yellow-300 text-yellow-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                                    >
                                                        Close
                                                    </button>
                                                    <button 
                                                        onClick={() => {
                                                            if (!auditData.documents[doc.id]?.note?.trim()) {
                                                                showToast('Please enter some text or close the note', 'error');
                                                                return;
                                                            }
                                                            if (openNoteIds.documents.includes(doc.id)) {
                                                                toggleNote('documents', doc.id);
                                                            }
                                                            showToast('Sticky note pinned to deliverable!', 'success');
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
                ) : (
                    <div className="p-6 bg-slate-50 border-2 border-dashed border-slate-100 rounded-[2rem] text-center flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-slate-200 shadow-sm">
                            <Clock size={24} />
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            {handoffDocs.length > 0 ? "Waiting for engineer to upload deliverables..." : "Waiting for Architect to handoff base designs..."}
                        </p>
                        {canUploadDeliverables && handoffDocs.length > 0 && (
                            <label className="cursor-pointer group mt-2">
                                <div className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all">
                                    {isUploadingDeliverable ? 'Uploading...' : 'Submit First Deliverable'}
                                </div>
                                <input ref={deliverableFileRef} type="file" className="hidden" onChange={handleUploadDeliverable} disabled={isUploadingDeliverable} />
                            </label>
                        )}
                    </div>
                )}
            </div>

            {/* Approved Design Integration Badge */}
            {approvedAt && (
                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-3xl flex items-center gap-3 animate-in fade-in duration-300 shadow-sm">
                    <div className="w-8 h-8 rounded-xl bg-white border border-emerald-100 text-emerald-600 flex items-center justify-center shadow-sm">
                        <CheckCircle2 size={16} />
                    </div>
                    <div>
                        <h5 className="text-xs font-black text-emerald-950 uppercase tracking-tight">Design Integration Approved</h5>
                        <p className="text-[9px] text-emerald-600 font-bold uppercase mt-0.5 tracking-wider">
                            All engineering deliverables are approved and technical progress logs have been finalized.
                        </p>
                    </div>
                </div>
            )}

            {/* Specialist Audit Logs (Milestones) */}
            <div className="pt-4 border-t border-slate-100">
                <TechnicalMilestones 
                    project={project}
                    currentUser={user}
                    roleType={roleType}
                    isSpecialist={user?.role_type === roleType || (isArchitect && profile?.type === 'internal_team')}
                    isPM={user?.role_type === 'project_manager' || user?.id === project.user_id}
                    auditData={auditData.milestones}
                    onReviewChange={(id, status, note) => updateItemReview('milestones', id, status, note)}
                    hasSubmittedDeliverables={hasSubmittedDeliverables}
                    isApproved={!!approvedAt}
                />
            </div>

            {/* Design Deliverables Integration Approval for PM/Owner/Architect */}
            {canReview && (!approvedAt || hasPendingSubmission) && deliverableDocs.length > 0 && (
                <div className="pt-6 border-t border-slate-100 animate-in fade-in duration-300">
                    {hasPendingSubmission ? (
                        <div className={`border border-${accentColor}-100 rounded-3xl p-6 bg-${accentColor}-50/50 flex flex-col md:flex-row gap-4 items-center justify-between shadow-sm`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-${accentColor}-600 shadow-sm border border-${accentColor}-100`}>
                                    <ShieldCheck size={20} />
                                </div>
                                <div>
                                    <h5 className="text-xs font-black text-slate-950 uppercase tracking-tight">
                                        {approvedAt ? "Revision / Addon Review Pending" : "Design Review Pending"}
                                    </h5>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5 tracking-wider">
                                        A specialized {roleType} designer submitted calculations/layouts for integration
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 w-full md:w-auto">
                                <button
                                    onClick={handleReviseDesign}
                                    disabled={isSubmitting}
                                    className="flex-1 md:flex-initial px-5 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm disabled:opacity-50"
                                >
                                    Request Revision
                                </button>
                                <button
                                    onClick={handleApproveDesign}
                                    disabled={isSubmitting}
                                    className={`flex-1 md:flex-initial px-5 py-3 bg-slate-900 hover:bg-black text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-lg disabled:opacity-50`}
                                >
                                    {approvedAt ? "Approve Revision" : "Approve Integration"}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="border border-slate-200 rounded-3xl p-6 bg-slate-50 flex items-center gap-3">
                            <Clock className="text-slate-400 shrink-0 animate-pulse" size={24} />
                            <div>
                                <h5 className="text-xs font-black text-slate-800 uppercase tracking-tight">Awaiting Submissions</h5>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-0.5">
                                    The specialist has uploaded drafts but has not officially finalized and submitted their design for integration yet.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

        </div>
    );
}
