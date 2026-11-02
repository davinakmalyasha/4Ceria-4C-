'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';

/**
 * Delete a house listing the signed-in owner posted.
 *
 * The action runs on the server with the httpOnly session cookie, then
 * revalidates both house routes so the deleted card disappears without a
 * manual refresh.
 */
export async function deleteHouse(formData: FormData): Promise<void> {
    const id = Number(formData.get('id'));

    if (!Number.isInteger(id) || id <= 0) {
        return;
    }

    try {
        await apiFetch(`/houses/${id}`, { method: 'DELETE' });
    } catch (error) {
        if (error instanceof ApiFailure) {
            redirect(`/dashboard/my-houses?error=${encodeURIComponent(error.message)}`);
        }

        throw error;
    }

    revalidatePath('/dashboard/houses');
    revalidatePath('/dashboard/my-houses');
}
