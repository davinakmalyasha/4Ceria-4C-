import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, MapPin } from 'lucide-react';
import { apiFetch, ApiFailure } from '@/lib/api';

export const metadata = { title: 'Shared project brief' };
export const dynamic = 'force-dynamic';

interface BriefPayload {
    title: string;
    location?: string | null;
    city?: string | null;
    construction_details?: unknown;
    construction_locked_at?: string | null;
    milestones?: { id: number; title?: string; description?: string; type?: string; due_date?: string | null }[];
    requirements?: { id: number; name?: string; qty?: string | number; unit?: string }[];
    comments?: { id: number; comment?: string; body?: string; user?: { name?: string } | null }[];
}

export default async function PublicBriefPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;

    let brief: BriefPayload;

    try {
        brief = await apiFetch<BriefPayload>(`/brief/${encodeURIComponent(token)}`);
    } catch (error) {
        if (error instanceof ApiFailure && (error.status === 404 || error.status === 403)) {
            notFound();
        }
        throw error;
    }

    if (!brief?.title) {
        notFound();
    }

    const details =
        brief.construction_details && typeof brief.construction_details === 'object'
            ? brief.construction_details
            : null;

    return (
        <main className="min-h-screen bg-neutral-50 px-4 py-10 font-sans text-neutral-900 sm:px-6">
            <div className="mx-auto max-w-4xl">
                <header className="flex flex-wrap items-center justify-between gap-4">
                    <Link href="/" className="inline-flex items-center gap-2 text-xl font-black tracking-tighter">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/assets/Logo4C.png" alt="" className="h-9 w-9" width={36} height={36} />
                        4Ceria<span className="text-[#FD1D1D]">.</span>
                    </Link>
                    <span className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                        Shared brief · read only
                    </span>
                </header>

                <section className="mt-8 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-10">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FD1D1D]">
                        Project brief
                    </p>
                    <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{brief.title}</h1>
                    {(brief.location || brief.city) && (
                        <p className="mt-3 flex items-center gap-2 text-sm text-neutral-500">
                            <MapPin className="h-4 w-4 text-neutral-400" />
                            {[brief.location, brief.city].filter(Boolean).join(', ')}
                        </p>
                    )}

                    {details && (
                        <div className="mt-8">
                            <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                                Construction details
                            </h2>
                            <pre className="mt-3 overflow-x-auto rounded-2xl bg-neutral-50 p-4 text-xs leading-relaxed text-neutral-600">
                                {JSON.stringify(details, null, 2)}
                            </pre>
                        </div>
                    )}

                    {brief.milestones && brief.milestones.length > 0 && (
                        <div className="mt-8">
                            <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                                Milestones · {brief.milestones.length}
                            </h2>
                            <ol className="mt-3 space-y-3">
                                {brief.milestones.map((milestone, index) => (
                                    <li key={milestone.id} className="rounded-2xl border border-neutral-100 p-4">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                            Stage {index + 1} · {milestone.type ?? 'Milestone'}
                                        </p>
                                        <p className="mt-1 text-sm font-bold">{milestone.title ?? 'Untitled milestone'}</p>
                                        {milestone.description && (
                                            <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                                                {milestone.description}
                                            </p>
                                        )}
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}

                    {brief.requirements && brief.requirements.length > 0 && (
                        <div className="mt-8">
                            <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                                Material requirements · {brief.requirements.length}
                            </h2>
                            <ul className="mt-3 divide-y divide-neutral-100 rounded-2xl border border-neutral-100">
                                {brief.requirements.map((requirement) => (
                                    <li key={requirement.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                                        <span className="font-semibold text-neutral-700">{requirement.name ?? 'Material'}</span>
                                        <span className="text-xs text-neutral-400">
                                            {requirement.qty ?? '—'} {requirement.unit ?? ''}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </section>

                <section className="mt-6 flex flex-col items-start justify-between gap-4 rounded-3xl border border-neutral-200 bg-white p-6 sm:flex-row sm:items-center">
                    <div>
                        <p className="text-sm font-black">Want to bid on this project?</p>
                        <p className="mt-1 text-xs text-neutral-500">
                            Create a professional account, get verified, and send a proposal from the Bidding Board.
                        </p>
                    </div>
                    <Link
                        href="/pro/register"
                        className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-neutral-900 px-5 py-3 text-xs font-bold text-white transition hover:bg-neutral-800"
                    >
                        Join as a professional
                        <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </section>

                <footer className="mt-10 border-t border-neutral-200 pt-6 text-center text-[11px] text-neutral-400">
                    Shared from 4Ceria. The owner can revoke this link at any time.
                </footer>
            </div>
        </main>
    );
}
