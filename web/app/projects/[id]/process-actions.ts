'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';

export async function approveMilestone(formData: FormData): Promise<void> {
    const projectId = String(formData.get('project_id') ?? '');
    const milestoneId = String(formData.get('milestone_id') ?? '');

    if (!/^\d+$/.test(projectId) || !/^\d+$/.test(milestoneId)) {
        redirect('/dashboard/projects');
    }

    try {
        await apiFetch(`/projects/${projectId}/milestones/${milestoneId}/approve`, {
            method: 'POST',
        });
    } catch (error) {
        const message =
            error instanceof ApiFailure
                ? (error.errors ? Object.values(error.errors)[0]?.[0] : undefined) ?? error.message
                : 'The milestone could not be approved.';
        redirect(`/projects/${projectId}/process?error=${encodeURIComponent(message)}`);
    }

    revalidatePath(`/projects/${projectId}/process`);
    revalidatePath(`/projects/${projectId}/payments`);
    redirect(`/projects/${projectId}/process?updated=approved`);
}

export async function clientSignContract(formData: FormData): Promise<void> {
    const projectId = String(formData.get('project_id') ?? '');
    const bidId = String(formData.get('bid_id') ?? '');
    const bidType = String(formData.get('bid_type') ?? '');
    const signature = String(formData.get('signature') ?? '');

    if (!/^\d+$/.test(projectId) || !/^\d+$/.test(bidId) || bidType === '') {
        redirect('/dashboard/projects');
    }

    try {
        await apiFetch(`/projects/${projectId}/bids/${bidId}/client-sign-contract`, {
            method: 'POST',
            body: JSON.stringify({ bid_type: bidType, signature }),
        });
    } catch (error) {
        const message =
            error instanceof ApiFailure
                ? (error.errors ? Object.values(error.errors)[0]?.[0] : undefined) ?? error.message
                : 'The contract could not be signed.';
        redirect(`/projects/${projectId}/proposals?error=${encodeURIComponent(message)}`);
    }

    revalidatePath(`/projects/${projectId}/proposals`);
    revalidatePath(`/projects/${projectId}/payments`);
    redirect(`/projects/${projectId}/proposals?updated=signed`);
}
