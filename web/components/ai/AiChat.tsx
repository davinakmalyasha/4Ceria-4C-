'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Markdown } from './markdown';

/**
 * Ceria — the 4Ceria AI assistant chat (Vercel-style: sidebar + thread).
 *
 * Server delivers the first paint (status, session list, active thread);
 * this island owns sending (streaming SSE via the BFF), history switching,
 * rename and delete. The token never touches the browser: every fetch goes
 * to `/api/ai/...`, which the BFF forwards with the session cookie.
 */

export type AiSession = {
    id: string;
    title: string;
    created_at?: string;
    updated_at?: string;
};

export type AiMessage = {
    id?: number;
    role: 'user' | 'assistant' | 'system';
    content: string;
};

const SUGGESTIONS = [
    'How does escrow work on 4Ceria?',
    'Find me a house in Bandung under Rp 1.000.000.000',
    'Recommend an arsitek for a new build',
    'What are the steps to hire a kontraktor?',
    'Explain payment termins and retention',
    'Estimate a 120 m2 new build, middle quality',
];

function parseSSE(chunk: string): { delta?: string; done?: boolean; refused?: boolean; error?: string; session_id?: string }[] {
    const out: { delta?: string; done?: boolean; refused?: boolean; error?: string; session_id?: string }[] = [];
    for (const line of chunk.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        try {
            out.push(JSON.parse(trimmed.slice(5).trim()));
        } catch {
            // A partial frame at the buffer edge; the remainder arrives next.
        }
    }
    return out;
}

export function AiChat({
    initialSessions,
    initialMessages,
    initialSessionId,
    enabled,
    compact,
}: {
    initialSessions: AiSession[];
    initialMessages: AiMessage[];
    initialSessionId: string | null;
    enabled: boolean;
    /** Floating/launcher mode: no sidebar, tighter frame. */
    compact?: boolean;
}) {
    const router = useRouter();
    const [sessions, setSessions] = useState<AiSession[]>(initialSessions);
    const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
    const [messages, setMessages] = useState<AiMessage[]>(initialMessages);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [renaming, setRenaming] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const bottomRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages, busy]);

    const refreshSessions = useCallback(async () => {
        try {
            const response = await fetch('/api/ai/sessions');
            if (!response.ok) return;
            const body = (await response.json()) as { data?: AiSession[] };
            setSessions(body.data ?? []);
        } catch {
            // The sidebar keeps its last known list.
        }
    }, []);

    const openSession = useCallback(async (id: string | null) => {
        if (id === null) {
            setSessionId(null);
            setMessages([]);
            setError(null);
            return;
        }
        setSessionId(id);
        setError(null);
        try {
            const response = await fetch(`/api/ai/sessions/${id}`);
            if (!response.ok) throw new Error(`session ${response.status}`);
            const body = (await response.json()) as { messages?: AiMessage[] };
            setMessages(body.messages ?? []);
        } catch {
            setError('That conversation could not be loaded.');
        }
    }, []);

    const send = useCallback(
        async (text: string) => {
            const clean = text.trim();
            if (!clean || busy) return;
            if (clean.length > 4000) {
                setError('Please keep messages under 4,000 characters.');
                return;
            }
            setBusy(true);
            setError(null);
            setInput('');
            setMessages((prev) => [...prev, { role: 'user', content: clean }]);
            // The assistant bubble streams in place.
            setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

            const controller = new AbortController();
            abortRef.current = controller;
            let streamed = '';
            let nextSessionId: string | null = null;

            try {
                const response = await fetch('/api/ai/chat/stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: sessionId, message: clean }),
                    signal: controller.signal,
                });
                if (!response.ok || !response.body) {
                    let detail = `The assistant answered ${response.status}.`;
                    try {
                        const body = (await response.json()) as { message?: string };
                        if (body.message) detail = body.message;
                    } catch {
                        // The status carries it.
                    }
                    throw new Error(detail);
                }
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    for (const event of parseSSE(decoder.decode(value, { stream: true }))) {
                        if (event.session_id && !sessionId) nextSessionId = event.session_id;
                        if (event.error) throw new Error(event.error);
                        if (event.delta) {
                            streamed += event.delta;
                            const snapshot = streamed;
                            setMessages((prev) => {
                                const next = [...prev];
                                next[next.length - 1] = { role: 'assistant', content: snapshot };
                                return next;
                            });
                        }
                        if (event.done) break;
                    }
                }
                if (!streamed) {
                    setMessages((prev) => prev.slice(0, -1));
                    throw new Error('The assistant returned an empty reply. Please try again.');
                }
                if (nextSessionId) {
                    setSessionId(nextSessionId);
                    void refreshSessions();
                } else {
                    void refreshSessions();
                }
            } catch (failure) {
                if ((failure as Error).name === 'AbortError') {
                    setMessages((prev) => {
                        const next = [...prev];
                        const last = next[next.length - 1];
                        if (last && last.role === 'assistant' && !last.content) return next.slice(0, -1);
                        return next;
                    });
                } else {
                    // Drop the empty streaming bubble, keep the user message.
                    setMessages((prev) => {
                        const next = [...prev];
                        const last = next[next.length - 1];
                        if (last && last.role === 'assistant' && last.content === streamed && !streamed) {
                            return next.slice(0, -1);
                        }
                        if (last && last.role === 'assistant' && !streamed) return next.slice(0, -1);
                        return next;
                    });
                    setError(failure instanceof Error ? failure.message : 'The assistant hit a snag. Please try again.');
                }
            } finally {
                setBusy(false);
                abortRef.current = null;
            }
        },
        [busy, sessionId, refreshSessions],
    );

    const removeSession = useCallback(
        async (id: string) => {
            try {
                const response = await fetch(`/api/ai/sessions/${id}`, { method: 'DELETE' });
                if (!response.ok && response.status !== 204) throw new Error();
                setSessions((prev) => prev.filter((s) => s.id !== id));
                if (sessionId === id) {
                    setSessionId(null);
                    setMessages([]);
                }
            } catch {
                setError('That conversation could not be deleted.');
            }
        },
        [sessionId],
    );

    const renameSession = useCallback(async (id: string, title: string) => {
        const clean = title.trim();
        if (!clean) {
            setRenaming(null);
            return;
        }
        try {
            const response = await fetch(`/api/ai/sessions/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: clean }),
            });
            if (!response.ok) throw new Error();
            setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title: clean } : s)));
        } catch {
            setError('That conversation could not be renamed.');
        } finally {
            setRenaming(null);
        }
    }, []);

    return (
        <div className={compact ? 'flex flex-col h-full min-h-0' : 'grid md:grid-cols-[260px_1fr] gap-4 min-h-[70vh]'}>
            {!compact && (
                <aside className="bg-white rounded-2xl border border-neutral-200 p-3 flex flex-col min-h-0 max-h-[70vh]">
                    <button
                        type="button"
                        onClick={() => void openSession(null)}
                        className="mb-2 w-full px-3 py-2 rounded-xl bg-neutral-900 text-white text-xs font-black uppercase tracking-wider hover:bg-black transition-colors"
                    >
                        + New chat
                    </button>
                    <div className="flex-1 overflow-y-auto space-y-1">
                        {sessions.length === 0 && (
                            <p className="p-3 text-xs text-neutral-500">No conversations yet. Ask anything to start.</p>
                        )}
                        {sessions.map((s) => (
                            <div
                                key={s.id}
                                className={`group flex items-center gap-1 rounded-xl px-2 py-2 text-left text-[13px] ${
                                    s.id === sessionId ? 'bg-red-50/60 text-neutral-900' : 'hover:bg-neutral-50 text-neutral-700'
                                }`}
                            >
                                {renaming === s.id ? (
                                    <input
                                        autoFocus
                                        value={renameValue}
                                        onChange={(e) => setRenameValue(e.target.value)}
                                        onBlur={() => void renameSession(s.id, renameValue)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') void renameSession(s.id, renameValue);
                                            if (e.key === 'Escape') setRenaming(null);
                                        }}
                                        className="flex-1 min-w-0 px-1 py-0.5 text-[13px] border border-neutral-300 rounded-lg"
                                    />
                                ) : (
                                    <button type="button" onClick={() => void openSession(s.id)} className="flex-1 min-w-0 text-left truncate font-bold">
                                        {s.title || 'New chat'}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    title="Rename"
                                    onClick={() => {
                                        setRenaming(s.id);
                                        setRenameValue(s.title);
                                    }}
                                    className="hidden group-hover:block px-1 text-neutral-400 hover:text-neutral-700 text-xs"
                                >
                                    ✎
                                </button>
                                <button
                                    type="button"
                                    title="Delete"
                                    onClick={() => void removeSession(s.id)}
                                    className="hidden group-hover:block px-1 text-neutral-400 hover:text-red-600 text-xs"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => router.refresh()}
                        className="mt-2 text-[10px] font-black uppercase tracking-widest text-neutral-400 hover:text-neutral-600"
                    >
                        Refresh
                    </button>
                </aside>
            )}

            <section className="bg-white rounded-2xl border border-neutral-200 flex flex-col min-h-0 overflow-hidden">
                <header className="shrink-0 px-4 sm:px-5 py-3 border-b border-neutral-100 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-neutral-900 text-white flex items-center justify-center text-sm font-black">C</span>
                    <div className="min-w-0">
                        <p className="text-sm font-black text-neutral-900 leading-tight">Ceria — AI Assistant</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 leading-tight">
                            {enabled ? 'Projects · Houses · Materials · How-tos' : 'Not configured yet'}
                        </p>
                    </div>
                    {compact && (
                        <button
                            type="button"
                            onClick={() => void openSession(null)}
                            title="New chat"
                            className="ml-auto px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-neutral-100 hover:bg-neutral-200"
                        >
                            New
                        </button>
                    )}
                </header>

                <div className={compact ? 'flex-1 overflow-y-auto p-3 space-y-3 min-h-0' : 'flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 min-h-[40vh] max-h-[62vh]'}>
                    {!enabled && (
                        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            The AI assistant isn&apos;t configured yet (the operator still needs to set <code>DEEPSEEK_API_KEY</code>). Your chats are saved and will work once it&apos;s enabled.
                        </p>
                    )}
                    {error && (
                        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>
                    )}
                    {messages.length === 0 && (
                        <div>
                            <p className="text-sm text-neutral-600 leading-relaxed">
                                Hi, I&apos;m <strong>Ceria</strong>. I can search live houses, professionals and materials, explain escrow/termins/bids, check your projects, and estimate budgets. What are you working on?
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {SUGGESTIONS.map((s) => (
                                    <button
                                        key={s}
                                        type="button"
                                        disabled={busy}
                                        onClick={() => void send(s)}
                                        className="px-3 py-1.5 rounded-full border border-neutral-200 text-xs font-bold text-neutral-600 hover:border-neutral-900 hover:text-neutral-900 transition-colors disabled:opacity-50"
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {messages.map((m, i) =>
                        m.role === 'user' ? (
                            <div key={i} className="flex justify-end">
                                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-neutral-900 text-white px-3 py-2">
                                    <p className="text-sm leading-relaxed whitespace-pre-line">{m.content}</p>
                                </div>
                            </div>
                        ) : (
                            <div key={i} className="flex justify-start gap-2">
                                <span className="mt-1 w-6 h-6 shrink-0 rounded-lg bg-neutral-900 text-white flex items-center justify-center text-[10px] font-black">C</span>
                                <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-neutral-100 text-neutral-900 px-3 py-2 min-w-0">
                                    {m.content ? (
                                        <Markdown text={m.content} />
                                    ) : (
                                        <p className="text-xs text-neutral-400 animate-pulse">Thinking…</p>
                                    )}
                                </div>
                            </div>
                        ),
                    )}
                    <div ref={bottomRef} />
                </div>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void send(input);
                    }}
                    className="shrink-0 border-t border-neutral-100 p-3 flex items-end gap-2"
                >
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                void send(input);
                            }
                        }}
                        rows={1}
                        maxLength={4000}
                        placeholder={enabled ? 'Ask about projects, houses, materials…' : 'Assistant offline — history still works'}
                        className="flex-1 min-w-0 resize-none rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/20 focus:border-neutral-900 max-h-32"
                    />
                    {busy ? (
                        <button
                            type="button"
                            onClick={() => abortRef.current?.abort()}
                            className="shrink-0 px-3 py-2 rounded-xl bg-neutral-200 text-neutral-700 text-xs font-black uppercase tracking-wider hover:bg-neutral-300"
                        >
                            Stop
                        </button>
                    ) : (
                        <button
                            type="submit"
                            disabled={!input.trim()}
                            className="shrink-0 px-4 py-2 rounded-xl bg-neutral-900 text-white text-xs font-black uppercase tracking-wider hover:bg-black disabled:opacity-40"
                        >
                            Send
                        </button>
                    )}
                </form>
                <p className="shrink-0 px-4 pb-2 text-[9px] font-bold uppercase tracking-widest text-neutral-300">
                    AI answers can be wrong — verify prices &amp; project facts
                </p>
            </section>
        </div>
    );
}
