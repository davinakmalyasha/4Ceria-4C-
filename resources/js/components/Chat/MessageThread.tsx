import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage, ChatUser } from '../../types/chat.types';
import { format, isToday, isYesterday } from 'date-fns';
import { Home, MapPin, Calendar, Clock, DollarSign, ExternalLink } from 'lucide-react';
import { formatCurrency } from '../../types/explore';

interface MessageThreadProps {
    messages: ChatMessage[];
    currentUser: any;
    otherUser: ChatUser;
    isLoading: boolean;
    hasMoreHistory?: boolean;
    isLoadingEarlier?: boolean;
    onLoadEarlier?: () => void;
}

export default function MessageThread({ messages, currentUser, otherUser, isLoading, hasMoreHistory = false, isLoadingEarlier = false, onLoadEarlier }: MessageThreadProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const endRef = useRef<HTMLDivElement>(null);
    const [renderLimit, setRenderLimit] = useState(100);

    const visibleMessages = messages.slice(-renderLimit);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Check if user is already near bottom (within 150px)
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
        
        // Also check if the last message was sent by the current user (in which case we always scroll to bottom)
        const lastMsg = messages[messages.length - 1];
        const isMe = lastMsg && lastMsg.sender_id === currentUser?.id;

        if (isNearBottom || isMe) {
            endRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, currentUser?.id]);

    const formatMessageDate = (date: Date) => {
        if (isToday(date)) return 'Today';
        if (isYesterday(date)) return 'Yesterday';
        return format(date, 'MMM d, yyyy');
    };

    return (
        <div ref={containerRef} className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin bg-gray-50/50">
            {isLoading && messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                    <div className="animate-pulse text-gray-400 text-sm font-medium">Loading messages...</div>
                </div>
            ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4 max-w-sm mx-auto p-8 bg-white rounded-3xl border border-gray-100 shadow-sm">
                    <div className="w-16 h-16 rounded-3xl bg-red-50 text-red-500 flex items-center justify-center text-2xl animate-bounce">
                        👋
                    </div>
                    <div>
                        <h4 className="font-bold text-gray-900">Say hello!</h4>
                        <p className="text-sm text-gray-500">Start a conversation with {otherUser.name}.</p>
                    </div>
                </div>
            ) : (
                <>
                    {/* B12: fetch older pages from the server when the
                        initial 50-message window has more history. */}
                    {hasMoreHistory && onLoadEarlier && (
                        <div className="flex justify-center pb-2 shrink-0">
                            <button
                                onClick={(e) => { e.stopPropagation(); onLoadEarlier(); }}
                                disabled={isLoadingEarlier}
                                className="px-3.5 py-1.5 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-500 hover:text-gray-900 transition-colors shadow-sm disabled:opacity-60"
                            >
                                {isLoadingEarlier ? 'Loading...' : 'Load earlier messages'}
                            </button>
                        </div>
                    )}
                    {messages.length > renderLimit && (
                        <div className="flex justify-center py-2 shrink-0">
                            <button 
                                onClick={(e) => { e.stopPropagation(); setRenderLimit(prev => prev + 100); }}
                                className="px-3.5 py-1.5 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-500 hover:text-gray-900 transition-colors shadow-sm"
                            >
                                Load older messages ({messages.length - renderLimit} remaining)
                            </button>
                        </div>
                    )}
                    {visibleMessages.map((msg, idx) => {
                        const isMe = msg.sender_id === currentUser.id;
                        const prevMsg = idx > 0 ? visibleMessages[idx - 1] : null;
                        const showDate = !prevMsg || format(new Date(prevMsg.created_at), 'yyyy-MM-dd') !== format(new Date(msg.created_at), 'yyyy-MM-dd');
                        const showAvatar = !prevMsg || prevMsg.sender_id !== msg.sender_id || showDate;

                        let parsedJSON: any = null;
                        if (msg.content) {
                            try { parsedJSON = JSON.parse(msg.content); } catch (e) { /* not json */ }
                        }
                        const isPropertyInquiry = parsedJSON && parsedJSON.type === 'property_inquiry';

                        return (
                            <div key={msg.id} className="space-y-4">
                                {showDate && (
                                    <div className="flex justify-center my-6">
                                        <span className="px-3 py-1 rounded-full bg-white border border-gray-100 text-[10px] uppercase font-bold text-gray-400 tracking-wider shadow-sm">
                                            {formatMessageDate(new Date(msg.created_at))}
                                        </span>
                                    </div>
                                )}
                                
                                <div className={`flex items-end gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                    {!isMe && (
                                        <div className={`w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden border border-gray-200 transition-opacity ${showAvatar ? 'opacity-100' : 'opacity-0'}`}>
                                            {otherUser.pic ? <img src={`/storage/${otherUser.pic}`} className="w-full h-full object-cover" /> : otherUser.name.charAt(0)}
                                        </div>
                                    )}
                                    
                                    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[75%] sm:max-w-[85%]`}>
                                        <div className={`overflow-hidden rounded-2xl shadow-sm transition-all hover:shadow-md ${isMe ? 'bg-red-500 text-white rounded-br-none' : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'}`}>
                                            {msg.image_url && (
                                                <div 
                                                    className="cursor-pointer hover:opacity-95 transition-opacity"
                                                    onClick={() => msg.image_url && window.open(msg.image_url, '_blank')}
                                                >
                                                    <img 
                                                        src={msg.image_url} 
                                                        className="max-w-full max-h-[300px] object-contain block bg-black/5" 
                                                        alt="Attached"
                                                    />
                                                </div>
                                            )}
                                            {msg.content && (
                                                isPropertyInquiry ? (
                                                    <div 
                                                        onClick={() => window.dispatchEvent(new CustomEvent('openHouseDetails', { detail: parsedJSON.house.id }))}
                                                        className="cursor-pointer group flex flex-col w-[260px] sm:w-[320px] transition-transform active:scale-[0.98] rounded-2xl overflow-hidden"
                                                    >
                                                        <div className={`p-3 text-center border-b font-bold tracking-tight text-[13px] ${isMe ? 'bg-black/10 text-white border-white/10' : 'bg-gray-50 text-gray-800 border-gray-100'}`}>
                                                            {parsedJSON.inquiry.mode === 'visit' 
                                                                ? (isMe ? 'You requested a property visit' : '📅 New property visit request!')
                                                                : (isMe ? 'You submitted a price offer' : '💡 New price offer received!')}
                                                        </div>
                                                        <div className="w-full h-32 relative bg-black/10 overflow-hidden flex items-center justify-center">
                                                            {parsedJSON.house.image ? (
                                                                <img src={`/storage/${parsedJSON.house.image}`} className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-90 transition-transform duration-500 group-hover:scale-110" />
                                                            ) : (
                                                                <Home size={32} className="opacity-20" />
                                                            )}
                                                            <div className="absolute top-3 right-3 bg-white/20 backdrop-blur-md text-white border border-white/20 shadow-sm text-[10px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider flex items-center gap-1.5">
                                                                <Home size={12} fill="currentColor" /> {parsedJSON.inquiry.mode === 'visit' ? 'Visit Inquiry' : 'Price Offer'}
                                                            </div>
                                                            <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />
                                                            <div className="absolute bottom-3 left-3 right-3 text-white">
                                                                <h5 className="font-extrabold text-sm line-clamp-1 drop-shadow-sm">{parsedJSON.house.name}</h5>
                                                                <div className="flex items-center gap-2 mt-0.5 text-white/90">
                                                                    <span className="text-xs font-bold drop-shadow-sm">{formatCurrency(parsedJSON.house.price)}</span>
                                                                    {parsedJSON.house.city && <span className="text-[10px] flex items-center gap-0.5 drop-shadow-sm"><MapPin size={10} /> {parsedJSON.house.city}</span>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="p-3.5 space-y-3 flex-1 text-[12.5px]">
                                                            {parsedJSON.inquiry.mode === 'offer' && parsedJSON.inquiry.offerPrice && (
                                                                <div className="flex items-start gap-2">
                                                                    <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isMe ? 'bg-white/10 text-white' : 'bg-red-50 text-red-500'}`}>
                                                                        <DollarSign size={12} />
                                                                    </div>
                                                                    <div>
                                                                        <span className={`block text-[10px] font-bold uppercase tracking-wider ${isMe ? 'text-white/70' : 'text-gray-400'}`}>My Offer</span>
                                                                        <span className="font-bold text-sm tracking-tight">{Number(parsedJSON.inquiry.offerPrice).toLocaleString('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            <div className="flex items-start gap-2">
                                                                <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isMe ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                                                    <Calendar size={12} />
                                                                </div>
                                                                <div>
                                                                    <span className={`block text-[10px] font-bold uppercase tracking-wider ${isMe ? 'text-white/70' : 'text-gray-400'}`}>Preferred Date</span>
                                                                    <span className="font-medium">{parsedJSON.inquiry.date} at {parsedJSON.inquiry.time}</span>
                                                                </div>
                                                            </div>
                                                            {parsedJSON.inquiry.message && (
                                                                <div className={`mt-3 pt-3 border-t ${isMe ? 'border-white/20' : 'border-gray-100'}`}>
                                                                    <span className={`block mb-1.5 text-[10px] font-bold uppercase tracking-wider ${isMe ? 'text-white/70' : 'text-gray-400'}`}>Attached NOTE</span>
                                                                    <p className={`text-[12.5px] leading-relaxed italic border-l-2 pl-2 ${isMe ? 'border-white/30 text-white/90' : 'border-gray-200 text-gray-600'}`}>{parsedJSON.inquiry.message}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap">
                                                        {msg.content}
                                                    </div>
                                                )
                                            )}
                                        </div>
                                        <span className="text-[10px] text-gray-400 mt-1 mx-1 font-medium select-none">
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
