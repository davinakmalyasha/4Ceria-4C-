import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';
import { sessionToken } from '@/lib/session';
import { AuthProvider, type User } from '@/context/AuthContext';

/**
 * The admin area's guard and providers.
 *
 * A LAYOUT, not a per-page check. The legacy wraps each admin route in
 * `<AdminRoute>`, which renders a loader while `/me` answers and then either
 * redirects or renders — so a non-admin briefly sees the admin shell. Here the
 * check happens once, on the server, before any admin markup exists, and a
 * non-admin is redirected without being told the area exists.
 *
 * The synced pages keep their own `AdminLayout` chrome; this layout only
 * supplies the session and the guard.
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

    return <AuthProvider user={user}>{children}</AuthProvider>;
}
