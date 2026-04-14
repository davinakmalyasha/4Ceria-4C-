import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    Box, Upload, File as FileIcon, Trash2, Download, 
    Layers, Image as ImageIcon, Ruler, Code, FileArchive,
    Plus, FolderOpen, ShieldCheck, ChevronRight
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { ProjectDocument } from '../../../types/project.types';
import { motion, AnimatePresence } from 'framer-motion';

interface ProjectDeliverablesProps {
    project: any;
    currentUser: any;
    isPro: boolean;
}

const CATEGORIES = [
    { id: 'blueprint', label: 'Master Blueprints', icon: Ruler, color: 'text-blue-600', bg: 'bg-blue-50', desc: 'Architectural & structural plans' },
    { id: 'render', label: '3D Visualizations', icon: ImageIcon, color: 'text-purple-600', bg: 'bg-purple-50', desc: 'Final renders & design previews' },
    { id: 'technical', label: 'Technical Specs', icon: Layers, color: 'text-teal-600', bg: 'bg-teal-50', desc: 'MEP & finishing specifications' },
    { id: 'src', label: 'Source (CAD)', icon: Code, color: 'text-orange-600', bg: 'bg-orange-50', desc: 'Editable DWG & source files' },
    { id: 'others', label: 'Progress & Misc', icon: FileArchive, color: 'text-slate-600', bg: 'bg-slate-50', desc: 'Field notes & other documents' },
];

export default function ProjectDeliverables({ project, currentUser, isPro }: ProjectDeliverablesProps) {
    const [documents, setDocuments] = useState<ProjectDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string>('blueprint');
    const { showToast } = useToast();

    const fetchDocuments = async () => {
        if (!project?.id) return;
        try {
            const res = await axios.get(`/projects/${project.id}/documents`);
            setDocuments(res.data?.data || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDocuments();
    }, [project.id]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, categoryId: string) => {
        if (!e.target.files || e.target.files.length === 0) return;
        
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', categoryId);

        setUploading(true);
        try {
            await axios.post(`/projects/${project.id}/documents`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            showToast('Document securely uploaded to vault', 'success');
            fetchDocuments();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to upload document', 'error');
        } finally {
            setUploading(false);
            if (e.target) e.target.value = ''; // reset input
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm("Are you sure you want to delete this deliverable?")) return;
        try {
            await axios.delete(`/projects/${project.id}/documents/${id}`);
            showToast('Document removed from vault', 'success');
            fetchDocuments();
        } catch (error) {
            showToast('Failed to delete document', 'error');
        }
    };

    const getFilesByCategory = (catId: string) => {
        return documents.filter(doc => (doc.category || 'others') === catId);
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-zinc-100 border-t-zinc-900"></div>
            <p className="text-zinc-400 font-bold uppercase tracking-widest text-xs">Accessing Project Vault...</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                <div className="max-w-xl">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-xl shadow-zinc-200">
                            <ShieldCheck size={20} />
                        </div>
                        <h3 className="text-2xl font-black text-zinc-900">Design Vault</h3>
                    </div>
                    <p className="text-zinc-500 text-sm font-medium leading-relaxed">
                        The secure central repository for all professional architectural deliverables. 
                        Files stored here represent the final technical output of the project.
                    </p>
                </div>

                <div className="flex items-center gap-2 p-1 bg-zinc-100 rounded-2xl border border-zinc-200">
                    <button className="px-4 py-2 bg-white text-zinc-900 rounded-xl text-xs font-black shadow-sm flex items-center gap-2">
                        <FolderOpen size={14} /> Repository
                    </button>
                    <button className="px-4 py-2 text-zinc-500 rounded-xl text-xs font-bold hover:bg-zinc-200 transition-colors">
                        Activity Stream
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Category Sidebar */}
                <div className="lg:col-span-4 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-4 ml-2">Deliverable Categories</p>
                    {CATEGORIES.map((cat) => {
                        const count = getFilesByCategory(cat.id).length;
                        return (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`w-full group flex items-center justify-between p-4 rounded-3xl transition-all border-2 ${
                                    selectedCategory === cat.id 
                                    ? 'bg-white border-zinc-900 shadow-xl shadow-zinc-100 scale-[1.02]' 
                                    : 'bg-transparent border-transparent hover:bg-white hover:border-zinc-100'
                                }`}
                            >
                                <div className="flex items-center gap-4 text-left">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${cat.bg} ${cat.color} transition-transform group-hover:scale-110`}>
                                        <cat.icon size={22} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-zinc-900">{cat.label}</p>
                                        <p className="text-[10px] text-zinc-400 font-bold uppercase truncate max-w-[120px]">{cat.desc}</p>
                                    </div>
                                </div>
                                <div className={`flex items-center gap-2 ${selectedCategory === cat.id ? 'opacity-100' : 'opacity-0'} transition-opacity`}>
                                    <span className="w-6 h-6 rounded-full bg-zinc-900 text-white text-[10px] flex items-center justify-center font-bold">
                                        {count}
                                    </span>
                                    <ChevronRight size={16} className="text-zinc-900" />
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Content Area */}
                <div className="lg:col-span-8 bg-zinc-50/50 rounded-[2.5rem] p-4 lg:p-8 border border-zinc-200 min-h-[500px]">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={selectedCategory}
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="space-y-6"
                        >
                            <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-6 rounded-[2rem] border border-zinc-200/60 shadow-sm gap-4">
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-[1.2rem] flex items-center justify-center ${CATEGORIES.find(c => c.id === selectedCategory)?.bg} ${CATEGORIES.find(c => c.id === selectedCategory)?.color}`}>
                                        {React.createElement(CATEGORIES.find(c => c.id === selectedCategory)?.icon || FileIcon, { size: 24 })}
                                    </div>
                                    <div>
                                        <h4 className="text-lg font-black text-zinc-900">{CATEGORIES.find(c => c.id === selectedCategory)?.label}</h4>
                                        <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider">{getFilesByCategory(selectedCategory).length} Master Files</p>
                                    </div>
                                </div>

                                {isPro && (
                                    <div className="relative">
                                        <input 
                                            type="file" 
                                            id={`vault-upload-${selectedCategory}`}
                                            className="hidden" 
                                            onChange={(e) => handleUpload(e, selectedCategory)}
                                            disabled={uploading}
                                        />
                                        <label 
                                            htmlFor={`vault-upload-${selectedCategory}`}
                                            className={`flex items-center gap-3 px-8 py-3.5 bg-zinc-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest cursor-pointer hover:bg-black hover:scale-105 active:scale-95 transition-all shadow-xl shadow-zinc-200 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
                                        >
                                            {uploading ? (
                                                <div className="animate-spin rounded-full h-3 w-3 border-2 border-zinc-400 border-t-white"></div>
                                            ) : <Upload size={16} />} 
                                            {uploading ? 'Processing...' : 'Upload to Vault'}
                                        </label>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {getFilesByCategory(selectedCategory).length === 0 ? (
                                    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-zinc-200 rounded-[2.5rem] bg-white/50">
                                        <div className="w-20 h-20 rounded-full bg-zinc-100 flex items-center justify-center mb-4 text-zinc-300">
                                            <FolderOpen size={40} />
                                        </div>
                                        <h5 className="text-sm font-black text-zinc-900 mb-1">No Files Yet</h5>
                                        <p className="text-xs text-zinc-400 font-bold max-w-xs">{isPro ? 'Start building the project foundation by uploading master files.' : 'The professional has not shared any files in this category yet.'}</p>
                                    </div>
                                ) : (
                                    getFilesByCategory(selectedCategory).map((doc) => (
                                        <div key={doc.id} className="group bg-white p-5 rounded-3xl border border-zinc-200/60 shadow-sm hover:shadow-xl hover:shadow-zinc-100 hover:border-zinc-300 transition-all flex flex-col gap-4">
                                            <div className="flex items-start justify-between">
                                                <div className="w-12 h-12 rounded-2xl bg-zinc-50 text-zinc-500 flex items-center justify-center shrink-0 border border-zinc-100 group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                                                    <FileIcon size={24} />
                                                </div>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <a 
                                                        href={`/storage/${doc.file_path}`} 
                                                        target="_blank" 
                                                        rel="noreferrer"
                                                        className="p-2.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-50 rounded-xl transition-all"
                                                        title="Download"
                                                    >
                                                        <Download size={18} />
                                                    </a>
                                                    {(currentUser?.id === doc.uploader_id || currentUser?.id === project.user_id) && (
                                                        <button 
                                                            onClick={() => handleDelete(doc.id)}
                                                            className="p-2.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                                            title="Delete"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            <div className="overflow-hidden">
                                                <p className="text-sm font-black text-zinc-900 truncate" title={doc.file_name}>{doc.file_name}</p>
                                                <p className="text-[10px] uppercase font-bold text-zinc-400 mt-1 flex items-center gap-2">
                                                    {new Date(doc.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    <span className="w-1 h-1 rounded-full bg-zinc-200"></span>
                                                    {(doc.file_type || 'file').toUpperCase()}
                                                </p>
                                            </div>

                                            <div className="pt-4 mt-auto border-t border-zinc-100 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-5 h-5 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400">
                                                        <Plus size={10} />
                                                    </div>
                                                    <span className="text-[10px] font-black text-zinc-500 uppercase">{doc.uploader?.name}</span>
                                                </div>
                                                <span className="px-2 py-1 bg-zinc-100 text-[10px] font-bold text-zinc-500 rounded-md">VERIFIED</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
