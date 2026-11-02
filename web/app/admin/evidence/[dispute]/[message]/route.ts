import { NextResponse } from 'next/server';
import { apiFetch, ApiFailure } from '@/lib/api';

/**
 * Resolve dispute evidence for an admin.
 *
 * Same reason as the verification documents: the API answers a JSON `{url}`
 * and the browser needs the file, so the redirect happens server-side with the
 * httpOnly session attached.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ dispute: string; message: string }> },
) {
    const { dispute, message } = await params;

    try {
        const body = await apiFetch<{ url?: string }>(
            `/admin/disputes/${dispute}/messages/${message}/evidence`,
        );

        if (!body.url) {
            return NextResponse.json({ message: 'Evidence not found.' }, { status: 404 });
        }

        return NextResponse.redirect(body.url);
    } catch (error) {
        if (error instanceof ApiFailure) {
            return NextResponse.json({ message: error.message }, { status: error.status });
        }

        return NextResponse.json({ message: 'The evidence could not be opened.' }, { status: 500 });
    }
}
