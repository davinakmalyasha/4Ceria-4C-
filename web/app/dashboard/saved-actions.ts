'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';

/**
 * Remove a bookmarked item.
 *
 * The favorites endpoint is a toggle, and the item is known to be saved when
 * this runs, so a single POST removes it. The action revalidates the saved
 * screen; the browser never touches the bearer token.
 */
export async function removeFavorite(formData: FormData): Promise<void> {
    const type = String(formData.get('type') ?? '');
    const id = Number(formData.get('id'));

    const allowed = new Set([
        'house',
        'arsitek',
        'kontraktor',
        'interior',
        'notaris',
        'project_manager',
        'structural',
        'mep',
        'material',
    ]);

    if (!allowed.has(type) || !Number.isInteger(id) || id <= 0) {
        return;
    }

    try {
        await apiFetch('/favorites/toggle', {
            method: 'POST',
            body: JSON.stringify({ favoritable_type: type, favoritable_id: id }),
        });
    } catch (error) {
        if (error instanceof ApiFailure) {
            redirect(`/dashboard/saved?error=${encodeURIComponent(error.message)}`);
        }

        throw error;
    }

    revalidatePath('/dashboard/saved');
}
