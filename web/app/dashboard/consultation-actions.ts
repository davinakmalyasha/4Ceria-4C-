'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';

/**
 * Confirm, complete, reject or reschedule a notary consultation.
 *
 * Only the booked notary may act (the API enforces it). The server action keeps
 * the bearer token out of the browser and revalidates the inbox.
 */
export async function respondConsultation(formData: FormData): Promise<void> {
    const id = Number(formData.get('id'));
    const action = String(formData.get('action') ?? '');
    const scheduleDate = String(formData.get('schedule_date') ?? '').trim();
    const notes = String(formData.get('notes') ?? '').trim();

    if (
        !Number.isInteger(id) ||
        id <= 0 ||
        !['confirm', 'reject', 'reschedule', 'complete'].includes(action)
    ) {
        return;
    }

    const payload: Record<string, unknown> = { action };
    if (action === 'reschedule') {
        if (scheduleDate === '') {
            redirect(`/dashboard/consultations?error=${encodeURIComponent('Choose a new date and time.')}`);
        }
        payload.schedule_date = scheduleDate;
    }
    if (notes !== '') {
        payload.notes = notes;
    }

    try {
        await apiFetch(`/consultations/${id}/respond`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    } catch (error) {
        if (error instanceof ApiFailure) {
            redirect(`/dashboard/consultations?error=${encodeURIComponent(error.message)}`);
        }

        throw error;
    }

    revalidatePath('/dashboard/consultations');
}
