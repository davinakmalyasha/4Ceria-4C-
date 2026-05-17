import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, X, GripVertical, Trash2, Save, FileText } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

interface StickyNote {
    id: number;
    title?: string;
    content: string;
    position_index: number;
}

interface StickyNotesLayerProps {
    project: any;
    currentUser: any;
    phaseContext: string;
    renderTrigger?: (toggle: () => void, isOpen: boolean) => React.ReactNode;
}

export default function StickyNotesLayer({ project, currentUser, phaseContext, renderTrigger }: StickyNotesLayerProps) {
    const [notes, setNotes] = useState<StickyNote[]>([]);
    const [editingNoteIds, setEditingNoteIds] = useState<number[]>([]);
    const [editingContent, setEditingContent] = useState<Record<number, string>>({});
    const [editingTitles, setEditingTitles] = useState<Record<number, string>>({});
    const [loading, setLoading] = useState(true);
    const [isOpen, setIsOpen] = useState(false); // Toggle visibility
    const { showToast } = useToast();

    // Only allow PM to use sticky notes
    const isPM = currentUser?.role_type === 'project_manager' && project?.pm_id === currentUser?.id;

    const fetchNotes = async () => {
        if (!isPM) return;
        try {
            const res = await axios.get(`/projects/${project.id}/sticky-notes`, {
                params: { phase_context: phaseContext }
            });
            setNotes(res.data?.data || []);
        } catch (error) {
            console.error('Failed to fetch sticky notes:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotes();
    }, [project.id, phaseContext, isPM]);

    const handleAddNote = async () => {
        try {
            const res = await axios.post(`/projects/${project.id}/sticky-notes`, {
                phase_context: phaseContext,
                title: '',
                content: '',
                position_index: notes.length
            });
            const newNote = res.data.data;
            setNotes([...notes, newNote]);
            setEditingNoteIds(prev => [...prev, newNote.id]);
        } catch (error) {
            showToast('Failed to add note', 'error');
        }
    };

    const handleUpdateNote = async (id: number, content: string, title: string) => {
        try {
            await axios.put(`/projects/${project.id}/sticky-notes/${id}`, { content, title });
            setNotes(prev => prev.map(n => n.id === id ? { ...n, content, title } : n));
            setEditingContent(prev => {
                const copy = { ...prev };
                delete copy[id];
                return copy;
            });
            setEditingTitles(prev => {
                const copy = { ...prev };
                delete copy[id];
                return copy;
            });
            setEditingNoteIds(prev => prev.filter(x => x !== id));
            showToast('Note pinned successfully!', 'success');
        } catch (error) {
            showToast('Failed to save note', 'error');
        }
    };

    const handleDeleteNote = async (id: number) => {
        if (!window.confirm("Delete this note?")) return;
        try {
            await axios.delete(`/projects/${project.id}/sticky-notes/${id}`);
            setNotes(notes.filter(n => n.id !== id));
            setEditingContent(prev => {
                const copy = { ...prev };
                delete copy[id];
                return copy;
            });
            setEditingTitles(prev => {
                const copy = { ...prev };
                delete copy[id];
                return copy;
            });
            setEditingNoteIds(prev => prev.filter(x => x !== id));
            showToast('Note deleted successfully!', 'success');
        } catch (error) {
            showToast('Failed to delete note', 'error');
        }
    };

    const handleCancelEdit = (id: number) => {
        setEditingContent(prev => {
            const copy = { ...prev };
            delete copy[id];
            return copy;
        });
        setEditingTitles(prev => {
            const copy = { ...prev };
            delete copy[id];
            return copy;
        });
        setEditingNoteIds(prev => prev.filter(x => x !== id));
    };

    const toggleEditNote = (id: number) => {
        setEditingNoteIds(prev => 
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    if (!isPM) return null;

    return (
        <>
            {renderTrigger ? (
                renderTrigger(() => setIsOpen(prev => !prev), isOpen)
            ) : (
                !isOpen && (
                    <button 
                        onClick={() => setIsOpen(true)}
                        className="fixed right-0 top-1/2 -translate-y-1/2 bg-amber-200 text-amber-900 px-3 py-4 rounded-l-2xl shadow-xl hover:bg-amber-300 transition-all z-50 flex flex-col items-center gap-2 group"
                        title="PM Notes"
                    >
                        <FileText size={20} className="group-hover:scale-110 transition-transform" />
                        <span style={{ writingMode: 'vertical-rl' }} className="text-[10px] font-black uppercase tracking-widest mt-2">
                            PM Notes
                        </span>
                        {notes.length > 0 && (
                            <span className="w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold">
                                {notes.length}
                            </span>
                        )}
                    </button>
                )
            )}

            {isOpen && (
                <div className="fixed right-0 top-24 bottom-6 w-80 bg-slate-50/90 backdrop-blur-md shadow-2xl border-l border-slate-200 z-50 flex flex-col rounded-l-3xl overflow-hidden animate-in slide-in-from-right-10 duration-300">
                    <div className="bg-amber-200 p-5 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-2">
                            <FileText size={18} className="text-amber-800" />
                            <h3 className="font-black text-amber-900 uppercase tracking-widest text-xs">Phase Notes</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={handleAddNote} className="p-1.5 bg-amber-300/50 hover:bg-amber-300 text-amber-900 rounded-lg transition-colors">
                                <Plus size={16} />
                            </button>
                            <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-amber-300/50 text-amber-900 rounded-lg transition-colors">
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {notes.length === 0 && !loading && (
                            <div className="text-center py-10">
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">No notes for this phase.</p>
                                <button onClick={handleAddNote} className="mt-4 text-[10px] uppercase font-black tracking-widest text-amber-600 hover:text-amber-700 underline">Add First Note</button>
                            </div>
                        )}

                        {notes.map((note) => {
                            const isEditing = editingNoteIds.includes(note.id);
                            const hasChanges = 
                                (editingContent[note.id] !== undefined && editingContent[note.id] !== note.content) ||
                                (editingTitles[note.id] !== undefined && editingTitles[note.id] !== note.title);
                            const currentVal = editingContent[note.id] ?? note.content ?? '';
                            const currentTitle = editingTitles[note.id] ?? note.title ?? '';

                            return (
                                <div key={note.id} className={`bg-yellow-100 rounded-3xl shadow-sm border overflow-hidden relative group p-5 flex flex-col gap-3 transition-all ${
                                    isEditing ? 'border-yellow-400 ring-2 ring-yellow-300' : 'border-yellow-200 bg-yellow-50/70'
                                }`}>
                                    <div className="flex items-center gap-1.5 border-b border-yellow-200/50 pb-2">
                                        <FileText size={12} className="text-yellow-800 shrink-0" />
                                        <input 
                                            type="text"
                                            className={`text-[10px] font-black uppercase tracking-widest outline-none border-0 w-full transition-all ${
                                                isEditing 
                                                    ? 'bg-white/80 focus:bg-white text-yellow-950 px-2 py-1 rounded-lg border border-yellow-200 placeholder-yellow-600/30' 
                                                    : 'bg-transparent text-yellow-900 placeholder-yellow-600/50 cursor-text hover:bg-yellow-200/30 p-1 rounded-lg'
                                            }`}
                                            placeholder="STICKY NOTE"
                                            value={currentTitle}
                                            onChange={(e) => setEditingTitles(prev => ({ ...prev, [note.id]: e.target.value }))}
                                            onFocus={() => {
                                                if (!isEditing) {
                                                    setEditingNoteIds(prev => [...prev, note.id]);
                                                }
                                            }}
                                        />
                                    </div>
                                    
                                    <textarea 
                                        id={`note-textarea-${note.id}`}
                                        className={`w-full h-28 bg-transparent text-xs text-yellow-900 placeholder-yellow-600/50 outline-none resize-none font-medium leading-relaxed transition-all p-2 rounded-xl border ${
                                            isEditing 
                                                ? 'focus:bg-white border-yellow-200 bg-yellow-50/30' 
                                                : 'border-transparent hover:border-yellow-200/50 cursor-text'
                                        }`}
                                        placeholder="Type your notes here..."
                                        value={currentVal}
                                        onChange={(e) => setEditingContent(prev => ({ ...prev, [note.id]: e.target.value }))}
                                        onFocus={() => {
                                            if (!isEditing) {
                                                setEditingNoteIds(prev => [...prev, note.id]);
                                            }
                                        }}
                                    />

                                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-yellow-200/50">
                                        {!isEditing ? (
                                            <>
                                                <button 
                                                    onClick={() => {
                                                        toggleEditNote(note.id);
                                                        setTimeout(() => {
                                                            document.getElementById(`note-textarea-${note.id}`)?.focus();
                                                        }, 50);
                                                    }}
                                                    className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-yellow-950 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                                                    title="Edit Note"
                                                >
                                                    Edit
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteNote(note.id)}
                                                    className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                                                    title="Delete Note"
                                                >
                                                    Delete
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button 
                                                    onClick={() => handleCancelEdit(note.id)}
                                                    className="px-3 py-1.5 bg-yellow-200 hover:bg-yellow-300 text-yellow-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                                    title="Close and Discard Changes"
                                                >
                                                    Close
                                                </button>
                                                <button 
                                                    onClick={() => handleUpdateNote(note.id, currentVal, currentTitle)}
                                                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1 shadow-sm ${
                                                        hasChanges 
                                                            ? 'bg-yellow-400 hover:bg-yellow-500 text-yellow-950 ring-2 ring-yellow-300 ring-offset-1 ring-offset-yellow-100 animate-pulse' 
                                                            : 'bg-yellow-300 hover:bg-yellow-400 text-yellow-900'
                                                    }`}
                                                    title="Save and Pin Note"
                                                >
                                                    Pin Note
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </>
    );
}
