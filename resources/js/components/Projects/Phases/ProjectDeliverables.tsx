import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { 
    Box, Upload, File as FileIcon, Trash2, Download, 
    Layers, Image as ImageIcon, Ruler, Code, FileArchive,
    Plus, FolderOpen, ShieldCheck, ChevronRight, FileText
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { ProjectDocument } from '../../../types/project.types';
import { motion, AnimatePresence } from 'framer-motion';
import ProjectContractViewerModal from '../Contracts/ProjectContractViewerModal';

interface ProjectDeliverablesProps {
    project: any;
    currentUser: any;
    isPro: boolean;
}

const CATEGORIES = [
    { id: 'client_id', label: 'Client Identification', icon: ShieldCheck, color: 'text-rose-600', bg: 'bg-rose-50', desc: 'Owner identity cards & family sheets' },
    { id: 'blueprint', label: 'Master Blueprints', icon: Ruler, color: 'text-blue-600', bg: 'bg-blue-50', desc: 'Architectural & structural plans' },
    { id: 'render', label: '3D Visualizations', icon: ImageIcon, color: 'text-purple-600', bg: 'bg-purple-50', desc: 'Final renders & design previews' },
    { id: 'technical', label: 'Technical Specs', icon: Layers, color: 'text-teal-600', bg: 'bg-teal-50', desc: 'MEP & finishing specifications' },
    { id: 'legal', label: 'Legal & Permits', icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50', desc: 'Verified certificates & land deeds' },
    { id: 'contracts', label: 'Official Contracts', icon: FileText, color: 'text-amber-600', bg: 'bg-amber-50', desc: 'Signed SPK & agreements' },
    { id: 'src', label: 'Source (CAD)', icon: Code, color: 'text-orange-600', bg: 'bg-orange-50', desc: 'Editable DWG & source files' },
    { id: 'others', label: 'Progress & Misc', icon: FileArchive, color: 'text-slate-600', bg: 'bg-slate-50', desc: 'Field notes & other documents' },
];

export default function ProjectDeliverables({ project, currentUser, isPro }: ProjectDeliverablesProps) {
    const [documents, setDocuments] = useState<ProjectDocument[]>([]);
    const [milestones, setMilestones] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [submittingMilestoneId, setSubmittingMilestoneId] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>('client_id');
    const { showToast } = useToast();

    const personalIdSlots = [
        { id: 'ktp_owner', label: 'KTP (Owner Identity Card)', desc: 'Valid Resident Identity Cards for all land owners.' },
        { id: 'kartu_keluarga', label: 'Kartu Keluarga (KK)', desc: 'Family Card to verify family relationships and heirs.' },
        { id: 'marriage_cert', label: 'Surat Nikah (Marriage Certificate)', desc: 'Required if joint property ownership consent is mandatory.' },
        { id: 'npwp', label: 'NPWP (Tax ID Number)', desc: 'Copy of personal tax identification number card.' },
        { id: 'surat_kuasa', label: 'Surat Kuasa (Power of Attorney)', desc: 'If signing capacity is delegated to a representative.' },
        { id: 'prenuptial', label: 'Perjanjian Kawin (Prenup Agreement)', desc: 'Clarifies asset separation if building individually.' },
    ];

    const fetchMilestones = async () => {
        try {
            const res = await axios.get(`/projects/${project.id}/milestones`);
            setMilestones(res.data?.data || res.data || []);
        } catch (error) {
            console.error(error);
        }
    };

    const handleIdUpload = async (e: React.ChangeEvent<HTMLInputElement>, slotId: string, slotLabel: string, activeMilestone?: any) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        
        setSubmittingMilestoneId(slotId);
        try {
            const formData = new FormData();
            formData.append('gallery[]', file);
            formData.append('description', 'Client identification document uploaded.');
            formData.append('phase_context', 'legal');
            formData.append('type', 'legal');
            formData.append('title', slotLabel);
            
            formData.append('content', JSON.stringify({
                ...activeMilestone?.content,
                req_id: slotId
            }));

            if (activeMilestone) {
                formData.append('_method', 'PUT');
                await axios.post(`/projects/${project.id}/milestones/${activeMilestone.id}`, formData);
                showToast('Identification document updated', 'success');
            } else {
                await axios.post(`/projects/${project.id}/milestones`, formData);
                showToast('Identification document uploaded', 'success');
            }
            fetchMilestones();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to upload document', 'error');
        } finally {
            setSubmittingMilestoneId(null);
            if (e.target) e.target.value = '';
        }
    };

    // Contract Viewer Modal State
    const [selectedContract, setSelectedContract] = useState<any>(null);
    const [isContractViewerOpen, setIsContractViewerOpen] = useState(false);

    // Dynamic filtering of categories based on accepted bid deliverables
    const activeBid = project.accepted_arsitek_bid || project.accepted_kontraktor_bid || project.accepted_interior_bid;
    const selectedDeliverables = activeBid?.deliverables || [];

    const signedContracts = useMemo(() => {
        if (!project) return [];
        const contractBids: any[] = [];
        const bidKeys = [
            { key: 'bids_arsitek', label: 'arsitek', roleName: 'Lead Architect' },
            { key: 'bids_kontraktor', label: 'kontraktor', roleName: 'Lead Contractor' },
            { key: 'bids_notaris', label: 'notaris', roleName: 'Notary Partner' },
            { key: 'bids_interior', label: 'interior', roleName: 'Interior Designer' },
            { key: 'bids_project_manager', label: 'project_manager', roleName: 'Lead Project Manager' },
            { key: 'bids_structural', label: 'structural', roleName: 'Structural Engineer' },
            { key: 'bids_mep', label: 'mep', roleName: 'MEP Engineer' },
        ];
        
        bidKeys.forEach(({ key, label, roleName }) => {
            const bids = project[key] || [];
            bids.forEach((bid: any) => {
                if (bid.pro_signature_url && bid.client_signature_url) {
                    contractBids.push({
                        id: bid.id,
                        roleType: label,
                        roleName: roleName,
                        bidderName: bid.bidder?.name || 'Professional',
                        proSignature: bid.pro_signature_url,
                        clientSignature: bid.client_signature_url,
                        bid: bid,
                        updatedAt: bid.updated_at || project.updated_at
                    });
                }
            });
        });
        return contractBids;
    }, [project]);

    const filteredCategories = CATEGORIES.filter(cat => {
        // Fallback: If no structured deliverables exist yet (older bids), show everything
        if (!selectedDeliverables || selectedDeliverables.length === 0) return true;

        // "others", "contracts" & "client_id" are always visible
        if (cat.id === 'others' || cat.id === 'contracts' || cat.id === 'client_id') return true;

        // Mapping logic
        switch (cat.id) {
            case 'blueprint':
                return selectedDeliverables.some(d => ['floor_plan', 'structural'].includes(d));
            case 'render':
                return selectedDeliverables.some(d => ['3d_render', 'vr_walkthrough', 'interior_concept'].includes(d));
            case 'technical':
                return selectedDeliverables.some(d => ['mep_plan', 'structural'].includes(d));
            case 'src':
                // Source files are usually relevant if any design work is done
                return selectedDeliverables.length > 0;
            default:
                return true;
        }
    });

    // Auto-select first available category if current one is hidden
    useEffect(() => {
        if (!filteredCategories.find(c => c.id === selectedCategory)) {
            setSelectedCategory(filteredCategories[0]?.id || 'others');
        }
    }, [selectedDeliverables]);

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
        fetchMilestones();
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
    const activeCategoryData = CATEGORIES.find(c => c.id === selectedCategory);

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                <div className="max-w-xl">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-xl shadow-zinc-200">
                            <FolderOpen size={20} />
                        </div>
                        <h3 className="text-2xl font-black text-zinc-900">Reference & Verification Files</h3>
                    </div>
                    <p className="text-zinc-500 text-sm font-medium leading-relaxed">
                        Access client identification records and the architect's technical blueprints. 
                        These documents provide all necessary inputs for drafting legal deeds.
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
                    {filteredCategories.map((cat) => {
                        const count = cat.id === 'contracts' 
                            ? signedContracts.length 
                            : cat.id === 'client_id'
                            ? milestones.filter(m => ['ktp_owner', 'kartu_keluarga', 'marriage_cert', 'npwp', 'surat_kuasa', 'prenuptial'].includes(m.content?.req_id) && m.content?.gallery?.length > 0).length
                            : getFilesByCategory(cat.id).length;
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
                                    <div className={`w-12 h-12 rounded-[1.2rem] flex items-center justify-center ${activeCategoryData?.bg} ${activeCategoryData?.color}`}>
                                        {React.createElement(activeCategoryData?.icon || FileIcon, { size: 24 })}
                                    </div>
                                    <div>
                                        <h4 className="text-lg font-black text-zinc-900">{activeCategoryData?.label}</h4>
                                        <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider">
                                            {selectedCategory === 'contracts' 
                                                ? `${signedContracts.length} Signed Agreements` 
                                                : selectedCategory === 'client_id'
                                                ? 'Legal Capacity & Verification Documents'
                                                : `${getFilesByCategory(selectedCategory).length} Master Files`}
                                        </p>
                                    </div>
                                </div>

                                {isPro && selectedCategory !== 'contracts' && selectedCategory !== 'client_id' && (
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
                                {selectedCategory === 'client_id' ? (
                                    personalIdSlots.map((slot) => {
                                        const m = milestones.find(item => item.content?.req_id === slot.id);
                                        const file = m?.content?.gallery?.[0];
                                        const hasFile = !!file;
                                        return (
                                            <div key={slot.id} className="group bg-white p-5 rounded-3xl border border-zinc-200/60 shadow-sm hover:shadow-xl hover:shadow-zinc-100 hover:border-zinc-300 transition-all flex flex-col gap-4 text-left">
                                                <div className="flex items-start justify-between">
                                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border transition-colors ${
                                                        hasFile ? 'bg-rose-50 border-rose-100 text-rose-600 group-hover:bg-rose-600 group-hover:text-white' : 'bg-zinc-50 border-zinc-100 text-zinc-300'
                                                    }`}>
                                                        <ShieldCheck size={24} />
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {hasFile && (
                                                            <a 
                                                                href={file.startsWith('http') ? file : `/storage/${file}`} 
                                                                target="_blank" 
                                                                rel="noreferrer"
                                                                className="p-2.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-50 rounded-xl transition-all"
                                                                title="Download ID Document"
                                                            >
                                                                <Download size={18} />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                                
                                                <div className="overflow-hidden">
                                                    <p className="text-sm font-black text-zinc-900 truncate" title={slot.label}>{slot.label}</p>
                                                    <p className="text-xs font-bold text-zinc-400 mt-1 leading-relaxed">{slot.desc}</p>
                                                </div>

                                                <div className="pt-4 mt-auto border-t border-zinc-100 flex items-center justify-between gap-4">
                                                    {hasFile ? (
                                                        <span className="px-2 py-1 bg-emerald-50 text-[10px] font-bold text-emerald-600 rounded-md">UPLOADED</span>
                                                    ) : (
                                                        <span className="px-2 py-1 bg-zinc-50 text-[10px] font-bold text-zinc-400 rounded-md">EMPTY</span>
                                                    )}
                                                    
                                                    {/* Upload/Replace Button for Owner or Notary */}
                                                    {(currentUser?.id === project.user_id || isPro) && (
                                                        <div className="relative">
                                                            <input 
                                                                type="file" 
                                                                id={`id-upload-${slot.id}`}
                                                                className="hidden" 
                                                                onChange={(e) => handleIdUpload(e, slot.id, slot.label, m)}
                                                                disabled={submittingMilestoneId === slot.id}
                                                            />
                                                            <label 
                                                                htmlFor={`id-upload-${slot.id}`}
                                                                className={`px-4 py-2 bg-zinc-900 hover:bg-black text-white text-[9px] font-black uppercase tracking-widest rounded-xl transition-all shadow-md cursor-pointer hover:scale-105 active:scale-95 flex items-center gap-1.5 ${submittingMilestoneId === slot.id ? 'opacity-50 pointer-events-none' : ''}`}
                                                            >
                                                                {submittingMilestoneId === slot.id ? (
                                                                    <div className="animate-spin rounded-full h-3 w-3 border-2 border-zinc-400 border-t-white"></div>
                                                                ) : <Upload size={12} />} 
                                                                {hasFile ? 'Replace' : 'Upload'}
                                                            </label>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : selectedCategory === 'contracts' ? (
                                    signedContracts.length === 0 ? (
                                        <div className="col-span-full flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-zinc-200 rounded-[2.5rem] bg-white/50 animate-in fade-in duration-300">
                                            <div className="w-20 h-20 rounded-full bg-zinc-100 flex items-center justify-center mb-4 text-zinc-300">
                                                <FileText size={40} />
                                            </div>
                                            <h5 className="text-sm font-black text-zinc-900 mb-1">No Signed Contracts</h5>
                                            <p className="text-xs text-zinc-400 font-bold max-w-xs">Once both the client and professional have signed the agreement, the official SPK will appear here.</p>
                                        </div>
                                    ) : (
                                        signedContracts.map((contract) => (
                                            <div key={contract.id} className="group bg-white p-5 rounded-3xl border border-zinc-200/60 shadow-sm hover:shadow-xl hover:shadow-zinc-100 hover:border-zinc-300 transition-all flex flex-col gap-4 animate-in fade-in duration-300">
                                                <div className="flex items-start justify-between">
                                                    <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                                                        <FileText size={24} />
                                                    </div>
                                                    <span className="px-2.5 py-1 bg-emerald-50 text-[9px] font-black text-emerald-700 rounded-md tracking-wider flex items-center gap-1">
                                                        <ShieldCheck size={10} /> SIGNED & ACTIVE
                                                    </span>
                                                </div>
                                                
                                                <div className="overflow-hidden">
                                                    <p className="text-sm font-black text-zinc-900 truncate">Surat Perjanjian Kerja (SPK)</p>
                                                    <p className="text-xs font-bold text-zinc-500 mt-1 uppercase tracking-wide">{contract.roleName} - {contract.bidderName}</p>
                                                    <p className="text-[9px] uppercase font-mono text-zinc-400 mt-1">
                                                        NO: SPK/{project.id}/{contract.id}
                                                    </p>
                                                </div>

                                                <div className="pt-4 mt-auto border-t border-zinc-100 flex items-center justify-between gap-4">
                                                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-wider">
                                                        {new Date(contract.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedContract(contract);
                                                            setIsContractViewerOpen(true);
                                                        }}
                                                        className="px-4 py-2 bg-zinc-900 hover:bg-black text-white text-[9px] font-black uppercase tracking-widest rounded-xl transition-all shadow-md shadow-zinc-200 hover:scale-105 active:scale-95 flex items-center gap-1.5"
                                                    >
                                                        View Contract
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )
                                ) : (
                                    getFilesByCategory(selectedCategory).length === 0 ? (
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
                                                            href={doc.file_url || `/storage/${doc.file_path}`} 
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
                                    )
                                )}
                            </div>
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {/* Contract Viewer Modal Overlay */}
            {selectedContract && (
                <ProjectContractViewerModal
                    isOpen={isContractViewerOpen}
                    onClose={() => {
                        setIsContractViewerOpen(false);
                        setSelectedContract(null);
                    }}
                    project={project}
                    bid={selectedContract.bid}
                    roleType={selectedContract.roleType}
                />
            )}
        </div>
    );
}
