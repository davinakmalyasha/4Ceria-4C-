import React from 'react';
import { Upload, FileText, Edit2, Trash2, Send, Clock, RefreshCw } from 'lucide-react';

interface DeliverablesUploadCardProps {
    title: string;
    subtitle: string;
    deliverables: any[];
    isUploading: boolean;
    isApproved: boolean;
    hasHandoffDocs: boolean;
    isSpecialist?: boolean;
    isSubmitting?: boolean;
    readOnly?: boolean;
    onSubmitDesign?: () => Promise<void>;
    onUpload: (e: React.ChangeEvent<HTMLInputElement>, parentId?: number) => void;
    onDelete: (id: number) => void;
    onUpdate: (id: number, name: string, note: string) => Promise<void>;
}

export default function DeliverablesUploadCard({
    title,
    subtitle,
    deliverables,
    isUploading,
    isApproved,
    hasHandoffDocs,
    isSpecialist,
    isSubmitting = false,
    readOnly = false,
    onSubmitDesign,
    onUpload,
    onDelete,
    onUpdate
}: DeliverablesUploadCardProps) {
    const fileRef = React.useRef<HTMLInputElement>(null);
    const revisionFileRef = React.useRef<HTMLInputElement>(null);
    
    const [editingDocId, setEditingDocId] = React.useState<number | null>(null);
    const [editFileName, setEditFileName] = React.useState('');
    const [editVersionLabel, setEditVersionLabel] = React.useState('');
    const [isSaving, setIsSaving] = React.useState(false);
    
    const [activeParentId, setActiveParentId] = React.useState<number | null>(null);
    const [expandedHistory, setExpandedHistory] = React.useState<number[]>([]);

    const toggleHistory = (parentId: number) => {
        setExpandedHistory(prev => 
            prev.includes(parentId) ? prev.filter(id => id !== parentId) : [...prev, parentId]
        );
    };

    const startEditing = (doc: any) => {
        setEditingDocId(doc.id);
        setEditFileName(doc.file_name);
        setEditVersionLabel(doc.version_label || '');
    };

    const handleSave = async (id: number) => {
        if (!editFileName.trim()) return;
        setIsSaving(true);
        try {
            await onUpdate(id, editFileName, editVersionLabel);
            setEditingDocId(null);
        } finally {
            setIsSaving(false);
        }
    };

    const hasSubmittableFiles = deliverables.some(doc => doc.status === 'uploaded' || doc.status === 'revision_requested');
    const hasUnderReviewFiles = deliverables.some(doc => doc.status === 'under_review');
    
    // Main upload button is only locked if a review is currently pending.
    // We do not force-lock on missing handoff docs to prevent blocking real-life specialist workflows.
    const isLockedState = hasUnderReviewFiles;

    // Group deliverables by parent to implement Version Control
    const parentDocs = deliverables.filter(d => !d.parent_id);

    return (
        <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-slate-50 text-slate-900 rounded-2xl flex items-center justify-center border border-slate-100">
                    <Upload size={18} />
                </div>
                <div>
                    <h4 className="text-sm font-black text-slate-950 uppercase tracking-tight">{title}</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{subtitle}</p>
                </div>
            </div>

            {!readOnly && hasUnderReviewFiles && (
                <div className="w-full p-6 border-2 border-dashed border-indigo-200 bg-indigo-50/40 rounded-2xl flex flex-col items-center justify-center gap-2 mb-4 animate-in fade-in duration-300">
                    <div className="w-10 h-10 rounded-xl bg-white border border-indigo-100 text-indigo-600 flex items-center justify-center shadow-sm">
                        <Send size={16} className="animate-pulse" />
                    </div>
                    <div className="text-center">
                        <p className="text-xs font-black text-indigo-950 uppercase tracking-tight">Design Under Integration Review</p>
                        <p className="text-[9px] text-indigo-500 font-bold mt-0.5 uppercase tracking-widest">
                            ✓ Deliverables submitted.
                        </p>
                        <p className="text-[8px] text-slate-400 font-medium mt-1">
                            Uploading and modifications are locked until the review is complete.
                        </p>
                    </div>
                </div>
            )}

            {!readOnly && !hasUnderReviewFiles && (
                <label className={`w-full p-8 border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100/50 rounded-2xl transition-all flex flex-col items-center justify-center gap-3 ${isLockedState ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer group'}`}>
                    <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-slate-400 group-hover:text-slate-950 group-hover:scale-110 shadow-sm border border-slate-100 transition-all">
                        <Upload size={18} />
                    </div>
                    <div className="text-center">
                        <p className="text-xs font-black text-slate-700">{isUploading ? 'Uploading...' : 'Upload New Deliverable (Addon)'}</p>
                        <p className="text-[9px] text-slate-400 mt-1 uppercase tracking-widest">DWG, PDF, or Excel</p>
                    </div>
                    <input 
                        ref={fileRef} 
                        type="file" 
                        className="hidden" 
                        onChange={(e) => onUpload(e)} 
                        disabled={isUploading || isLockedState} 
                    />
                </label>
            )}

            {/* Hidden Input for uploading revisions */}
            <input 
                ref={revisionFileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                    if (activeParentId) {
                        onUpload(e, activeParentId);
                    }
                }}
            />

            {parentDocs.length > 0 && (
                <div className="space-y-4 mt-6">
                    {parentDocs.map((parent: any) => {
                        const revisions = deliverables.filter(d => d.parent_id === parent.id).sort((a, b) => b.version - a.version);
                        const latestDoc = revisions.length > 0 ? revisions[0] : parent;
                        const allVersions = [parent, ...revisions].sort((a, b) => b.version - a.version);

                        const isEditing = editingDocId === latestDoc.id;
                        const isLocked = latestDoc.status === 'under_review' || latestDoc.status === 'verified' || latestDoc.status === 'approved';

                        if (isEditing) {
                            return (
                                <div key={parent.id} className="flex flex-col gap-3.5 p-4 bg-slate-50 border border-slate-200 rounded-2xl animate-in fade-in duration-200">
                                    <div className="space-y-2.5">
                                        <div>
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">File Name</label>
                                            <input 
                                                type="text" 
                                                value={editFileName} 
                                                onChange={(e) => setEditFileName(e.target.value)}
                                                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-slate-900 transition-colors"
                                                placeholder="File Name"
                                                disabled={isSaving}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Description / Note for PM</label>
                                            <input 
                                                type="text" 
                                                value={editVersionLabel} 
                                                onChange={(e) => setEditVersionLabel(e.target.value)}
                                                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-slate-900 transition-colors"
                                                placeholder="e.g. Detailed notes for review"
                                                disabled={isSaving}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <button 
                                            onClick={() => setEditingDocId(null)}
                                            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-200 transition-colors"
                                            disabled={isSaving}
                                        >
                                            Cancel
                                        </button>
                                        <button 
                                            onClick={() => handleSave(latestDoc.id)}
                                            className="px-3 py-1.5 bg-slate-950 hover:bg-black text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm"
                                            disabled={isSaving || !editFileName.trim()}
                                        >
                                            {isSaving ? 'Saving...' : 'Save'}
                                        </button>
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div key={parent.id} className="flex flex-col p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:border-slate-200 transition-all">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-start gap-3 min-w-0">
                                        <FileText size={18} className={`mt-0.5 shrink-0 ${
                                            latestDoc.status === 'verified' || latestDoc.status === 'approved' ? 'text-emerald-500' :
                                            latestDoc.status === 'revision_requested' ? 'text-rose-500' :
                                            latestDoc.status === 'under_review' ? 'text-indigo-500' : 'text-slate-400'
                                        }`} />
                                        <div className="flex flex-col min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-bold text-slate-700 truncate" title={latestDoc.file_name}>{latestDoc.file_name}</span>
                                                <span className="font-mono text-[8px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-black shrink-0">v{latestDoc.version}</span>
                                            </div>
                                            {latestDoc.version_label ? (
                                                <span className="text-[10px] text-slate-400 font-bold mt-0.5 truncate max-w-[200px]" title={latestDoc.version_label}>
                                                    {latestDoc.version_label}
                                                </span>
                                            ) : (
                                                <span className="text-[9px] text-slate-300 font-bold uppercase tracking-wider mt-0.5">No description</span>
                                            )}
                                            {latestDoc.review_note && (
                                                <div className="mt-1 text-[9px] text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-100/50">
                                                    Revision Note: {latestDoc.review_note}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                        {latestDoc.status === 'revision_requested' ? (
                                            <span className="px-2 py-0.5 bg-rose-100 text-rose-600 rounded-md text-[8px] font-black uppercase shrink-0">Revision</span>
                                        ) : latestDoc.status === 'verified' || latestDoc.status === 'approved' ? (
                                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-md text-[8px] font-black uppercase shrink-0">Integrated</span>
                                        ) : latestDoc.status === 'under_review' ? (
                                            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md text-[8px] font-black uppercase shrink-0">Reviewing</span>
                                        ) : (
                                            <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded-md text-[8px] font-black uppercase shrink-0">Draft</span>
                                        )}

                                        {/* Action buttons */}
                                        {!readOnly && (
                                            <>
                                                {/* Upload Revision Button: active only for verified/approved files */}
                                                {(latestDoc.status === 'verified' || latestDoc.status === 'approved' || isApproved) && isSpecialist && !hasUnderReviewFiles && (
                                                    <button 
                                                        onClick={() => {
                                                            setActiveParentId(parent.id);
                                                            setTimeout(() => revisionFileRef.current?.click(), 50);
                                                        }}
                                                        className="p-1.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-all border border-indigo-100 hover:scale-105 active:scale-95 shadow-sm"
                                                        title="Upload New Version / Revision"
                                                    >
                                                        <RefreshCw size={12} className="animate-hover-spin" />
                                                    </button>
                                                )}

                                                {!isLocked && (
                                                    <>
                                                        <button 
                                                            onClick={() => startEditing(latestDoc)}
                                                            className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-white rounded-lg transition-all border border-transparent hover:border-slate-100 shadow-sm hover:shadow"
                                                            title="Edit Details"
                                                        >
                                                            <Edit2 size={12} />
                                                        </button>
                                                        <button 
                                                            onClick={() => onDelete(latestDoc.id)}
                                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                            title="Delete Deliverable"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Version History Expander */}
                                {allVersions.length > 1 && (
                                    <div className="mt-2 pt-2 border-t border-slate-100/50">
                                        <button 
                                            onClick={() => toggleHistory(parent.id)}
                                            className="flex items-center gap-1.5 text-[8px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors focus:outline-none"
                                        >
                                            <Clock size={10} />
                                            {expandedHistory.includes(parent.id) ? 'Hide Version History' : `Show Version History (${allVersions.length - 1} archived)`}
                                        </button>

                                        {expandedHistory.includes(parent.id) && (
                                            <div className="mt-2.5 ml-4 pl-3 border-l-2 border-slate-100 space-y-2 animate-in slide-in-from-top-2 duration-200">
                                                {allVersions.slice(1).map((vDoc: any) => (
                                                    <div key={vDoc.id} className="flex items-center justify-between py-1 text-[9px] text-slate-500">
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                            <span className="font-mono text-[8px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-bold shrink-0">v{vDoc.version}</span>
                                                            <span className="truncate max-w-[150px] font-medium" title={vDoc.file_name}>{vDoc.file_name}</span>
                                                            {vDoc.version_label && (
                                                                <span className="text-slate-400 italic truncate max-w-[100px]">({vDoc.version_label})</span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0 ml-2">
                                                            <span className="text-[7px] font-black uppercase tracking-wider text-slate-400 bg-slate-100 px-1 py-0.5 rounded">Archived</span>
                                                            <span className="text-[8px] text-slate-300 font-bold">{new Date(vDoc.created_at).toLocaleDateString()}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {isSpecialist && hasSubmittableFiles && !hasUnderReviewFiles && onSubmitDesign && (
                <button
                    onClick={onSubmitDesign}
                    disabled={isSubmitting}
                    className="w-full mt-5 py-3.5 bg-slate-900 hover:bg-black text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                >
                    <Send size={14} />
                    {isSubmitting ? 'Submitting Deliverables...' : 'Finalize & Submit Deliverables'}
                </button>
            )}
        </div>
    );
}
