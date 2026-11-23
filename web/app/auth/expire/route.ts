import { NextResponse, type NextRequest } from 'next/server';
import { clearSession } from '@/lib/session';

/**
 * Clears a session that the API has already rejected.
 *
 * A server component cannot delete a cookie while rendering, so a page that
 * receives a 401 sends the browser here instead of straight to /login. Without
 * this hop the stale cookie bounces `/login` back to `/dashboard` and back
 * again, forever.
 */
export async function GET(request: NextRequest) {
    await clearSession();

    const requested = request.nextUrl.searchParams.get('next') ?? '/login';
    const safeNext =
        requested.startsWith('/') && !requested.startsWith('//') ? requested : '/login';

    return NextResponse.redirect(new URL(safeNext, request.url));
}
