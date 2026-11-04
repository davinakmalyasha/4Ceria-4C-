import { notFound } from 'next/navigation';
import { DashboardView } from '../DashboardView';
import { isDashboardTab } from '../tabs';

/**
 * `/dashboard/<tab>` — one route per dashboard section.
 *
 * An unknown segment is a real 404: a renamed tab must not silently render the
 * overview, which is how a removed screen stays "working" forever.
 */
export default async function DashboardTabPage({
    params,
    searchParams,
}: {
    params: Promise<{ tab: string }>;
    searchParams: Promise<{
        error?: string;
        section?: string;
        q?: string;
        category?: string;
        type?: string;
        conversation?: string;
        firm?: string;
        city?: string;
        price_min?: string;
        price_max?: string;
        bedrooms?: string;
        sort?: string;
        page?: string;
        session?: string;
    }>;
}) {
    const { tab } = await params;
    const { error, section, q, category, type, conversation, firm, city, price_min, price_max, bedrooms, sort, page, session } =
        await searchParams;

    if (!isDashboardTab(tab)) {
        notFound();
    }

    return (
        <DashboardView
            activeTab={tab}
            error={error}
            section={section}
            q={q}
            category={category}
            type={type}
            conversation={conversation}
            firm={firm}
            city={city}
            price_min={price_min}
            price_max={price_max}
            bedrooms={bedrooms}
            sort={sort}
            page={page}
            session={session}
        />
    );
}
