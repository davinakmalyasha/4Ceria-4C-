import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Conversation, ChatMessage } from '../types/chat.types';
import { useToast } from '../context/ToastContext';

// PERF: ChatOverlay AND ChatTab each mount useChat on the dashboard — two
// independent 5s pollers doubled the chattiest traffic. This module-level
// timer drives ALL subscribers from ONE interval and is cleaned up when the
// last consumer unmounts.
type PollListener = () => void;
const chatPollListeners = new Set<PollListener>();
let sharedPollTimer: ReturnType<typeof setInterval> | null = null;

function subscribeToChatPolling(listener: PollListener): () => void {
    chatPollListeners.add(listener);
    if (!sharedPollTimer) {
        sharedPollTimer = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            chatPollListeners.forEach(fn => fn());
        }, 5000);
    }
    return () => {
        chatPollListeners.delete(listener);
        if (chatPollListeners.size === 0 && sharedPollTimer) {
            clearInterval(sharedPollTimer);
            sharedPollTimer = null;
        }
    };
}

// PERF: the shared timer alone was not enough — every useChat instance kept
// its own conversations STATE and fired its own GET /conversations per tick
// (ChatOverlay + ChatTab = 2 requests every 5s). Conversations now live in a
// module-level store with in-flight dedup: ONE request per cycle, and every
// subscriber sees the same list.
let sharedConversations: Conversation[] = [];
let sharedFetchInFlight = false;
type ConversationListener = (c: Conversation[]) => void;
const conversationListeners = new Set<ConversationListener>();

function publishConversations(next: Conversation[]): void {
    sharedConversations = next;
    conversationListeners.forEach(fn => fn(next));
}

function subscribeToConversations(listener: ConversationListener): () => void {
    conversationListeners.add(listener);
    return () => { conversationListeners.delete(listener); };
}


export function useChat() {
    const [conversations, setConversations] = useState<Conversation[]>(sharedConversations);
    const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoadingConv, setIsLoadingConv] = useState(false);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [hasMoreHistory, setHasMoreHistory] = useState(false);
    const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
    
    const { showToast } = useToast();


    const fetchConversations = useCallback(async (silent = false) => {
        // Single-flight: a duplicate poll while a request is already running
        // just returns the shared list.
        if (sharedFetchInFlight) return sharedConversations;
        sharedFetchInFlight = true;
        if (!silent) setIsLoadingConv(true);
        try {
            const res = await axios.get('/conversations');
            const data = res.data.data;
            const prev = sharedConversations;
            if (!(prev.length === data.length &&
                prev.every((c, idx) =>
                    c.id === data[idx].id &&
                    c.unread_count === data[idx].unread_count &&
                    c.last_message?.id === data[idx].last_message?.id
                )
            )) {
                publishConversations(data);
            }
            return sharedConversations;
        } catch (err) {
            console.error('Failed to fetch conversations', err);
            return [];
        } finally {
            sharedFetchInFlight = false;
            if (!silent) setIsLoadingConv(false);
        }
    }, []);

    // Keep local state in sync with the shared store.
    useEffect(() => subscribeToConversations(setConversations), []);

    const fetchMessages = useCallback(async (conversationId: number) => {
        setIsLoadingMessages(true);
        try {
            const res = await axios.get(`/conversations/${conversationId}`);
            setMessages(res.data.data);
            setHasMoreHistory(res.data.meta?.has_more ?? false);

            // Mark as read locally in conversations list (shared store)
            publishConversations(sharedConversations.map(c =>
                c.id === conversationId ? { ...c, unread_count: 0 } : c
            ));
        } catch (err) {
            console.error('Failed to fetch messages', err);
        } finally {
            setIsLoadingMessages(false);
        }
    }, []);

    // B12: load one older page of history (cursor = current oldest id).
    const loadEarlierMessages = useCallback(async () => {
        if (!activeConversation || messages.length === 0 || isLoadingEarlier) return;
        const oldestId = messages[0]?.id;
        if (!oldestId) return;
        setIsLoadingEarlier(true);
        try {
            const res = await axios.get(`/conversations/${activeConversation.id}`, {
                params: { before_id: oldestId },
            });
            setMessages(prev => [...(res.data.data as ChatMessage[]), ...prev]);
            setHasMoreHistory(res.data.meta?.has_more ?? false);
        } catch (err) {
            console.error('Failed to load earlier messages', err);
        } finally {
            setIsLoadingEarlier(false);
        }
    }, [activeConversation, messages, isLoadingEarlier]);

    const sendMessage = useCallback(async (content: string, imageFile?: File | null) => {
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
            
            // Update last message in conversations list (shared store)
            publishConversations(sharedConversations.map(c =>
                c.id === activeConversation.id ? { ...c, last_message: newMsg, last_message_at: newMsg.created_at } : c
            ).sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()));
            
        } catch (err) {
            console.error('Failed to send message', err);
            showToast('Failed to send message. Please try again.', 'error');
        } finally {
            setIsSending(false);
        }
    }, [activeConversation, showToast]);

    const startConversation = useCallback(async (userId: number) => {
        try {
            const res = await axios.post('/conversations', { user_id: userId });
            const conversationId = res.data.data;
            
            // Fetch fresh list and wait for it to return the actual data
            const freshConversations = await fetchConversations();
            
            // Find and set the active conversation from the fresh list
            const found = freshConversations.find((c: Conversation) => c.id === conversationId);
            if (found) {
                setActiveConversation(found);
            } else {
                // Final fallback if the list update was somehow delayed
                const refreshedRes = await axios.get('/conversations');
                const finalFound = (refreshedRes.data.data as Conversation[]).find(c => c.id === conversationId);
                if (finalFound) setActiveConversation(finalFound);
            }
        } catch (err) {
            console.error('Failed to start conversation', err);
        }
    }, [fetchConversations]);

    useEffect(() => {
        fetchConversations();

        // Poll via the SHARED timer (one network cycle for every useChat instance)
        const poll = () => {
            fetchConversations(true);
            if (activeConversation) {
                // Only fetch messages if tab is focused
                axios.get(`/conversations/${activeConversation.id}`).then(res => {
                    const newMessages = res.data.data;
                    setMessages(prev => {
                        if (prev.length === newMessages.length &&
                            prev[prev.length - 1]?.id === newMessages[newMessages.length - 1]?.id) {
                            return prev;
                        }
                        return newMessages;
                    });
                }).catch(() => {});
            }
        };
        const unsubscribe = subscribeToChatPolling(poll);

        return unsubscribe;
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
        refreshConversations: fetchConversations,
        hasMoreHistory,
        isLoadingEarlier,
        loadEarlierMessages
    };
}
