import { useEffect, useState } from 'react';
import axios from 'axios';

export type FavoriteType =
    | 'house'
    | 'arsitek'
    | 'kontraktor'
    | 'interior'
    | 'notaris'
    | 'project_manager'
    | 'structural'
    | 'mep'
    | 'material';

export interface FavoriteItem {
    id: number;
    type: FavoriteType;
    title: string;
    subtitle: string | null;
    image: string | null;
    price: number | null;
}

// Legacy localStorage keys -> canonical favorite type.
const LEGACY_KEYS: Record<string, FavoriteType> = {
    house_wishlist: 'house',
    v1_fav_architects: 'arsitek',
    v1_fav_constructors: 'kontraktor',
    v1_fav_interior: 'interior',
    v1_fav_pms: 'project_manager',
};

const TYPE_TO_KEY: Record<FavoriteType, string> = {
    house: 'house_wishlist',
    arsitek: 'v1_fav_architects',
    kontraktor: 'v1_fav_constructors',
    interior: 'v1_fav_interior',
    notaris: 'v1_fav_notaris',
    project_manager: 'v1_fav_pms',
    structural: 'v1_fav_structural',
    mep: 'v1_fav_mep',
    material: 'v1_fav_materials',
};

const ALL_TYPES = Object.keys(TYPE_TO_KEY) as FavoriteType[];

/**
 * Marks ids in localStorage as written by a genuinely anonymous (guest)
 * session. Without it there is no way to tell a guest's wishlist apart from a
 * previous account's leftovers, and the leftovers used to be uploaded into
 * whichever account logged in next.
 */
const GUEST_MARKER_KEY = 'guest_favorites_pending';

function hasGuestFavoritesMarker(): boolean {
    try {
        return localStorage.getItem(GUEST_MARKER_KEY) !== null;
    } catch {
        return false;
    }
}

function markGuestFavorites(): void {
    try {
        localStorage.setItem(GUEST_MARKER_KEY, String(Date.now()));
    } catch {
        // Storage unavailable - ids simply will not be merged.
    }
}

function resolveType(key: string): FavoriteType | null {
    if (LEGACY_KEYS[key]) return LEGACY_KEYS[key];
    if ((ALL_TYPES as string[]).includes(key)) return key as FavoriteType;
    return null;
}

function hasToken(): boolean {
    return !!localStorage.getItem('auth_token');
}

function readLocalIds(type: FavoriteType): number[] {
    try {
        const raw = localStorage.getItem(TYPE_TO_KEY[type]);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'number') : [];
    } catch {
        return [];
    }
}

function writeLocalIds(type: FavoriteType, ids: number[]) {
    localStorage.setItem(TYPE_TO_KEY[type], JSON.stringify(ids));
    markGuestFavorites();
}

function readAllLocal(): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    ALL_TYPES.forEach((type) => {
        const ids = readLocalIds(type);
        if (ids.length) out[type] = ids;
    });
    return out;
}

/** Drops the locally cached id lists + the guest marker. */
function clearFavoriteKeys() {
    ALL_TYPES.forEach((type) => localStorage.removeItem(TYPE_TO_KEY[type]));
    localStorage.removeItem(GUEST_MARKER_KEY);
}

/**
 * Full reset (used on logout): drops the local keys AND the in-memory store, so
 * nothing from the previous account can be rendered by the next one.
 */
export function clearLocalFavorites() {
    clearFavoriteKeys();
    map = {};
    loaded = false;
    emit();
}

// ---------------------------------------------------------------------------
// Shared module store: all hook instances stay in sync, and guest favorites
// are merged into the server on first authenticated load.
// ---------------------------------------------------------------------------
let map: Record<string, number[]> = {};
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
    listeners.forEach((listener) => listener());
}

export async function loadFavorites(force = false): Promise<void> {
    if (loaded && !force) return;
    if (loading) return loading;

    loading = (async () => {
        const local = readAllLocal();

        if (!hasToken()) {
            map = local;
            loaded = true;
            emit();
            return;
        }

        // Only ids written by a genuinely anonymous session may be merged into
        // this account. Local ids without the guest marker are leftovers from a
        // previous account (or a failed merge) and are discarded outright.
        const guestLocal: Record<string, number[]> = hasGuestFavoritesMarker() ? local : {};
        Object.keys(local).forEach((type) => {
            if (!(type in guestLocal)) {
                localStorage.removeItem(TYPE_TO_KEY[type as FavoriteType]);
            }
        });

        try {
            const res = await axios.get('/favorites');
            let server: Record<string, number[]> = res.data?.data ?? {};

            const pending: { type: string; id: number }[] = [];
            Object.entries(guestLocal).forEach(([type, ids]) => {
                const serverIds = server[type] ?? [];
                ids.forEach((id) => {
                    if (!serverIds.includes(id)) pending.push({ type, id });
                });
            });

            if (pending.length) {
                const merged = await axios.post('/favorites/merge', { items: pending });
                server = merged.data?.data ?? server;
            }

            // Always clear - even when nothing was pending. Anything left here
            // would be merged into whoever logs in next.
            clearFavoriteKeys();
            map = server;
            loaded = true;
            emit();
        } catch {
            // Network/auth failure: only the guest-scoped ids survive, and they
            // keep their marker so the next successful load can still merge
            // them. The previous account's ids are never resurrected.
            map = guestLocal;
            loaded = true;
            emit();
        } finally {
            loading = null;
        }
    })();

    return loading;
}

export function useFavorites(storageKey: string) {
    const type = resolveType(storageKey);
    const [ids, setIds] = useState<number[]>(() => {
        if (!type) return [];
        if (map[type]) return map[type];
        // Local ids are only trustworthy for a guest session; while signed in
        // they could still belong to the previously signed-in account.
        return hasToken() ? [] : readLocalIds(type);
    });

    useEffect(() => {
        if (!type) return;
        const sync = () => setIds(map[type] ?? []);
        listeners.add(sync);
        loadFavorites().then(sync);
        return () => {
            listeners.delete(sync);
        };
    }, [type]);

    const toggleFavorite = async (id: number) => {
        if (!type) return;
        await toggleFavoriteItem(type, id);
    };

    return {
        favorites: ids,
        toggleFavorite,
        isFavorite: (id: number) => ids.includes(id),
    };
}

/**
 * Standalone toggle usable outside hooks (e.g. the Saved Items dashboard).
 *
 * Resolves to the resulting favorited state so callers can surface a failure
 * (the optimistic update is reverted on error) and offer an Undo. Callers
 * that ignore the return value keep the previous fire-and-forget behaviour.
 */
export async function toggleFavoriteItem(type: FavoriteType, id: number): Promise<boolean> {
    const current = map[type] ?? [];
    const wasFavorited = current.includes(id);
    const next = wasFavorited ? current.filter((x) => x !== id) : [...current, id];

    // Optimistic update.
    map = { ...map, [type]: next };
    emit();

    if (!hasToken()) {
        writeLocalIds(type, next);
        return next.includes(id);
    }

    try {
        await axios.post('/favorites/toggle', { favoritable_type: type, favoritable_id: id });
        return next.includes(id);
    } catch {
        // Revert on failure.
        map = { ...map, [type]: current };
        emit();
        return wasFavorited;
    }
}

export async function fetchFavoriteItems(): Promise<Record<string, FavoriteItem[]>> {
    await loadFavorites();
    if (!hasToken()) return {};
    try {
        const res = await axios.get('/favorites');
        return res.data?.items ?? {};
    } catch {
        return {};
    }
}
