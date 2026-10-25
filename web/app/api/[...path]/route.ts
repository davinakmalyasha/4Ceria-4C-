import { NextRequest } from 'next/server';
import { apiOrigin, clearSession, sessionToken } from '@/lib/session';

/**
 * The BFF: the browser's `/api/*`, forwarded to the real API with its identity.
 *
 * WHY THIS EXISTS
 * ---------------
 * The legacy SPA calls `/api/...` with a bearer token it read from
 * `localStorage`. The port has no bearer token in the browser — it has an
 * httpOnly cookie — so a client component that fetches `/api/unread-counts`
 * would arrive at the API anonymous and get a 401.
 *
 * Two ways out, and only one of them is right:
 *
 *   1. Read the token in the browser and attach it. That puts the token back
 *      where it was, which is the thing this rewrite removes.
 *   2. Forward the request HERE, where the cookie is readable, and attach the
 *      token server-side. The browser never sees it, and every client
 *      component keeps calling `/api/...` exactly as it does today.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It does not merge, reshape, cache or retry. A proxy that "helps" is a proxy
 * whose behaviour nobody can predict from the API's own contract — the port is
 * supposed to make the wire format identical, not introduce a second one.
 *
 * A 401 from the API clears the session cookie: the token is dead, and leaving
 * it in place would make every later request fail the same way.
 *
 * NOT FOR SERVER-SIDE CALLS. A server component should call `apiFetch()`
 * (`lib/api.ts`) directly instead of round-tripping through its own host.
 */

export const dynamic = 'force-dynamic';

const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD', 'OPTIONS']);

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
    const { path } = await context.params;
    const target = new URL(`/api/${path.join('/')}`, apiOrigin());
    target.search = request.nextUrl.search;

    const headers = new Headers();

    // Only the headers the API actually reads. Forwarding `host`, `cookie` or
    // `content-length` from the incoming request would be wrong: the target
    // host is different, the cookie is the session we are deliberately not
    // sending, and the body is re-streamed.
    headers.set('Accept', request.headers.get('Accept') ?? 'application/json');
    headers.set('X-Requested-With', 'XMLHttpRequest');

    const contentType = request.headers.get('Content-Type');
    if (contentType) {
        headers.set('Content-Type', contentType);
    }

    const token = await sessionToken();
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    const init: RequestInit = {
        method: request.method,
        headers,
        redirect: 'manual',
        cache: 'no-store',
    };

    if (!METHODS_WITHOUT_BODY.has(request.method)) {
        init.body = await request.arrayBuffer();
    }

    const response = await fetch(target, init);

    if (response.status === 401 && token) {
        await clearSession();
    }

    // The API's own status, headers and body. `set-cookie` from the API is not
    // forwarded: the session is this application's cookie, not the API's.
    const outgoing = new Headers();
    const responseType = response.headers.get('Content-Type');

    if (responseType) {
        outgoing.set('Content-Type', responseType);
    }

    return new Response(response.body, {
        status: response.status,
        headers: outgoing,
    });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
export const HEAD = forward;
export const OPTIONS = forward;
