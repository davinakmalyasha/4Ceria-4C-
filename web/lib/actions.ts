'use server';

import { redirect } from 'next/navigation';
import { apiOrigin, clearSession, sessionToken } from './session';

/**
 * Sign out: revoke the token on the API, then drop the cookie.
 *
 * The legacy `logout()` does the same thing from the browser and then sets
 * `window.location.href` — which CANCELS the revoke request, so the token often
 * stayed valid (the legacy code says so). Here the revoke completes before the
 * redirect, because the redirect is a server instruction rather than a
 * navigation that races the fetch.
 */
export async function signOut(): Promise<void> {
    const token = await sessionToken();

    if (token) {
        await fetch(`${apiOrigin()}/api/logout`, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${token}`,
                'X-Requested-With': 'XMLHttpRequest',
            },
            cache: 'no-store',
        }).catch(() => {
            // A failed revoke still clears the cookie: keeping a dead session
            // would leave the visitor unable to sign in again.
        });
    }

    await clearSession();

    redirect('/login');
}
