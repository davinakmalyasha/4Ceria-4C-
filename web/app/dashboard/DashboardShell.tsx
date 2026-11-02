'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { DashboardHeader } from '@/components/DashboardHeader';
import { VerificationAlert } from '@/components/header/VerificationAlert';
import { useAuth } from '@/context/AuthContext';
import { ChatLauncher } from './ChatLauncher';
import type { ConversationRow } from './chat';
import type { NotificationRow } from '@/components/header/NotificationsDropdown';

/**
 * The dashboard shell.
 *
 * IT OWNS THE TAB, THE SELECTIONS AND NOTHING ELSE. Every tab body is now a
 * native panel rendered by the server; `nativeTab` is the slot that receives it.
 * The synced `DashboardTabs` tree is no longer mounted by the dashboard, so the
 * legacy bundle (and its `Loading module...` boundary) is not part of the route.
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
    conversations,
    notifications,
    unreadNotifications,
    storageBase,
    nativeTab,
}: {
    activeTab: string;
    projects: Rows;
    projectFeed: Rows;
    myBids: Rows;
    hiredProfessionals: Rows;
    collection: Rows;
    conversations: ConversationRow[];
    notifications: NotificationRow[];
    unreadNotifications: number;
    storageBase: string;
    /** A server-rendered panel; when present the legacy tab tree is not mounted. */
    nativeTab?: ReactNode;
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
        router.push(tab === 'overview' ? '/dashboard' : `/dashboard/${tab}`);
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

    return (
        <div className="min-h-screen bg-neutral-100 flex overflow-hidden font-sans">
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <DashboardHeader
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    onMenuClick={() => setSidebarOpen(true)}
                    counts={counts}
                    notifications={notifications}
                    unreadNotifications={unreadNotifications}
                    storageBase={storageBase}
                />

                <div className={`flex-1 overflow-y-auto px-4 sm:px-8 relative ${activeTab === 'houses' ? 'py-3 sm:py-4' : 'py-4 sm:py-8'}`}>
                    <div className="max-w-7xl mx-auto">
                        {user && (
                            <VerificationAlert user={user} activeTab={activeTab} setActiveTab={setActiveTab} />
                        )}

                        {nativeTab}
                    </div>
                </div>
            </main>

            {/* The floating messenger: server-fed inbox, BFF thread, native composer. */}
            <ChatLauncher
                conversations={conversations}
                viewerId={user?.id ?? 0}
                activeTab={activeTab}
                storageBase={storageBase}
            />

            {/* The shell keeps the tab's modals unmounted until they are used;
                these two carry state the tabs own. */}
            <span hidden data-modals={String(!!projectToEdit || !!projectToDelete)} />
        </div>
    );
}
