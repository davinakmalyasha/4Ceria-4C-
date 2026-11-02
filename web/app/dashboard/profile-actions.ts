'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';

/**
 * Save the signed-in account's profile.
 *
 * Two endpoints, chosen by the form's hidden `mode`:
 *   - `user`         → `PUT /me` (multipart with `_method=PUT`, because the
 *                      avatar makes the body multipart and PHP does not parse
 *                      multipart on a real PUT).
 *   - `professional` → `POST /me/professional`, the endpoint every legacy
 *                      role form used. The controller validates ONLY the field
 *                      list for the caller's `role_type`, so forwarding every
 *                      field the form rendered is safe: keys outside that
 *                      role's list are ignored.
 *
 * `phone_numbers` is sent as a JSON array even when empty — the controller
 * decodes it and treats `'[]'` as "no numbers left", which is how a phone row
 * gets deleted.
 */

const TEXT_FIELDS = [
    // Professional fields, per role group.
    'rate_harga',
    'pengalaman_tahun',
    'spesialisasi',
    'lokasi',
    'no_telp',
    'deskripsi',
    'pendidikan',
    'alasan_hire',
    'nama_perusahaan',
    'alamat',
    'no_telepon',
    'pengalaman',
    'jenis',
    // Notary.
    'nama',
    'nomor_sk',
    'wilayah_kerja',
];

const FILE_FIELDS = ['foto'];

export async function saveProfile(formData: FormData): Promise<void> {
    const mode = String(formData.get('mode') ?? 'professional');
    const name = String(formData.get('name') ?? '').trim();
    const email = String(formData.get('email') ?? '').trim();
    const username = String(formData.get('username') ?? '').trim();

    if (name === '' || email === '' || username === '') {
        return;
    }

    const body = new FormData();
    body.set('name', name);
    body.set('email', email);
    body.set('username', username);

    const phones = formData
        .getAll('phone_numbers')
        .map((entry) => String(entry).trim())
        .filter((entry) => entry !== '');
    body.set('phone_numbers', JSON.stringify(phones));

    if (mode === 'user') {
        body.set('_method', 'PUT');

        const avatar = formData.get('pic');
        if (avatar instanceof File && avatar.size > 0) {
            body.set('pic', avatar);
        }
    } else {
        for (const key of TEXT_FIELDS) {
            if (!formData.has(key)) {
                continue;
            }

            body.set(key, String(formData.get(key) ?? '').trim());
        }

        for (const key of FILE_FIELDS) {
            const file = formData.get(key);
            if (file instanceof File && file.size > 0) {
                body.set(key, file);
            }
        }

        // Notary services are a JSON array of {title, price, description}.
        // The fieldset is always rendered for a notary, so an empty submit
        // means "remove every service" — the controller replaces the set.
        const titles = formData.getAll('service_title').map((entry) => String(entry).trim());

        if (titles.length > 0) {
            const prices = formData.getAll('service_price').map((entry) => String(entry).trim());
            const descriptions = formData
                .getAll('service_description')
                .map((entry) => String(entry).trim());

            const services = titles
                .map((title, index) => ({
                    title,
                    price: prices[index] === '' || prices[index] === undefined ? '0' : prices[index],
                    description: descriptions[index] ?? '',
                }))
                .filter((service) => service.title !== '');

            body.set('services', JSON.stringify(services));
        }
    }

    try {
        await apiFetch(mode === 'user' ? '/me' : '/me/professional', {
            method: 'POST',
            body,
        });
    } catch (error) {
        if (error instanceof ApiFailure) {
            redirect(`/dashboard/profile?error=${encodeURIComponent(error.message)}`);
        }

        throw error;
    }

    revalidatePath('/dashboard/profile');
    revalidatePath('/dashboard');
}
