import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { EnterpriseFormFields } from './EnterpriseFormFields';
import { PortfolioManager } from '../Dashboard/PortfolioManager';

interface Props { onCancel: () => void }

const PROFILE_KEY: Record<string, string> = {
    project_manager: 'project_manager',
    structural: 'structural_engineer',
    mep: 'mep_engineer',
};

export default function EnterpriseProfileForm({ onCancel }: Props) {
    const { user, refreshUser } = useAuth();
    const profileKey = PROFILE_KEY[user?.role_type ?? ''];
    const profile = profileKey ? (user as Record<string, any>)?.[profileKey] : null;

    const [formData, setFormData] = useState({
        name: user?.name ?? '',
        email: user?.email ?? '',
        username: user?.username ?? '',
        rate_harga: profile?.rate_harga ?? '',
        pengalaman_tahun: profile?.pengalaman_tahun ?? '',
        lokasi: profile?.lokasi ?? '',
        deskripsi: profile?.deskripsi ?? '',
        spesialisasi: profile?.spesialisasi ?? '',
        pendidikan: profile?.pendidikan ?? '',
        alasan_hire: '',
        no_telp: profile?.no_telp ?? '',
    });
    const [phoneNumbers, setPhoneNumbers] = useState<string[]>(user?.phone_number?.map(p => p.contact) ?? []);
    const [fileFoto, setFileFoto] = useState<File | null>(null);
    const [filePorto, setFilePorto] = useState<File | null>(null);
    const [fileSertif, setFileSertif] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
        const f = e.target.files?.[0] ?? null;
        if (field === 'foto') setFileFoto(f);
        else if (field === 'file_portofolio') setFilePorto(f);
        else if (field === 'file_sertifikat') setFileSertif(f);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true); setError(''); setSuccess(false);
        try {
            const data = new FormData();
            Object.entries(formData).forEach(([k, v]) => data.append(k, v.toString()));
            data.append('phone_numbers', JSON.stringify(phoneNumbers.filter(p => p.trim() !== '')));
            if (fileFoto) data.append('foto', fileFoto);
            if (filePorto) data.append('file_portofolio', filePorto);
            if (fileSertif) data.append('file_sertifikat', fileSertif);
            await axios.post('/me/professional', data, { headers: { 'Content-Type': 'multipart/form-data' } });
            setSuccess(true);
            await refreshUser();
            setTimeout(() => onCancel(), 1000);
        } catch (err: any) {
            console.error(err);
            const errorData = err.response?.data;
            if (errorData?.errors) {
                const firstError = Object.values(errorData.errors)[0] as string[];
                setError(`Error: ${firstError[0]}`);
            } else {
                setError(errorData?.message ?? 'Update failed');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {error && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100 font-medium">{error}</div>}
            {success && <div className="p-3 bg-green-50 text-green-600 rounded-xl text-sm border border-green-100 font-medium">Profile updated!</div>}

            {/* Basic identity */}
            <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-2">Full Name</label><input type="text" name="name" value={formData.name} onChange={handleChange} required className="w-full px-4 py-3 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-red-500/20 outline-none font-medium" /></div>
                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-2">Username</label><input type="text" name="username" value={formData.username} onChange={handleChange} required className="w-full px-4 py-3 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-red-500/20 outline-none font-medium" /></div>
                <div className="col-span-2"><label className="block text-xs font-bold text-gray-500 uppercase mb-2">Email</label><input type="email" name="email" value={formData.email} onChange={handleChange} required className="w-full px-4 py-3 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-red-500/20 outline-none font-medium" /></div>
            </div>

            <EnterpriseFormFields
                formData={formData} onChange={handleChange} onFile={handleFile}
                currentPhoto={profile?.foto} currentPortfolio={profile?.file_portofolio} currentCert={profile?.file_sertifikat}
                hasNewPhoto={!!fileFoto} hasNewPortfolio={!!filePorto} hasNewCert={!!fileSertif}
            />

            {/* Interactive Portfolio Management inside Edit Mode */}
            <PortfolioManager isEmbedded={true} />

            <div className="pt-4 flex items-center gap-4">
                <button type="submit" disabled={isLoading} className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-black transition-all shadow-lg disabled:opacity-50">{isLoading ? 'Saving...' : 'Save Profile'}</button>
                <button type="button" onClick={onCancel} className="flex-1 bg-white border border-gray-200 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-50 transition-all">Cancel</button>
            </div>
        </form>
    );
}
