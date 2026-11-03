import Link from 'next/link';
import { assetUrl } from '@/lib/assets';
import { titleCase } from '@/lib/format';
import { ChatComposer } from './chatComposer';
import { CoverImage } from '@/components/CoverImage';

/**
 * Native chat screen.
 *
 * `GET /conversations` renders the inbox; `?conversation=<id>` asks the server
 * for that thread (`GET /conversations/{id}`, which also marks it read) and
 * renders the messages. Sending is the only client island: the composer posts
 * multipart to the BFF and refreshes the route.
 */

export interface ChatUser {
    id: number;
    name?: string | null;
    username?: string | null;
    role_type?: string | null;
    pic?: string | null;
}

export interface ChatMessage {
    id: number;
    conversation_id: number;
    sender_id: number;
    content?: string | null;
    image?: string | null;
    image_url?: string | null;
    is_read?: boolean;
    created_at?: string | null;
    sender?: ChatUser | null;
}

export interface ConversationRow {
    id: number;
    other_user: ChatUser;
    last_message?: ChatMessage | null;
    unread_count?: number;
    last_message_at?: string | null;
}

function stamp(value: string | null | undefined): string {
    if (!value) return '';
    return value.slice(0, 16).replace('T', ' ');
}

function Avatar({ user, size = 'h-10 w-10' }: { user: ChatUser; size?: string }) {
    const image = assetUrl(user.pic);
    return (
        <span
            className={`${size} shrink-0 rounded-full bg-neutral-900 text-white text-xs font-black flex items-center justify-center overflow-hidden`}
            aria-hidden
        >
            {image ? (
                <CoverImage src={image} alt="" className="h-full" />
            ) : (
                (user.name ?? '?').trim().charAt(0).toUpperCase()
            )}
        </span>
    );
}

function ConversationList({ conversations, activeId }: { conversations: ConversationRow[]; activeId: number | null }) {
    if (conversations.length === 0) {
        return (
            <div className="p-8 text-center text-sm text-neutral-500">
                No conversations yet. Start one from a project or a professional profile.
            </div>
        );
    }

    return (
        <ul className="divide-y divide-neutral-100">
            {conversations.map((conversation) => {
                const active = conversation.id === activeId;
                return (
                    <li key={conversation.id}>
                        <Link
                            href={`/dashboard/chat?conversation=${conversation.id}`}
                            className={
                                active
                                    ? 'flex items-start gap-3 px-4 py-3 bg-neutral-900 text-white'
                                    : 'flex items-start gap-3 px-4 py-3 hover:bg-neutral-50'
                            }
                        >
                            <Avatar user={conversation.other_user} />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2">
                                    <p className={`text-sm font-black truncate ${active ? 'text-white' : 'text-neutral-900'}`}>
                                        {conversation.other_user.name ?? 'Conversation'}
                                    </p>
                                    <time
                                        className={`text-[9px] font-bold uppercase tracking-wider shrink-0 ${active ? 'text-neutral-300' : 'text-neutral-400'}`}
                                    >
                                        {stamp(conversation.last_message_at).slice(0, 10)}
                                    </time>
                                </div>
                                <p className={`mt-0.5 text-[10px] font-black uppercase tracking-wider ${active ? 'text-neutral-300' : 'text-neutral-400'}`}>
                                    {titleCase(conversation.other_user.role_type)}
                                </p>
                                <p className={`mt-1 text-xs truncate ${active ? 'text-neutral-200' : 'text-neutral-500'}`}>
                                    {conversation.last_message?.content || 'No messages yet'}
                                </p>
                            </div>
                            {(conversation.unread_count ?? 0) > 0 && (
                                <span className="shrink-0 mt-1 h-5 min-w-5 px-1 rounded-full bg-red-600 text-white text-[9px] font-black flex items-center justify-center">
                                    {conversation.unread_count}
                                </span>
                            )}
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
}

export function ChatPanel({
    conversations,
    activeId,
    messages,
    viewerId,
    error,
}: {
    conversations: ConversationRow[];
    activeId: number | null;
    messages: ChatMessage[];
    viewerId: number;
    error?: string;
}) {
    const active = conversations.find((conversation) => conversation.id === activeId) ?? null;

    return (
        <div data-native-panel="chat" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">Chat</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        Direct conversations with project owners, professionals and suppliers.
                    </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    {conversations.length} {conversations.length === 1 ? 'conversation' : 'conversations'}
                </span>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>
            )}

            <div className="grid gap-4 lg:grid-cols-[320px_1fr] items-start">
                <aside className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-neutral-100">
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Inbox</h2>
                    </div>
                    <ConversationList conversations={conversations} activeId={activeId} />
                </aside>

                <section className="bg-white rounded-2xl border border-neutral-200 min-h-[520px] flex flex-col">
                    {!active ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
                            <h2 className="text-sm font-black text-neutral-900">Select a conversation</h2>
                            <p className="mt-1 text-xs text-neutral-500 max-w-sm">
                                Pick a thread from the inbox to read its history and reply.
                            </p>
                        </div>
                    ) : (
                        <>
                            <header className="flex items-center gap-3 px-5 py-3 border-b border-neutral-100">
                                <Avatar user={active.other_user} size="h-9 w-9" />
                                <div className="min-w-0">
                                    <h2 className="text-sm font-black text-neutral-900 truncate">
                                        {active.other_user.name}
                                    </h2>
                                    <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                        {titleCase(active.other_user.role_type)}
                                    </p>
                                </div>
                                <Link
                                    href="/dashboard/chat"
                                    className="ml-auto text-[10px] font-black uppercase tracking-wider text-neutral-400 hover:text-neutral-900"
                                >
                                    ← Inbox
                                </Link>
                            </header>

                            <div className="flex-1 overflow-y-auto p-5 space-y-3 max-h-[460px]">
                                {messages.length === 0 ? (
                                    <p className="text-sm text-neutral-500 text-center py-10">
                                        No messages yet. Say hello.
                                    </p>
                                ) : (
                                    messages.map((message) => {
                                        const mine = message.sender_id === viewerId;
                                        const image = assetUrl(message.image_url ?? message.image);
                                        return (
                                            <div
                                                key={message.id}
                                                data-native-message={message.id}
                                                className={mine ? 'flex justify-end' : 'flex justify-start'}
                                            >
                                                <div
                                                    className={
                                                        mine
                                                            ? 'max-w-[78%] rounded-2xl rounded-br-md bg-neutral-900 text-white px-4 py-2.5'
                                                            : 'max-w-[78%] rounded-2xl rounded-bl-md bg-neutral-100 text-neutral-900 px-4 py-2.5'
                                                    }
                                                >
                                                    {!mine && (
                                                        <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500 mb-1">
                                                            {message.sender?.name ?? active.other_user.name}
                                                        </p>
                                                    )}
                                                    {message.content && (
                                                        <p className="text-sm leading-relaxed whitespace-pre-line">
                                                            {message.content}
                                                        </p>
                                                    )}
                                                    {image && (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={image}
                                                            alt=""
                                                            className="mt-2 max-h-48 rounded-xl object-cover"
                                                        />
                                                    )}
                                                    <p
                                                        className={`mt-1 text-[9px] font-bold uppercase tracking-wider ${mine ? 'text-neutral-400' : 'text-neutral-400'}`}
                                                    >
                                                        {stamp(message.created_at).slice(11)}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <ChatComposer conversationId={active.id} />
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}
