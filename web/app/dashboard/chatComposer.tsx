'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The chat composer — the one interactive island on the chat screen.
 *
 * Posts `multipart/form-data` to the BFF (`/api/conversations/{id}/messages`),
 * which attaches the httpOnly token. On success the route is refreshed so the
 * server-rendered thread shows the new message (and the inbox preview moves);
 * `onSent` lets a client-owned thread (the floating launcher) refetch itself.
 */
export function ChatComposer({
    conversationId,
    onSent,
}: {
    conversationId: number;
    onSent?: () => void;
}) {
    const router = useRouter();
    const [content, setContent] = useState('');
    const [image, setImage] = useState<File | null>(null);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const text = content.trim();
        if (text === '' && !image) {
            return;
        }

        setSending(true);
        setError(null);

        const data = new FormData();
        data.set('content', text);
        if (image) {
            data.set('image', image);
        }

        try {
            const response = await fetch(`/api/conversations/${conversationId}/messages`, {
                method: 'POST',
                body: data,
            });

            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as
                    | { message?: string; errors?: Record<string, string[]> }
                    | null;
                const firstError = body?.errors ? Object.values(body.errors)[0]?.[0] : undefined;
                setError(firstError ?? body?.message ?? `The message could not be sent (${response.status}).`);
                return;
            }

            setContent('');
            setImage(null);
            router.refresh();
            onSent?.();
        } catch {
            setError('The message could not be sent. Check your connection and try again.');
        } finally {
            setSending(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="border-t border-neutral-100 p-3 space-y-2">
            {error && <p className="text-[11px] font-bold text-red-600">{error}</p>}
            <div className="flex items-end gap-2">
                <label className="shrink-0 cursor-pointer rounded-xl border border-neutral-200 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-neutral-500 hover:text-neutral-900">
                    Photo
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/jpg"
                        className="hidden"
                        onChange={(event) => setImage(event.target.files?.[0] ?? null)}
                    />
                </label>
                <textarea
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    rows={1}
                    maxLength={4000}
                    placeholder="Write a message…"
                    className="flex-1 resize-none rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-800 outline-none focus:border-neutral-900"
                />
                <button
                    type="submit"
                    disabled={sending}
                    className="shrink-0 px-4 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700 disabled:opacity-50"
                >
                    {sending ? 'Sending…' : 'Send'}
                </button>
            </div>
            {image && (
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    {image.name} ·{' '}
                    <button type="button" onClick={() => setImage(null)} className="text-red-500">
                        remove
                    </button>
                </p>
            )}
        </form>
    );
}
