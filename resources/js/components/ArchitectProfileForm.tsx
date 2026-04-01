import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Plus, X, Phone, UploadCloud, FileText } from 'lucide-react';

interface EditProfileFormProps { onCancel: () => void; }

export default function ArchitectProfileForm({ onCancel }: EditProfileFormProps) {
    const { user } = useAuth();
    const [formData, setFormData] = useState({
        name: user?.name || '',
        email: user?.email || '',
        username: user?.username || '',
        rate_harga: user?.arsitek?.rate_harga || '',
        pengalaman_tahun: user?.arsitek?.pengalaman_tahun || '',
        lokasi: user?.arsitek?.lokasi || '',
        deskripsi: user?.arsitek?.deskripsi || '',
        spesialisasi: user?.arsitek?.spesialisasi || '',
        pendidikan: user?.arsitek?.pendidikan || '',
        alasan_hire: user?.arsitek?.alasan_hire || '',
    });
    const [phoneNumbers, setPhoneNumbers] = useState<string[]>(user?.phone_number?.map(p => p.contact) || []);
    const [filePorto, setFilePorto] = useState<File | null>(null);
    const [fileSertif, setFileSertif] = useState<File | null>(null);
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
            if (filePorto) data.append('file_portofolio', filePorto);
            if (fileSertif) data.append('file_sertifikat', fileSertif);

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
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Full Name</label>
                    <input type="text" name="name" value={formData.name} onChange={handleChange} required className="w-full px-4 py-3 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] outline-none" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Username</label>
                    <input type="text" name="username" value={formData.username} onChange={handleChange} required className="w-full px-4 py-3 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-[#FF2D20]/20 transition-all font-medium" />
                </div>
                <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Email</label>
                    <input type="email" name="email" value={formData.email} onChange={handleChange} required className="w-full px-4 py-3 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-[#FF2D20]/20 transition-all font-medium" />
                </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4">
                <h3 className="font-bold text-gray-800 border-b pb-2">Professional Identity</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Hourly Rate (IDR)</label>
                        <input type="number" name="rate_harga" value={formData.rate_harga} onChange={handleChange} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-[#FF2D20]/20" placeholder="e.g. 150000" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Years of Experience</label>
                        <input type="number" name="pengalaman_tahun" value={formData.pengalaman_tahun} onChange={handleChange} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-[#FF2D20]/20" placeholder="e.g. 5" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Location/City</label>
                        <input type="text" name="lokasi" value={formData.lokasi} onChange={handleChange} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-[#FF2D20]/20" placeholder="Jakarta" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Specialization</label>
                        <input type="text" name="spesialisasi" value={formData.spesialisasi} onChange={handleChange} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-[#FF2D20]/20" placeholder="Minimalist, Modern, etc." />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Company / Bio Description</label>
                    <textarea name="deskripsi" value={formData.deskripsi} onChange={handleChange} rows={2} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-[#FF2D20]/20 resize-none" placeholder="Give an overview of your architectural path..."></textarea>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Study / Education Experience</label>
                        <textarea name="pendidikan" value={formData.pendidikan} onChange={handleChange} rows={3} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-[#FF2D20]/20 resize-none" placeholder="University, Degrees, Certifications..."></textarea>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Why Hire Me (Pitch)</label>
                        <textarea name="alasan_hire" value={formData.alasan_hire} onChange={handleChange} rows={3} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-[#FF2D20]/20 resize-none" placeholder="What makes you the best architect for the job?"></textarea>
                    </div>
                </div>
            </div>

            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-4">
                <h3 className="font-bold text-blue-900 border-b border-blue-100 pb-2">Documents (PDF/JPG)</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-blue-700 uppercase mb-2">Portfolio Upload</label>
                        <input type="file" onChange={(e) => handleFile(e, setFilePorto)} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                        {user?.arsitek?.file_portofolio && !filePorto && <span className="text-xs text-blue-500 mt-1 block">✓ Current file saved</span>}
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-blue-700 uppercase mb-2">Certificate</label>
                        <input type="file" onChange={(e) => handleFile(e, setFileSertif)} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                        {user?.arsitek?.file_sertifikat && !fileSertif && <span className="text-xs text-blue-500 mt-1 block">✓ Current file saved</span>}
                    </div>
                </div>
            </div>

            <div className="pt-4 flex items-center gap-4">
                <button type="submit" disabled={isLoading} className="flex-1 bg-[#FF2D20] text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg disabled:opacity-50">
                    {isLoading ? 'Saving...' : 'Save Profile'}
                </button>
                <button type="button" onClick={onCancel} className="flex-1 bg-white border py-3 rounded-xl font-bold hover:bg-gray-50">Cancel</button>
            </div>
        </form>
    );
}
