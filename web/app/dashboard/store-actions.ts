'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';

/**
 * Update the authenticated supplier's store profile.
 *
 * The route is PUT, but the photo makes the body multipart — PHP does not parse
 * multipart on a real PUT, so the action POSTs with `_method=PUT` (the legacy
 * screen sent the same override as a query parameter). The controller requires
 * `store_name` and scopes the row to the caller's supplier.
 */
export async function updateStoreProfile(formData: FormData): Promise<void> {
    const storeName = String(formData.get('store_name') ?? '').trim();

    if (storeName === '') {
        return;
    }

    const body = new FormData();
    body.set('_method', 'PUT');
    body.set('store_name', storeName);

    for (const key of ['address', 'latitude', 'longitude', 'no_telp', 'category', 'bio', 'detail_location']) {
        const raw = formData.get(key);
        if (raw === null) continue;
        const value = String(raw).trim();
        if (value !== '') body.set(key, value);
    }

    const foto = formData.get('foto');
    if (foto instanceof File && foto.size > 0) {
        body.set('foto', foto);
    }

    try {
        await apiFetch('/merchant/profile', { method: 'POST', body });
    } catch (error) {
        if (error instanceof ApiFailure) {
            redirect(`/dashboard/store?error=${encodeURIComponent(error.message)}`);
        }

        throw error;
    }

    revalidatePath('/dashboard/store');
    revalidatePath('/dashboard/inventory');
    revalidatePath('/dashboard/marketplace');
    revalidatePath('/dashboard/marketplace-materials');
    revalidatePath('/dashboard/marketplace-furniture');
    revalidatePath('/dashboard/explore');
}
