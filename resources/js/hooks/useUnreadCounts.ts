import { useSyncExternalStore, useCallback } from 'react';
import axios from 'axios';

interface UnreadCounts {
    unread_messages: number;
    unread_notifications: number;
}

/**
 * Module-level shared store so every consumer (header badge, bell dropdown,
 * chat) shares ONE polling heartbeat instead of each running its own interval.
 */
let counts: UnreadCounts = { unread_messages: 0, unread_notifications: 0 };
const listeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setInterval> | null = null;

const POLL_INTERVAL_MS = 15000;

function emit(next: UnreadCounts) {
    if (next.unread_messages === counts.unread_messages && next.unread_notifications === counts.unread_notifications) {
        return;
    }
    counts = next;
    listeners.forEach(l => l());
}

export async function refreshUnreadCounts(): Promise<void> {
    try {
        const res = await axios.get<UnreadCounts>('/me/unread-summary');
        if (res.data && typeof res.data.unread_messages === 'number') {
            emit({
                unread_messages: res.data.unread_messages,
                unread_notifications: res.data.unread_notifications,
            });
        }
    } catch {
        // Silent: badges are non-critical, next tick retries
    }
}

function ensurePolling() {
    if (pollTimer !== null) return;
    refreshUnreadCounts();
    pollTimer = setInterval(() => {
        if (document.hidden) return; // pause when tab is in background
        refreshUnreadCounts();
    }, POLL_INTERVAL_MS);
}

function maybeStopPolling() {
    if (listeners.size === 0 && pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    ensurePolling();
    return () => {
        listeners.delete(listener);
        maybeStopPolling();
    };
}

function getSnapshot(): UnreadCounts {
    return counts;
}

export function useUnreadCounts(): { counts: UnreadCounts; refresh: typeof refreshUnreadCounts } {
    const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const refresh = useCallback(refreshUnreadCounts, []);
    return { counts: value, refresh };
}
