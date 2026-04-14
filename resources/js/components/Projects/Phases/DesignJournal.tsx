import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Send, Clock, User, Trash2, FileText } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

interface DesignJournalProps {
    project: any;
    currentUser: any;
}

export default function DesignJournal({ project, currentUser }: DesignJournalProps) {
    const [entries, setEntries] = useState<any[]>([]);
    const [newEntry, setNewEntry] = useState('');
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();

    const fetchEntries = async () => {
        if (!project?.id) return;
        try {
            const res = await axios.get(`/projects/${project.id}/comments`);
            setEntries(res.data?.data || []);
        } catch (error) {
            console.error("Failed to fetch journal entries", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEntries();
    }, [project?.id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEntry.trim()) return;

        try {
            await axios.post(`/projects/${project.id}/comments`, {
                message: newEntry,
                type: 'journal' // just for categorization if needed
            });
            setNewEntry('');
            fetchEntries();
            showToast('Entry logged successfully', 'success');
        } catch (error) {
            showToast('Failed to post entry', 'error');
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm("Remove this entry?")) return;
        try {
            await axios.delete(`/projects/${project.id}/comments/${id}`);
            fetchEntries();
            showToast('Entry deleted', 'success');
        } catch (error) {
            showToast('Failed to delete entry', 'error');
        }
    };

    if (loading) return (
        <div className="py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">
            Syncing Journal...
        </div>
    );

    return (
        <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm">
            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-1">Project Journal</h4>
            <p className="text-xs text-slate-400 font-medium mb-8">
                Official project log for decisions, meeting minutes, and change requests.
            </p>
            
            <div className="space-y-4 mb-8 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {(!entries || entries.length === 0) ? (
                    <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                        <FileText className="mx-auto text-slate-300 mb-2" size={32} />
                        <p className="text-sm font-bold text-slate-400">No decisions logged yet.</p>
                    </div>
                ) : (
                    entries?.map((entry) => (
                        <div key={entry.id} className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 relative group">
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold">
                                        {entry.user?.name?.charAt(0) || <User size={14} />}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-900">{entry.user?.name || 'Anonymous'}</p>
                                        <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-slate-400">
                                            <Clock size={10} />
                                            {entry.created_at ? new Date(entry.created_at).toLocaleString('en-US', { 
                                                month: 'short', 
                                                day: 'numeric', 
                                                hour: '2-digit', 
                                                minute: '2-digit' 
                                            }) : 'Recently'}
                                        </div>
                                    </div>
                                </div>
                                {(currentUser?.id === entry.user_id || currentUser?.id === project?.user_id) && (
                                    <button 
                                        onClick={() => handleDelete(entry.id)}
                                        className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                            <p className="text-sm text-slate-600 leading-relaxed font-medium">
                                {entry.message}
                            </p>
                        </div>
                    ))
                )}
            </div>

            <form onSubmit={handleSubmit} className="relative">
                <textarea 
                    value={newEntry}
                    onChange={(e) => setNewEntry(e.target.value)}
                    placeholder="Log a project decision or note here..."
                    className="w-full p-6 pr-20 bg-slate-50 border-2 border-slate-100 rounded-3xl text-sm font-medium focus:border-slate-900 focus:bg-white outline-none transition-all resize-none h-32"
                />
                <button 
                    type="submit"
                    className="absolute bottom-4 right-4 p-3 bg-slate-900 text-white rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-slate-200"
                >
                    <Send size={18} />
                </button>
            </form>
        </div>
    );
}
