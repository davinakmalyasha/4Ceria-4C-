import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

axios.defaults.baseURL = '/api';

interface User {
    id: number;
    name: string;
    email: string;
    role_type: string;
    username: string;
    pic?: string | null;
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
        verification_status: string;
    };
    structural_engineer?: {
        id: number;
        nama: string;
        no_telp: string;
        verification_status: string;
    };
    mep_engineer?: {
        id: number;
        nama: string;
        no_telp: string;
        verification_status: string;
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
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('auth_token'));
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            axios.get('/me')
                .then(res => setUser(res.data.data))
                .catch(() => {
                    setToken(null);
                    localStorage.removeItem('auth_token');
                })
                .finally(() => setIsLoading(false));
        } else {
            setIsLoading(false);
        }
    }, [token]);

    const login = (newToken: string, userData: User) => {
        setToken(newToken);
        setUser(userData);
        localStorage.setItem('auth_token', newToken);
        axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    };

    const logout = () => {
        localStorage.removeItem('auth_token');
        axios.post('/logout').catch(() => {});
        window.location.href = '/login';
    };
    
    const refreshUser = async () => {
        try {
            const res = await axios.get('/me');
            setUser(res.data.data);
        } catch (err) {
            console.error("Failed to refresh user data", err);
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, refreshUser, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
};
