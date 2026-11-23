'use server';

import { redirect } from 'next/navigation';
import { apiOrigin } from '@/lib/session';

export type ResetState = { error: string };

export async function resetPassword(_previous: ResetState, formData: FormData): Promise<ResetState> {
    const token = String(formData.get('token') ?? '');
    const email = String(formData.get('email') ?? '').trim().toLowerCase();
    const password = String(formData.get('password') ?? '');
    const confirmation = String(formData.get('password_confirmation') ?? '');

    if (password !== confirmation) {
        return { error: 'The password confirmation does not match.' };
    }

    const response = await fetch(`${apiOrigin()}/api/reset-password`, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
            token,
            email,
            password,
            password_confirmation: confirmation,
        }),
        cache: 'no-store',
    });

    if (!response.ok) {
        let error = 'The reset link is invalid or has expired.';

        try {
            const body = (await response.json()) as {
                message?: string;
                errors?: Record<string, string[]>;
            };
            error = body.errors?.email?.[0] ?? body.errors?.password?.[0] ?? body.message ?? error;
        } catch {
            // Keep the default copy.
        }

        return { error };
    }

    redirect('/login?reset=1');
}
