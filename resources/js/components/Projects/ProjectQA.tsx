import React, { useState } from 'react';
import axios from 'axios';
import { MessageSquare, Send, User, Edit2, Trash2, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../../context/ToastContext';
import { useAuth, User as AuthUser } from '../../context/AuthContext';
import { Project, ProjectComment } from '../../types/project.types';

interface ProjectQAProps {
    project: Project;
    onRefresh: () => void;
    user?: AuthUser | null;
}

interface ExtendedProjectComment extends ProjectComment {
    content?: string;
}

export default function ProjectQA({ project, onRefresh, user: propUser }: ProjectQAProps) {
    const { user: contextUser } = useAuth();
    const user = propUser !== undefined ? propUser : contextUser;
    const comments = project?.comments || [];
    const [newComment, setNewComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Inline Edit & Delete State
    const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
    const [editingText, setEditingText] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [deletingCommentId, setDeletingCommentId] = useState<number | null>(null);
    
    const { showToast } = useToast();

    const formatDate = (dateStr: string | null | undefined) => {
        if (!dateStr) return 'Recently';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return 'Recently';
        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() || isSubmitting) return;

        setIsSubmitting(true);
        try {
            await axios.post(`/projects/${project.id}/comments`, {
                message: newComment
            });
            setNewComment('');
            showToast('Comment posted successfully', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error?.response?.data?.message || 'Failed to post comment', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };
    const handleEditStart = (comment: ExtendedProjectComment) => {
        setEditingCommentId(comment.id);
        setEditingText(comment.message || comment.content || '');
    };

    const handleEditCancel = () => {
        setEditingCommentId(null);
        setEditingText('');
    };

    const handleEditSave = async (commentId: number) => {
        if (!editingText.trim() || isUpdating) return;
        setIsUpdating(true);
        try {
            await axios.put(`/projects/${project.id}/comments/${commentId}`, {
                message: editingText
            });
            showToast('Comment updated successfully', 'success');
            setEditingCommentId(null);
            setEditingText('');
            onRefresh();
        } catch (error: any) {
            showToast(error?.response?.data?.message || 'Failed to update comment', 'error');
        } finally {
            setIsUpdating(false);
        }
    };

    const handleDeleteClick = (commentId: number) => {
        setDeletingCommentId(commentId);
    };

    const confirmDelete = async (commentId: number) => {
        try {
            await axios.delete(`/projects/${project.id}/comments/${commentId}`);
            showToast('Comment deleted successfully', 'success');
            setDeletingCommentId(null);
            onRefresh();
        } catch (error: any) {
            showToast(error?.response?.data?.message || 'Failed to delete comment', 'error');
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-12">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Project Discussion</h2>
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">Q&A and General Inquiries</p>
                </div>
                <div className="bg-red-50 text-red-600 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-tighter">
                    {comments.length} Messages
                </div>
            </div>

            {/* Comment Input */}
            <form onSubmit={handleSubmit} className="bg-white p-2 pl-5 rounded-[2rem] border border-gray-100 shadow-xl shadow-gray-100/50 flex items-center gap-4">
                <input 
                    type="text" 
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Ask a question or leave a comment..." 
                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium text-gray-900 placeholder:text-gray-400"
                />
                <button 
                    type="submit"
                    disabled={isSubmitting || !newComment.trim()}
                    className="bg-gray-900 text-white p-3.5 rounded-2xl hover:bg-black transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                >
                    <Send size={18} />
                </button>
            </form>

            {/* Comments List */}
            <div className="space-y-4">
                {comments.length === 0 ? (
                    <div className="bg-gray-50/50 rounded-[2.5rem] p-12 text-center border border-dashed border-gray-200">
                        <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-4 text-gray-300">
                            <MessageSquare size={32} />
                        </div>
                        <p className="text-gray-500 font-bold text-sm">No discussions yet.</p>
                        <p className="text-gray-400 text-xs mt-1">Be the first to start a conversation about this project.</p>
                    </div>
                ) : (
                    comments.map((comment: ExtendedProjectComment | null, idx: number) => {
                        if (!comment) return null;
                        const isAuthor = user && comment.user_id === user.id;
                        const isProjectOwner = user && project.user_id === user.id;
                        const canEdit = isAuthor;
                        const canDelete = isAuthor || isProjectOwner;

                        return (
                            <motion.div
                                key={comment.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="bg-white p-6 rounded-[2rem] border border-gray-50 shadow-sm flex gap-5"
                            >
                                <div className="w-12 h-12 rounded-2xl bg-gray-100 flex-shrink-0 flex items-center justify-center text-gray-400 shadow-inner">
                                    <User size={24} />
                                </div>
                                <div className="flex-1 space-y-1">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-sm font-black text-gray-900">{comment.user?.name}</h4>
                                            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">
                                                {formatDate(comment.created_at)}
                                            </span>
                                        </div>

                                        {/* Action Buttons */}
                                        {editingCommentId !== comment.id && (canEdit || canDelete) && (
                                            <div className="flex items-center gap-1 border border-gray-100 rounded-lg p-0.5 bg-gray-50/20 shadow-sm">
                                                {canEdit && (
                                                    <button
                                                        onClick={() => handleEditStart(comment)}
                                                        className="p-1 rounded-md hover:bg-white text-gray-400 hover:text-blue-600 transition-all active:scale-95"
                                                        title="Edit comment"
                                                    >
                                                        <Edit2 size={12} />
                                                    </button>
                                                )}
                                                {canDelete && (
                                                    <button
                                                        onClick={() => handleDeleteClick(comment.id)}
                                                        className="p-1 rounded-md hover:bg-white text-gray-400 hover:text-red-600 transition-all active:scale-95"
                                                        title="Delete comment"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {editingCommentId === comment.id ? (
                                        <div className="mt-2 space-y-2">
                                            <input 
                                                type="text"
                                                value={editingText}
                                                onChange={(e) => setEditingText(e.target.value)}
                                                className="w-full text-sm font-medium text-gray-900 border border-gray-200 focus:border-zinc-900 focus:ring-0 rounded-xl px-3.5 py-2 bg-gray-50/50 shadow-inner"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleEditSave(comment.id);
                                                    if (e.key === 'Escape') handleEditCancel();
                                                }}
                                                autoFocus
                                            />
                                            <div className="flex items-center gap-1.5 justify-end">
                                                <button
                                                    onClick={handleEditCancel}
                                                    disabled={isUpdating}
                                                    className="px-3 py-1.5 rounded-lg border border-gray-100 hover:bg-gray-50 text-xs font-bold text-gray-500 flex items-center gap-1 transition-all active:scale-95"
                                                >
                                                    <X size={12} /> Cancel
                                                </button>
                                                <button
                                                    onClick={() => handleEditSave(comment.id)}
                                                    disabled={isUpdating || !editingText.trim()}
                                                    className="px-3 py-1.5 rounded-lg bg-gray-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1 transition-all active:scale-95 shadow-sm disabled:opacity-50"
                                                >
                                                    <Check size={12} /> Save
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-gray-600 text-sm leading-relaxed font-medium mt-1">
                                            {comment.message || comment.content}
                                        </p>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })
                )}
            </div>

            {/* Custom Premium Deletion Confirmation Modal */}
            <AnimatePresence>
                {deletingCommentId !== null && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-hidden">
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setDeletingCommentId(null)}
                            className="absolute inset-0 bg-neutral-950/40 backdrop-blur-sm cursor-pointer"
                        />
                        
                        {/* Modal Container */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 15 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 15 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                            className="relative z-10 w-full max-w-sm bg-white p-6 rounded-[2rem] border border-gray-100 shadow-2xl space-y-5 text-center mx-4"
                        >
                            {/* Glowing Red Icon */}
                            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto shadow-inner">
                                <Trash2 size={22} className="animate-pulse" />
                            </div>
                            
                            {/* Text Info */}
                            <div className="space-y-1.5">
                                <h4 className="text-base font-black text-gray-900 tracking-tight">Delete Message</h4>
                                <p className="text-gray-500 text-xs leading-relaxed font-semibold">
                                    Are you sure you want to delete this message? This action is permanent and cannot be undone.
                                </p>
                            </div>
                            
                            {/* Action Buttons */}
                            <div className="flex items-center gap-3 pt-1">
                                <button
                                    onClick={() => setDeletingCommentId(null)}
                                    className="flex-1 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-black uppercase tracking-wider text-gray-500 transition-all active:scale-95"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        if (deletingCommentId !== null) {
                                            confirmDelete(deletingCommentId);
                                        }
                                    }}
                                    className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-red-600/10 transition-all active:scale-95"
                                >
                                    Delete
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
