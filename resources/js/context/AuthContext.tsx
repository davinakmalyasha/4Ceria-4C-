import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { api } from '../api';
import { clearLocalFavorites } from '../hooks/useFavorites';

/* -------------------------------------------------------------------------
 * Per-user client-side storage
 *
 * Drafts written by one account (contract signature + bank details, negotiated
 * fees, technical audit notes) used to live under un-namespaced keys, so the
 * next person to use a shared device inherited them pre-filled. Every
 * user-scoped key is now prefixed with the owning user id.
 * ---------------------------------------------------------------------- */

const DRAFT_KEY_PREFIXES = [
    '4ceria_contract_draft_', // ContractSignModal (signature + bank details)
    'bid_draft_',             // useBidDraft (negotiated fee / termins)
    'draft_audit_',           // EngineeringCoordination (audit sticky notes)
];

/** Upper bound on how long logout may block before the user is navigated away. */
const LOGOUT_REVOKE_TIMEOUT = 3000;

export const userScopedStorageKey = (
    prefix: string,
    userId: number | string | null | undefined,
    ...parts: (string | number)[]
): string => `${prefix}u${userId ?? 'anon'}_${parts.join('_')}`;

const removeKeysByPrefix = (storage: Storage, prefixes: string[]) => {
    try {
        Object.keys(storage)
            .filter((key) => prefixes.some((prefix) => key.startsWith(prefix)))
            .forEach((key) => storage.removeItem(key));
    } catch (e) {
        // Storage unavailable (private mode / quota) - nothing else to do.
    }
};

/**
 * Drops every user-scoped draft from localStorage AND sessionStorage. Called on
 * logout so a signature image, bank details or negotiated fee never survives
 * into the next session on the same device.
 */
export const purgeUserScopedStorage = (): void => {
    removeKeysByPrefix(localStorage, DRAFT_KEY_PREFIXES);
    removeKeysByPrefix(sessionStorage, DRAFT_KEY_PREFIXES);
};

/**
 * One-time migration from a pre-namespacing draft key: read the legacy value,
 * write it to the user-scoped key, delete the legacy key. An already populated
 * user-scoped key always wins, and the legacy key is dropped either way.
 */
export const adoptLegacyDraft = (legacyKey: string, scopedKey: string, storage: Storage): void => {
    try {
        if (legacyKey === scopedKey) return;
        const legacy = storage.getItem(legacyKey);
        if (legacy === null) return;
        if (storage.getItem(scopedKey) === null) {
            storage.setItem(scopedKey, legacy);
        }
        storage.removeItem(legacyKey);
    } catch (e) {
        console.error('Failed to migrate draft storage key', e);
    }
};


export interface User {
    id: number;
    name: string;
    email: string;
    role_type: string;
    username: string;
    pic?: string | null;
    bank_name?: string | null;
    bank_account_number?: string | null;
    bank_account_name?: string | null;
    unique_code?: string;
    phone_number?: { id: number; contact: string }[];
    arsitek?: { 
        id: number;
        no_telp: string,
        foto: string,
        rate_harga: string, 
        pengalaman_tahun: string, 
        lokasi: string, 
        deskripsi: string, 
        spesialisasi: string, 
        file_portofolio: string, 
        file_sertifikat: string, 
        pendidikan: string, 
        alasan_hire: string,
        verification_status: string,
        rejection_reason?: string 
    };
    kontraktor?: { 
        id: number;
        no_telepon: string,
        foto: string,
        nama_perusahaan: string, 
        alamat: string, 
        jenis: string, 
        pengalaman: string, 
        rate_harga: string, 
        npwp: string, 
        siup: string, 
        pendidikan: string, 
        alasan_hire: string,
        verification_status: string,
        rejection_reason?: string 
    };
    supplier?: {
        id: number;
        store_name: string;
        address: string;
        no_telp: string;
        category: string;
        bio: string;
        foto: string;
        verification_status: string;
    };
    interior_profile?: {
        id: number;
        no_telp: string,
        foto: string,
        rate_harga: string, 
        pengalaman_tahun: string, 
        lokasi: string, 
        deskripsi: string, 
        spesialisasi: string, 
        file_portofolio: string, 
        file_sertifikat: string,
        verification_status: string,
        rejection_reason?: string
    };
    notaris_profile?: {
        id: number;
        no_telp: string,
        foto: string,
        pendidikan: string,
        rate_harga: string,
        lokasi: string,
        deskripsi: string,
        file_portofolio: string,
        verification_status: string,
        rejection_reason?: string
    };
    project_manager?: {
        id: number;
        nama: string;
        no_telp: string;
        rate_harga: string;
        pengalaman_tahun: string;
        lokasi: string;
        deskripsi: string;
        spesialisasi: string;
        pendidikan: string;
        alasan_hire: string;
        file_portofolio: string;
        file_sertifikat: string;
        verification_status: string;
        rejection_reason?: string;
    };
    structural_engineer?: {
        id: number;
        nama: string;
        no_telp: string;
        rate_harga: string;
        pengalaman_tahun: string;
        lokasi: string;
        deskripsi: string;
        spesialisasi: string;
        pendidikan: string;
        alasan_hire: string;
        file_portofolio: string;
        file_sertifikat: string;
        verification_status: string;
        rejection_reason?: string;
    };
    mep_engineer?: {
        id: number;
        nama: string;
        no_telp: string;
        rate_harga: string;
        pengalaman_tahun: string;
        lokasi: string;
        deskripsi: string;
        spesialisasi: string;
        pendidikan: string;
        alasan_hire: string;
        file_portofolio: string;
        file_sertifikat: string;
        verification_status: string;
        rejection_reason?: string;
    };
    team_members?: {
        id: number;
        name: string;
        photo_path: string | null;
        photo_url: string | null;
        role_title: string;
        bio: string | null;
        skills: string[];
        phone: string | null;
        email: string | null;
        status: 'active' | 'inactive';
    }[];
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string, user: User) => void;
    logout: () => void | Promise<void>;
    refreshUser: () => Promise<void>;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(() => {
        try {
            const cached = localStorage.getItem('user_profile');
            return cached ? JSON.parse(cached) : null;
        } catch (e) {
            return null;
        }
    });
    const [token, setToken] = useState<string | null>(localStorage.getItem('auth_token'));
    const [isLoading, setIsLoading] = useState(() => {
        const tokenExists = !!localStorage.getItem('auth_token');
        const userExists = !!localStorage.getItem('user_profile');
        return tokenExists && !userExists;
    });

    useEffect(() => {
        if (token) {
            // The token is attached per request by the origin-scoped client
            // (see resources/js/api.js) - never as a global axios default.
            api.get('/me')
                .then(res => {
                    const userData = res.data.data;
                    setUser(userData);
                    localStorage.setItem('user_profile', JSON.stringify(userData));
                })
                .catch(() => {
                    setToken(null);
                    setUser(null);
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('user_profile');
                })
                .finally(() => setIsLoading(false));
        } else {
            setUser(null);
            setIsLoading(false);
            localStorage.removeItem('user_profile');
        }
    }, [token]);

    const login = useCallback((newToken: string, userData: User) => {
        setToken(newToken);
        setUser(userData);
        localStorage.setItem('auth_token', newToken);
        localStorage.setItem('user_profile', JSON.stringify(userData));
    }, []);

    const logout = useCallback(async () => {
        // Revoke the Sanctum token server-side BEFORE navigating: the previous
        // implementation fired the request and immediately set
        // `window.location.href`, which cancelled the XHR so
        // `AuthController@logout` often never ran and the token stayed valid.
        const revoked = api
            .post('/logout', undefined, {
                timeout: LOGOUT_REVOKE_TIMEOUT,
                __isAuthCall: true, // suppress the global 401 redirect
            })
            .catch(() => { /* best effort - the local credential is dropped anyway */ });

        // Hard ceiling: a dead network must never trap the user on this page.
        await Promise.race([
            revoked,
            new Promise((resolve) => setTimeout(resolve, LOGOUT_REVOKE_TIMEOUT + 500)),
        ]);

        // The credential is gone from memory + storage either way.
        try {
            delete axios.defaults.headers.common['Authorization'];
        } catch (e) {
            // No shared default to purge.
        }
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_profile');
        // Signature images, bank details and negotiated fees from this account
        // must not be readable by the next user of this device.
        purgeUserScopedStorage();
        clearLocalFavorites();

        setToken(null);
        setUser(null);
        window.location.href = '/login';
    }, []);

    // Multi-tab session sync: when another tab logs out (or logs in), this
    // tab follows via the storage event.
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === 'auth_token' && !e.newValue && localStorage.getItem('auth_token') === null) {
                // sessionStorage is per-tab, so this tab's copy of the previous
                // user's drafts (signature, bank details, negotiated fees) has
                // to be dropped here too - the other tab cannot reach it.
                purgeUserScopedStorage();
                setUser(null);
                setToken(null);
                window.location.href = '/login';
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);
    
    const refreshUser = useCallback(async () => {
        try {
            const res = await api.get('/me');
            const userData = res.data.data;
            setUser(userData);
            localStorage.setItem('user_profile', JSON.stringify(userData));
        } catch (err) {
            console.error("Failed to refresh user data", err);
        }
    }, []);

    const value = useMemo(() => ({
        user,
        token,
        login,
        logout,
        refreshUser,
        isLoading
    }), [user, token, login, logout, refreshUser, isLoading]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
};
