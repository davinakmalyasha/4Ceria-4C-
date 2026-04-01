import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { X, Save, AlertCircle } from 'lucide-react';
import { Project } from '../../types/project.types';

interface Props {
    project: Project;
    onClose: () => void;
    onSuccess: (updated: Project) => void;
}

export default function EditProjectModal({ project, onClose, onSuccess }: Props) {
    const [title, setTitle] = useState(project.title);
    const [description, setDescription] = useState(project.description);
    const [budget, setBudget] = useState(project.budget.toString());
    const [lokasi, setLokasi] = useState(project.location || '');
    
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            // Laravel usually accepts PUT/PATCH for updates, but with FormData it's safer to use _method=PUT via POST or just standard PUT if JSON
            const res = await axios.put(`/projects/${project.id}`, {
                title,
                description,
                budget: Number(budget),
                lokasi, 
            });
            onSuccess(res.data.data || res.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to update project. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            >
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-gray-50/50">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Edit Project</h2>
                        <p className="text-xs text-gray-500">Update the details of your renovation.</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl flex items-start gap-2 text-sm border border-red-100">
                            <AlertCircle size={16} className="mt-0.5 shrink-0" /> <p>{error}</p>
                        </div>
                    )}
                    
                    <form id="editForm" onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Project Title</label>
                            <input type="text" value={title} onChange={e => setTitle(e.target.value)} required className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] outline-none transition-all placeholder:text-gray-400" placeholder="e.g. Total Roof Renovation" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
                            <textarea value={description} onChange={e => setDescription(e.target.value)} required rows={4} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] outline-none transition-all resize-none placeholder:text-gray-400" placeholder="Explain what requirements you hold..." />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Budget (Rp)</label>
                                <input type="number" value={budget} onChange={e => setBudget(e.target.value)} required min="100000" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] outline-none transition-all" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Location</label>
                                <input type="text" value={lokasi} onChange={e => setLokasi(e.target.value)} required className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] outline-none transition-all" />
                            </div>
                        </div>
                    </form>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
                    <button type="button" onClick={onClose} disabled={isLoading} className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all disabled:opacity-50">
                        Cancel
                    </button>
                    <button type="submit" form="editForm" disabled={isLoading} className="px-6 py-2.5 text-sm font-bold text-white bg-[#FF2D20] hover:bg-red-700 rounded-xl transition-all shadow-md shadow-red-500/20 disabled:opacity-50 flex items-center gap-2">
                        {isLoading ? <span className="animate-spin border-2 border-white/20 border-t-white rounded-full w-4 h-4"></span> : <Save size={16} />}
                        {isLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
