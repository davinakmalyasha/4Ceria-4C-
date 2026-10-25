'use server';

/**
 * The "send a reset link" action.
 *
 * It does NOT report whether the address exists, and it must not: the API
 * answers the same way for a known and an unknown address, and the screen says
 * so — "If an account with that email exists". Reproducing that is a security
 * property, not a nicety, so the action treats every non-error answer as
 * "sent".
 */

import { apiOrigin } from '@/lib/session';

export type ForgotState = {
    sent: boolean;
    error: string;
    /** Echoed back so the confirmation can name the address, as the legacy does. */
    email: string;
};

export async function requestReset(_previous: ForgotState, formData: FormData): Promise<ForgotState> {
    const email = String(formData.get('email') ?? '');

    const response = await fetch(`${apiOrigin()}/api/forgot-password`, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ email }),
        cache: 'no-store',
    });

    if (!response.ok) {
        let error = 'Something went wrong. Please try again.';

        try {
            const body = (await response.json()) as { message?: string };
            error = body.message ?? error;
        } catch {
            // Keep the default copy.
        }

        return { sent: false, error, email };
    }

    return { sent: true, error: '', email };
}
