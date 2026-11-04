import { AiChat, type AiMessage, type AiSession } from '@/components/ai/AiChat';

/**
 * The full-page assistant panel — server-fed first paint, client island
 * after. Status, session list and (when `?session=` names one) its thread
 * arrive with the page; sending streams through the BFF.
 */
export function AssistantPanel({
    enabled,
    sessions,
    activeSessionId,
    messages,
    error,
}: {
    enabled: boolean;
    sessions: AiSession[];
    activeSessionId: string | null;
    messages: AiMessage[];
    error?: string;
}) {
    return (
        <div>
            <div className="mb-4">
                <h1 className="text-2xl font-black tracking-tight text-neutral-900">AI Assistant</h1>
                <p className="mt-1 text-sm text-neutral-500">
                    Ceria searches live houses, professionals and materials, explains escrow and project flows, and drafts your next step.
                </p>
            </div>
            {error && (
                <p className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700">
                    {error}
                </p>
            )}
            <AiChat
                enabled={enabled}
                initialSessions={sessions}
                initialSessionId={activeSessionId}
                initialMessages={messages}
            />
        </div>
    );
}
