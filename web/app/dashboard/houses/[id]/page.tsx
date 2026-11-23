import { notFound } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';
import { HouseDetailPanel, type HouseQuestionRow } from '../../houses';
import type { HouseRow } from '../../explore';
import { sessionToken } from '@/lib/session';

/**
 * `/dashboard/houses/<id>` — one native house detail page.
 *
 * `GET /houses/{house}` returns the row and counts the view (once per viewer
 * per six hours), so linking every card here is what makes the view counter
 * move. An unknown id is a 404, matching the API's model-not-found.
 */
export default async function HouseDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ error?: string; asked?: string }>;
}) {
    const { id } = await params;
    const { error, asked } = await searchParams;

    if (!/^\d+$/.test(id)) {
        notFound();
    }

    let house: HouseRow;
    try {
        const response = await apiFetch<{ data: HouseRow }>(`/houses/${id}`);
        house = response.data;
    } catch (error) {
        if (error instanceof ApiFailure && (error.status === 404 || error.status === 403)) {
            notFound();
        }

        throw error;
    }

    if (!house) {
        notFound();
    }

    let questions: HouseQuestionRow[] = [];
    try {
        const response = await apiFetch<{ data: HouseQuestionRow[] }>(`/houses/${id}/questions`);
        questions = response.data ?? [];
    } catch {
        // A failed question list must not hide the listing.
    }

    return (
        <HouseDetailPanel
            house={house}
            questions={questions}
            signedIn={Boolean(await sessionToken())}
            error={error}
            asked={asked === '1'}
        />
    );
}
