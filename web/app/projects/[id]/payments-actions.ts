'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';

function firstError(error: unknown): string {
    if (error instanceof ApiFailure) {
        const field = error.errors ? Object.values(error.errors)[0]?.[0] : undefined;
        return field ?? error.message;
    }
    return 'The payment action could not be completed.';
}

function projectAndTermin(formData: FormData): { projectId: string; terminId: string } {
    const projectId = String(formData.get('project_id') ?? '');
    const terminId = String(formData.get('termin_id') ?? '');

    if (!/^\d+$/.test(projectId) || !/^\d+$/.test(terminId)) {
        redirect('/dashboard/projects');
    }

    return { projectId, terminId };
}

export async function uploadTerminProof(formData: FormData): Promise<void> {
    const { projectId, terminId } = projectAndTermin(formData);
    const proof = formData.get('proof');

    if (!(proof instanceof File) || proof.size === 0) {
        redirect(`/projects/${projectId}/payments?error=${encodeURIComponent('Choose a receipt first.')}`);
    }

    const body = new FormData();
    body.set('proof', proof);

    try {
        await apiFetch(`/projects/${projectId}/payments/termin/${terminId}/upload-proof`, {
            method: 'POST',
            body,
        });
    } catch (error) {
        redirect(`/projects/${projectId}/payments?error=${encodeURIComponent(firstError(error))}`);
    }

    revalidatePath(`/projects/${projectId}/payments`);
    redirect(`/projects/${projectId}/payments?updated=proof`);
}

export async function verifyTerminProof(formData: FormData): Promise<void> {
    const { projectId, terminId } = projectAndTermin(formData);
    const action = String(formData.get('action') ?? '');
    const notes = String(formData.get('notes') ?? '').trim();

    if (action !== 'accept' && action !== 'reject') {
        redirect(`/projects/${projectId}/payments?error=${encodeURIComponent('Choose accept or reject.')}`);
    }

    try {
        await apiFetch(`/projects/${projectId}/payments/termin/${terminId}/verify-proof`, {
            method: 'POST',
            body: JSON.stringify({ action, notes }),
        });
    } catch (error) {
        redirect(`/projects/${projectId}/payments?error=${encodeURIComponent(firstError(error))}`);
    }

    revalidatePath(`/projects/${projectId}/payments`);
    redirect(`/projects/${projectId}/payments?updated=${action}`);
}
