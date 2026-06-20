import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';

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
    logout: () => void;
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
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            axios.get('/me')
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
        axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_profile');
        axios.post('/logout').catch(() => {});
        window.location.href = '/login';
    }, []);
    
    const refreshUser = useCallback(async () => {
        try {
            const res = await axios.get('/me');
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
