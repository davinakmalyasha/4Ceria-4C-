import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Plus, X, Phone, UploadCloud, FileText, AlertCircle } from 'lucide-react';

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
    const [phoneNumbers, setPhoneNumbers] = useState<string[]>(user?.phone_number?.map(p => p.contact) || []);
    const [fileNpwp, setFileNpwp] = useState<File | null>(null);
    const [fileSiup, setFileSiup] = useState<File | null>(null);
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
            if (fileNpwp) data.append('npwp', fileNpwp);
            if (fileSiup) data.append('siup', fileSiup);
            if (fileFoto) data.append('foto', fileFoto);

            await axios.post('/me/professional', data, { headers: { 'Content-Type': 'multipart/form-data' } });
            setSuccess(true); 
            await refreshUser();
            setTimeout(() => onCancel(), 1000);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Update failed');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
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

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4">
                <h3 className="font-bold text-gray-800 border-b border-gray-200 pb-2">Documents & Gallery</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Main Portfolio Image</label>
                        <input type="file" accept="image/*" onChange={(e) => handleFile(e, setFileFoto)} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" />
                        {user?.kontraktor?.foto && !fileFoto && <span className="text-xs text-[#FF2D20] mt-1 block font-medium">✓ Current image saved</span>}
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">NPWP Document</label>
                        <input type="file" accept=".pdf,.jpg,.png" onChange={(e) => handleFile(e, setFileNpwp)} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" />
                        {user?.kontraktor?.npwp && !fileNpwp && <span className="text-xs text-[#FF2D20] mt-1 block font-medium">✓ NPWP previously uploaded</span>}
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">SIUP Document</label>
                        <input type="file" accept=".pdf,.jpg,.png" onChange={(e) => handleFile(e, setFileSiup)} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" />
                        {user?.kontraktor?.siup && !fileSiup && <span className="text-xs text-[#FF2D20] mt-1 block font-medium">✓ SIUP previously uploaded</span>}
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
