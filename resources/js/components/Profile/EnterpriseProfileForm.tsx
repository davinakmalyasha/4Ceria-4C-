import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { EnterpriseFormFields } from './EnterpriseFormFields';
import { PortfolioManager } from '../Dashboard/PortfolioManager';
import { VerificationPanel } from './VerificationPanel';
import AvatarUpload from '../AvatarUpload';
import { CompanyFormFields } from './CompanyFormFields';
import { IndividualFormFields } from './IndividualFormFields';

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
        alasan_hire: profile?.alasan_hire ?? '',
        no_telp: profile?.no_telp ?? profile?.no_telepon ?? '',
        company_name: profile?.company_name ?? '',
        company_license: profile?.company_license ?? '',
        npwp_number: profile?.npwp_number ?? '',
        siup_number: profile?.siup_number ?? '',
        identity_number: profile?.identity_number ?? '',
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
            setTimeout(() => setSuccess(false), 3000);
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

    const isVerified = (profile?.verification_status === 'verified' || profile?.verification_status === 'approved');

    const renderVerificationBanner = () => {
        if (isVerified) {
            return (
                <div className="bg-white border border-neutral-200 rounded-2xl p-5 text-neutral-900 flex items-center justify-between gap-4 relative overflow-hidden shadow-sm">
                    <div className="space-y-1">
                        <h4 className="text-xs font-black uppercase tracking-widest text-neutral-900 flex items-center gap-1.5">
                            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                            Account Verified
                        </h4>
                        <p className="text-[11px] text-neutral-500 font-semibold leading-relaxed">Your professional credentials are fully authenticated. Bidding board is unlocked.</p>
                    </div>
                </div>
            );
        }

        return (
            <div className="bg-white border border-neutral-200 rounded-2xl p-5 text-neutral-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative overflow-hidden shadow-sm">
                <div className="space-y-1">
                    <h4 className="text-xs font-black uppercase tracking-widest text-neutral-900 flex items-center gap-1.5">
                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                        Verification Required
                    </h4>
                    <p className="text-[11px] text-neutral-500 font-semibold leading-relaxed">Your professional account is not verified yet. Secure bidding access by uploading files.</p>
                </div>
                <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('switchDashboardTab', { detail: 'verification' }))}
                    className="py-2.5 px-4 bg-neutral-900 hover:bg-black text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 shadow-sm shrink-0 self-start sm:self-auto animate-pulse"
                >
                    Verify Account
                </button>
            </div>
        );
    };

    return (
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-6">
            {/* Header with Title and Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-150 pb-5">
                <div>
                    <h3 className="text-2xl font-black text-gray-900">Edit Profile</h3>
                    <p className="text-xs text-gray-400 font-semibold mt-1">Configure your personal and firm settings below.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button type="button" onClick={onCancel} className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-xs hover:bg-gray-50 transition-all shadow-sm">Cancel</button>
                    <button type="submit" disabled={isLoading} className="px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-black transition-all shadow-md disabled:opacity-50 flex items-center gap-2">{isLoading ? 'Saving...' : 'Save Profile'}</button>
                </div>
            </div>
            {/* Verification Banner */}
            {renderVerificationBanner()}

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

            {/* Conditional Entity-Specific Forms */}
            {profile?.entity_type === 'company' ? (
                <CompanyFormFields formData={formData} onChange={handleChange} />
            ) : (
                <IndividualFormFields formData={formData} onChange={handleChange} />
            )}

            {/* Interactive Portfolio Management inside Edit Mode */}
            <PortfolioManager isEmbedded={true} />


        </form>
    );
}
