import { postComment } from './qa-actions';

/**
 * Native Q&A panel.
 *
 * `GET /projects/{id}/comments` returns a FLAT list with the author and the
 * parent relation; the threads are assembled here on the server. Posting goes
 * through a server action, so the bearer token never reaches the browser.
 */

export interface CommentUser {
    id?: number;
    name?: string;
    pic?: string | null;
    role_type?: string | null;
}

export interface CommentRow {
    id: number;
    user_id?: number | null;
    parent_id?: number | null;
    message?: string | null;
    created_at?: string | null;
    user?: CommentUser | null;
    parent?: { id?: number; message?: string | null; user?: CommentUser | null } | null;
}

function formatDate(value: string | null | undefined): string {
    if (!value) {
        return '';
    }

    return value.slice(0, 10);
}

function initial(name: string | undefined): string {
    return (name ?? '?').trim().charAt(0).toUpperCase() || '?';
}

function avatar({
    user,
    size = 'h-9 w-9',
}: {
    user?: CommentUser | null;
    size?: string;
}) {
    return (
        <span
            className={`${size} shrink-0 rounded-full bg-neutral-900 text-white text-xs font-black flex items-center justify-center overflow-hidden`}
            aria-hidden
        >
            {user?.pic ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.pic} alt="" className="h-full w-full object-cover" />
            ) : (
                initial(user?.name)
            )}
        </span>
    );
}

export function QaPanel({
    projectId,
    comments,
    error,
}: {
    projectId: number;
    comments: CommentRow[];
    error?: string;
}) {
    const threads = comments.filter((comment) => comment.parent_id === null || comment.parent_id === undefined);
    const replies = comments.filter((comment) => comment.parent_id !== null && comment.parent_id !== undefined);
    const byParent = new Map<number, CommentRow[]>();
    for (const reply of replies) {
        const rows = byParent.get(reply.parent_id as number) ?? [];
        rows.push(reply);
        byParent.set(reply.parent_id as number, rows);
    }

    const participants = new Set<number>();
    for (const comment of comments) {
        if (comment.user_id) {
            participants.add(comment.user_id);
        }
    }

    return (
        <section>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">Q&amp;A</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        Project questions and answers, visible to the project team.
                    </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    {threads.length} {threads.length === 1 ? 'thread' : 'threads'} · {replies.length}{' '}
                    {replies.length === 1 ? 'reply' : 'replies'} · {participants.size} participants
                </span>
            </div>

            {error && (
                <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <form
                action={postComment}
                className="bg-white rounded-2xl border border-neutral-200 p-5 mb-8"
            >
                <input type="hidden" name="project_id" value={projectId} />
                <label htmlFor="qa-message" className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    Ask the project team
                </label>
                <textarea
                    id="qa-message"
                    name="message"
                    required
                    maxLength={1000}
                    rows={3}
                    placeholder="Write a question or an update…"
                    className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-800 outline-none focus:border-neutral-900"
                />
                <div className="mt-3 flex justify-end">
                    <button
                        type="submit"
                        className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-xs font-black uppercase tracking-wider hover:bg-neutral-700"
                    >
                        Post message
                    </button>
                </div>
            </form>

            {threads.length === 0 ? (
                <div className="bg-white rounded-2xl border border-neutral-200 p-8 text-sm text-neutral-500">
                    No questions yet. The first message opens the thread.
                </div>
            ) : (
                <div className="space-y-5">
                    {threads.map((thread) => {
                        const threadReplies = byParent.get(thread.id) ?? [];
                        return (
                            <article key={thread.id} className="bg-white rounded-2xl border border-neutral-200 p-5">
                                <div className="flex items-start gap-3">
                                    {avatar({ user: thread.user })}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                                            <p className="text-sm font-black text-neutral-900">
                                                {thread.user?.name ?? 'User'}
                                            </p>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                                {formatDate(thread.created_at)}
                                            </p>
                                        </div>
                                        <p className="mt-2 text-sm leading-relaxed text-neutral-700 whitespace-pre-line">
                                            {thread.message}
                                        </p>
                                    </div>
                                </div>

                                {threadReplies.length > 0 && (
                                    <div className="mt-4 ml-6 space-y-4 border-l border-neutral-100 pl-4">
                                        {threadReplies.map((reply) => (
                                            <div key={reply.id} className="flex items-start gap-3">
                                                {avatar({ user: reply.user, size: 'h-7 w-7' })}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                                        <p className="text-xs font-black text-neutral-800">
                                                            {reply.user?.name ?? 'User'}
                                                        </p>
                                                        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                                            {formatDate(reply.created_at)}
                                                        </p>
                                                    </div>
                                                    <p className="mt-1 text-sm leading-relaxed text-neutral-700 whitespace-pre-line">
                                                        {reply.message}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <form action={postComment} className="mt-4 ml-6 flex items-center gap-2">
                                    <input type="hidden" name="project_id" value={projectId} />
                                    <input type="hidden" name="parent_id" value={thread.id} />
                                    <input
                                        name="message"
                                        required
                                        maxLength={1000}
                                        placeholder="Reply…"
                                        className="flex-1 rounded-xl border border-neutral-200 px-4 py-2 text-sm text-neutral-800 outline-none focus:border-neutral-900"
                                    />
                                    <button
                                        type="submit"
                                        className="px-3 py-2 rounded-xl border border-neutral-200 text-xs font-black uppercase tracking-wider text-neutral-600 hover:text-neutral-900"
                                    >
                                        Reply
                                    </button>
                                </form>
                            </article>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
