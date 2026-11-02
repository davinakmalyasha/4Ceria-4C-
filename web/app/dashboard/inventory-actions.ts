'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';

/**
 * Supplier inventory writes.
 *
 * Create is multipart (`images[]`); update is the same multipart with
 * `_method=PUT` because PHP does not parse a real PUT body; delete is a plain
 * DELETE. The controller scopes every row to the authenticated supplier and
 * clears the materials cache. Errors return `?error=` on the inventory screen.
 */

function fail(error: unknown): never {
    if (error instanceof ApiFailure) {
        redirect(`/dashboard/inventory?error=${encodeURIComponent(error.message)}`);
    }

    throw error;
}

function appendImages(body: FormData, formData: FormData): void {
    formData.getAll('images').forEach((entry) => {
        if (entry instanceof File && entry.size > 0) {
            body.append('images[]', entry);
        }
    });
}

function afterWrite(): void {
    revalidatePath('/dashboard/inventory');
    revalidatePath('/dashboard/marketplace');
    revalidatePath('/dashboard/marketplace-materials');
    revalidatePath('/dashboard/marketplace-furniture');
    revalidatePath('/dashboard/explore');
}

export async function createMaterial(formData: FormData): Promise<void> {
    const name = String(formData.get('name') ?? '').trim();
    const price = String(formData.get('price') ?? '').trim();
    const unit = String(formData.get('unit') ?? '').trim();
    const category = String(formData.get('category') ?? '').trim();

    if (name === '' || price === '' || unit === '' || category === '') {
        return;
    }

    const body = new FormData();
    body.set('name', name);
    body.set('price', price);
    body.set('unit', unit);
    body.set('category', category);

    for (const key of ['description', 'stock']) {
        const value = String(formData.get(key) ?? '').trim();
        if (value !== '') body.set(key, value);
    }

    appendImages(body, formData);

    try {
        await apiFetch('/merchant/materials', { method: 'POST', body });
    } catch (error) {
        fail(error);
    }

    afterWrite();
}

export async function updateMaterial(formData: FormData): Promise<void> {
    const id = Number(formData.get('material_id'));
    if (!Number.isInteger(id) || id <= 0) {
        return;
    }

    const body = new FormData();
    body.set('_method', 'PUT');

    for (const key of ['name', 'description', 'price', 'unit', 'category', 'stock', 'is_available']) {
        const raw = formData.get(key);
        if (raw === null) continue;
        const value = String(raw).trim();
        if (value !== '') body.set(key, value);
    }

    appendImages(body, formData);

    formData.getAll('deleted_image_ids').forEach((entry) => {
        const value = String(entry).trim();
        if (value !== '') body.append('deleted_image_ids[]', value);
    });

    try {
        await apiFetch(`/merchant/materials/${id}`, { method: 'POST', body });
    } catch (error) {
        fail(error);
    }

    afterWrite();
}

export async function deleteMaterial(formData: FormData): Promise<void> {
    const id = Number(formData.get('material_id'));
    if (!Number.isInteger(id) || id <= 0) {
        return;
    }

    try {
        await apiFetch(`/merchant/materials/${id}`, { method: 'DELETE' });
    } catch (error) {
        fail(error);
    }

    afterWrite();
}
