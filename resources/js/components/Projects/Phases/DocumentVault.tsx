import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    FileText, Upload, Trash2, Download, 
    History, CheckCircle2, AlertCircle, X, Plus,
    ShieldAlert
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

interface Document {
    id: number;
    file_name: string;
    file_path: string;
    file_type: string;
    category: string;
    status: string;
    version_label?: string;
    target_role?: string;
    file_url?: string;
    uploader: { name: string };
    created_at: string;
}

interface DocumentVaultProps {
    project: any;
    isPro: boolean;
    targetRole?: string;
    canDownload?: boolean;
}

export default function DocumentVault({ project, isPro, targetRole, canDownload = false }: DocumentVaultProps) {
    const [allDocuments, setAllDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [showUpload, setShowUpload] = useState(false);
    const { showToast } = useToast();

    // Upload Form State
    const [file, setFile] = useState<File | null>(null);
    const [category, setCategory] = useState('blueprint');
    const [versionLabel, setVersionLabel] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const fetchDocs = async () => {
        try {
            const res = await axios.get(`/projects/${project.id}/documents`);
            setAllDocuments(res.data.data);
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const filteredDocs = React.useMemo(() => {
        if (!targetRole) return allDocuments;
        return allDocuments.filter(doc => {
            const docRole = (doc.target_role || '').toLowerCase();
            const filterRole = targetRole.toLowerCase();

            const isMatch = (roleA: string, roleB: string) => {
                if (roleA === roleB) return true;
                const pairs = [
                    ['architect', 'arsitek'],
                    ['contractor', 'kontraktor'],
                    ['notary', 'notaris'],
                    ['pm', 'project_manager']
                ];
                return pairs.some(p => p.includes(roleA) && p.includes(roleB));
            };

            if (isMatch(filterRole, 'architect') && doc.category === 'blueprint') return true;
            return isMatch(filterRole, docRole);
        });
    }, [allDocuments, targetRole]);

    useEffect(() => { fetchDocs(); }, [project.id]);

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) return;

        setSubmitting(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', category);
        formData.append('target_role', targetRole || '');
        if (versionLabel) formData.append('version_label', versionLabel);

        try {
            await axios.post(`/projects/${project.id}/documents`, formData);
            showToast('Document uploaded successfully', 'success');
            setShowUpload(false);
            setFile(null);
            setVersionLabel('');
            fetchDocs();
        } catch (err) {
            showToast('Upload failed', 'error');
        } finally { setSubmitting(false); }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('Delete this document?')) return;
        try {
            await axios.delete(`/projects/${project.id}/documents/${id}`);
            showToast('Document deleted', 'success');
            fetchDocs();
        } catch (err) { showToast('Delete failed', 'error'); }
    };

    if (loading) return <div className="py-10 text-center animate-pulse text-[10px] font-black uppercase text-slate-400">Loading Vault...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                        <History size={18} className="text-slate-500" />
                        Project Deliverables Vault
                    </h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Official drawings, technical specs & verified results</p>
                </div>
                {isPro && !showUpload && (
                    <button 
                        onClick={() => setShowUpload(true)}
                        className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-lg"
                    >
                        <Plus size={14} /> Upload Revision
                    </button>
                )}
            </div>

            {showUpload && (
                <form onSubmit={handleUpload} className="bg-slate-50 border-2 border-slate-100 rounded-[2rem] p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">File</label>
                            <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black outline-none" required />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Version Label (Optional)</label>
                            <input type="text" value={versionLabel} onChange={e => setVersionLabel(e.target.value)} placeholder="e.g. Rev A, Final Draft, v2.0" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-black outline-none focus:border-slate-900" />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" disabled={submitting} className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50">Confirm Upload</button>
                        <button type="button" onClick={() => setShowUpload(false)} className="px-6 py-3 bg-white border border-slate-200 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest">Cancel</button>
                    </div>
                </form>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDocs.length === 0 ? (
                    <div className="col-span-full py-12 text-center bg-slate-50 border-2 border-dashed border-slate-100 rounded-[2rem]">
                        <FileText className="mx-auto text-slate-200 mb-2" size={32} />
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Vault is empty</p>
                    </div>
                ) : (
                    filteredDocs.map(doc => (
                        <div key={doc.id} className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col justify-between hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                                <div className="w-10 h-10 bg-slate-50 text-slate-500 rounded-xl flex items-center justify-center">
                                    <FileText size={20} />
                                </div>
                                {isPro && (
                                    <button onClick={() => handleDelete(doc.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                            
                            <div>
                                <h5 className="text-xs font-black text-slate-900 truncate">{doc.file_name}</h5>
                                 <div className="flex flex-wrap gap-2 mt-2">
                                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                                        doc.category === 'spk' ? 'bg-amber-100 text-amber-700' : 
                                        doc.status === 'under_review' ? 'bg-amber-500 text-white' :
                                        'bg-slate-500 text-white'
                                    }`}>
                                        {doc.category === 'spk' ? 'OFFICIAL CONTRACT' : 
                                         doc.status === 'under_review' ? 'UNDER REVIEW' :
                                         (doc.version_label || 'VERIFIED')}
                                    </span>
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[8px] font-black uppercase tracking-widest">
                                        {doc.file_type.toUpperCase()}
                                    </span>
                                </div>
                                <p className="text-[9px] font-bold text-slate-400 mt-3 uppercase tracking-wider">
                                    Uploaded by {doc.uploader.name} • {new Date(doc.created_at).toLocaleDateString()}
                                </p>
                            </div>

                            {canDownload ? (
                                <a 
                                    href={doc.file_url || `/storage/${doc.file_path}`} 
                                    target="_blank" 
                                    className="mt-4 w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Download size={12} /> Download
                                </a>
                            ) : (
                                <div className="mt-4 w-full py-2.5 bg-slate-50 text-slate-400 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 cursor-not-allowed" title="Access Restricted">
                                    <ShieldAlert size={12} /> Restricted
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
