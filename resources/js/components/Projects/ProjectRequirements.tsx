import React, { useState, useEffect } from 'react';
import { Package, Plus, Hammer, Info, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { useToast } from '../../context/ToastContext';
import RequirementAddForm from './Requirements/RequirementAddForm';
import RequirementCard from './Requirements/RequirementCard';
import LogActionModal from './Requirements/LogActionModal';

interface ProjectRequirementsProps {
    project: any;
    onUpdate: () => void;
    canMutate?: boolean;
}

export default function ProjectRequirements({ project, onUpdate, canMutate = false }: ProjectRequirementsProps) {
    const { showToast } = useToast();
    const [bomTab, setBomTab] = useState<'raw' | 'finishing'>('raw');
    const [isAdding, setIsAdding] = useState(false);
    const [isMutating, setIsMutating] = useState(false);
    
    // Modal stock log state
    const [logState, setLogState] = useState<{
        isOpen: boolean;
        mode: 'restock' | 'use';
        requirement: any | null;
    }>({
        isOpen: false,
        mode: 'restock',
        requirement: null
    });

    const [editState, setEditState] = useState<{
        isOpen: boolean;
        requirement: any | null;
    }>({
        isOpen: false,
        requirement: null
    });

    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [dragOverFolderId, setDragOverFolderId] = useState<number | null | 'unassigned'>(null);
    const [dragOverTab, setDragOverTab] = useState<'raw' | 'finishing' | null>(null);

    const [requirements, setRequirements] = useState<any[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(false);

    const fetchRequirements = async () => {
        setIsLoadingData(true);
        try {
            const response = await axios.get(`/projects/${project.id}/requirements`);
            setRequirements(response.data.data);
        } catch (err) {
            console.error('Failed to fetch requirements', err);
        } finally {
            setIsLoadingData(false);
        }
    };

    useEffect(() => {
        fetchRequirements();
    }, [project.id]);

    const [folders, setFolders] = useState<any[]>([]);

    const fetchFolders = async () => {
        try {
            const response = await axios.get(`/projects/${project.id}/material-folders`);
            setFolders(response.data.data);
        } catch (err) {
            console.error('Failed to fetch folders', err);
        }
    };

    useEffect(() => {
        fetchFolders();
    }, [project.id]);

    const handleCreateFolder = async () => {
        if (!newFolderName) return;
        try {
            await axios.post(`/projects/${project.id}/material-folders`, { name: newFolderName, bom_type: bomTab });
            showToast('Folder created.', 'success');
            fetchFolders();
            setIsCreatingFolder(false);
            setNewFolderName('');
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to create folder.', 'error');
        }
    };

    const handleDrop = async (e: React.DragEvent, folderId: number | null) => {
        e.preventDefault();
        setDragOverFolderId(null);
        const requirementId = e.dataTransfer.getData('requirementId');
        if (!requirementId) return;
        
        try {
            await axios.put(`/projects/${project.id}/requirements/${requirementId}`, { folder_id: folderId });
            showToast('Material moved.', 'success');
            fetchRequirements();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to move material.', 'error');
        }
    };

    const handleDropOnTab = async (e: React.DragEvent, targetTab: 'raw' | 'finishing') => {
        e.preventDefault();
        setDragOverTab(null);
        const requirementId = e.dataTransfer.getData('requirementId');
        if (!requirementId) return;
        
        try {
            await axios.put(`/projects/${project.id}/requirements/${requirementId}`, { bom_type: targetTab });
            showToast(`Material moved to ${targetTab === 'raw' ? 'Bahan Baku' : 'Bahan Finishing'}.`, 'success');
            fetchRequirements();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to move material.', 'error');
        }
    };

    const handleAdd = async (formData: FormData) => {
        setIsMutating(true);
        try {
            await axios.post(`/projects/${project.id}/requirements`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setIsAdding(false);
            showToast('Material added to master list.', 'success');
            onUpdate?.();
            fetchRequirements();
        } finally {
            setIsMutating(false);
        }
    };

    const handleEdit = async (formData: FormData) => {
        if (!editState.requirement) return;
        setIsMutating(true);
        try {
            await axios.post(`/projects/${project.id}/requirements/${editState.requirement.id}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setEditState({ isOpen: false, requirement: null });
            showToast('Material updated successfully.', 'success');
            onUpdate?.();
            fetchRequirements();
        } finally {
            setIsMutating(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('Remove this material requirement?')) return;
        try {
            await axios.delete(`/projects/${project.id}/requirements/${id}`);
            showToast('Material item removed.', 'success');
            onUpdate?.();
            fetchRequirements();
        } catch (err: any) {
            console.error('Delete failed', err);
            showToast(err.response?.data?.message || 'Failed to remove material item.', 'error');
        }
    };

    const handleStockSubmit = async (quantity: number, notes: string) => {
        setIsMutating(true);
        try {
            const reqId = logState.requirement?.id;
            const endpoint = `/projects/${project.id}/requirements/${reqId}/${logState.mode}`;
            await axios.post(endpoint, { quantity, notes });
            
            setLogState({ isOpen: false, mode: 'restock', requirement: null });
            showToast(`Logged stock ${logState.mode} successfully.`, 'success');
            onUpdate?.();
            fetchRequirements();
        } finally {
            setIsMutating(false);
        }
    };

    // Filter requirements based on selected BOM type
    const filteredRequirements = requirements.filter((req: any) => (req.bom_type || 'raw') === bomTab);

    return (
        <div className="space-y-6 p-1">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
                <div>
                    <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <Package className="text-red-500" size={24} />
                        BOM & Site Inventory
                    </h3>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">
                        Track material specifications, restocks, & daily site usage
                    </p>
                </div>
                {canMutate && (
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setIsAdding(!isAdding)}
                            className="bg-slate-900 text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-wider shadow-md hover:bg-slate-800 transition-all flex items-center justify-center gap-2 active:scale-95 self-start"
                        >
                            {isAdding ? <Info size={14} /> : <Plus size={14} />}
                            {isAdding ? 'View List' : 'Add Material'}
                        </button>
                        <button 
                            onClick={() => setIsCreatingFolder(true)}
                            className="bg-white text-slate-700 px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-wider shadow-sm border border-slate-100 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 active:scale-95 self-start"
                        >
                            <Plus size={14} />
                            New Folder
                        </button>
                    </div>
                )}
            </div>

            <AnimatePresence mode="wait">
                {isAdding ? (
                    <motion.div 
                        key="form"
                        initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}
                        className="bg-slate-50 p-6 md:p-8 rounded-[2.5rem] border border-slate-100"
                    >
                        <RequirementAddForm 
                            isLoading={isMutating} 
                            onSubmit={handleAdd} 
                            onCancel={() => setIsAdding(false)} 
                        />
                    </motion.div>
                ) : (
                    <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                        {/* BOM Tab filters */}
                        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                            <button 
                                onClick={() => setBomTab('raw')}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${bomTab === 'raw' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-100 text-slate-400 hover:text-slate-600'} ${dragOverTab === 'raw' ? 'border-indigo-500 bg-indigo-50 scale-[1.05]' : ''}`}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setDragOverTab('raw');
                                }}
                                onDragLeave={() => setDragOverTab(null)}
                                onDrop={(e) => handleDropOnTab(e, 'raw')}
                            >
                                Bahan Baku (Raw)
                            </button>
                            <button 
                                onClick={() => setBomTab('finishing')}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${bomTab === 'finishing' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-100 text-slate-400 hover:text-slate-600'} ${dragOverTab === 'finishing' ? 'border-indigo-500 bg-indigo-50 scale-[1.05]' : ''}`}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setDragOverTab('finishing');
                                }}
                                onDragLeave={() => setDragOverTab(null)}
                                onDrop={(e) => handleDropOnTab(e, 'finishing')}
                            >
                                Bahan Finishing
                            </button>
                        </div>

                        {folders.length === 0 && filteredRequirements.length === 0 ? (
                            <div className="py-16 bg-slate-50 rounded-[2.5rem] border border-dashed border-slate-200 flex flex-col items-center justify-center text-center px-6">
                                <div className="p-4 bg-white rounded-2xl shadow-sm mb-4 border border-slate-100">
                                    <Hammer className="text-slate-300" size={32} />
                                </div>
                                <h4 className="text-sm font-black text-slate-900 tracking-tight">No Materials Found</h4>
                                <p className="text-slate-400 font-bold max-w-sm mt-1 text-[11px] leading-relaxed uppercase tracking-wider">
                                    No items listed under {bomTab === 'raw' ? 'Bahan Baku' : 'Bahan Finishing'} yet.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                {/* Render Folders */}
                                {folders.filter((folder: any) => (folder.bom_type || 'raw') === bomTab).map((folder: any) => {
                                    const folderReqs = filteredRequirements.filter((req: any) => req.folder_id === folder.id);
                                    const isDragOver = dragOverFolderId === folder.id;
                                    
                                    return (
                                        <div 
                                            key={folder.id} 
                                            className={`bg-slate-50 p-6 rounded-[2.5rem] border transition-all ${isDragOver ? 'border-indigo-300 bg-indigo-50/50 scale-[1.02]' : 'border-slate-100'} ${folderReqs.length === 0 ? 'py-3' : 'space-y-4'}`}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                setDragOverFolderId(folder.id);
                                            }}
                                            onDragLeave={() => setDragOverFolderId(null)}
                                            onDrop={(e) => handleDrop(e, folder.id)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider ml-2">{folder.name}</h4>
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{folderReqs.length} items</span>
                                            </div>
                                            {folderReqs.length > 0 && (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    {folderReqs.map((req: any) => (
                                                        <RequirementCard 
                                                            key={req.id} 
                                                            project={project} 
                                                            req={req} 
                                                            onDelete={handleDelete}
                                                            onEdit={() => setEditState({ isOpen: true, requirement: req })}
                                                            onOpenLogModal={(mode, requirement) => setLogState({ isOpen: true, mode, requirement })}
                                                            folders={folders}
                                                            canMutate={canMutate}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {/* Render Unassigned */}
                                {(() => {
                                    const unassignedReqs = filteredRequirements.filter((req: any) => !req.folder_id);
                                    const isDragOver = dragOverFolderId === 'unassigned';
                                    
                                    return (
                                        <div 
                                            className={`space-y-4 p-6 rounded-[2.5rem] border transition-all ${isDragOver ? 'border-indigo-300 bg-indigo-50/50 scale-[1.02]' : 'border-transparent'}`}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                setDragOverFolderId('unassigned');
                                            }}
                                            onDragLeave={() => setDragOverFolderId(null)}
                                            onDrop={(e) => handleDrop(e, null)}
                                        >
                                            <h4 className="text-sm font-black text-slate-400 uppercase tracking-wider ml-2">Unassigned Materials</h4>
                                            {unassignedReqs.length > 0 ? (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    {unassignedReqs.map((req: any) => (
                                                        <RequirementCard 
                                                            key={req.id} 
                                                            project={project} 
                                                            req={req} 
                                                            onDelete={handleDelete}
                                                            onEdit={() => setEditState({ isOpen: true, requirement: req })}
                                                            onOpenLogModal={(mode, requirement) => setLogState({ isOpen: true, mode, requirement })}
                                                            folders={folders}
                                                            canMutate={canMutate}
                                                        />
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="py-6 text-center text-slate-400 text-xs font-bold uppercase tracking-wider">
                                                    Drop here to unassign
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Edit Modal */}
            <AnimatePresence>
                {editState.isOpen && editState.requirement && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }} 
                            animate={{ opacity: 1, scale: 1 }} 
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-[2.5rem] shadow-2xl p-6 md:p-8 w-full max-w-3xl my-auto"
                        >
                            <div className="mb-6">
                                <h3 className="text-xl font-black text-slate-900 tracking-tight">Edit Material Requirement</h3>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Update specifications and details</p>
                            </div>
                            <RequirementAddForm 
                                isLoading={isMutating}
                                onSubmit={handleEdit}
                                onCancel={() => setEditState({ isOpen: false, requirement: null })}
                                initialData={editState.requirement}
                            />
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Create Folder Modal */}
            <AnimatePresence>
                {isCreatingFolder && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }} 
                            animate={{ opacity: 1, scale: 1 }} 
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-[2rem] shadow-2xl p-6 w-full max-w-md my-auto"
                        >
                            <div className="mb-4">
                                <h3 className="text-lg font-black text-slate-900 tracking-tight">Create New Folder</h3>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Group your materials</p>
                            </div>
                            <div className="space-y-4">
                                <input 
                                    type="text"
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    placeholder="e.g., Semen, Besi, etc."
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                                />
                                <div className="flex justify-end gap-2">
                                    <button 
                                        onClick={() => {
                                            setIsCreatingFolder(false);
                                            setNewFolderName('');
                                        }}
                                        className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-slate-500 hover:bg-slate-50 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={handleCreateFolder}
                                        disabled={!newFolderName}
                                        className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-800 transition-all disabled:opacity-50"
                                    >
                                        Create
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Log Stock Transaction Modal */}
            <AnimatePresence>
                {logState.isOpen && (
                    <LogActionModal 
                        isOpen={logState.isOpen}
                        mode={logState.mode}
                        requirement={logState.requirement}
                        isLoading={isMutating}
                        onClose={() => setLogState({ isOpen: false, mode: 'restock', requirement: null })}
                        onSubmit={handleStockSubmit}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
