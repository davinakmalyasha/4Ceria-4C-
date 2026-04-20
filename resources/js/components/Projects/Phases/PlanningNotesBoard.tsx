import React, { useState } from 'react';
import { Plus, X, Image as ImageIcon, Trash2, StickyNote, Pencil } from 'lucide-react';
import { Project, PlanningRequirement } from '../../../types/project.types';
import axios from 'axios';
import { useToast } from '../../../context/ToastContext';

interface PlanningNotesBoardProps {
    project: Project;
    isArchitect: boolean;
    onProjectUpdate: (updatedProject: Project) => void;
}

const PlanningNotesBoard: React.FC<PlanningNotesBoardProps> = ({ project, isArchitect, onProjectUpdate }) => {
    const { showToast } = useToast();
    const [isAdding, setIsAdding] = useState(false);
    const [newNote, setNewNote] = useState({ title: '', description: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ title: '', description: '' });

    const isReadOnly = project.planning_status === 'proposed' || project.planning_status === 'approved';
    const canEdit = isArchitect && !isReadOnly;

    const requirements = project.design_details?.requirements || [];

    const handleAddNote = async () => {
        if (!newNote.title.trim()) {
            showToast('Title is required', 'error');
            return;
        }

        setIsSaving(true);
        
        // Use crypto.randomUUID if available, otherwise fallback to simple timestamp-based ID
        const generatedId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
            ? crypto.randomUUID() 
            : `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const note: PlanningRequirement = {
            id: generatedId,
            title: newNote.title,
            description: newNote.description,
        };

        const updatedRequirements = [...requirements, note];
        
        // Ensure design_details is an object, even if it comes back as [] from Laravel
        const currentDetails = (project.design_details && !Array.isArray(project.design_details)) 
            ? project.design_details 
            : {};

        const updatedDesignDetails = {
            ...currentDetails,
            requirements: updatedRequirements
        };

        try {
            const response = await axios.post(`/projects/${project.id}/update`, {
                design_details: updatedDesignDetails
            });
            onProjectUpdate(response.data.data);
            setNewNote({ title: '', description: '' });
            setIsAdding(false);
            showToast('Note added & saved', 'success');
        } catch (error: any) {
            console.error('Save Note Error:', error);
            const msg = error.response?.data?.message || error.message || 'Failed to save note';
            showToast(msg, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteNote = async (id: string) => {
        if (!confirm('Are you sure you want to delete this note?')) return;

        setIsSaving(true);
        const updatedRequirements = requirements.filter(n => n.id !== id);
        const updatedDesignDetails = {
            ...(project.design_details || {}),
            requirements: updatedRequirements
        };

        try {
            const response = await axios.post(`/projects/${project.id}/update`, {
                design_details: updatedDesignDetails
            });
            onProjectUpdate(response.data.data);
            showToast('Note removed', 'success');
        } catch (error: any) {
            const msg = error.response?.data?.message || 'Failed to remove note';
            showToast(msg, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleStartEdit = (note: PlanningRequirement) => {
        setEditingId(note.id);
        setEditForm({ title: note.title, description: note.description });
    };

    const handleSaveEdit = async () => {
        if (!editingId) return;
        if (!editForm.title.trim()) {
            showToast('Title is required', 'error');
            return;
        }

        setIsSaving(true);
        const updatedRequirements = requirements.map((n: PlanningRequirement) => 
            n.id === editingId 
                ? { ...n, title: editForm.title, description: editForm.description, is_edited: true } 
                : n
        );

        const currentDetails = (project.design_details && !Array.isArray(project.design_details)) 
            ? project.design_details 
            : {};

        const updatedDesignDetails = {
            ...currentDetails,
            requirements: updatedRequirements
        };

        try {
            const response = await axios.post(`/projects/${project.id}/update`, {
                design_details: updatedDesignDetails
            });
            onProjectUpdate(response.data.data);
            setEditingId(null);
            showToast('Note updated', 'success');
        } catch (error: any) {
            console.error('Update Note Error:', error);
            const msg = error.response?.data?.message || error.message || 'Failed to update note';
            showToast(msg, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
                        <StickyNote className="w-5 h-5 text-amber-500" />
                        Design Requirements & Briefing Notes
                    </h3>
                    <p className="text-sm text-zinc-500">Capture every detail of the client's vision here.</p>
                </div>
                {canEdit && (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-full hover:bg-amber-100 transition-colors text-sm font-medium"
                    >
                        <Plus className="w-4 h-4" />
                        Add Requirement
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {isAdding && (
                    <div className="p-4 rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50/30 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2">
                        <input
                            autoFocus
                            placeholder="Requirement Title..."
                            className="bg-transparent border-none focus:ring-0 font-medium text-zinc-900 p-0 placeholder:text-zinc-400"
                            value={newNote.title}
                            onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
                        />
                        <textarea
                            placeholder="Describe the detail..."
                            className="bg-transparent border-none focus:ring-0 text-sm text-zinc-600 p-0 resize-none h-20 placeholder:text-zinc-400"
                            value={newNote.description}
                            onChange={(e) => setNewNote({ ...newNote, description: e.target.value })}
                        />
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-100">
                            <button
                                onClick={() => setIsAdding(false)}
                                className="p-2 text-zinc-400 hover:text-zinc-600 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                            <button
                                onClick={handleAddNote}
                                disabled={isSaving}
                                className="px-4 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-xs font-semibold disabled:opacity-50"
                            >
                                {isSaving ? 'Saving...' : 'Add Note'}
                            </button>
                        </div>
                    </div>
                )}

                {requirements.map((note) => (
                    <div 
                        key={note.id} 
                        className={`group p-5 rounded-2xl bg-white border ${editingId === note.id ? 'border-amber-400 ring-2 ring-amber-100' : 'border-zinc-200'} shadow-sm hover:shadow-md hover:border-amber-200 transition-all duration-300 relative overflow-hidden`}
                    >
                        {editingId === note.id ? (
                            <div className="flex flex-col gap-3 animate-in fade-in zoom-in-95">
                                <input
                                    autoFocus
                                    className="w-full bg-zinc-50 border-none rounded-lg p-2 text-sm font-bold focus:ring-1 focus:ring-amber-500"
                                    value={editForm.title}
                                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                />
                                <textarea
                                    className="w-full bg-zinc-50 border-none rounded-lg p-2 text-sm text-zinc-600 h-24 focus:ring-1 focus:ring-amber-500 resize-none"
                                    value={editForm.description}
                                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                />
                                <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
                                    <button 
                                        onClick={() => setEditingId(null)}
                                        className="px-3 py-1 text-xs font-medium text-zinc-500 hover:text-zinc-700"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={handleSaveEdit}
                                        disabled={isSaving}
                                        className="px-4 py-1 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 disabled:opacity-50"
                                    >
                                        {isSaving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="absolute top-0 left-0 w-1 h-full bg-amber-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex flex-col">
                                        <h4 className="font-bold text-zinc-900 group-hover:text-amber-700 transition-colors flex items-center gap-2">
                                            {note.title}
                                            {note.is_edited && (
                                                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded leading-none">
                                                    Edited
                                                </span>
                                            )}
                                        </h4>
                                    </div>
                                    {canEdit && (
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => handleStartEdit(note)}
                                                className="p-1 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-amber-600 transition-all"
                                                title="Edit Note"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteNote(note.id)}
                                                className="p-1 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-all"
                                                title="Delete Note"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                
                                <p className="text-sm text-zinc-600 leading-relaxed whitespace-pre-wrap">
                                    {note.description}
                                </p>

                                {note.image_url && (
                                    <div className="mt-4 rounded-lg overflow-hidden border border-zinc-100">
                                        <img src={note.image_url} alt={note.title} className="w-full h-32 object-cover" />
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ))}

                {requirements.length === 0 && !isAdding && (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center border-2 border-dashed border-zinc-100 rounded-3xl">
                        <div className="p-3 bg-zinc-50 rounded-full mb-3">
                            <StickyNote className="w-8 h-8 text-zinc-300" />
                        </div>
                        <p className="text-zinc-500 text-sm">No requirements added yet.</p>
                        {canEdit && (
                            <button
                                onClick={() => setIsAdding(true)}
                                className="mt-4 text-amber-600 text-sm font-semibold hover:underline"
                            >
                                Create the first note
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PlanningNotesBoard;
