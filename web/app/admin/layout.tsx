import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';
import { sessionToken } from '@/lib/session';
import { AuthProvider, type User } from '@/context/AuthContext';
import { AdminShell } from '@/components/admin/AdminShell';
import type { AdminStats, DisputesPayload } from '@/components/admin/types';

/**
 * The admin area's guard, chrome and badges.
 *
 * A LAYOUT, not a per-page check: the session is resolved once, on the server,
 * before any admin markup exists, and a non-admin never sees the shell. The two
 * badge counts come from the same endpoints the legacy layout called after
 * mount, so the sidebar is correct on first paint.
 */
export default async function AdminLayoutPage({ children }: { children: React.ReactNode }) {
    if (!(await sessionToken())) {
        redirect('/login');
    }

    let user: User;

    try {
        const me = await apiFetch<{ data: User }>('/me');
        user = me.data;
    } catch (error) {
        if (error instanceof ApiFailure && error.status === 401) {
            redirect('/login');
        }

        throw error;
    }

    if (user.role_type !== 'admin') {
        redirect('/dashboard');
    }

    let pending = 0;
    let openDisputes = 0;

    try {
        const [stats, disputes] = await Promise.all([
            apiFetch<AdminStats>('/admin/stats'),
            apiFetch<DisputesPayload>('/admin/disputes?status=open&page=1'),
        ]);
        pending = stats.pending_verifications ?? 0;
        openDisputes = disputes.open_count ?? 0;
    } catch {
        // The shell still renders; a failed badge is not a failed page.
    }

    return (
        <AuthProvider user={user}>
            <AdminShell pending={pending} disputes={openDisputes}>
                {children}
            </AdminShell>
        </AuthProvider>
    );
}
