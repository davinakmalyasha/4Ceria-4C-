import React from 'react';
import ConversationList from './ConversationList';
import MessageThread from './MessageThread';
import ChatInput from './ChatInput';
import { useChat } from '../../hooks/useChat';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, User as UserIcon, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChatTabProps {
    initialUserId?: number | null;
    onClearInitialUser?: () => void;
}

export default function ChatTab({ initialUserId, onClearInitialUser }: ChatTabProps) {
    const {
        conversations,
        activeConversation,
        setActiveConversation,
        messages,
        isLoadingConv,
        isLoadingMessages,
        isSending,
        sendMessage,
        startConversation,
        hasMoreHistory,
        isLoadingEarlier,
        loadEarlierMessages
    } = useChat();
    const { user } = useAuth();

    React.useEffect(() => {
        if (initialUserId) {
            startConversation(initialUserId);
            onClearInitialUser?.();
        }
    }, [initialUserId, startConversation, onClearInitialUser]);

    return (
        <div className="flex bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden h-[calc(100vh-160px)] min-h-[500px]">
            {/* Conversation list - Hidden on mobile if a conversation is active */}
            <div className={`w-full sm:w-auto h-full ${activeConversation ? 'hidden sm:block' : 'block'}`}>
                <ConversationList 
                    conversations={conversations} 
                    activeConversation={activeConversation} 
                    onSelect={setActiveConversation} 
                    isLoading={isLoadingConv}
                />
            </div>

            {/* Chat Area */}
            <div className={`flex-1 flex flex-col h-full bg-white relative ${!activeConversation ? 'hidden sm:flex' : 'flex'}`}>
                {activeConversation ? (
                    <>
                        {/* Chat Header */}
                        <div className="h-16 border-b border-gray-100 flex items-center justify-between px-6 shrink-0 bg-white/80 backdrop-blur-md z-10 sticky top-0">
                            <div className="flex items-center gap-4">
                                <button 
                                    onClick={() => setActiveConversation(null)}
                                    className="p-2 -ml-2 hover:bg-gray-50 rounded-full sm:hidden transition-colors"
                                >
                                    <ArrowLeft size={18} className="text-gray-500" />
                                </button>
                                
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold border border-red-200 overflow-hidden">
                                        {activeConversation.other_user.pic ? (
                                            <img src={`/storage/${activeConversation.other_user.pic}`} className="w-full h-full object-cover" />
                                        ) : (
                                            activeConversation.other_user.name.charAt(0).toUpperCase()
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-bold text-gray-900 leading-tight truncate">{activeConversation.other_user.name}</h4>
                                    </div>
                                </div>
                            </div>
                            
                        </div>

                        {/* Messages */}
                        <MessageThread
                            messages={messages}
                            currentUser={user}
                            otherUser={activeConversation.other_user}
                            isLoading={isLoadingMessages}
                            hasMoreHistory={hasMoreHistory}
                            isLoadingEarlier={isLoadingEarlier}
                            onLoadEarlier={loadEarlierMessages}
                        />

                        {/* Input */}
                        <ChatInput key={activeConversation.id} onSend={sendMessage} isDisabled={isSending} />
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-gray-50/30">
                        <div className="w-24 h-24 rounded-[40px] bg-red-50 flex items-center justify-center mb-6 shadow-xl shadow-red-200/20">
                            <MessageSquare className="w-10 h-10 text-red-500" />
                        </div>
                        <h3 className="text-2xl font-black text-gray-900 mb-2">Private Messages</h3>
                        <p className="text-gray-500 max-w-xs mx-auto text-[13.5px] leading-relaxed">
                            Connect with homeowners, architects, and constructors to discuss project details and milestones. Click on a conversation to start chatting.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
