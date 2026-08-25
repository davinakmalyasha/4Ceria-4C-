import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, ArrowLeft, Maximize2 } from 'lucide-react';
import { useChat } from '../../hooks/useChat';
import { useAuth } from '../../context/AuthContext';
import CompactConversationList from './CompactConversationList';
import CompactMessageThread from './CompactMessageThread';
import ChatInput from './ChatInput';

interface ChatOverlayProps {
    onMaximize: () => void;
    activeTab: string;
}

export default function ChatOverlay({ onMaximize, activeTab }: ChatOverlayProps) {
    const [isOpen, setIsOpen] = useState(false);
    const { user } = useAuth();

    const {
        conversations,
        activeConversation,
        setActiveConversation,
        messages,
        isLoadingConv,
        isLoadingMessages,
        isSending,
        sendMessage,
        hasMoreHistory,
        isLoadingEarlier,
        loadEarlierMessages,
    } = useChat();

    // Hide overlay for guests or if the user is already on the full chat tab
    if (!user || activeTab === 'chat') return null;

    const totalUnread = conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);

    return createPortal(
        <div className="fixed bottom-6 right-6 z-[120] font-sans">
            {/* Floating Action Button (FAB) */}
            <motion.button
                onClick={() => setIsOpen(!isOpen)}
                className="w-14 h-14 bg-zinc-900 text-white rounded-full flex items-center justify-center shadow-[0_10px_30px_rgba(0,0,0,0.25)] hover:bg-black transition-colors relative border border-white/10"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
            >
                {isOpen ? <X size={22} className="stroke-[2.5px]" /> : <MessageSquare size={22} className="stroke-[2.5px]" />}
                {totalUnread > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-white shadow-md">
                        {totalUnread}
                    </span>
                )}
            </motion.button>

            {/* Chat Floating Window */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 30, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 30, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="absolute bottom-[72px] right-0 w-[360px] sm:w-[420px] h-[520px] bg-white rounded-3xl border border-gray-100 shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col z-[130]"
                    >
                        {/* Header */}
                        <div className="h-14 border-b border-gray-100 flex items-center justify-between px-4 bg-zinc-900 text-white shrink-0">
                            <div className="flex items-center gap-2 min-w-0">
                                {activeConversation ? (
                                    <>
                                        <button 
                                            onClick={() => setActiveConversation(null)} 
                                            className="p-1 hover:bg-white/10 rounded-lg transition-colors text-white"
                                        >
                                            <ArrowLeft size={16} />
                                        </button>
                                        <span className="font-extrabold text-xs sm:text-sm truncate">{activeConversation.other_user.name}</span>
                                    </>
                               ) : (
                                    <span className="font-extrabold text-xs sm:text-sm tracking-tight flex items-center gap-2">
                                        <MessageSquare size={16} />
                                        Chat Messenger
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <button 
                                    onClick={() => { setIsOpen(false); onMaximize(); }}
                                    title="Open Full Page Chat"
                                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white"
                                >
                                    <Maximize2 size={13} />
                                </button>
                                <button 
                                    onClick={() => setIsOpen(false)} 
                                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white"
                                >
                                    <X size={13} />
                                </button>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 flex flex-col min-h-0 bg-white relative">
                            {activeConversation ? (
                                <>
                                    <CompactMessageThread
                                        messages={messages}
                                        currentUser={user}
                                        otherUser={activeConversation.other_user}
                                        isLoading={isLoadingMessages}
                                        hasMoreHistory={hasMoreHistory}
                                        isLoadingEarlier={isLoadingEarlier}
                                        onLoadEarlier={loadEarlierMessages}
                                    />
                                    <ChatInput 
                                        key={activeConversation.id} 
                                        onSend={sendMessage} 
                                        isDisabled={isSending} 
                                    />
                                </>
                            ) : (
                                <CompactConversationList 
                                    conversations={conversations} 
                                    onSelect={setActiveConversation} 
                                    isLoading={isLoadingConv}
                                />
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>,
        document.body
    );
}
