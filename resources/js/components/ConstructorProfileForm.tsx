import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Plus, X, Phone, UploadCloud, FileText } from 'lucide-react';

interface EditProfileFormProps { onCancel: () => void; }

export default function ConstructorProfileForm({ onCancel }: EditProfileFormProps) {
    const { user } = useAuth();
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
    });
    const [phoneNumbers, setPhoneNumbers] = useState<string[]>(user?.phone_number?.map(p => p.contact) || []);
    const [fileNpwp, setFileNpwp] = useState<File | null>(null);
    const [fileSiup, setFileSiup] = useState<File | null>(null);
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
            if (fileNpwp) data.append('npwp', fileNpwp);
            if (fileSiup) data.append('siup', fileSiup);

            await axios.post('/me/professional', data, { headers: { 'Content-Type': 'multipart/form-data' } });
            setSuccess(true); setTimeout(() => window.location.reload(), 1000);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Update failed');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {error && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">{error}</div>}
            {success && <div className="p-3 bg-green-50 text-green-600 rounded-xl text-sm border border-green-100">Profile updated! Refreshing...</div>}
            
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Director / Name</label>
                    <input type="text" name="name" value={formData.name} onChange={handleChange} required className="w-full px-4 py-3 bg-gray-50 border rounded-xl focus:ring-[#FF2D20]/20" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Username</label>
                    <input type="text" name="username" value={formData.username} onChange={handleChange} required className="w-full px-4 py-3 bg-gray-50 border rounded-xl focus:ring-[#FF2D20]/20" />
                </div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4">
                <h3 className="font-bold text-gray-800 border-b pb-2">Company Information</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Company Name</label>
                        <input type="text" name="nama_perusahaan" value={formData.nama_perusahaan} onChange={handleChange} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-[#FF2D20]/20" placeholder="PT. Pembangunan Jaya" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Company Type (Jenis)</label>
                        <input type="text" name="jenis" value={formData.jenis} onChange={handleChange} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-[#FF2D20]/20" placeholder="e.g. SIPIL" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Experience (Years)</label>
                        <input type="text" name="pengalaman" value={formData.pengalaman} onChange={handleChange} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-[#FF2D20]/20" placeholder="e.g. 10" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Est. Rate (Rate Harga)</label>
                        <input type="number" name="rate_harga" value={formData.rate_harga} onChange={handleChange} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-[#FF2D20]/20" placeholder="150000" />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Company Background</label>
                        <textarea name="pendidikan" value={formData.pendidikan} onChange={handleChange} rows={2} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-[#FF2D20]/20 resize-none" placeholder="Company history, team credentials, etc."></textarea>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Why Hire Us? (Value Prop)</label>
                        <textarea name="alasan_hire" value={formData.alasan_hire} onChange={handleChange} rows={2} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-[#FF2D20]/20 resize-none" placeholder="What makes your company the best choice?"></textarea>
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Company Address</label>
                    <textarea name="alamat" value={formData.alamat} onChange={handleChange} rows={2} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-[#FF2D20]/20 resize-none"></textarea>
                </div>
            </div>

            <div className="bg-orange-50/50 p-4 rounded-xl border border-orange-100 space-y-4">
                <h3 className="font-bold text-orange-900 border-b border-orange-100 pb-2">Legal Documents (JPG/PDF)</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-orange-700 uppercase mb-2">NPWP Document</label>
                        <input type="file" onChange={(e) => handleFile(e, setFileNpwp)} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100" />
                        {user?.kontraktor?.npwp && !fileNpwp && <span className="text-xs text-orange-500 mt-1 block">✓ NPWP previously uploaded</span>}
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-orange-700 uppercase mb-2">SIUP Document</label>
                        <input type="file" onChange={(e) => handleFile(e, setFileSiup)} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100" />
                        {user?.kontraktor?.siup && !fileSiup && <span className="text-xs text-orange-500 mt-1 block">✓ SIUP previously uploaded</span>}
                    </div>
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
