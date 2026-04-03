import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Conversation, ChatMessage } from '../types/chat.types';

export function useChat() {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoadingConv, setIsLoadingConv] = useState(false);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [isSending, setIsSending] = useState(false);
    
    const pollingInterval = useRef<any>(null);

    const fetchConversations = useCallback(async () => {
        setIsLoadingConv(true);
        try {
            const res = await axios.get('/conversations');
            setConversations(res.data.data);
        } catch (err) {
            console.error('Failed to fetch conversations', err);
        } finally {
            setIsLoadingConv(false);
        }
    }, []);

    const fetchMessages = useCallback(async (conversationId: number) => {
        setIsLoadingMessages(true);
        try {
            const res = await axios.get(`/conversations/${conversationId}`);
            setMessages(res.data.data);
            
            // Mark as read locally in conversations list
            setConversations(prev => prev.map(c => 
                c.id === conversationId ? { ...c, unread_count: 0 } : c
            ));
        } catch (err) {
            console.error('Failed to fetch messages', err);
        } finally {
            setIsLoadingMessages(false);
        }
    }, []);

    const sendMessage = async (content: string, imageFile?: File | null) => {
        if (!activeConversation || (!content.trim() && !imageFile)) return;
        
        setIsSending(true);
        try {
            const formData = new FormData();
            if (content.trim()) formData.append('content', content.trim());
            if (imageFile) formData.append('image', imageFile);

            const res = await axios.post(`/conversations/${activeConversation.id}/messages`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            const newMsg = res.data.data;
            setMessages(prev => [...prev, newMsg]);
            
            // Update last message in conversations list
            setConversations(prev => prev.map(c => 
                c.id === activeConversation.id ? { ...c, last_message: newMsg, last_message_at: newMsg.created_at } : c
            ).sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()));
            
        } catch (err) {
            console.error('Failed to send message', err);
            alert('Failed to send message. Please try again.');
        } finally {
            setIsSending(false);
        }
    };

    const startConversation = async (userId: number) => {
        try {
            const res = await axios.post('/conversations', { user_id: userId });
            const conversationId = res.data.data;
            
            // Fetch conversations again to get the new one in the list
            await fetchConversations();
            
            // Find and set the active conversation
            const found = conversations.find(c => c.id === conversationId);
            if (found) {
                setActiveConversation(found);
            } else {
                // If not found in current list (rare since we just fetched), we might need to fetch it specifically or just wait for the state to update
                const refreshedRes = await axios.get('/conversations');
                const newFound = (refreshedRes.data.data as Conversation[]).find(c => c.id === conversationId);
                if (newFound) setActiveConversation(newFound);
            }
        } catch (err) {
            console.error('Failed to start conversation', err);
        }
    };

    useEffect(() => {
        fetchConversations();
        
        // Poll for new messages/conversations every 5 seconds
        pollingInterval.current = setInterval(() => {
            fetchConversations();
            if (activeConversation) {
                // Only fetch messages if tab is focused or implement more smart polling
                axios.get(`/conversations/${activeConversation.id}`).then(res => {
                    setMessages(res.data.data);
                }).catch(() => {});
            }
        }, 5000);

        return () => {
            if (pollingInterval.current) clearInterval(pollingInterval.current);
        };
    }, [fetchConversations, activeConversation?.id]);

    useEffect(() => {
        if (activeConversation) {
            fetchMessages(activeConversation.id);
        }
    }, [activeConversation, fetchMessages]);

    return {
        conversations,
        activeConversation,
        setActiveConversation,
        messages,
        isLoadingConv,
        isLoadingMessages,
        isSending,
        sendMessage,
        startConversation,
        refreshConversations: fetchConversations
    };
}
