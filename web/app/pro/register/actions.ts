'use server';

/**
 * The professional-registration action.
 *
 * THE VALIDATION IS THE LEGACY'S: only the confirmation is checked here. The
 * password rules themselves belong to the API, and duplicating them would mean
 * two places to change them — which is how the user-facing register screen came
 * to have a `min:8` check that the professional one does not.
 */

import { redirect } from 'next/navigation';
import { apiOrigin, clearSession, sessionToken } from '@/lib/session';

export type ProRegisterState = {
    error: string;
};

export async function registerProfessional(
    _previous: ProRegisterState,
    formData: FormData,
): Promise<ProRegisterState> {
    const fields = {
        name: String(formData.get('name') ?? ''),
        username: String(formData.get('username') ?? ''),
        email: String(formData.get('email') ?? ''),
        role_type: String(formData.get('role_type') ?? 'arsitek'),
        password: String(formData.get('password') ?? ''),
        password_confirmation: String(formData.get('password_confirmation') ?? ''),
    };

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
            // Keep the default copy.
        }

        return { error: message };
    }

    const body = (await response.json()) as { access_token: string };

    const { setSession } = await import('@/lib/session');
    await setSession(body.access_token);

    redirect('/dashboard');
}

/**
 * Sign the current account out, so the visitor can register a partner account.
 *
 * The legacy panel's button calls `logout()`, which revokes the token and then
 * navigates. Here the token is revoked on the server and the cookie is dropped;
 * the browser never held the token in the first place.
 */
export async function signOut(): Promise<void> {
    const token = await sessionToken();

    if (token) {
        await fetch(`${apiOrigin()}/api/logout`, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${token}`,
                'X-Requested-With': 'XMLHttpRequest',
            },
            cache: 'no-store',
        }).catch(() => {
            // A failed revoke still clears the local session: keeping a dead
            // cookie would leave the visitor unable to register.
        });
    }

    await clearSession();

    redirect('/pro/register');
}
