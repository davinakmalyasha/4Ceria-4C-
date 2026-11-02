'use server';

import { apiFetch, ApiFailure } from '@/lib/api';

/**
 * Notification writes used by the native header.
 *
 * A server action cannot leak a raw error to the browser in production, so each
 * one returns a small result object the dropdown can render. The list itself is
 * server-fed; the client calls `router.refresh()` after a successful write so
 * the header re-renders with the new unread state.
 */
export type ActionResult = { ok: true } | { ok: false; message: string };

function failure(error: unknown): ActionResult {
    if (error instanceof ApiFailure) {
        return { ok: false, message: error.message };
    }

    return { ok: false, message: 'The request could not be completed.' };
}

export async function markNotificationRead(id: number): Promise<ActionResult> {
    if (!Number.isInteger(id) || id <= 0) {
        return { ok: false, message: 'Unknown notification.' };
    }

    try {
        await apiFetch(`/notifications/${id}/read`, { method: 'POST' });
    } catch (error) {
        return failure(error);
    }

    return { ok: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
    try {
        await apiFetch('/notifications/read-all', { method: 'POST' });
    } catch (error) {
        return failure(error);
    }

    return { ok: true };
}

export async function saveNotificationPreference(
    type: string | null,
    enabled: boolean,
): Promise<ActionResult> {
    try {
        await apiFetch('/notification-preferences', {
            method: 'PUT',
            body: JSON.stringify({ type, channel: 'webpush', enabled }),
        });
    } catch (error) {
        return failure(error);
    }

    return { ok: true };
}

export async function openConversationWith(
    userId: number,
): Promise<{ ok: true; href: string } | { ok: false; message: string }> {
    if (!Number.isInteger(userId) || userId <= 0) {
        return { ok: false, message: 'Unknown sender.' };
    }

    try {
        const response = await apiFetch<{ data: number }>('/conversations', {
            method: 'POST',
            body: JSON.stringify({ user_id: userId }),
        });

        if (typeof response.data !== 'number') {
            return { ok: false, message: 'The conversation could not be opened.' };
        }

        return { ok: true, href: `/dashboard/chat?conversation=${response.data}` };
    } catch (error) {
        if (error instanceof ApiFailure) {
            return { ok: false, message: error.message };
        }

        return { ok: false, message: 'The conversation could not be opened.' };
    }
}
