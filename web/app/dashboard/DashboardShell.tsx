'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { DashboardHeader } from '@/components/DashboardHeader';
import { MobileNav } from '@/components/header/MobileNav';
import { VerificationAlert } from '@/components/header/VerificationAlert';
import { DataFreshness } from '@/components/feedback/DataFreshness';
import { useAuth } from '@/context/AuthContext';
import { ChatLauncher } from './ChatLauncher';
import { AiLauncher } from '@/components/ai/AiLauncher';
import type { ConversationRow } from './chat';
import type { NotificationRow } from '@/components/header/NotificationsDropdown';

/**
 * The dashboard shell.
 *
 * The page computes the navigation counts on the server, so the shell receives
 * four numbers instead of four whole collections. `setActiveTab` pushes a URL
 * rather than setting state: every tab is a location, the back button works,
 * and a notification can deep-link to it.
 */
export function DashboardShell({
    activeTab,
    counts,
    conversations,
    notifications,
    unreadNotifications,
    storageBase,
    nativeTab,
}: {
    activeTab: string;
    counts?: Record<string, number>;
    conversations: ConversationRow[];
    notifications: NotificationRow[];
    unreadNotifications: number;
    storageBase: string;
    /** A server-rendered panel for the active tab. */
    nativeTab?: ReactNode;
}) {
    const router = useRouter();
    const { user } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const ADMIN_ROUTES: Record<string, string> = {
        users: '/admin',
        verifications: '/admin/verification',
        properties_moderation: '/admin/houses',
        projects_moderation: '/admin/projects',
    };

    const setActiveTab = (tab: string) => {
        setSidebarOpen(false);
        const adminRoute = ADMIN_ROUTES[tab];
        if (adminRoute) {
            router.push(adminRoute);
            return;
        }
        router.push(tab === 'overview' ? '/dashboard' : `/dashboard/${tab}`);
    };

    return (
        <div className="flex min-h-dvh overflow-hidden bg-neutral-100 font-sans">
            <main className="flex h-dvh flex-1 flex-col overflow-hidden">
                <DashboardHeader
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    onMenuClick={() => setSidebarOpen(true)}
                    counts={counts}
                    notifications={notifications}
                    unreadNotifications={unreadNotifications}
                    storageBase={storageBase}
                />

                <div
                    className={`relative flex-1 overflow-y-auto px-4 sm:px-8 ${
                        activeTab === 'houses' ? 'py-3 sm:py-4' : 'py-4 sm:py-8'
                    }`}
                >
                    <div className="mx-auto max-w-7xl">
                        {user && (
                            <VerificationAlert
                                user={user}
                                activeTab={activeTab}
                                setActiveTab={setActiveTab}
                            />
                        )}

                        <DataFreshness />

                        {nativeTab}
                    </div>
                </div>
            </main>

            <MobileNav
                open={sidebarOpen}
                activeTab={activeTab}
                counts={counts}
                storageBase={storageBase}
                onClose={() => setSidebarOpen(false)}
                onNavigate={setActiveTab}
            />

            <ChatLauncher
                conversations={conversations}
                viewerId={user?.id ?? 0}
                activeTab={activeTab}
                storageBase={storageBase}
            />

            <AiLauncher activeTab={activeTab} viewerId={user?.id ?? 0} />
        </div>
    );
}
