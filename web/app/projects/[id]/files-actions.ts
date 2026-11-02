'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';

/**
 * Verify or delete a project document.
 *
 * Verification is owner/PM only and deletion is uploader/owner only, with
 * verified/approved documents locked — the API enforces both; the UI hides the
 * buttons the caller cannot use, and a failure still returns `?error=`.
 */

function fail(projectId: string, error: unknown): never {
    if (error instanceof ApiFailure) {
        redirect(`/projects/${projectId}/files?error=${encodeURIComponent(error.message)}`);
    }

    throw error;
}

export async function verifyDocument(formData: FormData): Promise<void> {
    const projectId = String(formData.get('project_id') ?? '');
    const documentId = Number(formData.get('document_id'));

    if (!/^\d+$/.test(projectId) || !Number.isInteger(documentId) || documentId <= 0) {
        return;
    }

    try {
        await apiFetch(`/projects/${projectId}/documents/${documentId}/verify`, { method: 'POST' });
    } catch (error) {
        fail(projectId, error);
    }

    revalidatePath(`/projects/${projectId}/files`);
}

export async function deleteDocument(formData: FormData): Promise<void> {
    const projectId = String(formData.get('project_id') ?? '');
    const documentId = Number(formData.get('document_id'));

    if (!/^\d+$/.test(projectId) || !Number.isInteger(documentId) || documentId <= 0) {
        return;
    }

    try {
        await apiFetch(`/projects/${projectId}/documents/${documentId}`, { method: 'DELETE' });
    } catch (error) {
        fail(projectId, error);
    }

    revalidatePath(`/projects/${projectId}/files`);
}
