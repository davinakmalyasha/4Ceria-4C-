'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';

/**
 * Claim a pending delivery job from the radar.
 *
 * The API is atomic (the status check is part of the UPDATE), so the first
 * courier wins; a 404 means someone else took it. The action revalidates both
 * logistics screens so the row moves from Radar to My Deliveries.
 */
export async function acceptDeliveryJob(formData: FormData): Promise<void> {
    const id = Number(formData.get('id'));

    if (!Number.isInteger(id) || id <= 0) {
        return;
    }

    try {
        await apiFetch(`/logistics/jobs/${id}/accept`, { method: 'POST' });
    } catch (error) {
        if (error instanceof ApiFailure) {
            redirect(`/dashboard/job-radar?error=${encodeURIComponent(error.message)}`);
        }

        throw error;
    }

    revalidatePath('/dashboard/job-radar');
    revalidatePath('/dashboard/my-deliveries');
}

/**
 * Advance a claimed delivery with photo evidence.
 *
 * `POST /logistics/jobs/{id}/status` accepts `accepted|picked_up|delivered` and
 * 1-3 photos; the controller enforces forward-only transitions and stores
 * pickup/dropoff photos under different folders. The form requires at least one
 * photo for each confirmed step, matching the legacy courier UI.
 */
export async function updateDeliveryStatus(formData: FormData): Promise<void> {
    const id = Number(formData.get('job_id'));
    const status = String(formData.get('status') ?? '');
    const allowed = ['accepted', 'picked_up', 'delivered'];

    if (!Number.isInteger(id) || id <= 0 || !allowed.includes(status)) {
        return;
    }

    const photos = formData
        .getAll('photos')
        .filter((entry): entry is File => entry instanceof File && entry.size > 0)
        .slice(0, 3);

    if (photos.length === 0) {
        redirect(
            `/dashboard/my-deliveries?error=${encodeURIComponent('At least one photo is required as evidence.')}`,
        );
    }

    const body = new FormData();
    body.set('status', status);
    photos.forEach((photo) => body.append('photos[]', photo));

    try {
        await apiFetch(`/logistics/jobs/${id}/status`, { method: 'POST', body });
    } catch (error) {
        if (error instanceof ApiFailure) {
            redirect(`/dashboard/my-deliveries?error=${encodeURIComponent(error.message)}`);
        }

        throw error;
    }

    revalidatePath('/dashboard/my-deliveries');
    revalidatePath('/dashboard/job-radar');
    revalidatePath('/dashboard');
}
