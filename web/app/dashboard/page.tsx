import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';
import { sessionToken } from '@/lib/session';
import { AuthProvider, type User } from '@/context/AuthContext';
import { DashboardShell } from './DashboardShell';

/**
 * The dashboard — a SERVER component that fetches, and a client shell that
 * renders.
 *
 * THE LEGACY HOOK FIRES ~15 REQUESTS ON MOUNT and keeps three module-level
 * caches alive across users. Here the page awaits the four calls the OVERVIEW
 * actually needs, in parallel, before sending any markup — so the first paint
 * is the data, not a skeleton. A tab that needs more fetches its own data when
 * it is ported; nothing is fetched "just in case".
 *
 * An API 401 sends the visitor to /login. That is safe HERE because the server
 * knows why it is unauthenticated; the defect the visual baseline found (B30)
 * was a CLIENT-INTERCEPTOR redirecting on a 401 raised by an unrelated panel.
 *
 * `?tab=` is still a query parameter. The plan is one route per tab; doing that
 * conversion one tab at a time is the next step, and a tab is not a route until
 * it is ported.
 */
export default async function DashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string }>;
}) {
    const { tab } = await searchParams;
    const activeTab = tab ?? 'overview';

    /**
     * THE TABS A SIGNED-OUT VISITOR MAY READ.
     *
     * The legacy page lists exactly these and sends every other tab to /login.
     * The port reproduces the list rather than closing the door: the product
     * advertises a public marketplace and a public directory, and the screens
     * already render correctly with `user === null`.
     */
    const PUBLIC_TABS = [
        'houses',
        'marketplace-materials',
        'marketplace-furniture',
        'architects',
        'constructors',
        'interior',
        'notaris',
        'project_manager',
        'structural',
        'mep',
    ];

    if (!(await sessionToken())) {
        if (!PUBLIC_TABS.includes(activeTab)) {
            redirect('/login');
        }

        return (
            <AuthProvider user={null}>
                <DashboardShell
                    activeTab={activeTab}
                    projects={[]}
                    projectFeed={[]}
                    myBids={[]}
                    hiredProfessionals={[]}
                    collection={[]}
                />
            </AuthProvider>
        );
    }

    let user: User;
    let projects: unknown[] = [];
    let projectFeed: unknown[] = [];
    let myBids: unknown[] = [];
    let hiredProfessionals: unknown[] = [];
    let collection: unknown[] = [];

    // THE COLLECTION THIS TAB NEEDS, fetched HERE rather than after mount.
    //
    // The legacy hook lazy-loads it from an effect the moment the tab becomes
    // active, so the tab paints its empty state first and fills in later. One
    // awaited request on the server removes that flash and the waterfall with
    // it.
    const collectionForTab: Record<string, string> = {
        houses: '/houses',
        'marketplace-materials': '/houses',
        'marketplace-furniture': '/houses',
        architects: '/arsitek',
        constructors: '/kontraktor',
        interior: '/interior',
        notaris: '/notaris',
        project_manager: '/project-manager',
        structural: '/structural-engineers',
        mep: '/mep-engineers',
    };

    try {
        const me = await apiFetch<{ data: User }>('/me');
        user = me.data;

        const isPlainUser = user.role_type === 'user';

        const [projectsResponse, feedResponse, third] = await Promise.all([
            apiFetch<{ data: unknown[] }>('/projects?all=true'),
            apiFetch<{ data: unknown[] }>('/projects?feed=true'),
            isPlainUser
                ? apiFetch<{ data: unknown[] }>('/hire-history')
                : apiFetch<{ data: unknown[] }>('/my-bids'),
        ]);

        projects = projectsResponse.data ?? [];
        projectFeed = feedResponse.data ?? [];

        if (isPlainUser) {
            hiredProfessionals = third.data ?? [];
        } else {
            myBids = third.data ?? [];
        }

        const collectionUrl = collectionForTab[activeTab];

        if (collectionUrl) {
            try {
                const response = await apiFetch<{ data: unknown[] }>(collectionUrl);
                collection = response.data ?? [];
            } catch {
                // A directory that cannot be fetched renders empty, exactly as
                // the legacy hook leaves it after a failed lazy load.
            }
        }
    } catch (error) {
        if (error instanceof ApiFailure && error.status === 401) {
            redirect('/login');
        }

        throw error;
    }

    return (
        <AuthProvider user={user}>
            <DashboardShell
                activeTab={activeTab}
                projects={projects as never[]}
                projectFeed={projectFeed as never[]}
                myBids={myBids as never[]}
                hiredProfessionals={hiredProfessionals as never[]}
                collection={collection as never[]}
            />
        </AuthProvider>
    );
}
