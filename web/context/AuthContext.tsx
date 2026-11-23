'use client';

import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/actions';

/**
 * The session as the UI sees it.
 *
 * THE LEGACY CONTEXT IS A FETCHER. `AuthProvider` reads `localStorage`, renders
 * an unauthenticated state, calls `/me`, and only then knows who the user is —
 * which is why every screen needs a loading branch and why the dashboard can
 * briefly paint a guest.
 *
 * HERE THE ANSWER IS ALREADY KNOWN. The server resolved the cookie, fetched the
 * profile once, and passed it in. `isLoading` exists only because this builded
 * components read it: it is always `false`.
 *
 * `logout` is a server action. It revokes the token before redirecting, which
 * the previous version could not do — it set `window.location.href` immediately,
 * cancelling its own revoke request (the previous code documents this).
 */

/**
 * The profile shape this builded components expect.
 *
 * `User` is the previous name, kept because the components import it. The
 * index signature is `any` on purpose: the API returns role-specific relations
 * (`arsitek`, `kontraktor`, `supplier`, …) that a component reads directly, and
 * a narrower type here would only push a cast into every one of them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type User = {
    id: number;
    name: string;
    email: string;
    username?: string | null;
    role_type: string;
    pic?: string | null;
    [key: string]: any;
};

export type SessionUser = User;

type AuthValue = {
    user: SessionUser | null;
    isLoading: false;
    logout: () => void;
    /**
     * The edit forms call `refreshUser()` after a successful save. The
     * server owns the session here, so the honest equivalent is a route
     * refresh: it re-runs the page's `/me` fetch and streams the updated user
     * back into this provider. Without it the forms threw after saving.
     */
    refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ user, children }: { user: SessionUser | null; children: ReactNode }) {
    const router = useRouter();
    const refreshUser = useCallback(async () => {
        router.refresh();
    }, [router]);

    const value: AuthValue = {
        user,
        isLoading: false,
        logout: () => {
            void signOut();
        },
        refreshUser,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
    const value = useContext(AuthContext);

    if (value === null) {
        throw new Error('useAuth must be used inside <AuthProvider>');
    }

    return value;
}
