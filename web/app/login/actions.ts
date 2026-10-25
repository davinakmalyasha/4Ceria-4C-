'use server';

/**
 * The login action.
 *
 * WHAT MOVED OFF THE CLIENT
 * -------------------------
 * The legacy handler POSTs `/login` from the browser, receives an
 * `access_token`, writes it to `localStorage` and navigates. Every one of those
 * steps is a thing an attacker who can run script on the page can also do.
 *
 * Here the form posts to a server action: the token is exchanged on the server,
 * stored in an httpOnly cookie, and the browser is redirected. The token is
 * never in the document.
 *
 * The error message is the API's own — "These credentials do not match our
 * records." — because the port must not invent copy the baseline does not have.
 */

import { redirect } from 'next/navigation';
import { apiOrigin } from '@/lib/session';
import { setSession } from '@/lib/session';

export type LoginState = {
    error: string;
};

type LoginResponse = {
    access_token: string;
    user: { id: number; role_type: string };
};

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');

    const response = await fetch(`${apiOrigin()}/api/login`, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ email, password }),
        cache: 'no-store',
    });

    if (!response.ok) {
        let message = 'Invalid login credentials';

        try {
            const body = (await response.json()) as { message?: string };
            message = body.message ?? message;
        } catch {
            // A non-JSON body keeps the default copy.
        }

        return { error: message };
    }

    const body = (await response.json()) as LoginResponse;

    await setSession(body.access_token);

    redirect('/dashboard');
}
