import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

axios.defaults.baseURL = '/api';

interface User {
    id: number;
    name: string;
    email: string;
    role_type: string;
    username: string;
    phone_number?: { id: number; contact: string }[];
    arsitek?: { 
        id: number;
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
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string, user: User) => void;
    logout: () => void;
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
                .then(res => setUser(res.data))
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

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
};
