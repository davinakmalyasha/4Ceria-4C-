'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';

/**
 * Admin mutations.
 *
 * Every action revalidates the screen it belongs to and returns a `?error=`
 * message instead of a dead button. The API is still the authority: it checks
 * the admin role, the allowed status values and the dispute action set.
 */

function fail(path: string, error: unknown): never {
    if (error instanceof ApiFailure) {
        redirect(`${path}?error=${encodeURIComponent(error.message)}`);
    }

    throw error;
}

function idFrom(value: FormDataEntryValue | null): number | null {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

export async function toggleUserSuspend(formData: FormData): Promise<void> {
    const id = idFrom(formData.get('user_id'));
    if (id === null) return;

    try {
        await apiFetch(`/admin/users/${id}/suspend`, { method: 'PATCH' });
    } catch (error) {
        fail('/admin', error);
    }

    revalidatePath('/admin');
}

export async function changeUserRole(formData: FormData): Promise<void> {
    const id = idFrom(formData.get('user_id'));
    const role = String(formData.get('role_type') ?? '');

    if (id === null || role === '') return;

    try {
        await apiFetch(`/admin/users/${id}/role`, {
            method: 'PATCH',
            body: JSON.stringify({ role_type: role }),
        });
    } catch (error) {
        fail('/admin', error);
    }

    revalidatePath('/admin');
}

export async function toggleHouseSuspend(formData: FormData): Promise<void> {
    const id = idFrom(formData.get('house_id'));
    if (id === null) return;

    try {
        await apiFetch(`/admin/houses/${id}/suspend`, { method: 'PATCH' });
    } catch (error) {
        fail('/admin/houses', error);
    }

    revalidatePath('/admin/houses');
}

export async function forceTerminateProject(formData: FormData): Promise<void> {
    const id = idFrom(formData.get('project_id'));
    if (id === null) return;

    try {
        await apiFetch(`/admin/projects/${id}/force-terminate`, { method: 'POST' });
    } catch (error) {
        fail('/admin/projects', error);
    }

    revalidatePath('/admin/projects');
    revalidatePath(`/projects/${id}`);
}

export async function replyToDispute(formData: FormData): Promise<void> {
    const id = idFrom(formData.get('dispute_id'));
    const body = String(formData.get('body') ?? '').trim();

    if (id === null || body === '') return;

    try {
        await apiFetch(`/admin/disputes/${id}/reply`, {
            method: 'POST',
            body: JSON.stringify({ body }),
        });
    } catch (error) {
        fail(`/admin/disputes?dispute=${id}`, error);
    }

    revalidatePath('/admin/disputes');
}

const DISPUTE_ACTIONS = new Set([
    'dismiss',
    'release_payment',
    'record_refund',
    'terminate_project',
    'custom',
]);

export async function actOnDispute(formData: FormData): Promise<void> {
    const id = idFrom(formData.get('dispute_id'));
    const action = String(formData.get('action') ?? '');
    const notes = String(formData.get('notes') ?? '').trim();
    const amount = String(formData.get('amount') ?? '').trim();

    if (id === null || !DISPUTE_ACTIONS.has(action)) return;

    const payload: Record<string, unknown> = { action };

    if (action === 'custom') {
        if (notes === '') {
            redirect(
                `/admin/disputes?dispute=${id}&error=${encodeURIComponent('Resolution notes are required.')}`,
            );
        }
        payload.notes = notes;
    } else if (action === 'record_refund') {
        if (amount === '' || Number(amount) <= 0) {
            redirect(
                `/admin/disputes?dispute=${id}&error=${encodeURIComponent('A positive refund amount is required.')}`,
            );
        }
        payload.amount = Number(amount);
        if (notes !== '') payload.notes = notes;
    } else if (notes !== '') {
        payload.notes = notes;
    }

    try {
        await apiFetch(`/admin/disputes/${id}/act`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    } catch (error) {
        fail(`/admin/disputes?dispute=${id}`, error);
    }

    revalidatePath('/admin/disputes');
}

export async function reviewProfessional(formData: FormData): Promise<void> {
    const id = idFrom(formData.get('profile_id'));
    const type = String(formData.get('type') ?? '');
    const status = String(formData.get('status') ?? '');
    const reason = String(formData.get('reason') ?? '').trim();

    if (
        id === null ||
        type === '' ||
        (status !== 'verified' && status !== 'rejected')
    ) {
        return;
    }

    try {
        await apiFetch(`/admin/professionals/${type}/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({
                status,
                reason: status === 'rejected' ? reason : undefined,
                send_email: true,
            }),
        });
    } catch (error) {
        fail(`/admin/verification?type=${type}`, error);
    }

    revalidatePath('/admin/verification');
    revalidatePath('/admin/verification/logs');
}
