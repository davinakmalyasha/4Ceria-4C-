import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Project, ProjectDocument } from '../../types/project.types';
import { useAuth } from '../../context/AuthContext';
import { UploadCloud, File, Trash2, Download, ExternalLink, Pencil, Check, X, RefreshCw } from 'lucide-react';
import { useToast } from '../../context/ToastContext';


interface Props {
    project: Project;
}

export default function ProjectVault({ project }: Props) {
    const { user } = useAuth();
    const [documents, setDocuments] = useState<ProjectDocument[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<'general' | 'legal' | 'interior' | 'technical'>('general');
    const [renamingId, setRenamingId] = useState<number | null>(null);
    const [newName, setNewName] = useState('');
    const [isSubmittingRename, setIsSubmittingRename] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        const fetchDocs = async () => {
            try {
                const res = await axios.get(`/projects/${project.id}/documents`);
                setDocuments(res.data.data);
            } catch (err) {
                console.error("Failed to fetch documents");
            }
        };
        fetchDocs();
    }, [project.id]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', selectedCategory);

        try {
            const res = await axios.post(`/projects/${project.id}/documents`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            showToast('Document uploaded successfully', 'success');
            setDocuments([res.data.data, ...documents]);
        } catch (err) {
            console.error('Upload failed', err);
            showToast('Upload failed. Ensure file is pdf, doc, docx, jpg, or png under 10MB.', 'error');
        } finally {
            setIsUploading(false);
            e.target.value = '';
        }
    };

    const handleRename = async (doc: ProjectDocument) => {
        if (!newName.trim() || newName === doc.file_name) {
            setRenamingId(null);
            return;
        }

        setIsSubmittingRename(true);
        try {
            const res = await axios.put(`/projects/${project.id}/documents/${doc.id}`, {
                file_name: newName.trim()
            });
            setDocuments(prev => prev.map(d => d.id === doc.id ? res.data.data : d));
            showToast('Document renamed', 'success');
            setRenamingId(null);
        } catch (err) {
            console.error('Rename failed', err);
            showToast('Failed to rename document', 'error');
        } finally {
            setIsSubmittingRename(false);
        }
    };

    const handleDelete = async (docId: number) => {
        if (!confirm('Delete this document?')) return;
        try {
            await axios.delete(`/projects/${project.id}/documents/${docId}`);
            setDocuments(prev => prev.filter(d => d.id !== docId));
            showToast('Document removed', 'success');
        } catch (err) {
            console.error('Delete failed', err);
            showToast('Failed to delete document', 'error');
        }
    };

    const getCategoryStyles = (category?: string) => {
        switch (category) {
            case 'legal': return 'bg-blue-50 text-blue-700 border-blue-100';
            case 'interior': return 'bg-purple-50 text-purple-700 border-purple-100';
            case 'technical': return 'bg-amber-50 text-amber-700 border-amber-100';
            default: return 'bg-gray-50 text-gray-700 border-gray-100';
        }
    };

    const getStatusStyles = (status?: string) => {
        switch (status) {
            case 'legally_binding': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
            case 'awaiting_signature': return 'bg-red-50 text-red-700 border-red-100 animate-pulse';
            case 'under_review': return 'bg-blue-50 text-blue-700 border-blue-100';
            default: return 'bg-gray-50 text-gray-700 border-gray-100';
        }
    };

    return (
        <div className="space-y-8">
            <div className="bg-zinc-900 rounded-[32px] p-10 text-white relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
                <div className="relative z-10">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                        <div className="text-center md:text-left">
                            <h4 className="text-2xl font-black mb-2">Secure Document Vault</h4>
                            <p className="text-blue-100/60 font-medium max-w-md">Store blueprints, legal contracts, and interior designs securely. Maximum 10MB per file.</p>
                        </div>
                        
                        <div className="flex flex-col items-center gap-4">
                            <div className="flex bg-white/10 p-1 rounded-xl backdrop-blur-md border border-white/10">
                                {(['general', 'legal', 'interior', 'technical'] as const).map(cat => (
                                    <button 
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat)}
                                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${selectedCategory === cat ? 'bg-white text-zinc-900 shadow-lg' : 'text-white/40 hover:text-white/60'}`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>

                            <label className={`group relative inline-flex items-center justify-center gap-3 bg-white text-zinc-900 font-black py-4 px-10 rounded-2xl cursor-pointer hover:bg-blue-50 transition-all shadow-xl active:scale-95 ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                <UploadCloud size={20} className={isUploading ? 'animate-bounce' : ''} />
                                <span className="text-xs uppercase tracking-[0.2em]">{isUploading ? 'Uploading...' : 'Upload To Vault'}</span>
                                <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.png" onChange={handleUpload} disabled={isUploading} />
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {documents.length === 0 ? (
                    <div className="md:col-span-2 py-20 text-center bg-gray-50 rounded-[32px] border-2 border-dashed border-gray-200">
                        <File className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Your vault is currently empty</p>
                    </div>
                ) : (
                    documents.map(doc => {
                        const isOwner = user?.id === doc.uploader?.id || user?.id === project.owner_id;
                        
                        return (
                            <div key={doc.id} className="group relative bg-white border border-gray-100 rounded-[28px] p-6 flex items-start gap-4 hover:shadow-xl hover:shadow-blue-900/5 transition-all">
                                <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100 text-blue-900 group-hover:bg-blue-900 group-hover:text-white transition-colors">
                                    <File className="w-6 h-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        {renamingId === doc.id ? (
                                            <div className="flex items-center gap-2 w-full">
                                                <input 
                                                    autoFocus
                                                    value={newName}
                                                    onChange={e => setNewName(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleRename(doc)}
                                                    className="flex-1 px-3 py-1 bg-slate-50 border border-blue-200 rounded-lg text-sm font-black outline-none focus:ring-2 focus:ring-blue-100"
                                                />
                                                <button 
                                                    disabled={isSubmittingRename}
                                                    onClick={() => handleRename(doc)}
                                                    className="p-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                                                >
                                                    {isSubmittingRename ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                                                </button>
                                                <button 
                                                    onClick={() => setRenamingId(null)}
                                                    className="p-1.5 bg-slate-100 text-slate-400 rounded-lg hover:bg-slate-200 transition-colors"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <h5 className="text-sm font-black text-gray-900 truncate max-w-[150px]">{doc.file_name}</h5>
                                                {isOwner && (
                                                    <button 
                                                        onClick={() => { setRenamingId(doc.id); setNewName(doc.file_name); }}
                                                        className="p-1 text-gray-300 hover:text-blue-600 transition-colors"
                                                    >
                                                        <Pencil size={10} />
                                                    </button>
                                                )}
                                            </>
                                        )}
                                        
                                        <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-tighter border ${getCategoryStyles(doc.category)}`}>
                                            {doc.category || 'general'}
                                        </span>
                                        {doc.status && doc.status !== 'uploaded' && (
                                            <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-tighter border ${getStatusStyles(doc.status)}`}>
                                                {doc.status.replace('_', ' ')}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                                        {doc.file_type} &bull; by {doc.uploader?.name}
                                    </p>
                                    
                                    <div className="flex gap-4 mt-4">
                                        <a href={`/storage/${doc.file_path}`} target="_blank" rel="noopener noreferrer" className="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-blue-900 flex items-center gap-1.5 transition-colors">
                                            <ExternalLink className="w-3.5 h-3.5" /> View
                                        </a>
                                        <a href={`/storage/${doc.file_path}`} download={doc.file_name} className="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-blue-900 flex items-center gap-1.5 transition-colors">
                                            <Download className="w-3.5 h-3.5" /> Download
                                        </a>
                                    </div>
                                </div>

                                {isOwner && !renamingId && (
                                    <button 
                                        onClick={() => handleDelete(doc.id)} 
                                        className="p-2 text-gray-200 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
