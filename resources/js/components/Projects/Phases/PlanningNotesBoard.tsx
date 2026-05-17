import React, { useState, useRef } from 'react';
import { Plus, X, Image as ImageIcon, Trash2, StickyNote, Pencil, Loader2, MessageSquarePlus, Send, User } from 'lucide-react';
import { Project, PlanningRequirement, PlanningRequirementFeedback } from '../../../types/project.types';
import axios from 'axios';
import { useToast } from '../../../context/ToastContext';
import { useAuth } from '../../../context/AuthContext';

interface PlanningNotesBoardProps {
    project: Project;
    isArchitect: boolean;
    onProjectUpdate: (updatedProject: Project) => void;
}

const PlanningNotesBoard: React.FC<PlanningNotesBoardProps> = ({ project, isArchitect, onProjectUpdate }) => {
    const { showToast } = useToast();
    const { user } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const editFileInputRef = useRef<HTMLInputElement>(null);
    
    const [isAdding, setIsAdding] = useState(false);
    const [newNote, setNewNote] = useState<{ title: string; description: string; image_url?: string }>({ 
        title: '', 
        description: '',
        image_url: undefined
    });
    
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<{ title: string; description: string; image_url?: string }>({ 
        title: '', 
        description: '',
        image_url: undefined
    });

    const [feedbackInputId, setFeedbackInputId] = useState<string | null>(null);
    const [feedbackContent, setFeedbackContent] = useState('');

    const isPM = user?.id === project.pm_id;
    const isOwner = user?.id === project.user_id;
    const canAddFeedback = isPM || isOwner;

    const isReadOnly = project.planning_status === 'proposed' || project.planning_status === 'approved';
    const canEdit = isArchitect && !isReadOnly;

    const requirements = project.design_details?.requirements || [];

    const handleFileUpload = async (file: File, isEdit: boolean = false) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', 'design_briefs');

        setIsUploading(true);
        try {
            const response = await axios.post('/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            
            if (isEdit) {
                setEditForm(prev => ({ ...prev, image_url: response.data.url }));
            } else {
                setNewNote(prev => ({ ...prev, image_url: response.data.url }));
            }
            showToast('Image uploaded', 'success');
        } catch (error) {
            showToast('Failed to upload image', 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const handleAddNote = async () => {
        if (!newNote.title.trim()) {
            showToast('Title is required', 'error');
            return;
        }

        setIsSaving(true);
        
        const generatedId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
            ? crypto.randomUUID() 
            : `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const note: PlanningRequirement = {
            id: generatedId,
            title: newNote.title,
            description: newNote.description,
            image_url: newNote.image_url,
            feedback: []
        };

        const updatedRequirements = [...requirements, note];
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
            setNewNote({ title: '', description: '', image_url: undefined });
            setIsAdding(false);
            showToast('Note added & saved', 'success');
        } catch (error: any) {
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
        setEditForm({ 
            title: note.title, 
            description: note.description,
            image_url: note.image_url 
        });
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
                ? { ...n, title: editForm.title, description: editForm.description, image_url: editForm.image_url, is_edited: true } 
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
            const msg = error.response?.data?.message || error.message || 'Failed to update note';
            showToast(msg, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddFeedback = async (requirementId: string) => {
        if (!feedbackContent.trim()) return;

        setIsSaving(true);
        const newFeedback: PlanningRequirementFeedback = {
            id: Math.random().toString(36).substr(2, 9),
            author_id: user?.id || 0,
            author_name: user?.name || 'Anonymous',
            author_role: user?.role_type || 'user',
            content: feedbackContent,
            created_at: new Date().toISOString()
        };

        const updatedRequirements = requirements.map(req => {
            if (req.id === requirementId) {
                return {
                    ...req,
                    feedback: [...(req.feedback || []), newFeedback]
                };
            }
            return req;
        });

        const updatedDesignDetails = {
            ...(project.design_details || {}),
            requirements: updatedRequirements
        };

        try {
            const response = await axios.post(`/projects/${project.id}/update`, {
                design_details: updatedDesignDetails
            });
            onProjectUpdate(response.data.data);
            setFeedbackContent('');
            setFeedbackInputId(null);
            showToast('Feedback added', 'success');
        } catch (error: any) {
            showToast('Failed to add feedback', 'error');
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

                        {newNote.image_url ? (
                            <div className="relative group/img rounded-xl overflow-hidden border border-amber-100 bg-white">
                                <img src={newNote.image_url} alt="Preview" className="w-full h-32 object-cover" />
                                <button 
                                    onClick={() => setNewNote(prev => ({ ...prev, image_url: undefined }))}
                                    className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover/img:opacity-100 transition-opacity"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ) : (
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                                className="flex items-center justify-center gap-2 py-4 border-2 border-dashed border-amber-100 rounded-xl text-amber-600 hover:bg-white transition-colors text-xs font-medium"
                            >
                                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                                {isUploading ? 'Uploading...' : 'Add Image Reference'}
                            </button>
                        )}
                        <input 
                            type="file" 
                            className="hidden" 
                            ref={fileInputRef} 
                            accept="image/*"
                            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
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
                                disabled={isSaving || isUploading}
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
                        className={`group p-5 rounded-2xl bg-white border ${editingId === note.id ? 'border-amber-400 ring-2 ring-amber-100' : 'border-zinc-200'} shadow-sm hover:shadow-md hover:border-amber-200 transition-all duration-300 relative flex flex-col`}
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

                                {editForm.image_url ? (
                                    <div className="relative group/img rounded-xl overflow-hidden border border-zinc-100 bg-zinc-50">
                                        <img src={editForm.image_url} alt="Preview" className="w-full h-32 object-cover" />
                                        <button 
                                            onClick={() => setEditForm(prev => ({ ...prev, image_url: undefined }))}
                                            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover/img:opacity-100 transition-opacity"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => editFileInputRef.current?.click()}
                                        className="flex items-center justify-center gap-2 py-4 border-2 border-dashed border-zinc-100 rounded-xl text-zinc-400 hover:text-amber-600 hover:border-amber-100 transition-colors text-xs font-medium"
                                    >
                                        <ImageIcon className="w-4 h-4" />
                                        Add Image Reference
                                    </button>
                                )}
                                <input 
                                    type="file" 
                                    className="hidden" 
                                    ref={editFileInputRef} 
                                    accept="image/*"
                                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], true)}
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
                                        disabled={isSaving || isUploading}
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
                                    <div className="flex items-center gap-1">
                                        {canAddFeedback && (
                                            <button
                                                onClick={() => setFeedbackInputId(feedbackInputId === note.id ? null : note.id)}
                                                className={`p-1 transition-all ${feedbackInputId === note.id ? 'text-amber-600' : 'opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-amber-600'}`}
                                                title="Add Feedback"
                                            >
                                                <MessageSquarePlus className="w-4 h-4" />
                                            </button>
                                        )}
                                        {canEdit && (
                                            <>
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
                                            </>
                                        )}
                                    </div>
                                </div>
                                
                                <p className="text-sm text-zinc-600 leading-relaxed whitespace-pre-wrap mb-4">
                                    {note.description}
                                </p>

                                {note.image_url && (
                                    <div className="mb-4 rounded-xl overflow-hidden border border-zinc-100 shadow-sm">
                                        <img src={note.image_url} alt={note.title} className="w-full h-40 object-cover hover:scale-105 transition-transform duration-500 cursor-zoom-in" />
                                    </div>
                                )}

                                {/* Feedback Section */}
                                <div className="mt-auto space-y-2">
                                    {note.feedback?.map((f) => (
                                        <div key={f.id} className={`p-3 rounded-xl text-xs flex flex-col gap-1 border ${f.author_role === 'project_manager' ? 'bg-zinc-900 text-white border-zinc-800' : 'bg-amber-50 text-amber-900 border-amber-100'}`}>
                                            <div className="flex items-center gap-1.5 opacity-80 font-bold uppercase tracking-tighter">
                                                <User className="w-3 h-3" />
                                                {f.author_role.replace('_', ' ')}: {f.author_name}
                                            </div>
                                            <p className="leading-tight">{f.content}</p>
                                        </div>
                                    ))}

                                    {feedbackInputId === note.id && (
                                        <div className="flex gap-2 animate-in fade-in slide-in-from-bottom-2">
                                            <input 
                                                autoFocus
                                                placeholder="Add audit note..."
                                                className="flex-1 bg-zinc-100 border-none rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-amber-500"
                                                value={feedbackContent}
                                                onChange={(e) => setFeedbackContent(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleAddFeedback(note.id)}
                                            />
                                            <button 
                                                onClick={() => handleAddFeedback(note.id)}
                                                disabled={isSaving || !feedbackContent.trim()}
                                                className="p-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
                                            >
                                                <Send className="w-3 h-3" />
                                            </button>
                                        </div>
                                    )}
                                </div>
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
