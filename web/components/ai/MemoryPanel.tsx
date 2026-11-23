'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * What Ceria remembers.
 *
 * Memory is user-owned data, so it is visible and deletable here rather than
 * hidden behind the chat. The panel fetches on open, keeps the toggle honest,
 * and deletes one row or everything through the same authenticated API.
 */

type MemoryItem = {
    id: number;
    kind: 'message' | 'note';
    role: 'user' | 'assistant' | 'note';
    content: string;
    created_at?: string;
};

export function MemoryPanel() {
    const [open, setOpen] = useState(false);
    const [enabled, setEnabled] = useState(true);
    const [items, setItems] = useState<MemoryItem[]>([]);
    const [count, setCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/ai/memory');
            if (!response.ok) throw new Error(`memory ${response.status}`);
            const body = (await response.json()) as {
                enabled?: boolean;
                count?: number;
                data?: MemoryItem[];
            };
            setEnabled(body.enabled ?? true);
            setCount(body.count ?? body.data?.length ?? 0);
            setItems(body.data ?? []);
        } catch {
            setError('Memory could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) void load();
    }, [open, load]);

    const setMemory = useCallback(async (next: boolean) => {
        setError(null);
        try {
            const response = await fetch('/api/ai/memory', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: next }),
            });
            if (!response.ok) throw new Error(`memory ${response.status}`);
            setEnabled(next);
        } catch {
            setError('The memory setting could not be saved.');
        }
    }, []);

    const clearAll = useCallback(async () => {
        setError(null);
        try {
            const response = await fetch('/api/ai/memory', { method: 'DELETE' });
            if (!response.ok && response.status !== 204) throw new Error(`memory ${response.status}`);
            setItems([]);
            setCount(0);
        } catch {
            setError('Memory could not be cleared.');
        }
    }, []);

    const remove = useCallback(async (id: number) => {
        setError(null);
        try {
            const response = await fetch(`/api/ai/memory/${id}`, { method: 'DELETE' });
            if (!response.ok && response.status !== 204) throw new Error(`memory ${response.status}`);
            setItems((prev) => prev.filter((item) => item.id !== id));
            setCount((prev) => Math.max(0, prev - 1));
        } catch {
            setError('That memory could not be removed.');
        }
    }, []);

    return (
        <div className="mb-3">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-neutral-600 hover:border-neutral-900 hover:text-neutral-900"
            >
                <span aria-hidden>◈</span>
                Memory{count > 0 ? ` (${count})` : ''}
                <span aria-hidden>{open ? '▴' : '▾'}</span>
            </button>

            {open && (
                <section className="mt-2 rounded-2xl border border-neutral-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <p className="text-sm font-black text-neutral-900">Ceria&apos;s memory</p>
                            <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                                Preferences and facts from your own chats. Turn it off or clear it at any time.
                            </p>
                        </div>
                        <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
                            <input
                                type="checkbox"
                                checked={enabled}
                                onChange={(event) => void setMemory(event.target.checked)}
                                className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                            />
                            Enabled
                        </label>
                    </div>

                    {error && (
                        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                            {error}
                        </p>
                    )}

                    {loading ? (
                        <p className="mt-3 text-xs text-neutral-400">Loading…</p>
                    ) : items.length === 0 ? (
                        <p className="mt-3 text-xs text-neutral-500">
                            Nothing remembered yet. Ask Ceria to remember a preference, or just keep chatting.
                        </p>
                    ) : (
                        <ul className="mt-3 space-y-2">
                            {items.map((item) => (
                                <li key={item.id} className="flex items-start gap-2 rounded-xl bg-neutral-50 px-3 py-2">
                                    <span className="mt-0.5 shrink-0 rounded-md bg-white px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                        {item.kind === 'note' ? 'note' : item.role}
                                    </span>
                                    <p className="min-w-0 flex-1 text-xs leading-relaxed text-neutral-700">{item.content}</p>
                                    <button
                                        type="button"
                                        onClick={() => void remove(item.id)}
                                        aria-label="Delete this memory"
                                        className="shrink-0 rounded-md px-1.5 text-neutral-400 hover:bg-white hover:text-red-600"
                                    >
                                        ×
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {items.length > 0 && (
                        <button
                            type="button"
                            onClick={() => void clearAll()}
                            className="mt-3 text-[10px] font-black uppercase tracking-widest text-red-600 hover:text-red-700"
                        >
                            Clear all memory
                        </button>
                    )}
                </section>
            )}
        </div>
    );
}
