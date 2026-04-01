import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Project, ProjectComment } from '../../types/project.types';
import { Send, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface Props {
    project: Project;
}

export default function ProjectComments({ project }: Props) {
    const { user } = useAuth();
    const [comments, setComments] = useState<ProjectComment[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
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
            const res = await axios.post(`/projects/${project.id}/comments`, { message: newMessage });
            setComments([...comments, res.data.data]);
            setNewMessage('');
        } catch (err) {
            console.error('Failed to send comment', err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[500px] bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
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
                        return (
                            <div key={c.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center shrink-0">
                                    <span className="text-xs font-bold text-gray-600">
                                        {c.user?.name?.charAt(0).toUpperCase() || '?'}
                                    </span>
                                </div>
                                <div className={`flex flex-col max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                                    <span className="text-[10px] text-gray-400 font-semibold mb-1 px-1">
                                        {isMe ? 'You' : c.user?.name} &bull; {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <div className={`px-4 py-2.5 rounded-2xl text-[13.5px] leading-relaxed ${isMe ? 'bg-[#FF2D20] text-white rounded-tr-sm' : 'bg-gray-100 text-gray-800 rounded-tl-sm'}`}>
                                        {c.message}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <form onSubmit={handleSend} className="p-3 bg-white border-t border-gray-100 flex gap-2">
                <input 
                    type="text" 
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder="Type your message here..."
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
