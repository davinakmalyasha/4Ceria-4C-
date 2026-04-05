import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Project, ProjectComment } from '../../types/project.types';
import { Send, User as UserIcon, Pencil, Trash2, X, Check, Reply } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface Props {
    project: Project;
}

export default function ProjectComments({ project }: Props) {
    const { user } = useAuth();
    const [comments, setComments] = useState<ProjectComment[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editValue, setEditValue] = useState('');
    const [replyingTo, setReplyingTo] = useState<ProjectComment | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchComments = async () => {
            try {
                const res = await axios.get(`/projects/${project.id}/comments`);
                setComments(res.data.data);
            } catch (err) {
                console.error("Failed to load comments");
            }
        };
        fetchComments();
    }, [project.id]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [comments]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || isLoading) return;

        setIsLoading(true);
        try {
            const payload = { message: newMessage, parent_id: replyingTo?.id || null };
            const res = await axios.post(`/projects/${project.id}/comments`, payload);
            setComments([...comments, res.data.data]);
            setNewMessage('');
            setReplyingTo(null);
        } catch (err) {
            console.error('Failed to send comment', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdate = async (id: number) => {
        if (!editValue.trim() || isLoading) return;
        setIsLoading(true);
        try {
            const res = await axios.put(`/projects/${project.id}/comments/${id}`, { message: editValue });
            setComments(prev => prev.map(c => c.id === id ? { ...c, message: res.data.data.message } : c));
            setEditingId(null);
        } catch (err) {
            console.error('Failed to update comment', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this message?')) return;
        try {
            await axios.delete(`/projects/${project.id}/comments/${id}`);
            setComments(prev => prev.filter(c => c.id !== id));
        } catch (err) {
            console.error('Failed to delete comment', err);
        }
    };

    const startEdit = (c: ProjectComment) => {
        setEditingId(c.id);
        setEditValue(c.message);
    };

    return (
        <div className="flex flex-col h-[380px] bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <div>
                    <h3 className="font-bold text-gray-900">Project Q&A</h3>
                    <p className="text-xs text-gray-500">Ask questions before bidding or discuss requirements.</p>
                </div>
                <span className="bg-red-50 text-red-600 text-xs font-bold px-2 py-1 rounded-md">{comments.length} Messages</span>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
                {comments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                        <UserIcon className="w-12 h-12 mb-3 text-gray-200" />
                        <p>No questions yet.<br/>Be the first to start the discussion!</p>
                    </div>
                ) : (
                    comments.map(c => {
                        const isMe = c.user?.id === user?.id;
                        const canDelete = isMe || project.owner_id === user?.id;
                        const isEditing = editingId === c.id;

                        return (
                            <div key={c.id} className={`flex gap-3 group ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-100 to-red-200 flex items-center justify-center shrink-0 border border-red-50">
                                    <span className="text-xs font-bold text-red-600">
                                        {c.user?.name?.charAt(0).toUpperCase() || '?'}
                                    </span>
                                </div>
                                <div className={`flex flex-col max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                                    <div className="flex items-center gap-2 mb-1 px-1">
                                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">
                                            {isMe ? 'You' : c.user?.name} &bull; {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        {!isEditing && (isMe || canDelete || !isMe) && (
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => setReplyingTo(c)} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-[#FF2D20] transition-colors" title="Reply">
                                                    <Reply size={10} />
                                                </button>
                                                {isMe && (
                                                    <button onClick={() => startEdit(c)} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-[#FF2D20] transition-colors">
                                                        <Pencil size={10} />
                                                    </button>
                                                )}
                                                {canDelete && (
                                                    <button onClick={() => handleDelete(c.id)} className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors">
                                                        <Trash2 size={10} />
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    
                                    {isEditing ? (
                                        <div className="w-full min-w-[200px] bg-white border-2 border-red-200 rounded-2xl p-2 shadow-sm">
                                            <textarea 
                                                autoFocus
                                                value={editValue}
                                                onChange={e => setEditValue(e.target.value)}
                                                className="w-full bg-transparent outline-none text-[13.5px] text-gray-800 resize-none px-2 py-1"
                                                rows={2}
                                            />
                                            <div className="flex justify-end gap-1 mt-2">
                                                <button 
                                                    onClick={() => setEditingId(null)}
                                                    className="p-1.5 hover:bg-gray-100 text-gray-400 rounded-lg transition-colors"
                                                    title="Cancel"
                                                >
                                                    <X size={14} />
                                                </button>
                                                <button 
                                                    onClick={() => handleUpdate(c.id)}
                                                    className="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors shadow-sm"
                                                    title="Save"
                                                >
                                                    <Check size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className={`px-4 py-2.5 rounded-2xl text-[13.5px] leading-relaxed shadow-sm border ${
                                            isMe 
                                                ? 'bg-[#FF2D20] text-white rounded-tr-sm border-red-600' 
                                                : 'bg-white text-gray-800 rounded-tl-sm border-gray-100'
                                        }`}>
                                            {c.parent && (
                                                <div className={`mb-2 pl-3 py-1 border-l-2 text-xs opacity-90 rounded-r-md ${isMe ? 'border-red-400 bg-red-600/30' : 'border-gray-300 bg-gray-50'}`}>
                                                    <p className="font-bold mb-0.5">{c.parent.user?.name || 'User'}</p>
                                                    <p className="line-clamp-2 italic">{c.parent.message}</p>
                                                </div>
                                            )}
                                            {c.message}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {replyingTo && (
                <div className="bg-gray-50 px-4 py-2 border-t border-gray-100 flex items-center justify-between shadow-[0_-2px_10px_rgba(0,0,0,0.02)]">
                    <div className="flex-1 overflow-hidden">
                        <p className="text-[10px] font-bold text-[#FF2D20] uppercase tracking-wide">Replying to {replyingTo.user?.name}</p>
                        <p className="text-xs text-gray-500 truncate">{replyingTo.message}</p>
                    </div>
                    <button onClick={() => setReplyingTo(null)} className="p-1 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition-colors shrink-0 ml-2">
                        <X size={14} />
                    </button>
                </div>
            )}

            <form onSubmit={handleSend} className="p-3 bg-white border-t border-gray-100 flex gap-2">
                <input 
                    type="text" 
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder={replyingTo ? "Write your reply..." : "Type your message here..."}
                    className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-full focus:bg-white focus:ring-2 focus:ring-[#FF2D20]/50 outline-none text-[13.5px]"
                />
                <button 
                    type="submit" 
                    disabled={!newMessage.trim() || isLoading}
                    className="w-11 h-11 bg-[#FF2D20] hover:bg-red-700 text-white rounded-full flex items-center justify-center disabled:opacity-50 transition-colors shrink-0"
                >
                    <Send className="w-4 h-4 ml-[-2px]" />
                </button>
            </form>
        </div>
    );
}
