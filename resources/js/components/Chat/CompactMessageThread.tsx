import React, { useEffect, useRef } from 'react';
import { ChatMessage, ChatUser } from '../../types/chat.types';
import { format, isToday, isYesterday } from 'date-fns';

interface Props {
    messages: ChatMessage[];
    currentUser: any;
    otherUser: ChatUser;
    isLoading: boolean;
    hasMoreHistory?: boolean;
    isLoadingEarlier?: boolean;
    onLoadEarlier?: () => void;
}

export default function CompactMessageThread({ messages, currentUser, otherUser, isLoading, hasMoreHistory = false, isLoadingEarlier = false, onLoadEarlier }: Props) {
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const formatMessageDate = (date: Date) => {
        if (isToday(date)) return 'Today';
        if (isYesterday(date)) return 'Yesterday';
        return format(date, 'MMM d, yyyy');
    };

    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/40 scrollbar-thin">
            {isLoading && messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                    <div className="animate-pulse text-gray-400 text-xs font-semibold">Loading chat...</div>
                </div>
            ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-6 bg-white rounded-2xl border border-gray-100">
                    <div className="text-xl mb-2 animate-bounce">👋</div>
                    <h5 className="font-extrabold text-xs text-gray-900">Say hello!</h5>
                    <p className="text-[10px] text-gray-500 mt-0.5">Start a conversation with {otherUser.name}.</p>
                </div>
            ) : (
                <>
                    {hasMoreHistory && onLoadEarlier && (
                        <div className="flex justify-center pb-1">
                            <button
                                onClick={(e) => { e.stopPropagation(); onLoadEarlier(); }}
                                disabled={isLoadingEarlier}
                                className="px-3 py-1 rounded-lg bg-white border border-gray-200 text-[10px] font-bold text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-60"
                            >
                                {isLoadingEarlier ? 'Loading...' : 'Load earlier'}
                            </button>
                        </div>
                    )}
                    {messages.map((msg, idx) => {
                        const isMe = msg.sender_id === currentUser.id;
                        const prevMsg = idx > 0 ? messages[idx - 1] : null;
                        const showDate = !prevMsg || format(new Date(prevMsg.created_at), 'yyyy-MM-dd') !== format(new Date(msg.created_at), 'yyyy-MM-dd');
                        const showAvatar = !prevMsg || prevMsg.sender_id !== msg.sender_id || showDate;

                        return (
                            <div key={msg.id} className="space-y-3">
                            {showDate && (
                                <div className="flex justify-center my-4">
                                    <span className="px-2.5 py-0.5 rounded-full bg-white border border-gray-100 text-[9px] font-black text-gray-400 uppercase tracking-wider shadow-xs">
                                        {formatMessageDate(new Date(msg.created_at))}
                                    </span>
                                </div>
                            )}
                            
                            <div className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                {!isMe && (
                                    <div className={`w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold shrink-0 overflow-hidden border border-gray-200 ${showAvatar ? 'opacity-100' : 'opacity-0'}`}>
                                        {otherUser.pic ? <img src={`/storage/${otherUser.pic}`} className="w-full h-full object-cover" /> : otherUser.name.charAt(0)}
                                    </div>
                                )}
                                
                                <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[80%]`}>
                                    <div className={`rounded-2xl px-3 py-1.5 text-xs shadow-xs ${
                                        isMe 
                                            ? 'bg-zinc-900 text-white rounded-br-none' 
                                            : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'
                                    }`}>
                                        {msg.image_url && (
                                            <div onClick={() => window.open(msg.image_url, '_blank')} className="cursor-pointer mb-1 hover:opacity-90">
                                                <img src={msg.image_url} className="max-w-full max-h-40 rounded-lg object-contain bg-gray-50" />
                                            </div>
                                        )}
                                        {msg.content && <p className="leading-relaxed break-words whitespace-pre-wrap">{
                                            msg.content.startsWith('{') ? '🏠 Property inquiry message' : msg.content
                                        }</p>}
                                    </div>
                                    <span className="text-[8px] text-gray-400 mt-0.5 mx-1 font-bold select-none">
                                        {format(new Date(msg.created_at), 'HH:mm')}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                    })}
                </>
            )}
            <div ref={endRef} />
        </div>
    );
}
