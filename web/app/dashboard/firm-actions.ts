'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';

/**
 * Firm workspace writes.
 *
 * The owner's squad profile (`/firm-members/update-profile`) accepts one
 * multipart POST for the text fields, banner, logo and the `firm_needed_roles`
 * JSON array. Roster decisions are separate small endpoints: respond (accept or
 * decline a join request), cancel (withdraw an invitation) and remove (offboard
 * an active member). Portfolios are a normal resource; the update route is
 * POST, not PUT, so a multipart body reaches the controller unchanged.
 */

function fail(path: string, error: unknown): never {
    if (error instanceof ApiFailure) {
        redirect(`${path}?error=${encodeURIComponent(error.message)}`);
    }

    throw error;
}

function revalidateFirm(): void {
    revalidatePath('/dashboard/my-firm');
    revalidatePath('/dashboard/my-firms');
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/overview');
    revalidatePath('/dashboard/profile');
}

function positiveId(value: FormDataEntryValue | null): number | null {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

export async function updateFirmProfile(formData: FormData): Promise<void> {
    const body = new FormData();

    for (const key of [
        'firm_name',
        'firm_slogan',
        'firm_description',
        'base_rate',
        'experience_years',
    ]) {
        const raw = formData.get(key);
        if (raw === null) {
            continue;
        }

        body.set(key, String(raw).trim());
    }

    for (const key of ['firm_banner', 'firm_logo']) {
        const file = formData.get(key);
        if (file instanceof File && file.size > 0) {
            body.set(key, file);
        }
    }

    // Existing plain-string roles are preserved verbatim through hidden
    // `role_tag` inputs; job postings are editable rows. A checked
    // `delete_job_id` removes that posting.
    const deleted = new Set(formData.getAll('delete_job_id').map((entry) => String(entry)));
    const ids = formData.getAll('job_id').map((entry) => String(entry));
    const roles = formData.getAll('job_role').map((entry) => String(entry));
    const titles = formData.getAll('job_title').map((entry) => String(entry));
    const descriptions = formData.getAll('job_description').map((entry) => String(entry));
    const budgets = formData.getAll('job_budget').map((entry) => String(entry));
    const durations = formData.getAll('job_duration').map((entry) => String(entry));

    const jobPostings = ids
        .map((id, index) => ({
            id: id !== '' ? id : `job-${Date.now()}-${index}`,
            role: (roles[index] ?? '').trim(),
            title: (titles[index] ?? '').trim(),
            description: (descriptions[index] ?? '').trim(),
            budget: (budgets[index] ?? '').trim() || 'Negotiable',
            duration: (durations[index] ?? '').trim() || 'Flexible',
        }))
        .filter((job) => job.title !== '' && !deleted.has(job.id));

    const roleTags = formData
        .getAll('role_tag')
        .map((entry) => String(entry).trim())
        .filter((entry) => entry !== '');

    const needed = [...roleTags, ...jobPostings];

    // The legacy screen derives the hiring flag from the list itself, so an
    // empty list always means "not hiring".
    body.set('firm_is_hiring', needed.length > 0 ? '1' : '0');
    body.set('firm_needed_roles', JSON.stringify(needed));

    try {
        await apiFetch('/firm-members/update-profile', { method: 'POST', body });
    } catch (error) {
        fail('/dashboard/my-firm', error);
    }

    revalidateFirm();
}

export async function respondFirmMember(formData: FormData): Promise<void> {
    const id = positiveId(formData.get('membership_id'));
    const action = String(formData.get('action') ?? '');

    if (id === null || (action !== 'accept' && action !== 'decline')) {
        return;
    }

    try {
        await apiFetch(`/firm-members/${id}/respond`, {
            method: 'POST',
            body: JSON.stringify({ action }),
        });
    } catch (error) {
        fail('/dashboard/my-firm', error);
    }

    revalidateFirm();
}

export async function removeFirmMember(formData: FormData): Promise<void> {
    const id = positiveId(formData.get('membership_id'));
    if (id === null) {
        return;
    }

    try {
        await apiFetch(`/firm-members/${id}`, { method: 'DELETE' });
    } catch (error) {
        fail('/dashboard/my-firm', error);
    }

    revalidateFirm();
}

export async function cancelFirmInvitation(formData: FormData): Promise<void> {
    const id = positiveId(formData.get('membership_id'));
    if (id === null) {
        return;
    }

    try {
        await apiFetch(`/firm-members/${id}/cancel`, { method: 'POST' });
    } catch (error) {
        fail('/dashboard/my-firm', error);
    }

    revalidateFirm();
}

export async function requestJoinFirm(formData: FormData): Promise<void> {
    const ownerId = positiveId(formData.get('firm_owner_id'));
    const role = String(formData.get('role_in_firm') ?? '').trim();

    if (ownerId === null || role === '') {
        return;
    }

    try {
        await apiFetch('/firm-members/request-join', {
            method: 'POST',
            body: JSON.stringify({ firm_owner_id: ownerId, role_in_firm: role }),
        });
    } catch (error) {
        fail('/dashboard/my-firms', error);
    }

    revalidateFirm();
}

export async function savePortfolio(formData: FormData): Promise<void> {
    const id = positiveId(formData.get('portfolio_id'));
    const title = String(formData.get('title') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();

    if (title === '' || description === '') {
        return;
    }

    const body = new FormData();
    body.set('title', title);
    body.set('description', description);

    for (const key of ['duration', 'client_review', 'role_type']) {
        const raw = formData.get(key);
        if (raw === null) continue;
        const value = String(raw).trim();
        if (value !== '') body.set(key, value);
    }

    const image = formData.get('image');
    if (image instanceof File && image.size > 0) {
        body.set('image', image);
    }

    try {
        await apiFetch(id === null ? '/portfolios' : `/portfolios/${id}`, {
            method: 'POST',
            body,
        });
    } catch (error) {
        fail('/dashboard/my-firm', error);
    }

    revalidateFirm();
}

export async function deletePortfolio(formData: FormData): Promise<void> {
    const id = positiveId(formData.get('portfolio_id'));
    if (id === null) {
        return;
    }

    try {
        await apiFetch(`/portfolios/${id}`, { method: 'DELETE' });
    } catch (error) {
        fail('/dashboard/my-firm', error);
    }

    revalidateFirm();
}
