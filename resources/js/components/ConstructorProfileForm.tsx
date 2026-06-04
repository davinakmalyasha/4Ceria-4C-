import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Plus, X, Phone, UploadCloud, FileText, AlertCircle } from 'lucide-react';
import { PortfolioManager } from './Dashboard/PortfolioManager';

import { ErrorBoundary } from './Common/ErrorBoundary';

interface EditProfileFormProps { onCancel: () => void; }

export default function ConstructorProfileForm({ onCancel }: EditProfileFormProps) {
    const { user, refreshUser } = useAuth();
    const [formData, setFormData] = useState({
        name: user?.name || '',
        email: user?.email || '',
        username: user?.username || '',
        nama_perusahaan: user?.kontraktor?.nama_perusahaan || '',
        alamat: user?.kontraktor?.alamat || '',
        jenis: user?.kontraktor?.jenis || '',
        pengalaman: user?.kontraktor?.pengalaman || '',
        rate_harga: user?.kontraktor?.rate_harga || '',
        pendidikan: user?.kontraktor?.pendidikan || '',
        alasan_hire: user?.kontraktor?.alasan_hire || '',
        no_telepon: user?.kontraktor?.no_telepon || '',
    });
    const [phoneNumbers, setPhoneNumbers] = useState<string[]>(
        Array.isArray(user?.phone_number) 
            ? user.phone_number.map((p: any) => p.contact) 
            : []
    );
    const [fileFoto, setFileFoto] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<File | null>>) => {
        if (e.target.files && e.target.files[0]) setter(e.target.files[0]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true); setError(''); setSuccess(false);
        try {
            const data = new FormData();
            Object.entries(formData).forEach(([key, value]) => data.append(key, value.toString()));
            data.append('phone_numbers', JSON.stringify(phoneNumbers.filter(p => p.trim() !== '')));
            if (fileFoto) data.append('foto', fileFoto);

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
                setError(errorData?.message || 'Update failed');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const isVerified = (user?.kontraktor?.verification_status === 'verified' || user?.kontraktor?.verification_status === 'approved');

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
        <form onSubmit={handleSubmit} className="space-y-6">
            {renderVerificationBanner()}
            {error && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">{error}</div>}
            {success && <div className="p-3 bg-green-50 text-green-600 rounded-xl text-sm border border-green-100">Profile updated successfully!</div>}
            
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Director / Name</label>
                    <input type="text" name="name" value={formData.name} onChange={handleChange} required className="w-full px-4 py-3 bg-gray-50 border rounded-xl focus:ring-[#FF2D20]/20" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Username</label>
                    <input type="text" name="username" value={formData.username} onChange={handleChange} required className="w-full px-4 py-3 bg-gray-50 border rounded-xl focus:ring-[#FF2D20]/20" />
                </div>
                <div className="col-span-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-2">
                        Email Address
                        {!formData.email && <AlertCircle size={14} className="text-[#FF2D20] animate-pulse" />}
                    </label>
                    <input type="email" name="email" value={formData.email} onChange={handleChange} required className="w-full px-4 py-3 bg-gray-50 border rounded-xl focus:ring-[#FF2D20]/20" placeholder="company@example.com" />
                </div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4">
                <h3 className="font-bold text-gray-800 border-b pb-2">Contractor Information</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Contractor Type (Jenis)</label>
                        <input type="text" name="jenis" value={formData.jenis} onChange={handleChange} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-[#FF2D20]/20" placeholder="e.g. SIPIL" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Experience (Years)</label>
                        <input type="text" name="pengalaman" value={formData.pengalaman} onChange={handleChange} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-[#FF2D20]/20" placeholder="e.g. 10" />
                    </div>
                    <div className="col-span-2">
                        <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-2">
                            Est. Rate (Rate Harga)
                            {!formData.rate_harga && <AlertCircle size={14} className="text-[#FF2D20] animate-pulse" />}
                        </label>
                        <input type="number" name="rate_harga" value={formData.rate_harga} onChange={handleChange} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-[#FF2D20]/20" placeholder="150000" />
                    </div>
                    <div className="col-span-2">
                        <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-2">
                            WhatsApp Number (Direct Link)
                            {!formData.no_telepon && <AlertCircle size={14} className="text-[#FF2D20] animate-pulse" />}
                        </label>
                        <div className="relative">
                            <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input type="tel" name="no_telepon" value={formData.no_telepon} onChange={handleChange} className="w-full pl-11 pr-4 py-3 bg-white border rounded-xl focus:ring-[#FF2D20]/20 font-medium" placeholder="e.g. 08123456789" />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1 font-medium italic">This number will be used for the direct WhatsApp chat button on your profile.</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Personal Background / Bio</label>
                        <textarea name="pendidikan" value={formData.pendidikan} onChange={handleChange} rows={2} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-[#FF2D20]/20 resize-none" placeholder="History, credentials, etc."></textarea>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Why Hire Me? (Value Prop)</label>
                        <textarea name="alasan_hire" value={formData.alasan_hire} onChange={handleChange} rows={2} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-[#FF2D20]/20 resize-none" placeholder="What makes you the best choice?"></textarea>
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Personal / Business Address</label>
                    <textarea name="alamat" value={formData.alamat} onChange={handleChange} rows={2} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-[#FF2D20]/20 resize-none"></textarea>
                </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4">
                <h3 className="font-bold text-gray-800 border-b border-gray-200 pb-2">Main Gallery Cover</h3>
                <div className="max-w-md">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Profile Cover Image</label>
                    <input type="file" accept="image/*" onChange={(e) => handleFile(e, setFileFoto)} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" />
                    {user?.kontraktor?.foto && !fileFoto && <span className="text-xs text-[#FF2D20] mt-1 block font-medium">✓ Current image saved</span>}
                </div>
            </div>

            <div className="pt-4 flex items-center gap-4">
                <button type="submit" disabled={isLoading} className="flex-1 bg-neutral-900 text-white py-3 rounded-xl font-bold hover:bg-neutral-800 transition-all shadow-lg disabled:opacity-50">
                    {isLoading ? 'Saving...' : 'Save Profile'}
                </button>
                <button type="button" onClick={onCancel} className="flex-1 bg-white border py-3 rounded-xl font-bold hover:bg-gray-50">Cancel</button>
            </div>
        </form>
    );
}
