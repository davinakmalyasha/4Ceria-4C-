'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';

/**
 * Update a house listing the signed-in owner posted.
 *
 * The route is `PUT /api/houses/{id}`. The Go gateway parses multipart bodies
 * for every method, so the gallery can ride on the real PUT rather than the
 * old form-post method override. Gallery changes use `house_pics[]` for new
 * files and `deleted_house_pics[]` for removed rows; the handler deletes the
 * physical files and scopes every id to this house.
 */
export async function updateHouse(formData: FormData): Promise<void> {
    const id = Number(formData.get('house_id'));
    if (!Number.isInteger(id) || id <= 0) {
        return;
    }

    const body = new FormData();

    for (const key of [
        'name',
        'price',
        'house_desc',
        'width',
        'length',
        'floors',
        'br',
        'ba',
        'street_name',
        'kelurahan',
        'kecamatan',
        'kab_kota',
        'province',
        'postal_code',
        'lat',
        'lng',
    ]) {
        const raw = formData.get(key);
        if (raw === null) continue;
        const value = String(raw).trim();
        if (value !== '') body.set(key, value);
    }

    formData.getAll('house_pics').forEach((entry) => {
        if (entry instanceof File && entry.size > 0) {
            body.append('house_pics[]', entry);
        }
    });

    formData.getAll('deleted_house_pics').forEach((entry) => {
        const value = String(entry).trim();
        if (value !== '') body.append('deleted_house_pics[]', value);
    });

    try {
        await apiFetch(`/houses/${id}`, { method: 'PUT', body });
    } catch (error) {
        if (error instanceof ApiFailure) {
            redirect(`/dashboard/my-houses?error=${encodeURIComponent(error.message)}`);
        }

        throw error;
    }

    revalidatePath('/dashboard/houses');
    revalidatePath('/dashboard/my-houses');
    revalidatePath('/dashboard/explore');
    revalidatePath('/dashboard/saved');
}
