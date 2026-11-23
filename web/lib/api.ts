/**
 * The server-side API client.
 *
 * ONE PLACE THAT KNOWS WHERE THE API IS AND WHO IS ASKING.
 *
 * A server component calls `apiFetch('/projects')` and the origin, the token
 * and the JSON headers are decided once.
 *
 * `cache: 'no-store'` on every call is deliberate: the data is per-user and
 * money-shaped, and Next's default fetch cache is a cache of someone else's
 * ledger. A page that wants a cache expires it explicitly via `revalidate`.
 */

import { apiOrigin, sessionToken } from './session';

export type ApiError = {
    status: number;
    message: string;
    /** The validation bag, when the API answered 422. */
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
 * must NOT do is redirect from inside the client: a 401 from an unrelated
 * panel must not throw the visitor out of a page they were allowed to read.
 */
export async function apiFetch<T>(
    path: string,
    init: RequestInit = {},
    revalidateSeconds?: number,
): Promise<T> {
    const headers = new Headers(init.headers);

    headers.set('Accept', 'application/json');
    headers.set('X-Requested-With', 'XMLHttpRequest');

    if (init.body !== undefined && !headers.has('Content-Type')) {
        // A FormData body carries its own multipart boundary; setting the JSON
        // content type here would strip the boundary and break uploads.
        const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
        if (!isFormData) {
            headers.set('Content-Type', 'application/json');
        }
    }

    const token = await sessionToken();

    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    // Next's data cache is keyed by URL, not by Authorization. A personalized
    // response must never be reused for another visitor, so a request with a
    // session is always `no-store`.
    const cacheMode =
        token !== null
            ? { cache: 'no-store' as const }
            : revalidateSeconds === undefined
              ? { cache: 'no-store' as const }
              : { next: { revalidate: revalidateSeconds } };

    const response = await fetch(`${apiOrigin()}/api${path}`, {
        ...init,
        headers,
        signal: init.signal ?? AbortSignal.timeout(30_000),
        ...cacheMode,
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
