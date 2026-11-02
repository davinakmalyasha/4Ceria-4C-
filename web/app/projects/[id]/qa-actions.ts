'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';

/**
 * Post a project Q&A message (or a reply) through the API server action.
 *
 * The token never leaves the server; the browser submits a plain HTML form.
 */
export async function postComment(formData: FormData): Promise<void> {
    const projectId = String(formData.get('project_id') ?? '');
    const message = String(formData.get('message') ?? '').trim();
    const parent = formData.get('parent_id');

    if (!/^\d+$/.test(projectId) || message === '') {
        return;
    }

    const payload: Record<string, unknown> = { message };
    if (parent) {
        payload.parent_id = Number(parent);
    }

    try {
        await apiFetch(`/projects/${projectId}/comments`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    } catch (error) {
        if (error instanceof ApiFailure) {
            redirect(`/projects/${projectId}/qa?error=${encodeURIComponent(error.message)}`);
        }

        throw error;
    }

    revalidatePath(`/projects/${projectId}/qa`);
}
