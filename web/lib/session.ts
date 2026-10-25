/**
 * The session, as an httpOnly cookie.
 *
 * WHAT CHANGES FROM THE LEGACY CLIENT
 * -----------------------------------
 * The SPA keeps the bearer token in `localStorage` and attaches it from
 * `api.js`. Any script on the page can read it, which is why one XSS is a full
 * account takeover, and why the token has to be re-attached by every call site
 * (and was missed by some).
 *
 * Here the token NEVER reaches the browser. The server action exchanges the
 * credentials for a token, stores it in an httpOnly cookie, and every server
 * component reads it on the way out. `document.cookie` shows nothing, and the
 * client code has no token to leak.
 *
 * The cookie is `SameSite=Lax` rather than `Strict`: the app is entered from
 * email links and from the public brief, and `Strict` would silently drop the
 * session on the first navigation from another site.
 */

import { cookies } from 'next/headers';

export const SESSION_COOKIE = '4ceria_session';

/** The API origin. Server-side only; never exposed to the browser. */
export function apiOrigin(): string {
    return process.env.API_ORIGIN ?? 'http://127.0.0.1:9000';
}

/** The token from the request's cookie, when there is one. */
export async function sessionToken(): Promise<string | null> {
    const store = await cookies();
    const value = store.get(SESSION_COOKIE)?.value;

    return value && value !== '' ? value : null;
}

/** Store a token in the httpOnly cookie. */
export async function setSession(token: string): Promise<void> {
    const store = await cookies();

    store.set(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        // Sanctum's personal access tokens do not expire by default, so the
        // cookie should not either: an arbitrary cookie lifetime would log the
        // user out of a session that is still valid on the server.
        maxAge: 60 * 60 * 24 * 30,
    });
}

/** Forget the token. The caller is responsible for revoking it server-side. */
export async function clearSession(): Promise<void> {
    const store = await cookies();
    store.delete(SESSION_COOKIE);
}
