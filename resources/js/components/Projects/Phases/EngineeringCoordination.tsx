import React, { useState, useRef } from 'react';
import axios from 'axios';
import {
    Upload, Download, CheckCircle2, AlertTriangle,
    FileText, X, ShieldCheck, RotateCcw
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

interface EngineeringCoordinationProps {
    project: any;
    roleType: 'structural' | 'mep';
    isArchitect: boolean;
    onRefresh: () => void;
}

export default function EngineeringCoordination({ project, roleType, isArchitect, onRefresh }: EngineeringCoordinationProps) {
    const { showToast } = useToast();
    const [isUploading, setIsUploading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [revisionNote, setRevisionNote] = useState('');
    const [showRevisionForm, setShowRevisionForm] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const approvedAt = roleType === 'structural' ? project.structural_approved_at : project.mep_approved_at;
    const engineer = roleType === 'structural' ? project.structural_engineer : project.mep_engineer;
    const handoffCategory = 'technical_handoff';
    const deliverableCategory = roleType === 'structural' ? 'structural_calc' : 'mep_layout';

    const handoffDocs = (project.documents || []).filter(
        (d: any) => d.category === handoffCategory && d.target_role === roleType
    );
    const deliverableDocs = (project.documents || []).filter(
        (d: any) => d.category === deliverableCategory
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
            showToast('Base design uploaded for engineer.', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Upload failed.', 'error');
        } finally {
            setIsUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const handleApproveIntegration = async () => {
        if (!window.confirm(`Approve ${roleType.toUpperCase()} integration? This certifies their technical calculations are structurally sound.`)) return;
        setIsProcessing(true);
        try {
            await axios.post(`/projects/${project.id}/approve-engineering`, { role_type: roleType });
            showToast(`${roleType.toUpperCase()} integration approved!`, 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed.', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRequestRevision = async () => {
        if (!revisionNote.trim()) return;
        setIsProcessing(true);
        try {
            await axios.post(`/projects/${project.id}/request-engineering-revision`, {
                role_type: roleType,
                note: revisionNote,
            });
            showToast('Revision requested. Engineer notified.', 'success');
            setRevisionNote('');
            setShowRevisionForm(false);
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed.', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const accentColor = roleType === 'structural' ? 'indigo' : 'amber';

    return (
        <div className="space-y-4">
            {/* Engineer Info */}
            <div className={`flex items-center gap-3 p-3 bg-${accentColor}-50 rounded-2xl border border-${accentColor}-100`}>
                <div className={`w-10 h-10 rounded-full bg-${accentColor}-200 border-2 border-white flex items-center justify-center overflow-hidden`}>
                    <img src={`https://ui-avatars.com/api/?name=${engineer?.user?.name || engineer?.name}&background=${roleType === 'structural' ? '6366f1' : 'f59e0b'}&color=fff`} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-slate-900 truncate">{engineer?.user?.name || engineer?.name}</p>
                    <p className={`text-[10px] text-${accentColor}-600 font-bold uppercase tracking-wider`}>Hired Specialist</p>
                </div>
                {approvedAt ? (
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                        <CheckCircle2 size={12} /> Integrated
                    </span>
                ) : (
                    <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                        <AlertTriangle size={12} /> Pending
                    </span>
                )}
            </div>

            {/* Architect Actions */}
            {isArchitect && (
                <div className="space-y-3">
                    {/* Upload Base Design */}
                    <label className="block w-full cursor-pointer group">
                        <div className={`w-full py-3 border-2 border-dashed border-${accentColor}-200 rounded-2xl flex items-center justify-center gap-2 group-hover:border-${accentColor}-400 group-hover:bg-${accentColor}-50 transition-all text-[10px] font-black text-${accentColor}-500 uppercase tracking-widest`}>
                            <Upload size={14} />
                            {isUploading ? 'Uploading...' : 'Upload Base Design for Engineer'}
                        </div>
                        <input ref={fileRef} type="file" className="hidden" onChange={handleUploadBaseDesign} disabled={isUploading} />
                    </label>

                    {/* Uploaded Base Designs */}
                    {handoffDocs.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Your Uploaded Designs</p>
                            {handoffDocs.map((doc: any) => (
                                <div key={doc.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <FileText size={14} className="text-slate-400 shrink-0" />
                                        <span className="text-xs font-bold text-slate-700 truncate">{doc.file_name}</span>
                                    </div>
                                    <a href={doc.file_path} target="_blank" rel="noreferrer" className="text-[10px] font-black text-indigo-500 uppercase tracking-widest hover:underline shrink-0">View</a>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Engineer Deliverables */}
                    {deliverableDocs.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Engineer's Deliverables</p>
                            {deliverableDocs.map((doc: any) => (
                                <div key={doc.id} className={`flex items-center justify-between p-3 bg-white border rounded-xl ${doc.status === 'revision_requested' ? 'border-red-200' : 'border-emerald-100'}`}>
                                    <div className="flex items-center gap-2 min-w-0">
                                        <FileText size={14} className={doc.status === 'revision_requested' ? 'text-red-400' : 'text-emerald-400'} />
                                        <div className="min-w-0">
                                            <span className="text-xs font-bold text-slate-700 truncate block">{doc.file_name}</span>
                                            {doc.status === 'revision_requested' && (
                                                <span className="text-[9px] text-red-500 font-black uppercase">Revision Requested</span>
                                            )}
                                        </div>
                                    </div>
                                    <a href={doc.file_path} target="_blank" rel="noreferrer" className="text-[10px] font-black text-emerald-500 uppercase tracking-widest hover:underline shrink-0">Download</a>
                                </div>
                            ))}

                            {/* Approve / Request Revision Buttons */}
                            {!approvedAt && (
                                <div className="flex gap-2 pt-2">
                                    <button
                                        onClick={handleApproveIntegration}
                                        disabled={isProcessing}
                                        className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        <ShieldCheck size={14} />
                                        {isProcessing ? 'Approving...' : 'Approve Integration'}
                                    </button>
                                    <button
                                        onClick={() => setShowRevisionForm(!showRevisionForm)}
                                        className="px-4 py-3 bg-white border-2 border-slate-200 text-slate-600 hover:border-red-300 hover:text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                                    >
                                        <RotateCcw size={14} /> Revise
                                    </button>
                                </div>
                            )}

                            {showRevisionForm && (
                                <div className="p-4 bg-red-50 border border-red-100 rounded-2xl space-y-3">
                                    <textarea
                                        value={revisionNote}
                                        onChange={e => setRevisionNote(e.target.value)}
                                        placeholder="Describe what needs to be revised..."
                                        rows={3}
                                        className="w-full px-4 py-3 bg-white border border-red-200 rounded-xl text-sm font-medium focus:border-red-400 outline-none resize-none"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleRequestRevision}
                                            disabled={isProcessing || !revisionNote.trim()}
                                            className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                                        >
                                            {isProcessing ? 'Sending...' : 'Send Revision Request'}
                                        </button>
                                        <button onClick={() => setShowRevisionForm(false)} className="px-4 py-2.5 bg-white border border-red-200 text-red-500 rounded-xl text-[10px] font-black uppercase">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* No deliverables yet */}
                    {deliverableDocs.length === 0 && handoffDocs.length > 0 && (
                        <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-center">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                Waiting for engineer to upload deliverables...
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Non-architect: read-only status */}
            {!isArchitect && approvedAt && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl">
                    <p className="text-[10px] font-bold text-emerald-700">
                        ✓ Integration approved on {new Date(approvedAt).toLocaleDateString()}
                    </p>
                </div>
            )}
        </div>
    );
}
