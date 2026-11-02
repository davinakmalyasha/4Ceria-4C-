import { NextResponse } from 'next/server';
import { apiFetch, ApiFailure } from '@/lib/api';

/**
 * Resolve a private verification document for an admin.
 *
 * The browser cannot call the presign endpoint and follow the result in one
 * navigation, and the signed URL must not be embedded in the page (it expires
 * in five minutes and reveals the storage host). This handler asks the API for
 * the URL server-side — with the httpOnly session — and redirects.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ type: string; id: string; field: string }> },
) {
    const { type, id, field } = await params;

    try {
        const body = await apiFetch<{ url?: string }>(`/verifications/documents/${type}/${id}/${field}`);

        if (!body.url) {
            return NextResponse.json({ message: 'Document not found.' }, { status: 404 });
        }

        return NextResponse.redirect(body.url);
    } catch (error) {
        if (error instanceof ApiFailure) {
            return NextResponse.json({ message: error.message }, { status: error.status });
        }

        return NextResponse.json({ message: 'The document could not be opened.' }, { status: 500 });
    }
}
