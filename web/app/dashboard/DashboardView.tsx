import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { apiFetch, ApiFailure } from '@/lib/api';
import { apiOrigin, sessionToken } from '@/lib/session';
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
                    conversations={[]}
                    notifications={[]}
                    unreadNotifications={0}
                    storageBase={apiOrigin()}
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
        // inbox is one page-wide pair of calls rather than a post-hydration
        // fetch plus poll.
        try {
            const [notificationList, unreadSummary] = await Promise.all([
                apiFetch<{ data: NotificationRow[] }>('/notifications'),
                apiFetch<{ unread_notifications?: number }>('/me/unread-summary'),
            ]);
            headerNotifications = notificationList.data ?? [];
            unreadNotifications = unreadSummary.unread_notifications ?? 0;
        } catch {
            // The bell renders empty when the inbox cannot be read.
        }

        const isPlainUser = user.role_type === 'user';
        // `my-bids` is a professional screen, but a plain user who opens it must
        // still get the pipeline call rather than the hire-history one.
        const wantsBids = !isPlainUser || activeTab === 'my-bids';

        const [projectsResponse, feedResponse, third] = await Promise.all([
            apiFetch<{ data: unknown[] }>('/projects?all=true'),
            apiFetch<{ data: unknown[] }>('/projects?feed=true'),
            wantsBids
                ? apiFetch<{ data: unknown[] }>('/my-bids')
                : apiFetch<{ data: unknown[] }>('/hire-history'),
        ]);

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
                    // `?mine=` is dead server-side (anonymous caller, parity
                    // with the oracle which answers everybody's rows), so
                    // aggregate every public page here and let MyHousesPanel
                    // client-filter by viewerId — the same rows, just all of
                    // them. The 20-page cap bounds this at 240 listings;
                    // no-store because the panel renders a per-viewer slice.
                    const mine: unknown[] = [];
                    for (let wanted = 1; wanted <= 20; wanted++) {
                        const minePage = await apiFetch<{
                            data: unknown[];
                            meta?: { last_page?: number };
                        }>(`/houses?mine=true&page=${wanted}`);
                        mine.push(...(minePage.data ?? []));
                        if (
                            wanted >= (minePage.meta?.last_page ?? 1) ||
                            (minePage.data ?? []).length === 0
                        ) {
                            break;
                        }
                    }
                    collection = mine;
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
                // the legacy hook leaves it after a failed lazy load.
            }
        }

        if (activeTab === 'overview' && SPECIALIST_ROLES.has(user.role_type ?? '')) {
            try {
                const response = await apiFetch<{ data: unknown[] }>('/firm-members/invitations');
                invitations = response.data ?? [];
            } catch {
                // An invitation list that cannot be fetched renders as no
                // banner, exactly like the legacy component's empty state.
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

        // The floating launcher is mounted on every tab, so the inbox is one
        // dashboard-wide call; the full chat route fetches it (and its thread)
        // below instead of paying for it twice.
        if (activeTab !== 'chat') {
            try {
                const inbox = await apiFetch<{ data: ConversationRow[] }>('/conversations');
                chatConversations = inbox.data ?? [];
            } catch {
                // An inbox that cannot be fetched renders an empty launcher list.
            }
        }

        if (activeTab === 'chat') {
            try {
                const inbox = await apiFetch<{ data: ConversationRow[] }>('/conversations');
                chatConversations = inbox.data ?? [];

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
            redirect('/login');
        }

        throw error;
    }

    /**
     * THE PANELS ALREADY PORTED are rendered HERE, as server components, and
     * the synced tab tree is not mounted for them. The rest still use it.
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
        nativeTab = <MyBidsPanel bids={myBids as MyBidRow[]} />;
    } else if (activeTab === 'hire-history') {
        nativeTab = <HireHistoryPanel rows={hiredProfessionals as HireRow[]} />;
    } else if (DIRECTORY_TABS.has(activeTab)) {
        nativeTab = <DirectoryPanel rows={collection as never[]} title={titleCase(activeTab)} />;
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
                conversations={chatConversations}
                notifications={headerNotifications}
                unreadNotifications={unreadNotifications}
                storageBase={apiOrigin()}
                nativeTab={nativeTab}
            />
        </AuthProvider>
    );
}
