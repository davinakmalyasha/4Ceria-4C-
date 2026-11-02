'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';

/**
 * Accept or decline a firm invitation from the dashboard overview.
 *
 * The browser posts a plain HTML form; the server action calls the API with the
 * httpOnly session cookie, so the bearer token never reaches the client. A
 * failure comes back as `?error=…` on the overview instead of a dead button.
 */
export async function respondToInvitation(formData: FormData): Promise<void> {
    const id = Number(formData.get('id'));
    const action = String(formData.get('action') ?? '');

    if (!Number.isInteger(id) || id <= 0 || (action !== 'accept' && action !== 'decline')) {
        return;
    }

    try {
        await apiFetch(`/firm-members/${id}/respond`, {
            method: 'POST',
            body: JSON.stringify({ action }),
        });
    } catch (error) {
        if (error instanceof ApiFailure) {
            redirect(`/dashboard?error=${encodeURIComponent(error.message)}`);
        }

        throw error;
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/overview');
    revalidatePath('/dashboard/my-firms');
    revalidatePath('/dashboard/my-firm');
}
