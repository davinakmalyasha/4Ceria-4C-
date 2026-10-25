'use server';

/**
 * The registration action.
 *
 * THE VALIDATION IS THE LEGACY VALIDATION, and it is kept on purpose.
 *
 * `Register.tsx:35-43` checks the password length and the confirmation in the
 * BROWSER, before the request, with its own two messages. That looks like
 * duplication — Laravel validates both — but it is a deliberate round-trip
 * saving: a mismatched confirmation is refused without a request, and the user
 * sees the message instantly. The port keeps the same two checks and the same
 * two sentences, so the screen behaves the way the baseline says it does.
 *
 * The API's own `errors` bag is still the source for everything else, and the
 * FIRST message is shown — as the legacy does.
 */

import { redirect } from 'next/navigation';
import { apiOrigin, setSession } from '@/lib/session';

export type RegisterState = {
    error: string;
};

type RegisterResponse = {
    access_token: string;
    user: { id: number; role_type: string };
};

export async function register(_previous: RegisterState, formData: FormData): Promise<RegisterState> {
    const fields = {
        name: String(formData.get('name') ?? ''),
        username: String(formData.get('username') ?? ''),
        email: String(formData.get('email') ?? ''),
        role_type: String(formData.get('role_type') ?? 'user'),
        password: String(formData.get('password') ?? ''),
        password_confirmation: String(formData.get('password_confirmation') ?? ''),
    };

    if (fields.password.length < 8) {
        return { error: 'Password must be at least 8 characters' };
    }

    if (fields.password !== fields.password_confirmation) {
        return { error: 'Passwords do not match' };
    }

    const response = await fetch(`${apiOrigin()}/api/register`, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify(fields),
        cache: 'no-store',
    });

    if (!response.ok) {
        let message = 'Registration failed';

        try {
            const body = (await response.json()) as {
                message?: string;
                errors?: Record<string, string[]>;
            };

            const first = body.errors ? Object.values(body.errors)[0]?.[0] : undefined;

            message = first ?? body.message ?? message;
        } catch {
            // A non-JSON body keeps the default copy.
        }

        return { error: message };
    }

    const body = (await response.json()) as RegisterResponse;

    await setSession(body.access_token);

    redirect('/dashboard');
}
