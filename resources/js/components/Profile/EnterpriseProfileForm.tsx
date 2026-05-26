import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { EnterpriseFormFields } from './EnterpriseFormFields';
import { PortfolioManager } from '../Dashboard/PortfolioManager';
import { VerificationPanel } from './VerificationPanel';
import AvatarUpload from '../AvatarUpload';

interface Props { onCancel: () => void }

const PROFILE_KEY: Record<string, string> = {
    project_manager: 'project_manager',
    structural: 'structural_engineer',
    mep: 'mep_engineer',
    civil: 'kontraktor',
    mechanical: 'kontraktor',
    electrical: 'kontraktor',
    plumbing: 'kontraktor',
    roofing: 'kontraktor',
    finishing: 'kontraktor',
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
        pengalaman_tahun: profile?.pengalaman_tahun ?? profile?.pengalaman ?? '',
        lokasi: profile?.lokasi ?? profile?.alamat ?? '',
        deskripsi: profile?.deskripsi ?? '',
        spesialisasi: profile?.spesialisasi ?? '',
        pendidikan: profile?.pendidikan ?? '',
        alasan_hire: '',
        no_telp: profile?.no_telp ?? profile?.no_telepon ?? '',
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
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* Left Column: Input Fields & Portfolios */}
            <div className="lg:col-span-2 space-y-6">
                {error && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100 font-medium">{error}</div>}
                {success && <div className="p-3 bg-green-50 text-green-600 rounded-xl text-sm border border-green-100 font-medium">Profile updated!</div>}

                {/* Profile Photo Header (Reusing AvatarUpload exactly like UserProfileForm) */}
                <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-gray-50 border border-gray-100 rounded-2xl gap-4">
                    <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                        <AvatarUpload />
                        <div>
                            <h3 className="text-sm font-bold text-gray-800">Profile Photo</h3>
                            <p className="text-xs text-gray-400 mt-0.5">PNG, JPG, or JPEG (Max 2MB)</p>
                        </div>
                    </div>
                    
                    {user?.unique_code && (
                        <div className="flex flex-col items-center sm:items-end gap-1">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Referral Code</span>
                            <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-gray-200 rounded-xl shadow-sm">
                                <span className="font-mono font-bold text-xs text-gray-700 tracking-wider">{user.unique_code}</span>
                                <button 
                                    type="button" 
                                    onClick={() => {
                                        navigator.clipboard.writeText(user.unique_code || '');
                                        alert('Referral code copied to clipboard!');
                                    }}
                                    className="text-[#FF2D20] hover:text-red-700 transition-colors p-0.5"
                                    title="Copy Referral Code"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

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
                    excludeFiles={true}
                />

                {/* Interactive Portfolio Management inside Edit Mode */}
                <PortfolioManager isEmbedded={true} />

                <div className="pt-4 flex items-center gap-4">
                    <button type="submit" disabled={isLoading} className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-black transition-all shadow-lg disabled:opacity-50">{isLoading ? 'Saving...' : 'Save Profile'}</button>
                    <button type="button" onClick={onCancel} className="flex-1 bg-white border border-gray-200 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-50 transition-all">Cancel</button>
                </div>
            </div>

            {/* Right Column: Verification Panel (Sticky) */}
            <div className="lg:col-span-1 lg:sticky lg:top-6">
                <VerificationPanel
                    verificationStatus={profile?.verification_status ?? 'unverified'}
                    rejectionReason={profile?.rejection_reason}
                    fileFoto={fileFoto}
                    filePorto={filePorto}
                    fileSertif={fileSertif}
                    onFile={handleFile}
                    hasExistingPhoto={!!profile?.foto}
                    hasExistingPortfolio={!!profile?.file_portofolio}
                    hasExistingCert={!!profile?.file_sertifikat}
                    isLoading={isLoading}
                />
            </div>
        </form>
    );
}
