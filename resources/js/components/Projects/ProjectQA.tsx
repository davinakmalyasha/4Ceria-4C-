import React, { useState } from 'react';
import axios from 'axios';
import { MessageSquare, Send, User } from 'lucide-react';
import { motion } from 'framer-motion';

interface ProjectQAProps {
    project: any;
    onRefresh: () => void;
}

export default function ProjectQA({ project, onRefresh }: ProjectQAProps) {
    const comments = project?.comments || [];
    const [newComment, setNewComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() || isSubmitting) return;

        setIsSubmitting(true);
        try {
            await axios.post(`/projects/${project.id}/comments`, {
                content: newComment
            });
            setNewComment('');
            onRefresh();
        } catch (error) {
            console.error('Failed to post comment:', error);
        } finally {
            setIsSubmitting(false);
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
                    comments.map((comment: any, idx: number) => (
                        <motion.div
                            key={comment.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="bg-white p-6 rounded-[2rem] border border-gray-50 shadow-sm flex gap-5"
                        >
                            <div className="w-12 h-12 rounded-2xl bg-gray-100 flex-shrink-0 flex items-center justify-center text-gray-400">
                                <User size={24} />
                            </div>
                            <div className="flex-1 space-y-1">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-black text-gray-900">{comment.user?.name}</h4>
                                    <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">
                                        {new Date(comment.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                                    </span>
                                </div>
                                <p className="text-gray-600 text-sm leading-relaxed font-medium">
                                    {comment.content}
                                </p>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>
        </div>
    );
}
