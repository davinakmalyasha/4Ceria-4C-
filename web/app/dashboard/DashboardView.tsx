import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { apiFetch, ApiFailure } from '@/lib/api';
import { sessionToken } from '@/lib/session';
import { AuthProvider, type User } from '@/context/AuthContext';
import { DashboardShell } from './DashboardShell';
import { DirectoryPanel, ProjectsPanel } from './native';
import { MyBidsPanel, type MyBidRow } from './myBids';
import { HireHistoryPanel, type HireRow } from './hireHistory';
import { OverviewPanel, SPECIALIST_ROLES, type FirmInvitation, type OverviewProject, type OverviewUser } from './overview';
import {
    ExplorePanel,
    isExploreSection,
    type DirectoryRow,
    type ExploreData,
    type ExploreSection,
    type FavoriteItem,
    type HouseRow,
    type MaterialRow,
    type SupplierRow,
} from './explore';
import { titleCase } from '@/lib/format';
import { HousesPanel, MyHousesPanel } from './houses';
import { PostHouseForm } from './postHouse';
import { SavedPanel } from './saved';
import { ProfilePanel } from './profile';
import { VerificationPanel } from './verification';
import { MarketplacePanel, type MarketplaceMode } from './marketplace';
import { ChatPanel, type ChatMessage, type ConversationRow } from './chat';
import { OrdersPanel, type MaterialOrderRow } from './orders';
import { QuotesPanel, type MaterialQuoteRow } from './quotes';
import { FindEngineersPanel } from './findEngineers';
import { FindSubContractorsPanel } from './findSubContractors';
import { ManagementPanel, type ManagementProject } from './management';
import { FirmListPanel, FirmProfilePanel, type FirmMembership, type FirmProfilePayload } from './firms';
import type { FirmBrowseRow } from './firmWorkspace';
import type { NotificationRow } from '@/components/header/NotificationsDropdown';
import {
    DeliveryJobsPanel,
    JobRadarPanel,
    MyDeliveriesPanel,
    type DeliveryJobRow,
} from './deliveries';
import { InventoryPanel, type InventoryMaterial } from './inventory';
import { StorePanel, type StorePayload } from './store';
import { ConsultationsPanel, type ConsultationRow } from './consultations';
import { AssistantPanel } from './assistant';
import type { AiMessage, AiSession } from '@/components/ai/AiChat';
import { PostProjectForm } from './postProject';
import {
    LogisticsOverviewPanel,
    type LogisticsRecentJob,
    type LogisticsStats,
} from './logisticsOverview';

/**
 * The dashboard body — shared by `/dashboard` and `/dashboard/<tab>`.
 *
 * THE LEGACY HOOK FIRES ~15 REQUESTS ON MOUNT and keeps three module-level
 * caches alive across users. Here the page awaits only the calls the ACTIVE
 * tab needs, in parallel, before sending any markup — so the first paint is the
 * data, not a skeleton.
 *
 * An API 401 sends the visitor to /login. That is safe HERE because the server
 * knows why it is unauthenticated.
 */
export async function DashboardView({
    activeTab,
    error,
    section,
    q,
    category,
    type,
    conversation,
    firm,
    city,
    price_min,
    price_max,
    bedrooms,
    sort,
    page,
    session,
}: {
    activeTab: string;
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
}) {
    /**
     * THE TABS A SIGNED-OUT VISITOR MAY READ.
     *
     * The previous page lists exactly these and sends every other tab to /login.
     * This build reproduces the list rather than closing the door: the product
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
            redirect('/login?next=' + encodeURIComponent(`/dashboard/${activeTab}`));
        }

        let guestCollection: unknown[] = [];
        let guestMeta: { total: number; current_page: number; last_page: number } | null = null;
        let guestMaterials: MaterialRow[] = [];
        let guestSuppliers: SupplierRow[] = [];

        try {
            if (activeTab === 'houses') {
                const params = new URLSearchParams();
                if (q) params.set('search', q);
                if (city) params.set('city', city);
                if (price_min) params.set('price_min', price_min);
                if (price_max) params.set('price_max', price_max);
                if (bedrooms) params.set('bedrooms', bedrooms);
                if (sort) params.set('sort', sort);
                params.set('page', String(Math.max(1, Number.parseInt(page ?? '1', 10) || 1)));

                const response = await apiFetch<{
                    data: unknown[];
                    meta?: { total?: number; current_page?: number; last_page?: number };
                }>(`/houses?${params.toString()}`, {}, 60);
                guestCollection = response.data ?? [];
                if (response.meta && typeof response.meta.total === 'number') {
                    guestMeta = {
                        total: response.meta.total,
                        current_page: response.meta.current_page ?? 1,
                        last_page: response.meta.last_page ?? 1,
                    };
                }
            } else if (activeTab === 'marketplace-materials' || activeTab === 'marketplace-furniture') {
                const [materials, suppliers] = await Promise.all([
                    apiFetch<{ data: MaterialRow[] }>('/marketplace/materials', {}, 60),
                    apiFetch<{ data: SupplierRow[] }>('/marketplace/suppliers', {}, 60),
                ]);
                guestMaterials = materials.data ?? [];
                guestSuppliers = suppliers.data ?? [];
            } else {
                const publicPaths: Record<string, string> = {
                    architects: '/arsitek',
                    constructors: '/kontraktor',
                    interior: '/interior',
                    notaris: '/notaris',
                    project_manager: '/project-manager',
                    structural: '/structural-engineers',
                    mep: '/mep-engineers',
                };
                const path = publicPaths[activeTab];
                if (path) {
                    const response = await apiFetch<{ data: unknown[] }>(path, {}, 60);
                    guestCollection = response.data ?? [];
                }
            }
        } catch {
            // A public section that cannot load renders its empty state; the
            // rest of the page still paints.
        }

        let guestTab: ReactNode;
        if (activeTab === 'houses') {
            guestTab = (
                <HousesPanel
                    houses={guestCollection as HouseRow[]}
                    filters={{ q, city, price_min, price_max, bedrooms, sort }}
                    pageMeta={guestMeta}
                />
            );
        } else if (activeTab === 'marketplace-materials' || activeTab === 'marketplace-furniture') {
            guestTab = (
                <MarketplacePanel
                    mode={activeTab === 'marketplace-furniture' ? 'furniture' : 'materials'}
                    materials={guestMaterials}
                    suppliers={guestSuppliers}
                    q={q}
                    category={category}
                    fixedType
                    canQuote={false}
                />
            );
        } else if (activeTab === 'architects' || activeTab === 'constructors' || activeTab === 'interior' ||
            activeTab === 'notaris' || activeTab === 'project_manager' || activeTab === 'structural' || activeTab === 'mep') {
            guestTab = <DirectoryPanel rows={guestCollection as never[]} title={titleCase(activeTab)} />;
        } else {
            guestTab = (
                <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
                    <h1 className="text-xl font-black">Sign in to continue</h1>
                    <p className="mt-2 text-sm text-neutral-500">
                        This area is part of your project workspace.
                    </p>
                    <a href={`/login?next=${encodeURIComponent(`/dashboard/${activeTab}`)}`} className="mt-5 inline-block rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white">
                        Sign in
                    </a>
                </div>
            );
        }

        return (
            <AuthProvider user={null}>
                <DashboardShell
                    activeTab={activeTab}
                    counts={{}}
                    conversations={[]}
                    notifications={[]}
                    unreadNotifications={0}
                    storageBase=""
                    nativeTab={guestTab}
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
    let collectionMeta: { total: number; current_page: number; last_page: number } | null = null;
    /** Specialist roles see the firm-invitation banner on the overview. */
    let invitations: unknown[] = [];
    /** Explore fetches ONLY the section named by the URL. */
    const exploreSection: ExploreSection = section && isExploreSection(section) ? section : 'houses';
    const explore: ExploreData = { houses: [], professionals: {}, materials: [], suppliers: [], favorites: {} };
    /** The standalone Saved tab renders the resolved favorites map. */
    let savedItems: Record<string, FavoriteItem[]> = {};
    /** Marketplace materials/suppliers, fetched once for the cluster. */
    let marketplaceMaterials: MaterialRow[] = [];
    let marketplaceSuppliers: SupplierRow[] = [];
    /** Chat: the inbox and, when `?conversation=` names one, that thread. */
    let chatConversations: ConversationRow[] = [];
    let chatMessages: ChatMessage[] = [];
    let chatActiveId: number | null = null;
    let chatError: string | undefined;
    /** Header inbox: the latest notifications and the true unread count. */
    let headerNotifications: NotificationRow[] = [];
    let unreadNotifications = 0;
    /** Marketplace order/quote history. */
    let materialOrders: MaterialOrderRow[] = [];
    let materialQuotes: MaterialQuoteRow[] = [];
    /** Find Engineers stacks the two specialist directories. */
    let findEngineersStructural: DirectoryRow[] = [];
    let findEngineersMep: DirectoryRow[] = [];
    /** Hire Sub-Contractors reuses the constructor directory. */
    let subContractors: DirectoryRow[] = [];
    /** Firms: the owner profile and the specialist's memberships/invitations. */
    let firmProfile: FirmProfilePayload | null = null;
    let firmMemberships: FirmMembership[] = [];
    let firmInvitations: FirmMembership[] = [];
    let firmBrowse: FirmBrowseRow[] = [];
    let viewedFirm: FirmProfilePayload | null = null;
    let viewedFirmId: number | null = null;
    /** Delivery screens: supplier jobs, courier radar and courier assignments. */
    let deliveryJobs: DeliveryJobRow[] = [];
    let radarJobs: DeliveryJobRow[] = [];
    let myDeliveries: DeliveryJobRow[] = [];
    let deliveryError: string | undefined;
    /** Supplier screens. */
    let inventoryMaterials: InventoryMaterial[] = [];
    let inventoryError: string | undefined;
    let storeProfile: StorePayload | null = null;
    /** Notary consultation inbox. */
    let consultations: ConsultationRow[] = [];
    let consultationsError: string | undefined;
    /** Logistics overview counters (role=logistics only). */
    let logisticsStats: LogisticsStats = {};
    let logisticsJobs: LogisticsRecentJob[] = [];
    let logisticsError: string | undefined;
    /** AI assistant: status, session list and (when `?session=` names one) its thread. */
    let aiEnabled = false;
    let aiSessions: AiSession[] = [];
    let aiMessages: AiMessage[] = [];
    let aiActiveId: string | null = null;
    let aiError: string | undefined;

    // THE COLLECTION THIS TAB NEEDS, fetched HERE rather than after mount.
    const collectionForTab: Record<string, string> = {
        houses: '/houses',
        'my-houses': '/houses?mine=true',
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

        // The header renders on every authenticated dashboard route, so its
        // inbox and the shell's conversation list are page-wide calls rather
        // than post-hydration fetches. Everything the shell needs starts at
        // once; only tab-specific data waits behind this batch.
        const isPlainUser = user.role_type === 'user';
        // `my-bids` is a professional screen, but a plain user who opens it must
        // still get the pipeline call rather than the hire-history one.
        const wantsBids = !isPlainUser || activeTab === 'my-bids';

        const [notificationResult, projectsResponse, feedResponse, third, inboxResult] =
            await Promise.all([
                Promise.all([
                    apiFetch<{ data: NotificationRow[] }>('/notifications'),
                    apiFetch<{ unread_notifications?: number }>('/me/unread-summary'),
                ]).catch(() => null),
                apiFetch<{ data: unknown[] }>('/projects?all=true'),
                apiFetch<{ data: unknown[] }>('/projects?feed=true'),
                wantsBids
                    ? apiFetch<{ data: unknown[] }>('/my-bids')
                    : apiFetch<{ data: unknown[] }>('/hire-history'),
                apiFetch<{ data: ConversationRow[] }>('/conversations').catch(() => null),
            ]);

        if (notificationResult) {
            headerNotifications = notificationResult[0].data ?? [];
            unreadNotifications = notificationResult[1].unread_notifications ?? 0;
        }
        if (inboxResult) {
            chatConversations = inboxResult.data ?? [];
        }

        projects = projectsResponse.data ?? [];
        projectFeed = feedResponse.data ?? [];

        if (wantsBids) {
            myBids = third.data ?? [];
        } else {
            hiredProfessionals = third.data ?? [];
        }

        const collectionUrl = collectionForTab[activeTab];

        if (collectionUrl) {
            try {
                if (activeTab === 'my-houses') {
                    // The list is scoped server-side now; no client-side
                    // filtering and no 20-page crawl.
                    const response = await apiFetch<{
                        data: unknown[];
                        meta?: { total?: number; current_page?: number; last_page?: number };
                    }>('/houses?mine=true');
                    collection = response.data ?? [];
                    if (response.meta && typeof response.meta.total === 'number') {
                        collectionMeta = {
                            total: response.meta.total,
                            current_page: response.meta.current_page ?? 1,
                            last_page: response.meta.last_page ?? 1,
                        };
                    }
                } else {
                    // Houses carry the listing filters into the API call, so the
                    // filter form narrows server-side (search/city/price/bedrooms/
                    // sort) instead of filtering the first page in the browser.
                    let url = collectionUrl;
                    if (activeTab === 'houses') {
                        const params = new URLSearchParams();
                        if (q) params.set('search', q);
                        if (city) params.set('city', city);
                        if (price_min) params.set('price_min', price_min);
                        if (price_max) params.set('price_max', price_max);
                        if (bedrooms) params.set('bedrooms', bedrooms);
                        if (sort) params.set('sort', sort);
                        const wanted = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);
                        params.set('page', String(wanted));
                        const query = params.toString();
                        if (query) url += `${url.includes('?') ? '&' : '?'}${query}`;
                    }
                    // Public directories change slowly; a 60s cache keeps Explore
                    // cheap. Authenticated money/user reads below stay no-store.
                    const response = await apiFetch<{
                        data: unknown[];
                        meta?: { total?: number; current_page?: number; last_page?: number };
                    }>(url, {}, 60);
                    collection = response.data ?? [];
                    if (response.meta && typeof response.meta.total === 'number') {
                        collectionMeta = {
                            total: response.meta.total,
                            current_page: response.meta.current_page ?? 1,
                            last_page: response.meta.last_page ?? 1,
                        };
                    }
                }
            } catch {
                // A directory that cannot be fetched renders empty, exactly as
                // the previous hook leaves it after a failed lazy load.
            }
        }

        if (activeTab === 'overview' && SPECIALIST_ROLES.has(user.role_type ?? '')) {
            try {
                const response = await apiFetch<{ data: unknown[] }>('/firm-members/invitations');
                invitations = response.data ?? [];
            } catch {
                // An invitation list that cannot be fetched renders as no
                // banner, exactly like the previous component's empty state.
            }
        }

        if (activeTab === 'overview' && user.role_type === 'logistics') {
            try {
                const response = await apiFetch<{
                    stats?: LogisticsStats;
                    recentJobs?: LogisticsRecentJob[];
                }>('/logistics/dashboard-stats');
                logisticsStats = response.stats ?? {};
                logisticsJobs = response.recentJobs ?? [];
            } catch (logisticsFailure) {
                if (!(logisticsFailure instanceof ApiFailure)) {
                    throw logisticsFailure;
                }
                logisticsError = logisticsFailure.message;
            }
        }

        if (activeTab === 'explore') {
            try {
                if (exploreSection === 'houses') {
                    const response = await apiFetch<{ data: HouseRow[] }>('/houses');
                    explore.houses = response.data ?? [];
                } else if (exploreSection === 'professionals') {
                    const [projectManagers, architects, interiors, constructors, notaries, structural, mep] =
                        await Promise.all([
                            apiFetch<{ data: DirectoryRow[] }>('/project-manager'),
                            apiFetch<{ data: DirectoryRow[] }>('/arsitek'),
                            apiFetch<{ data: DirectoryRow[] }>('/interior'),
                            apiFetch<{ data: DirectoryRow[] }>('/kontraktor'),
                            apiFetch<{ data: DirectoryRow[] }>('/notaris'),
                            apiFetch<{ data: DirectoryRow[] }>('/structural-engineers'),
                            apiFetch<{ data: DirectoryRow[] }>('/mep-engineers'),
                        ]);

                    explore.professionals = {
                        project_manager: projectManagers.data ?? [],
                        arsitek: architects.data ?? [],
                        interior: interiors.data ?? [],
                        kontraktor: constructors.data ?? [],
                        notaris: notaries.data ?? [],
                        structural: structural.data ?? [],
                        mep: mep.data ?? [],
                    };
                } else if (exploreSection === 'marketplace') {
                    const [materials, suppliers] = await Promise.all([
                        apiFetch<{ data: MaterialRow[] }>('/marketplace/materials'),
                        apiFetch<{ data: SupplierRow[] }>('/marketplace/suppliers'),
                    ]);
                    explore.materials = materials.data ?? [];
                    explore.suppliers = suppliers.data ?? [];
                } else if (exploreSection === 'saved') {
                    const response = await apiFetch<{
                        data: Record<string, number[]>;
                        items?: Record<string, FavoriteItem[]>;
                    }>('/favorites');
                    explore.favorites = response.items ?? {};
                }
            } catch {
                // A section that cannot be fetched renders its empty state; the
                // rest of the dashboard must still paint.
            }
        }

        if (activeTab === 'saved') {
            try {
                const response = await apiFetch<{
                    data: Record<string, number[]>;
                    items?: Record<string, FavoriteItem[]>;
                }>('/favorites');
                savedItems = response.items ?? {};
            } catch {
                // A favorites call that fails renders the empty state.
            }
        }

        if (
            activeTab === 'marketplace' ||
            activeTab === 'marketplace-materials' ||
            activeTab === 'marketplace-furniture'
        ) {
            try {
                const [materials, suppliers] = await Promise.all([
                    apiFetch<{ data: MaterialRow[] }>('/marketplace/materials'),
                    apiFetch<{ data: SupplierRow[] }>('/marketplace/suppliers'),
                ]);
                marketplaceMaterials = materials.data ?? [];
                marketplaceSuppliers = suppliers.data ?? [];
            } catch {
                // The marketplace renders its empty states if either call fails.
            }
        }

        if (activeTab === 'chat') {
            try {
                const requested = Number.parseInt(conversation ?? '', 10);
                if (Number.isInteger(requested) && requested > 0) {
                    try {
                        const thread = await apiFetch<{ data: ChatMessage[] }>(
                            `/conversations/${requested}`,
                        );
                        chatActiveId = requested;
                        chatMessages = thread.data ?? [];
                    } catch (threadError) {
                        if (
                            threadError instanceof ApiFailure &&
                            (threadError.status === 403 || threadError.status === 404)
                        ) {
                            chatError = 'That conversation is not available for this account.';
                        } else {
                            throw threadError;
                        }
                    }
                }
            } catch {
                // The chat screen renders its empty inbox if the list fails.
            }
        }

        if (activeTab === 'orders' || activeTab === 'material-orders') {
            try {
                const response = await apiFetch<{ data: MaterialOrderRow[] }>('/material-orders');
                materialOrders = response.data ?? [];
            } catch {
                // The panel renders its empty state if the list fails.
            }
        }

        if (activeTab === 'quotes') {
            try {
                const response = await apiFetch<{ data: MaterialQuoteRow[] }>('/material-quotes');
                materialQuotes = response.data ?? [];
            } catch {
                // The panel renders its empty state if the list fails.
            }
        }

        if (activeTab === 'find-engineers') {
            try {
                const [structural, mep] = await Promise.all([
                    apiFetch<{ data: DirectoryRow[] }>('/structural-engineers'),
                    apiFetch<{ data: DirectoryRow[] }>('/mep-engineers'),
                ]);
                findEngineersStructural = structural.data ?? [];
                findEngineersMep = mep.data ?? [];
            } catch {
                // Each section renders its empty state if a call fails.
            }
        }

        if (activeTab === 'find-sub-contractors') {
            try {
                const response = await apiFetch<{ data: DirectoryRow[] }>('/kontraktor');
                subContractors = response.data ?? [];
            } catch {
                // The panel renders its empty state if the list fails.
            }
        }

        if (activeTab === 'my-firm') {
            try {
                firmProfile = await apiFetch<FirmProfilePayload>(`/firm-members/profile/${user.id}`);
            } catch (profileError) {
                if (!(profileError instanceof ApiFailure) || profileError.status !== 404) {
                    throw profileError;
                }
                // A role without a firm profile renders the explanatory card.
            }
        }

        if (activeTab === 'my-firms') {
            try {
                const [memberships, invitations] = await Promise.all([
                    apiFetch<{ data: FirmMembership[] }>('/firm-members/my-firms'),
                    apiFetch<{ data: FirmMembership[] }>('/firm-members/invitations'),
                ]);
                firmMemberships = memberships.data ?? [];
                firmInvitations = invitations.data ?? [];
            } catch {
                // The panel renders its empty states if a call fails.
            }

            try {
                const search = (q ?? '').trim();
                const url =
                    search.length >= 2
                        ? `/firm-members/browse-owners?query=${encodeURIComponent(search)}`
                        : '/firm-members/browse-owners';
                const browse = await apiFetch<{ data: FirmBrowseRow[] }>(url);
                firmBrowse = browse.data ?? [];
            } catch {
                // A directory that cannot be fetched renders empty.
            }

            const requestedFirm = Number.parseInt(firm ?? '', 10);
            if (Number.isInteger(requestedFirm) && requestedFirm > 0) {
                try {
                    viewedFirm = await apiFetch<FirmProfilePayload>(
                        `/firm-members/profile/${requestedFirm}`,
                    );
                    viewedFirmId = requestedFirm;
                } catch {
                    // An unknown firm id renders the directory without a profile.
                }
            }
        }

        if (activeTab === 'delivery-jobs') {
            try {
                const response = await apiFetch<{ data: DeliveryJobRow[] }>('/delivery-jobs');
                deliveryJobs = response.data ?? [];
            } catch (deliveryFailure) {
                if (!(deliveryFailure instanceof ApiFailure) || deliveryFailure.status !== 403) {
                    throw deliveryFailure;
                }
                deliveryError = 'Delivery jobs are visible to supplier accounts only.';
            }
        }

        if (activeTab === 'job-radar') {
            try {
                const response = await apiFetch<{ data: DeliveryJobRow[] }>('/logistics/available-jobs');
                radarJobs = response.data ?? [];
            } catch (radarFailure) {
                if (!(radarFailure instanceof ApiFailure) || radarFailure.status !== 403) {
                    throw radarFailure;
                }
                deliveryError = 'Job Radar is available to logistics accounts only.';
            }
        }

        if (activeTab === 'my-deliveries') {
            try {
                const response = await apiFetch<{ data: DeliveryJobRow[] }>('/logistics/my-jobs');
                myDeliveries = response.data ?? [];
            } catch (myFailure) {
                if (!(myFailure instanceof ApiFailure) || myFailure.status !== 403) {
                    throw myFailure;
                }
                deliveryError = 'My Deliveries is available to logistics accounts only.';
            }
        }

        if (activeTab === 'inventory') {
            try {
                const response = await apiFetch<{ data: InventoryMaterial[] }>('/merchant/materials');
                inventoryMaterials = response.data ?? [];
            } catch (inventoryFailure) {
                if (
                    !(inventoryFailure instanceof ApiFailure) ||
                    (inventoryFailure.status !== 403 && inventoryFailure.status !== 404)
                ) {
                    throw inventoryFailure;
                }
                inventoryError = 'Merchant inventory is available to supplier accounts only.';
            }
        }

        if (activeTab === 'store') {
            try {
                const suppliers = await apiFetch<{ data: StorePayload[] }>('/marketplace/suppliers');
                const mine = (suppliers.data ?? []).find((supplier) => supplier.user_id === user.id);
                if (mine) {
                    try {
                        const full = await apiFetch<{ data: StorePayload }>(
                            `/marketplace/suppliers/${mine.id}`,
                        );
                        storeProfile = full.data;
                    } catch {
                        // The list row is enough for a store summary.
                        storeProfile = mine;
                    }
                }
            } catch {
                // The panel renders its no-store state.
            }
        }

        if (activeTab === 'consultations') {
            try {
                const response = await apiFetch<{ data: ConsultationRow[] }>('/consultations');
                consultations = response.data ?? [];
            } catch (consultationFailure) {
                if (!(consultationFailure instanceof ApiFailure)) {
                    throw consultationFailure;
                }
                consultationsError = consultationFailure.message;
            }
        }

        if (activeTab === 'assistant') {
            try {
                const status = await apiFetch<{ enabled?: boolean }>('/ai/status');
                aiEnabled = status.enabled ?? false;
            } catch {
                // An unreadable status renders the panel as unconfigured.
            }
            try {
                const list = await apiFetch<{ data: AiSession[] }>('/ai/sessions');
                aiSessions = list.data ?? [];
                if (session) {
                    try {
                        const thread = await apiFetch<{ messages?: AiMessage[] }>(
                            `/ai/sessions/${encodeURIComponent(session)}`,
                        );
                        aiActiveId = session;
                        aiMessages = thread.messages ?? [];
                    } catch (threadError) {
                        if (
                            threadError instanceof ApiFailure &&
                            (threadError.status === 403 || threadError.status === 404)
                        ) {
                            aiError = 'That conversation is not available for this account.';
                        } else {
                            throw threadError;
                        }
                    }
                }
            } catch {
                // The assistant renders its empty states if the list fails.
            }
        }
    } catch (error) {
        if (error instanceof ApiFailure && error.status === 401) {
            redirect('/auth/expire?next=/login');
        }

        throw error;
    }

    /**
     * THE PANELS ALREADY PORTED are rendered HERE, as server components, and
     * the tab tree is not mounted for them. The rest still use it.
     */
    const DIRECTORY_TABS = new Set([
        'architects', 'constructors', 'interior', 'notaris',
        'project_manager', 'structural', 'mep',
    ]);

    let nativeTab: ReactNode | undefined;
    if (activeTab === 'overview') {
        nativeTab =
            user.role_type === 'logistics' ? (
                <LogisticsOverviewPanel
                    name={user.name}
                    stats={logisticsStats}
                    jobs={logisticsJobs}
                    error={logisticsError ?? error}
                />
            ) : (
                <OverviewPanel
                    user={user as OverviewUser}
                    projects={projects as OverviewProject[]}
                    projectFeed={projectFeed as OverviewProject[]}
                    myBids={myBids as MyBidRow[]}
                    hiredProfessionals={hiredProfessionals as { id: number }[]}
                    invitations={invitations as FirmInvitation[]}
                    error={error}
                />
            );
    } else if (activeTab === 'houses') {
        nativeTab = (
            <HousesPanel
                houses={collection as HouseRow[]}
                filters={{ q, city, price_min, price_max, bedrooms, sort }}
                pageMeta={collectionMeta}
            />
        );
    } else if (activeTab === 'my-houses') {
        nativeTab = (
            <MyHousesPanel houses={collection as HouseRow[]} viewerId={user.id} error={error} />
        );
    } else if (activeTab === 'post-house') {
        nativeTab = <PostHouseForm />;
    } else if (activeTab === 'post-project') {
        nativeTab = <PostProjectForm />;
    } else if (activeTab === 'saved') {
        nativeTab = <SavedPanel items={savedItems} error={error} />;
    } else if (activeTab === 'profile') {
        nativeTab = <ProfilePanel user={user} error={error} />;
    } else if (activeTab === 'verification') {
        nativeTab = <VerificationPanel user={user} />;
    } else if (
        activeTab === 'marketplace' ||
        activeTab === 'marketplace-materials' ||
        activeTab === 'marketplace-furniture'
    ) {
        const mode: MarketplaceMode =
            activeTab === 'marketplace-furniture'
                ? 'furniture'
                : activeTab === 'marketplace-materials'
                  ? 'materials'
                  : type === 'furniture'
                    ? 'furniture'
                    : 'materials';

        nativeTab = (
            <MarketplacePanel
                mode={mode}
                materials={marketplaceMaterials}
                suppliers={marketplaceSuppliers}
                q={q}
                category={category}
                fixedType={activeTab !== 'marketplace'}
            />
        );
    } else if (activeTab === 'chat') {
        nativeTab = (
            <ChatPanel
                conversations={chatConversations}
                activeId={chatActiveId}
                messages={chatMessages}
                viewerId={user.id}
                error={chatError ?? error}
            />
        );
    } else if (activeTab === 'orders' || activeTab === 'material-orders') {
        nativeTab = <OrdersPanel orders={materialOrders} viewerRole={user.role_type} error={error} />;
    } else if (activeTab === 'quotes') {
        nativeTab = <QuotesPanel quotes={materialQuotes} viewerRole={user.role_type} error={error} />;
    } else if (activeTab === 'find-engineers') {
        nativeTab = (
            <FindEngineersPanel structural={findEngineersStructural} mep={findEngineersMep} />
        );
    } else if (activeTab === 'find-sub-contractors') {
        nativeTab = <FindSubContractorsPanel contractors={subContractors} />;
    } else if (activeTab === 'management') {
        nativeTab = <ManagementPanel projects={projects as ManagementProject[]} />;
    } else if (activeTab === 'my-firm') {
        nativeTab = <FirmProfilePanel profile={firmProfile} error={error} />;
    } else if (activeTab === 'my-firms') {
        nativeTab = (
            <FirmListPanel
                memberships={firmMemberships}
                invitations={firmInvitations}
                browseFirms={firmBrowse}
                viewedFirm={viewedFirm}
                viewedFirmId={viewedFirmId}
                query={q}
                error={error}
            />
        );
    } else if (activeTab === 'delivery-jobs') {
        nativeTab = (
            <DeliveryJobsPanel jobs={deliveryJobs} role={user.role_type} error={deliveryError ?? error} />
        );
    } else if (activeTab === 'job-radar') {
        nativeTab = (
            <JobRadarPanel jobs={radarJobs} role={user.role_type} error={deliveryError ?? error} />
        );
    } else if (activeTab === 'my-deliveries') {
        nativeTab = (
            <MyDeliveriesPanel jobs={myDeliveries} role={user.role_type} error={deliveryError ?? error} />
        );
    } else if (activeTab === 'inventory') {
        nativeTab = (
            <InventoryPanel
                materials={inventoryMaterials}
                role={user.role_type}
                error={inventoryError ?? error}
            />
        );
    } else if (activeTab === 'store') {
        nativeTab = <StorePanel store={storeProfile} error={error} />;
    } else if (activeTab === 'consultations') {
        nativeTab = (
            <ConsultationsPanel
                consultations={consultations}
                role={user.role_type}
                error={consultationsError ?? error}
            />
        );
    } else if (activeTab === 'assistant') {
        nativeTab = (
            <AssistantPanel
                enabled={aiEnabled}
                sessions={aiSessions}
                activeSessionId={aiActiveId}
                messages={aiMessages}
                error={aiError ?? error}
            />
        );
    } else if (activeTab === 'explore') {
        nativeTab = <ExplorePanel section={exploreSection} data={explore} />;
    } else if (activeTab === 'projects') {
        // Owners see their own/hired scope; professionals see the open-tender
        // feed as their Bidding Board (the nav labels it so). Sharing one
        // panel keeps the cards identical — only the dataset and the board
        // copy switch.
        const board = user.role_type !== 'user';
        nativeTab = <ProjectsPanel rows={(board ? projectFeed : projects) as never[]} board={board} />;
    } else if (activeTab === 'my-bids') {
        nativeTab = <MyBidsPanel bids={myBids as MyBidRow[]} error={error} user={user} />;
    } else if (activeTab === 'hire-history') {
        nativeTab = <HireHistoryPanel rows={hiredProfessionals as HireRow[]} />;
    } else if (DIRECTORY_TABS.has(activeTab)) {
        nativeTab = <DirectoryPanel rows={collection as never[]} title={titleCase(activeTab)} />;
    }

    const activeProjectCount = (projects as { status?: string }[]).filter(
        (project) => project.status !== 'completed' && project.status !== 'cancelled',
    ).length;
    const isPlainUser = user.role_type === 'user';
    const navCounts: Record<string, number> = {
        projects: isPlainUser ? activeProjectCount : projectFeed.length,
        management: activeProjectCount,
        'my-bids': (myBids as { status?: string }[]).filter(
            (bid) => bid.status === 'pending' || bid.status === 'invited',
        ).length,
        'my-houses': activeTab === 'my-houses' ? collection.length : 0,
    };

    return (
        <AuthProvider user={user}>
            <DashboardShell
                activeTab={activeTab}
                counts={navCounts}
                conversations={chatConversations}
                notifications={headerNotifications}
                unreadNotifications={unreadNotifications}
                storageBase=""
                nativeTab={nativeTab}
            />
        </AuthProvider>
    );
}
