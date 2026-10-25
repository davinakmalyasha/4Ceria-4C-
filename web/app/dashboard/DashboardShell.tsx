'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { DashboardHeader } from '@/components/DashboardHeader';
import ChatOverlay from '@/content/components/Chat/ChatOverlay';
// THE TAB BODY IS BROWSER-ONLY.
//
// The tab tree reaches `maplibre-gl` through `react-map-gl`, and that library
// touches `document` while its module initialises — so server-rendering it
// throws at import time and the whole page 500s. The tabs are client
// components that fetch their own data anyway, so nothing is lost by rendering
// them on the client; the SHELL (header, counts, session) is still server-
// rendered, which is what the first paint is made of.
const DashboardTabs = dynamic(
    () => import('@/content/components/Dashboard/DashboardTabs').then((module) => module.DashboardTabs),
    {
        ssr: false,
        loading: () => (
            <div className="py-24 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 rounded-full border-[3px] border-neutral-200 border-t-[#FF2D20] animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Loading module...</p>
            </div>
        ),
    },
);
import { VerificationAlert } from '@/content/components/Dashboard/VerificationAlert';
import { CartProvider } from '@/content/context/CartContext';
import { useAuth } from '@/context/AuthContext';

/**
 * The dashboard shell.
 *
 * IT OWNS THE TAB, THE SELECTIONS AND NOTHING ELSE. The body is
 * `DashboardTabs` — the SAME component the legacy application renders, on the
 * new runtime. That is phase 1 of the frontend port: the shell, the session,
 * the routing and the data fetching are the port's own code; the tab bodies are
 * the existing ones until each is rewritten.
 *
 * `setActiveTab` pushes a URL rather than setting state, so every tab is a
 * location: the back button works, a notification can deep-link to it, and the
 * server renders the page the URL names.
 */

/**
 * The API's payloads, typed as `never[]` AT THE BOUNDARY.
 *
 * The synced tab components declare their own `Project` / `House` / directory
 * types, and `never[]` is assignable to every one of them — while an
 * `unknown[]` is assignable to none. The shapes are asserted by the components
 * that consume them, and by the golden files at the API level.
 */
type Rows = never[];

export function DashboardShell({
    activeTab,
    projects,
    projectFeed,
    myBids,
    hiredProfessionals,
    collection,
}: {
    activeTab: string;
    projects: Rows;
    projectFeed: Rows;
    myBids: Rows;
    hiredProfessionals: Rows;
    collection: Rows;
}) {
    const router = useRouter();
    const { user } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeSubTab, setActiveSubTab] = useState<string | null>(null);
    const [selectedProfessional, setSelectedProfessional] = useState<unknown>(null);
    const [selectedProject, setSelectedProject] = useState<unknown>(null);
    const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
    const [selectedMaterial, setSelectedMaterial] = useState<unknown>(null);
    const [projectToEdit, setProjectToEdit] = useState<unknown>(null);
    const [projectToDelete, setProjectToDelete] = useState<unknown>(null);
    const [chatUserId, setChatUserId] = useState<number | null>(null);

    const setActiveTab = (tab: string) => {
        setSidebarOpen(false);
        router.push(tab === 'overview' ? '/dashboard' : `/dashboard?tab=${tab}`);
    };

    const counts = useMemo(() => {
        const rows = projects as { status?: string }[];
        const activeProjects = rows.filter((p) => p.status !== 'completed' && p.status !== 'cancelled').length;

        return {
            projects: user?.role_type === 'user' ? activeProjects : projectFeed.length,
            management: activeProjects,
            'my-bids': (myBids as { status?: string }[]).filter((b) => b.status === 'pending' || b.status === 'invited').length,
            'my-houses': 0,
        } as Record<string, number>;
    }, [projects, projectFeed, myBids, user?.role_type]);

    // The directory a tab needs, delivered by the page for the ACTIVE tab.
    const directory = (tab: string): Rows => (activeTab === tab ? collection : []);

    // The cart is dashboard-scoped in the legacy tree: `Dashboard.tsx` wraps the
    // page in it, and the marketplace tabs read it with `useCart()`.
    return (
        <CartProvider>
        <div className="min-h-screen bg-neutral-100 flex overflow-hidden font-sans">
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <DashboardHeader
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    onMenuClick={() => setSidebarOpen(true)}
                    counts={counts}
                />

                <div className={`flex-1 overflow-y-auto px-4 sm:px-8 relative ${activeTab === 'houses' ? 'py-3 sm:py-4' : 'py-4 sm:py-8'}`}>
                    <div className="max-w-7xl mx-auto">
                        {user && (
                            <VerificationAlert user={user} activeTab={activeTab} setActiveTab={setActiveTab} />
                        )}

                        <DashboardTabs
                            activeTab={activeTab}
                            setActiveTab={setActiveTab}
                            activeSubTab={activeSubTab}
                            setActiveSubTab={setActiveSubTab}
                            user={user}
                            houses={directory('houses')}
                            projects={projects}
                            projectFeed={projectFeed}
                            latestBids={myBids}
                            myBids={myBids}
                            isLoadingData={false}
                            hiredProfessionals={hiredProfessionals}
                            architects={directory('architects')}
                            constructors={directory('constructors')}
                            interiors={directory('interior')}
                            notaries={directory('notaris')}
                            projectManagers={directory('project_manager')}
                            structuralEngineers={directory('structural')}
                            mepEngineers={directory('mep')}
                            selectedProfessional={selectedProfessional}
                            setSelectedProfessional={setSelectedProfessional}
                            selectedProject={selectedProject}
                            setSelectedProject={setSelectedProject}
                            selectedStoreId={selectedStoreId}
                            setSelectedStoreId={setSelectedStoreId}
                            selectedMaterial={selectedMaterial}
                            setSelectedMaterial={setSelectedMaterial}
                            handleOpenChat={(professional: { id: number }) => {
                                setChatUserId(professional.id);
                                setActiveTab('chat');
                            }}
                            handleProjectStatusChange={() => {}}
                            setProjectToEdit={setProjectToEdit}
                            setProjectToDelete={setProjectToDelete}
                            handleViewActiveBids={() => setActiveTab('projects')}
                            onRefresh={() => router.refresh()}
                            chatUserId={chatUserId}
                            onClearChatUser={() => setChatUserId(null)}
                        />
                    </div>
                </div>
            </main>

            {/* The floating chat button, exactly as the legacy tree renders it. */}
            <ChatOverlay activeTab={activeTab} onMaximize={() => setActiveTab('chat')} />

            {/* The shell keeps the tab's modals unmounted until they are used;
                these two carry state the tabs own. */}
            <span hidden data-modals={String(!!projectToEdit || !!projectToDelete)} />
        </div>
        </CartProvider>
    );
}
