'use server';

import { redirect } from 'next/navigation';
import { apiOrigin, setSession } from '@/lib/session';

export type LoginState = {
    error: string;
};

type LoginResponse = {
    access_token: string;
    user: { id: number; role_type: string };
};

function safeNext(value: FormDataEntryValue | null): string {
    const next = String(value ?? '');

    return next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
    const email = String(formData.get('email') ?? '').trim().toLowerCase();
    const password = String(formData.get('password') ?? '');
    const next = safeNext(formData.get('next'));

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

    redirect(next);
}
