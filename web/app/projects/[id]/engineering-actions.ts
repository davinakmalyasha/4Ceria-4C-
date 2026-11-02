'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';

/**
 * Request a specialist, or verify (approve/reject) a pending request.
 *
 * `request-engineering` is open to any project participant; verification is
 * owner/assigned-PM only. Approval flips the matching `requires_structural` /
 * `requires_mep` / `requires_interior` flag and moves the addendum to
 * `authorized` (open bidding) or `approved_unpaid` (a direct team hire).
 */

function fail(projectId: string, error: unknown): never {
    if (error instanceof ApiFailure) {
        redirect(`/projects/${projectId}/engineering?error=${encodeURIComponent(error.message)}`);
    }

    throw error;
}

export async function requestEngineering(formData: FormData): Promise<void> {
    const projectId = String(formData.get('project_id') ?? '');
    const roleType = String(formData.get('role_type') ?? '');
    const description = String(formData.get('description') ?? '').trim();
    const feeText = String(formData.get('suggested_fee') ?? '').trim();

    if (
        !/^\d+$/.test(projectId) ||
        !['structural', 'mep', 'interior'].includes(roleType) ||
        description === ''
    ) {
        return;
    }

    const payload: Record<string, unknown> = { role_type: roleType, description };
    if (feeText !== '') {
        payload.suggested_fee = feeText;
    }

    try {
        await apiFetch(`/projects/${projectId}/request-engineering`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    } catch (error) {
        fail(projectId, error);
    }

    revalidatePath(`/projects/${projectId}/engineering`);
}

export async function verifyEngineering(formData: FormData): Promise<void> {
    const projectId = String(formData.get('project_id') ?? '');
    const addendumId = Number(formData.get('addendum_id'));
    const status = String(formData.get('status') ?? '');

    if (
        !/^\d+$/.test(projectId) ||
        !Number.isInteger(addendumId) ||
        addendumId <= 0 ||
        (status !== 'approved' && status !== 'rejected')
    ) {
        return;
    }

    try {
        await apiFetch(`/projects/${projectId}/verify-engineering/${addendumId}`, {
            method: 'POST',
            body: JSON.stringify({ status }),
        });
    } catch (error) {
        fail(projectId, error);
    }

    revalidatePath(`/projects/${projectId}/engineering`);
}
