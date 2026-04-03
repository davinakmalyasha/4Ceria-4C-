import React, { useState } from 'react';
import { Search, Image as ImageIcon } from 'lucide-react';
import { Conversation } from '../../types/chat.types';
import { formatDistanceToNow } from 'date-fns';

interface ConversationListProps {
    conversations: Conversation[];
    activeConversation: Conversation | null;
    onSelect: (conv: Conversation) => void;
    isLoading: boolean;
}

export default function ConversationList({ conversations, activeConversation, onSelect, isLoading }: ConversationListProps) {
    const [search, setSearch] = useState('');

    const filtered = conversations.filter(c => 
        c.other_user.name.toLowerCase().includes(search.toLowerCase()) ||
        c.other_user.username.toLowerCase().includes(search.toLowerCase())
    );

    const getPreviewText = (content: string) => {
        if (!content) return '';
        try {
            const parsed = JSON.parse(content);
            if (parsed?.type === 'property_inquiry') {
                return `🏠 ${parsed.inquiry?.mode === 'visit' ? 'Visit Inquiry' : 'Price Offer'}: ${parsed.house?.name}`;
            }
        } catch {
            // raw text
        }
        return content;
    };

    return (
        <div className="flex flex-col h-full bg-white border-r border-gray-100 w-full sm:w-80 shrink-0">
            <div className="p-4 border-b border-gray-100">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Messages</h3>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Search conversations..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-red-500/20"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
                {isLoading && conversations.length === 0 ? (
                    <div className="p-8 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mx-auto"></div>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-sm">
                        No conversations found.
                    </div>
                ) : (
                    filtered.map(conv => (
                        <button
                            key={conv.id}
                            onClick={() => onSelect(conv)}
                            className={`w-full p-4 flex items-center gap-3 transition-colors text-left border-b border-gray-50 ${activeConversation?.id === conv.id ? 'bg-red-50' : 'hover:bg-gray-50'}`}
                        >
                            <div className="relative shrink-0">
                                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold overflow-hidden border border-gray-200">
                                    {conv.other_user.pic ? (
                                        <img src={`/storage/${conv.other_user.pic}`} className="w-full h-full object-cover" />
                                    ) : (
                                        conv.other_user.name.charAt(0).toUpperCase()
                                    )}
                                </div>
                                {conv.unread_count > 0 && (
                                    <div className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
                                        {conv.unread_count}
                                    </div>
                                )}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                    <h4 className="font-bold text-sm text-gray-900 truncate">{conv.other_user.name}</h4>
                                    {conv.last_message_at && (
                                        <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2">
                                            {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: false }).replace('about ', '')}
                                        </span>
                                    )}
                                </div>
                                <p className={`text-xs truncate flex items-center gap-1.5 ${conv.unread_count > 0 ? 'text-gray-900 font-semibold' : 'text-gray-500'}`}>
                                    {conv.last_message ? (
                                        conv.last_message.image_url ? (
                                            <>
                                                <ImageIcon size={12} className="shrink-0 text-red-400" />
                                                <span className="shrink-0">Photo</span>
                                                {conv.last_message.content && <span className="truncate opacity-60">- {getPreviewText(conv.last_message.content)}</span>}
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
