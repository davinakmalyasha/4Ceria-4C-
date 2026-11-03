'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { resolveAsset } from '@/lib/assetUrl';
import { titleCase } from '@/lib/format';
import { ChatComposer } from './chatComposer';
import type { ChatMessage, ConversationRow } from './chat';
import { CoverImage } from '@/components/CoverImage';

/**
 * The floating chat messenger.
 *
 * The legacy `ChatOverlay` mounted the synced `useChat` hook — its own poller,
 * its own conversation state and a bundle that pulled the whole chat tree into
 * every dashboard page. Here the inbox arrives from the server with the page
 * (the dashboard already fetches `/conversations`), and this island only owns
 * the open/closed and selected-thread state. The thread itself is read through
 * the BFF on selection, which is the same endpoint the full Chat tab uses and
 * the same one that marks the other side's messages read.
 *
 * It is hidden on the full chat route: the screen below is already chat.
 */
export function ChatLauncher({
    conversations,
    viewerId,
    activeTab,
    storageBase,
}: {
    conversations: ConversationRow[];
    viewerId: number;
    activeTab: string;
    /** The API origin relative storage paths resolve against. */
    storageBase: string;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [activeId, setActiveId] = useState<number | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadThread = useCallback(async (id: number) => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/conversations/${id}`);

            if (!response.ok) {
                throw new Error(`thread ${response.status}`);
            }

            const body = (await response.json()) as { data?: ChatMessage[] };
            setMessages(body.data ?? []);
        } catch {
            setError('The conversation could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open && activeId !== null) {
            void loadThread(activeId);
        }
    }, [open, activeId, loadThread]);

    if (activeTab === 'chat' || !viewerId) {
        return null;
    }

    const active = conversations.find((conversation) => conversation.id === activeId) ?? null;
    const unread = conversations.reduce((sum, conversation) => sum + (conversation.unread_count ?? 0), 0);

    return (
        <div className="fixed bottom-6 right-6 z-[120] font-sans">
            <button
                type="button"
                onClick={() => {
                    setOpen((value) => !value);

                    if (open) {
                        setActiveId(null);
                    }
                }}
                aria-label={open ? 'Close chat' : 'Open chat'}
                className="relative w-14 h-14 rounded-full bg-neutral-900 text-white flex items-center justify-center border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.25)] hover:bg-black transition-colors"
            >
                {open ? (
                    <span className="text-xl leading-none">×</span>
                ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                )}
                {unread > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-white shadow-md">
                        {unread}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute bottom-[72px] right-0 w-[360px] sm:w-[420px] h-[520px] max-h-[calc(100vh-96px)] bg-white rounded-3xl border border-neutral-100 shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col">
                    <header className="h-14 shrink-0 bg-neutral-900 text-white flex items-center justify-between px-4">
                        <div className="flex items-center gap-2 min-w-0">
                            {active ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setActiveId(null);
                                            setMessages([]);
                                        }}
                                        aria-label="Back to conversations"
                                        className="p-1 rounded-lg hover:bg-white/10"
                                    >
                                        ←
                                    </button>
                                    <span className="text-sm font-extrabold truncate">{active.other_user.name}</span>
                                </>
                            ) : (
                                <span className="text-sm font-extrabold tracking-tight">Chat Messenger</span>
                            )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <button
                                type="button"
                                onClick={() => {
                                    setOpen(false);
                                    router.push(activeId ? `/dashboard/chat?conversation=${activeId}` : '/dashboard/chat');
                                }}
                                title="Open full page chat"
                                className="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-white/10"
                            >
                                Expand
                            </button>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                aria-label="Close chat"
                                className="p-1.5 rounded-lg hover:bg-white/10"
                            >
                                ×
                            </button>
                        </div>
                    </header>

                    <div className="flex-1 min-h-0 flex flex-col bg-white">
                        {error && (
                            <p className="px-4 py-2 text-[11px] font-bold text-red-600 border-b border-red-100 bg-red-50">
                                {error}
                            </p>
                        )}

                        {active ? (
                            <>
                                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                                    {loading ? (
                                        <p className="py-8 text-center text-[10px] font-black uppercase tracking-widest text-neutral-400">
                                            Loading conversation…
                                        </p>
                                    ) : messages.length === 0 ? (
                                        <p className="py-8 text-center text-xs text-neutral-500">
                                            No messages yet. Say hello.
                                        </p>
                                    ) : (
                                        messages.map((message) => {
                                            const mine = message.sender_id === viewerId;
                                            const image = resolveAsset(storageBase, message.image_url ?? message.image);

                                            return (
                                                <div key={message.id} className={mine ? 'flex justify-end' : 'flex justify-start'}>
                                                    <div
                                                        className={
                                                            mine
                                                                ? 'max-w-[80%] rounded-2xl rounded-br-md bg-neutral-900 text-white px-3 py-2'
                                                                : 'max-w-[80%] rounded-2xl rounded-bl-md bg-neutral-100 text-neutral-900 px-3 py-2'
                                                        }
                                                    >
                                                        {message.content && (
                                                            <p className="text-sm leading-relaxed whitespace-pre-line">
                                                                {message.content}
                                                            </p>
                                                        )}
                                                        {image && (
                                                            <img src={image} alt="" className="mt-1.5 max-h-40 rounded-xl object-cover" />
                                                        )}
                                                        <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-neutral-400">
                                                            {message.created_at ? message.created_at.slice(11, 16) : ''}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>

                                <ChatComposer
                                    key={active.id}
                                    conversationId={active.id}
                                    onSent={() => void loadThread(active.id)}
                                />
                            </>
                        ) : (
                            <div className="flex-1 overflow-y-auto">
                                {conversations.length === 0 ? (
                                    <p className="p-6 text-center text-xs text-neutral-500">
                                        No conversations yet. Start one from a project or a professional profile.
                                    </p>
                                ) : (
                                    <ul className="divide-y divide-neutral-100">
                                        {conversations.map((conversation) => {
                                            const image = resolveAsset(storageBase, conversation.other_user.pic);

                                            return (
                                                <li key={conversation.id}>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setActiveId(conversation.id);
                                                            setMessages([]);
                                                            router.refresh();
                                                        }}
                                                        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-neutral-50"
                                                    >
                                                        <span className="h-10 w-10 shrink-0 rounded-full bg-neutral-900 text-white text-xs font-black flex items-center justify-center overflow-hidden">
                                                            {image ? (
                                                                <CoverImage src={image} alt="" className="h-full" />
                                                            ) : (
                                                                (conversation.other_user.name ?? '?').trim().charAt(0).toUpperCase()
                                                            )}
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="flex items-baseline justify-between gap-2">
                                                                <span className="text-sm font-black text-neutral-900 truncate">
                                                                    {conversation.other_user.name ?? 'Conversation'}
                                                                </span>
                                                                <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 shrink-0">
                                                                    {conversation.last_message_at
                                                                        ? conversation.last_message_at.slice(0, 10)
                                                                        : ''}
                                                                </span>
                                                            </span>
                                                            <span className="mt-0.5 block text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                                                {titleCase(conversation.other_user.role_type)}
                                                            </span>
                                                            <span className="mt-1 block text-xs text-neutral-500 truncate">
                                                                {conversation.last_message?.content || 'No messages yet'}
                                                            </span>
                                                        </span>
                                                        {(conversation.unread_count ?? 0) > 0 && (
                                                            <span className="shrink-0 mt-1 h-5 min-w-5 px-1 rounded-full bg-red-600 text-white text-[9px] font-black flex items-center justify-center">
                                                                {conversation.unread_count}
                                                            </span>
                                                        )}
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
