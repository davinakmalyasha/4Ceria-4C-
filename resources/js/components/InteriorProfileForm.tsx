import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Plus, X, Phone, UploadCloud, FileText, AlertCircle, Building2, Palette } from 'lucide-react';

interface EditProfileFormProps { onCancel: () => void; }

export default function InteriorProfileForm({ onCancel }: EditProfileFormProps) {
    const { user, refreshUser } = useAuth();
    const [formData, setFormData] = useState({
        name: user?.name || '',
        email: user?.email || '',
        username: user?.username || '',
        rate_harga: user?.interior_profile?.rate_harga || '',
        pengalaman_tahun: user?.interior_profile?.pengalaman_tahun || '',
        lokasi: user?.interior_profile?.lokasi || '',
        deskripsi: user?.interior_profile?.deskripsi || '',
        spesialisasi: user?.interior_profile?.spesialisasi || '',
        no_telp: user?.interior_profile?.no_telp || '',
    });
    const [phoneNumbers, setPhoneNumbers] = useState<string[]>(user?.phone_number?.map((p: any) => p.contact) || []);
    const [filePorto, setFilePorto] = useState<File | null>(null);
    const [fileSertif, setFileSertif] = useState<File | null>(null);
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
            Object.entries(formData).forEach(([key, value]) => {
                if (value !== null && value !== undefined) {
                    data.append(key, value.toString());
                }
            });
            data.append('phone_numbers', JSON.stringify(phoneNumbers.filter(p => p.trim() !== '')));
            if (filePorto) data.append('file_portofolio', filePorto);
            if (fileSertif) data.append('file_sertifikat', fileSertif);
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
            {error && <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-sm border border-red-100 flex items-center gap-3">
                <AlertCircle size={18} /> {error}
            </div>}
            {success && <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl text-sm border border-emerald-100 flex items-center gap-3">
                <AlertCircle size={18} /> Studio profile updated successfully!
            </div>}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Studio / Company Name</label>
                    <div className="relative group">
                        <Building2 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-red-600 transition-colors" />
                        <input type="text" name="name" value={formData.name} onChange={handleChange} required className="w-full pl-12 pr-4 py-3.5 bg-white border border-zinc-100 rounded-2xl focus:ring-4 focus:ring-red-600/5 focus:border-red-600/50 outline-none transition-all font-bold text-zinc-900" placeholder="e.g. Minimalist Design Studio" />
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Username</label>
                    <input type="text" name="username" value={formData.username} onChange={handleChange} required className="w-full px-4 py-3.5 bg-white border border-zinc-100 rounded-2xl focus:ring-4 focus:ring-red-600/5 focus:border-red-600/50 outline-none transition-all font-bold text-zinc-900" />
                </div>
                <div className="md:col-span-2 space-y-2">
                    <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Business Email</label>
                    <input type="email" name="email" value={formData.email} onChange={handleChange} required className="w-full px-4 py-3.5 bg-white border border-zinc-100 rounded-2xl focus:ring-4 focus:ring-red-600/5 focus:border-red-600/50 outline-none transition-all font-bold text-zinc-900" />
                </div>
            </div>

            <div className="bg-zinc-50 p-6 rounded-[2rem] border border-zinc-100 space-y-6">
                <h3 className="font-black text-zinc-900 flex items-center gap-3 text-xs uppercase tracking-[0.2em]">
                    <Palette size={16} className="text-red-600" /> Studio Identity
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Hourly Design Rate (IDR)</label>
                        <input type="number" name="rate_harga" value={formData.rate_harga} onChange={handleChange} className="w-full px-4 py-3.5 bg-white border border-zinc-100 rounded-2xl focus:ring-4 focus:ring-red-600/5 focus:border-red-600/50 outline-none transition-all font-bold text-zinc-900" placeholder="e.g. 500000" />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Years Established</label>
                        <input type="number" name="pengalaman_tahun" value={formData.pengalaman_tahun} onChange={handleChange} className="w-full px-4 py-3.5 bg-white border border-zinc-100 rounded-2xl focus:ring-4 focus:ring-red-600/5 focus:border-red-600/50 outline-none transition-all font-bold text-zinc-900" placeholder="e.g. 10" />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Studio Location</label>
                        <input type="text" name="lokasi" value={formData.lokasi} onChange={handleChange} className="w-full px-4 py-3.5 bg-white border border-zinc-100 rounded-2xl focus:ring-4 focus:ring-red-600/5 focus:border-red-600/50 outline-none transition-all font-bold text-zinc-900" placeholder="Jakarta, Indonesia" />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Design Style / Specialization</label>
                        <input type="text" name="spesialisasi" value={formData.spesialisasi} onChange={handleChange} className="w-full px-4 py-3.5 bg-white border border-zinc-100 rounded-2xl focus:ring-4 focus:ring-red-600/5 focus:border-red-600/50 outline-none transition-all font-bold text-zinc-900" placeholder="Luxury, Minimalist, Japandi..." />
                    </div>
                    <div className="md:col-span-2 space-y-2">
                        <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Direct WhatsApp Number</label>
                        <div className="relative group">
                            <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-red-600 transition-colors" />
                            <input type="tel" name="no_telp" value={formData.no_telp} onChange={handleChange} className="w-full pl-12 pr-4 py-3.5 bg-white border border-zinc-100 rounded-2xl focus:ring-4 focus:ring-red-600/5 focus:border-red-600/50 outline-none transition-all font-bold text-zinc-900" placeholder="e.g. 08123456789" />
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Design Philosophy / Company Bio</label>
                    <textarea name="deskripsi" value={formData.deskripsi} onChange={handleChange} rows={4} className="w-full px-4 py-3.5 bg-white border border-zinc-100 rounded-3xl focus:ring-4 focus:ring-red-600/5 focus:border-red-600/50 outline-none transition-all font-medium text-zinc-600 resize-none" placeholder="Describe your studio's approach to creating beautiful spaces..."></textarea>
                </div>
            </div>

            <div className="bg-white p-6 rounded-[2rem] border border-zinc-100 space-y-6">
                <h3 className="font-black text-zinc-900 flex items-center gap-3 text-xs uppercase tracking-[0.2em]">
                    <UploadCloud size={16} className="text-red-600" /> Studio Portfolio & Assets
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-3">
                        <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Main Studio Image</label>
                        <div className="relative group cursor-pointer">
                            <input type="file" accept="image/*" onChange={(e) => handleFile(e, setFileFoto)} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                            <div className="w-full h-32 bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-2xl flex flex-col items-center justify-center gap-2 group-hover:border-red-500/50 group-hover:bg-red-50/30 transition-all">
                                <UploadCloud size={24} className="text-zinc-400 group-hover:text-red-500" />
                                <span className="text-[10px] font-bold text-zinc-400 group-hover:text-red-600">Click to Upload</span>
                            </div>
                        </div>
                        {user?.interior_profile?.foto && !fileFoto && <p className="text-[10px] text-emerald-600 font-black uppercase flex items-center gap-1"><X size={10} /> Current cover saved</p>}
                        {fileFoto && <p className="text-[10px] text-red-600 font-black uppercase truncate">{fileFoto.name}</p>}
                    </div>

                    <div className="space-y-3">
                        <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Full Portfolio PDF</label>
                        <div className="relative group cursor-pointer">
                            <input type="file" accept=".pdf" onChange={(e) => handleFile(e, setFilePorto)} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                            <div className="w-full h-32 bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-2xl flex flex-col items-center justify-center gap-2 group-hover:border-red-500/50 group-hover:bg-red-50/30 transition-all">
                                <FileText size={24} className="text-zinc-400 group-hover:text-red-500" />
                                <span className="text-[10px] font-bold text-zinc-400 group-hover:text-red-600">Select PDF File</span>
                            </div>
                        </div>
                        {user?.interior_profile?.file_portofolio && !filePorto && <p className="text-[10px] text-emerald-600 font-black uppercase">✓ Portfolio saved</p>}
                        {filePorto && <p className="text-[10px] text-red-600 font-black uppercase truncate">{filePorto.name}</p>}
                    </div>

                    <div className="space-y-3">
                        <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Business Certification</label>
                        <div className="relative group cursor-pointer">
                            <input type="file" accept=".pdf,.jpg,.png" onChange={(e) => handleFile(e, setFileSertif)} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                            <div className="w-full h-32 bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-2xl flex flex-col items-center justify-center gap-2 group-hover:border-red-500/50 group-hover:bg-red-50/30 transition-all">
                                <UploadCloud size={24} className="text-zinc-400 group-hover:text-red-500" />
                                <span className="text-[10px] font-bold text-zinc-400 group-hover:text-red-600">Company License</span>
                            </div>
                        </div>
                        {user?.interior_profile?.file_sertifikat && !fileSertif && <p className="text-[10px] text-emerald-600 font-black uppercase">✓ File saved</p>}
                        {fileSertif && <p className="text-[10px] text-red-600 font-black uppercase truncate">{fileSertif.name}</p>}
                    </div>
                </div>
            </div>

            <div className="pt-6 flex items-center gap-4">
                <button type="submit" disabled={isLoading} className="flex-1 bg-zinc-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-600 transition-all shadow-xl shadow-zinc-200 hover:shadow-red-600/20 disabled:opacity-50 active:scale-[0.98]">
                    {isLoading ? 'Processing Studio Sync...' : 'Save Studio Profile'}
                </button>
                <button type="button" onClick={onCancel} className="flex-1 bg-white border border-zinc-100 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-zinc-50 transition-all text-zinc-400">Cancel</button>
            </div>
        </form>
    );
}
