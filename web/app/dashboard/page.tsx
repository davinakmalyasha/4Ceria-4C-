import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { DashboardView } from './DashboardView';

/**
 * `/dashboard` — the overview.
 *
 * The SPA's `?tab=` URLs still exist in bookmarks and notification links, so a
 * `?tab=` value is redirected to its real route rather than silently showing
 * the overview. The redirect is server-side: the old URL never renders a frame
 * it then replaces.
 */
export default async function DashboardPage({
    searchParams,
}: {
    searchParams: Promise<{
        tab?: string;
        error?: string;
        section?: string;
        q?: string;
        category?: string;
        type?: string;
        conversation?: string;
        firm?: string;
    }>;
}) {
    const { tab, error, section, q, category, type, conversation, firm } = await searchParams;

    if (tab && tab !== 'overview') {
        const params = new URLSearchParams();
        if (section) params.set('section', section);
        if (q) params.set('q', q);
        if (category) params.set('category', category);
        if (type) params.set('type', type);
        if (conversation) params.set('conversation', conversation);
        if (firm) params.set('firm', firm);
        const query = params.toString();
        redirect(`/dashboard/${tab}${query ? `?${query}` : ''}`);
    }

    return (
        <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading dashboard…</div>}>
            <DashboardView
                activeTab="overview"
                error={error}
                section={section}
                q={q}
                category={category}
                type={type}
                conversation={conversation}
                firm={firm}
            />
        </Suspense>
    );
}
