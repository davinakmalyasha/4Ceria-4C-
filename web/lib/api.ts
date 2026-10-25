/**
 * The server-side API client.
 *
 * ONE PLACE THAT KNOWS WHERE THE API IS AND WHO IS ASKING.
 *
 * The legacy client spreads that knowledge over 416 call sites: `axios` in most
 * of them, a hardcoded `fetch('/api/geocode/…')` in others (defect B14), and a
 * token attached from `localStorage` at request time. Here a server component
 * calls `apiFetch('/projects')` and the origin, the token and the JSON headers
 * are decided once.
 *
 * `cache: 'no-store'` on every call is deliberate: the data is per-user and
 * money-shaped, and Next's default fetch cache is a cache of someone else's
 * ledger. A page that wants a cache expires it explicitly.
 */

import { apiOrigin, sessionToken } from './session';

export type ApiError = {
    status: number;
    message: string;
    /** The validation bag, when Laravel answered 422. */
    errors?: Record<string, string[]>;
};

export class ApiFailure extends Error {
    readonly status: number;
    readonly errors?: Record<string, string[]>;

    constructor(error: ApiError) {
        super(error.message);
        this.name = 'ApiFailure';
        this.status = error.status;
        this.errors = error.errors;
    }
}

/**
 * Call the API as the current user.
 *
 * A 401 is re-thrown as an ApiFailure so the caller can decide: a page can
 * render an empty state, a server action can send the user to /login. What it
 * must NOT do is redirect from inside the client, which is defect B30 — a 401
 * from an unrelated panel threw the visitor out of a page they were allowed to
 * read.
 */
export async function apiFetch<T>(
    path: string,
    init: RequestInit = {},
): Promise<T> {
    const headers = new Headers(init.headers);

    headers.set('Accept', 'application/json');
    headers.set('X-Requested-With', 'XMLHttpRequest');

    if (init.body !== undefined && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    const token = await sessionToken();

    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`${apiOrigin()}/api${path}`, {
        ...init,
        headers,
        cache: 'no-store',
    });

    if (!response.ok) {
        let body: { message?: string; errors?: Record<string, string[]> } = {};

        try {
            body = await response.json();
        } catch {
            // A non-JSON error body is still an error; the status carries it.
        }

        throw new ApiFailure({
            status: response.status,
            message: body.message ?? `The API answered ${response.status}.`,
            errors: body.errors,
        });
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return (await response.json()) as T;
}
