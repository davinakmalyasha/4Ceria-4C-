'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AiChat, type AiSession } from './AiChat';

/**
 * The floating AI launcher — Ceria on every dashboard tab.
 *
 * Sits left of the Chat messenger (`right-24` vs its `right-6`), same
 * elevation and motion language, compact chat mode inside. Hidden on the
 * full assistant route (the screen below is already Ceria) and for guests.
 * Each open re-reads status + sessions and remounts the panel, so the
 * sidebar never shows a stale list.
 */
export function AiLauncher({ activeTab, viewerId }: { activeTab: string; viewerId: number }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [openCount, setOpenCount] = useState(0);
    const [sessions, setSessions] = useState<AiSession[]>([]);
    const [enabled, setEnabled] = useState(true);

    if (activeTab === 'assistant' || !viewerId) {
        return null;
    }

    const toggle = () => {
        const next = !open;
        setOpen(next);
        if (next) {
            setOpenCount((c) => c + 1);
            void fetch('/api/ai/status')
                .then((response) => (response.ok ? response.json() : null))
                .then((body: { enabled?: boolean } | null) => {
                    if (body && typeof body.enabled === 'boolean') setEnabled(body.enabled);
                })
                .catch(() => {});
            void fetch('/api/ai/sessions')
                .then((response) => (response.ok ? response.json() : null))
                .then((body: { data?: AiSession[] } | null) => {
                    if (body) setSessions(body.data ?? []);
                })
                .catch(() => {});
        }
    };

    return (
        <div className="fixed bottom-6 right-24 z-[120] font-sans">
            <button
                type="button"
                onClick={toggle}
                aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
                title="Ask Ceria — AI assistant"
                className="relative w-14 h-14 rounded-full bg-[#FF2D20] text-white flex items-center justify-center shadow-[0_10px_30px_rgba(255,45,32,0.4)] hover:bg-red-600 transition-colors"
            >
                {open ? (
                    <span className="text-xl leading-none">×</span>
                ) : (
                    <span className="text-lg font-black leading-none">C</span>
                )}
            </button>

            {open && (
                <div className="absolute bottom-[72px] right-0 w-[360px] sm:w-[420px] h-[560px] max-h-[calc(100vh-96px)] rounded-3xl border border-neutral-100 shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col bg-neutral-50">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-50">
                        <button
                            type="button"
                            onClick={() => {
                                setOpen(false);
                                router.push('/dashboard/assistant');
                            }}
                            className="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider text-neutral-500 hover:bg-neutral-200/60"
                        >
                            Expand ⤢
                        </button>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            aria-label="Close AI assistant"
                            className="px-2 py-1 rounded-lg text-neutral-500 hover:bg-neutral-200/60"
                        >
                            ×
                        </button>
                    </div>
                    <div className="flex-1 min-h-0 px-2 pb-2">
                        <AiChat
                            key={openCount}
                            compact
                            enabled={enabled}
                            initialSessions={sessions}
                            initialMessages={[]}
                            initialSessionId={null}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
