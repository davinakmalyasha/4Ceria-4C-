'use client';

import { createContext, useContext, type ReactNode } from 'react';
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
 * profile once, and passed it in. `isLoading` exists only because the ported
 * components read it: it is always `false`.
 *
 * `logout` is a server action. It revokes the token before redirecting, which
 * the legacy version could not do — it set `window.location.href` immediately,
 * cancelling its own revoke request (the legacy code documents this).
 */

/**
 * The profile shape the ported components expect.
 *
 * `User` is the legacy name, kept because the synced components import it. The
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

/**
 * The two storage helpers the legacy context exports, kept with the same
 * signatures because ported drafts (a signature image, bank details, a
 * negotiated fee) are keyed through them.
 *
 * A DRAFT IS USER-SCOPED: `prefixu<id>_parts`. The key includes the user id so
 * the next person on the same device cannot open the previous user's
 * half-filled contract — the defect the legacy comments record.
 */
export const userScopedStorageKey = (
    prefix: string,
    userId: number | string | null | undefined,
    ...parts: (string | number)[]
): string => `${prefix}u${userId ?? 'anon'}_${parts.join('_')}`;

export const adoptLegacyDraft = (legacyKey: string, scopedKey: string, storage: Storage): void => {
    try {
        if (legacyKey === scopedKey) {
            return;
        }

        const legacy = storage.getItem(legacyKey);

        if (legacy === null) {
            return;
        }

        if (storage.getItem(scopedKey) === null) {
            storage.setItem(scopedKey, legacy);
        }

        storage.removeItem(legacyKey);
    } catch {
        // Storage unavailable (private mode, quota): the draft stays where it
        // is, which is exactly where it was before this call.
    }
};

type AuthValue = {
    user: SessionUser | null;
    isLoading: false;
    logout: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ user, children }: { user: SessionUser | null; children: ReactNode }) {
    const value: AuthValue = {
        user,
        isLoading: false,
        logout: () => {
            void signOut();
        },
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
