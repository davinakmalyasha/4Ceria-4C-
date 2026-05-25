import React, { useState } from 'react';
import { Search, Image as ImageIcon } from 'lucide-react';
import { Conversation } from '../../types/chat.types';
import { formatDistanceToNow } from 'date-fns';

interface Props {
    conversations: Conversation[];
    onSelect: (conv: Conversation) => void;
    isLoading: boolean;
}

export default function CompactConversationList({ conversations, onSelect, isLoading }: Props) {
    const [search, setSearch] = useState('');

    const filtered = conversations.filter(c => 
        c.other_user.name.toLowerCase().includes(search.toLowerCase())
    );

    const getPreviewText = (content: string) => {
        if (!content) return '';
        try {
            const parsed = JSON.parse(content);
            if (parsed?.type === 'property_inquiry') {
                return `🏠 ${parsed.inquiry?.mode === 'visit' ? 'Visit Inquiry' : 'Price Offer'}`;
            }
        } catch {}
        return content;
    };

    return (
        <div className="flex flex-col h-full bg-white w-full">
            <div className="p-3 border-b border-gray-100 shrink-0">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Search chats..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border-none rounded-xl text-xs focus:ring-2 focus:ring-red-500/20 text-gray-800 font-medium"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin">
                {isLoading && conversations.length === 0 ? (
                    <div className="p-6 text-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-500 mx-auto"></div>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-xs font-medium">
                        No messages yet.
                    </div>
                ) : (
                    filtered.map(conv => (
                        <button
                            key={conv.id}
                            onClick={() => onSelect(conv)}
                            className="w-full p-3 flex items-center gap-3 transition-colors text-left border-b border-gray-50 hover:bg-gray-50/60"
                        >
                            <div className="relative shrink-0">
                                <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold overflow-hidden border border-gray-200 text-xs">
                                    {conv.other_user.pic ? (
                                        <img src={`/storage/${conv.other_user.pic}`} className="w-full h-full object-cover" />
                                    ) : (
                                        conv.other_user.name.charAt(0).toUpperCase()
                                    )}
                                </div>
                                {conv.unread_count > 0 && (
                                    <div className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[8px] font-black flex items-center justify-center border border-white">
                                        {conv.unread_count}
                                    </div>
                                )}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                    <h4 className="font-extrabold text-xs text-gray-900 truncate">{conv.other_user.name}</h4>
                                    {conv.last_message_at && (
                                        <span className="text-[9px] text-gray-450 font-bold whitespace-nowrap ml-2">
                                            {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: false }).replace('about ', '')}
                                        </span>
                                    )}
                                </div>
                                <p className={`text-[11px] truncate flex items-center gap-1 ${conv.unread_count > 0 ? 'text-gray-900 font-extrabold' : 'text-gray-400 font-medium'}`}>
                                    {conv.last_message ? (
                                        conv.last_message.image_url ? (
                                            <>
                                                <ImageIcon size={10} className="shrink-0 text-red-400" />
                                                <span className="shrink-0 font-bold">Photo</span>
                                                {conv.last_message.content && <span className="truncate opacity-75">- {getPreviewText(conv.last_message.content)}</span>}
                                            </>
                                        ) : (
                                            getPreviewText(conv.last_message.content)
                                        )
                                    ) : (
                                        'Started a conversation'
                                    )}
                                </p>
                            </div>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
