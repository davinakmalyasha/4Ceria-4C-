import { notFound, redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';
import { sessionToken } from '@/lib/session';
import type { User } from '@/context/AuthContext';

/**
 * Resolve the session and the project for a `/projects/<id>` URL.
 *
 * Shared by the overview route and the per-tab routes, so both answer the same
 * way to a signed-out visitor (login with a return path), an unreadable id
 * (404) and an inaccessible project (404 — the API's 403 is a 404 on the web,
 * because a stranger should not learn that the id exists).
 */
export async function loadProjectPage(id: string): Promise<{ project: unknown; user: User }> {
    if (!/^\d+$/.test(id)) {
        notFound();
    }

    if (!(await sessionToken())) {
        redirect(`/login?next=/projects/${id}`);
    }

    try {
        const [projectResponse, meResponse] = await Promise.all([
            apiFetch<{ data: unknown }>(`/projects/${id}`),
            apiFetch<{ data: User }>('/me'),
        ]);

        return { project: projectResponse.data, user: meResponse.data };
    } catch (error) {
        if (error instanceof ApiFailure) {
            if (error.status === 401) {
                redirect(`/login?next=/projects/${id}`);
            }
            if (error.status === 403 || error.status === 404) {
                notFound();
            }
        }

        throw error;
    }
}
