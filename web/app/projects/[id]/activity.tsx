import { titleCase } from '@/lib/format';

/**
 * Native activity panel.
 *
 * `GET /projects/{id}/activity` returns the newest 50 events with the actor's
 * user block. The server renders the timeline; no client hook or fetch.
 */

export interface ActivityRow {
    id: number;
    user_id?: number | null;
    action?: string | null;
    details?: string | null;
    created_at?: string | null;
    user?: { id?: number; name?: string; pic?: string | null; role_type?: string | null } | null;
}

function formatDate(value: string | null | undefined): string {
    if (!value) {
        return '';
    }

    // Stored as UTC ISO; the timeline shows the date and time as recorded.
    return value.slice(0, 16).replace('T', ' ');
}

export function ActivityPanel({ events }: { events: ActivityRow[] }) {
    return (
        <section className="max-w-3xl">
            <div className="mb-6">
                <h1 className="text-2xl font-black text-neutral-900">Activity Timeline</h1>
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mt-1">
                    Full history of project events · {events.length}
                </p>
            </div>

            {events.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-8 text-sm text-neutral-500">
                    No activity recorded yet.
                </div>
            ) : (
                <div className="relative">
                    <div className="absolute left-[19px] top-4 bottom-4 w-px bg-neutral-200" aria-hidden />
                    <ol className="space-y-5">
                        {events.map((event) => (
                            <li key={event.id} className="relative flex gap-4">
                                <span className="relative z-10 h-10 w-10 shrink-0 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center text-[10px] font-black text-neutral-400">
                                    {(event.action ?? 'event').slice(0, 2).toUpperCase()}
                                </span>
                                <article className="flex-1 bg-white rounded-2xl border border-neutral-200 px-5 py-4">
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-[9px] font-black uppercase tracking-wider text-neutral-500">
                                                {titleCase(event.action)}
                                            </span>
                                            {event.user?.name && (
                                                <span className="text-[11px] font-semibold text-neutral-500">
                                                    {event.user.name}
                                                </span>
                                            )}
                                        </div>
                                        <time className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                            {formatDate(event.created_at)}
                                        </time>
                                    </div>
                                    {event.details && (
                                        <p className="mt-2 text-sm leading-relaxed text-neutral-700">{event.details}</p>
                                    )}
                                </article>
                            </li>
                        ))}
                    </ol>
                </div>
            )}
        </section>
    );
}
