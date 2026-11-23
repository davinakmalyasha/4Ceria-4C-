import { NextRequest } from 'next/server';
import { apiOrigin, sessionToken } from '@/lib/session';

/**
 * Same-origin storage proxy.
 *
 * The API origin stays server-side; the browser only ever sees `/storage/...`.
 * Public files pass through, private files carry either a signed query string
 * or the session cookie, which this handler turns into a bearer token.
 */
export const dynamic = 'force-dynamic';

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
    const { path } = await context.params;
    const target = new URL(`/storage/${path.join('/')}`, apiOrigin());
    target.search = request.nextUrl.search;

    const headers = new Headers();
    const token = await sessionToken();

    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(target, {
        method: request.method,
        headers,
        cache: 'no-store',
        redirect: 'manual',
    });

    const outgoing = new Headers();
    for (const name of [
        'content-type',
        'content-length',
        'content-disposition',
        'cache-control',
        'etag',
        'last-modified',
        'accept-ranges',
        'content-range',
        'x-content-type-options',
    ]) {
        const value = response.headers.get(name);
        if (value) outgoing.set(name, value);
    }

    return new Response(response.body, { status: response.status, headers: outgoing });
}

export const GET = forward;
export const HEAD = forward;
