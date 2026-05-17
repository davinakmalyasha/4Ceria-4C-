import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Save, User, Shield, Briefcase, MapPin, Phone, Mail, Award, FileText, Camera, Scale, Gavel, Plus, Trash2 } from 'lucide-react';
import { PortfolioManager } from '../Dashboard/PortfolioManager';

export default function NotarisProfileForm({ onCancel }: { onCancel: () => void }) {
    const { user, refreshUser } = useAuth();
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    
    const [formData, setFormData] = useState({
        name: user?.name || '',
        email: user?.email || '',
        username: user?.username || '',
        phone_numbers: user?.phone_number?.map((p: any) => p.contact) || [''],
        nama: user?.notaris_profile?.nama || '',
        nomor_sk: user?.notaris_profile?.nomor_sk || '',
        wilayah_kerja: user?.notaris_profile?.wilayah_kerja || '',
        spesialisasi: user?.notaris_profile?.spesialisasi || '',
        lokasi: user?.notaris_profile?.lokasi || '',
        deskripsi: user?.notaris_profile?.deskripsi || '',
        pengalaman_tahun: user?.notaris_profile?.pengalaman_tahun || '',
        rate_harga: user?.notaris_profile?.rate_harga || '',
    });

    const [services, setServices] = useState<any[]>(user?.notaris_profile?.services || []);

    const handleServiceChange = (index: number, field: string, value: any) => {
        const newServices = [...services];
        newServices[index] = { ...newServices[index], [field]: value };
        setServices(newServices);
    };

    const addService = () => setServices([...services, { title: '', price: 0, description: '' }]);
    const removeService = (index: number) => setServices(services.filter((_, i) => i !== index));

    const [files, setFiles] = useState<{ [key: string]: File | null }>({
        foto: null,
        file_sertifikat: null,
    });

    const handlePhoneChange = (index: number, value: string) => {
        const newPhones = [...formData.phone_numbers];
        newPhones[index] = value;
        setFormData({ ...formData, phone_numbers: newPhones });
    };

    const addPhone = () => setFormData({ ...formData, phone_numbers: [...formData.phone_numbers, ''] });
    const removePhone = (index: number) => setFormData({ ...formData, phone_numbers: formData.phone_numbers.filter((_, i) => i !== index) });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        const data = new FormData();
        Object.keys(formData).forEach(key => {
            if (key === 'phone_numbers') {
                data.append(key, JSON.stringify(formData[key]));
            } else {
                data.append(key, (formData as any)[key]);
            }
        });

        // Add services
        data.append('services', JSON.stringify(services));

        if (files.foto) data.append('foto', files.foto);
        if (files.file_sertifikat) data.append('file_sertifikat', files.file_sertifikat);

        try {
            await axios.post('/me/professional', data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setMessage('Profile updated successfully!');
            if (refreshUser) await refreshUser();
            setTimeout(() => onCancel(), 1500);
        } catch (err: any) {
            console.error(err);
            const errorData = err.response?.data;
            if (errorData?.errors) {
                const firstError = Object.values(errorData.errors)[0] as string[];
                setMessage(`Error: ${firstError[0]}`);
            } else {
                setMessage(errorData?.message || 'Failed to update profile. Please check your input.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
            {/* Header Section */}
            <div className="bg-gradient-to-br from-blue-900 to-black p-10 rounded-[40px] text-white relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
                <div className="relative z-10">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20">
                            <Scale className="text-blue-400" size={32} />
                        </div>
                        <h2 className="text-4xl font-black tracking-tight">Legal Firm Profile</h2>
                    </div>
                    <p className="text-blue-100/60 max-w-xl text-lg font-medium leading-relaxed">
                        Establish your practice as a verified legal professional and secure transactions for our users.
                    </p>
                </div>
            </div>

            {message && (
                <div className={`p-5 rounded-3xl font-black text-sm uppercase tracking-widest text-center shadow-lg animate-bounce ${message.includes('success') ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                    {message}
                </div>
            )}

            {/* Account Identity Section */}
            <div className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm space-y-8">
                <h3 className="text-xl font-black text-gray-900 flex items-center gap-3">
                    <span className="w-1.5 h-6 bg-blue-600 rounded-full"></span> Account Identity
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="group">
                        <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">Full Name</label>
                        <div className="relative">
                            <User size={20} className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input 
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                required
                                className="w-full pl-14 pr-6 py-4 bg-gray-50 border-gray-100 border-2 rounded-2xl focus:border-blue-600 focus:bg-white outline-none transition-all font-bold text-gray-900"
                            />
                        </div>
                    </div>
                    <div className="group">
                        <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">Username</label>
                        <input 
                            type="text"
                            value={formData.username}
                            onChange={e => setFormData({ ...formData, username: e.target.value })}
                            required
                            className="w-full px-6 py-4 bg-gray-50 border-gray-100 border-2 rounded-2xl focus:border-blue-600 focus:bg-white outline-none transition-all font-bold text-gray-900"
                        />
                    </div>
                    <div className="md:col-span-2 group">
                        <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">Business Email Address</label>
                        <div className="relative">
                            <Mail size={20} className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input 
                                type="email"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                required
                                className="w-full pl-14 pr-6 py-4 bg-gray-50 border-gray-100 border-2 rounded-2xl focus:border-blue-600 focus:bg-white outline-none transition-all font-bold text-gray-900"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Contact Channels */}
            <div className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm space-y-8">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black text-gray-900 flex items-center gap-3">
                        <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span> Contact Channels
                    </h3>
                    <button 
                        type="button" 
                        onClick={addPhone}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all"
                    >
                        <Plus size={14} /> Add Phone
                    </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {formData.phone_numbers.map((phone, index) => (
                        <div key={index} className="relative group">
                            <Phone size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-emerald-500 transition-colors" />
                            <input 
                                type="tel"
                                value={phone}
                                onChange={e => handlePhoneChange(index, e.target.value)}
                                className="w-full pl-14 pr-12 py-4 bg-gray-50 border-gray-100 border-2 rounded-2xl focus:border-emerald-500 focus:bg-white outline-none transition-all font-bold text-gray-900"
                                placeholder="WhatsApp / Phone Number"
                            />
                            {formData.phone_numbers.length > 1 && (
                                <button 
                                    type="button"
                                    onClick={() => removePhone(index)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-red-500 transition-colors"
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {/* Office Info */}
                <div className="space-y-8 bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm">
                    <h3 className="text-xl font-black text-gray-900 flex items-center gap-3">
                        <span className="w-1.5 h-6 bg-blue-900 rounded-full"></span> Office Identity
                    </h3>
                    
                    <div className="space-y-6">
                        <div className="group">
                            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">Office / Firm Name</label>
                            <input 
                                type="text"
                                value={formData.nama}
                                onChange={e => setFormData({ ...formData, nama: e.target.value })}
                                className="w-full px-6 py-4 bg-gray-50 border-gray-100 border-2 rounded-2xl focus:border-blue-900 focus:bg-white outline-none transition-all font-bold text-gray-900"
                                placeholder="Notaris & PPAT ..."
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="group">
                                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">SK Number</label>
                                <input 
                                    type="text"
                                    value={formData.nomor_sk}
                                    onChange={e => setFormData({ ...formData, nomor_sk: e.target.value })}
                                    className="w-full px-6 py-4 bg-gray-50 border-gray-100 border-2 rounded-2xl focus:border-blue-900 focus:bg-white outline-none transition-all font-bold text-gray-900"
                                    placeholder="SK/2024/..."
                                />
                            </div>
                            <div className="group">
                                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">Work Area (Region)</label>
                                <input 
                                    type="text"
                                    value={formData.wilayah_kerja}
                                    onChange={e => setFormData({ ...formData, wilayah_kerja: e.target.value })}
                                    className="w-full px-6 py-4 bg-gray-50 border-gray-100 border-2 rounded-2xl focus:border-blue-900 focus:bg-white outline-none transition-all font-bold text-gray-900"
                                    placeholder="Jakarta Selatan"
                                />
                            </div>
                        </div>

                        <div className="group">
                            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">Office Location (Full Address)</label>
                            <div className="relative">
                                <MapPin size={20} className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input 
                                    type="text"
                                    value={formData.lokasi}
                                    onChange={e => setFormData({ ...formData, lokasi: e.target.value })}
                                    className="w-full pl-14 pr-6 py-4 bg-gray-50 border-gray-100 border-2 rounded-2xl focus:border-blue-900 focus:bg-white outline-none transition-all font-bold text-gray-900"
                                    placeholder="Jl. Thamrin No. 10..."
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Professional Details */}
                <div className="space-y-8 bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm">
                    <h3 className="text-xl font-black text-gray-900 flex items-center gap-3">
                        <span className="w-1.5 h-6 bg-blue-900 rounded-full"></span> Expertise & Rates
                    </h3>

                    <div className="space-y-6">
                        <div className="group">
                            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">Legal Specialization</label>
                            <input 
                                type="text"
                                value={formData.spesialisasi}
                                onChange={e => setFormData({ ...formData, spesialisasi: e.target.value })}
                                className="w-full px-6 py-4 bg-gray-50 border-gray-100 border-2 rounded-2xl focus:border-blue-900 focus:bg-white outline-none transition-all font-bold text-gray-900"
                                placeholder="Real Estate, Corporate Law, etc."
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="group">
                                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">Years Active</label>
                                <input 
                                    type="number"
                                    value={formData.pengalaman_tahun}
                                    onChange={e => setFormData({ ...formData, pengalaman_tahun: e.target.value })}
                                    className="w-full px-6 py-4 bg-gray-50 border-gray-100 border-2 rounded-2xl focus:border-blue-900 focus:bg-white outline-none transition-all font-bold text-gray-900"
                                />
                            </div>
                            <div className="group">
                                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">Consultation Fee (IDR)</label>
                                <input 
                                    type="number"
                                    value={formData.rate_harga}
                                    onChange={e => setFormData({ ...formData, rate_harga: e.target.value })}
                                    className="w-full px-6 py-4 bg-gray-50 border-gray-100 border-2 rounded-2xl focus:border-blue-900 focus:bg-white outline-none transition-all font-bold text-gray-900"
                                />
                            </div>
                        </div>

                        <div className="group">
                            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">Professional Statement</label>
                            <textarea 
                                value={formData.deskripsi}
                                onChange={e => setFormData({ ...formData, deskripsi: e.target.value })}
                                rows={4}
                                className="w-full px-6 py-4 bg-gray-50 border-gray-100 border-2 rounded-2xl focus:border-blue-900 focus:bg-white outline-none transition-all font-bold text-gray-900 resize-none"
                                placeholder="Describe your legal practice and ethics..."
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Service Catalog Section */}
            <div className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm space-y-8">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black text-gray-900 flex items-center gap-3">
                        <span className="w-1.5 h-6 bg-blue-900 rounded-full"></span> Service Catalog
                    </h3>
                    <button 
                        type="button" 
                        onClick={addService}
                        className="flex items-center gap-2 px-6 py-3 bg-blue-50 text-blue-900 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-900 hover:text-white transition-all transform hover:scale-105"
                    >
                        <Plus size={14} /> Add Service
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-6">
                    {services.map((service, index) => (
                        <motion.div 
                            key={index} 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-8 bg-gray-50 rounded-3xl border border-gray-100 relative group"
                        >
                            <button 
                                type="button" 
                                onClick={() => removeService(index)}
                                className="absolute top-6 right-6 p-2 text-red-300 hover:text-red-600 transition-colors"
                            >
                                <Trash2 size={18} />
                            </button>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">Service Title</label>
                                    <input 
                                        type="text"
                                        value={service.title}
                                        onChange={e => handleServiceChange(index, 'title', e.target.value)}
                                        className="w-full px-6 py-4 bg-white border-gray-200 border-2 rounded-2xl focus:border-blue-900 outline-none transition-all font-bold text-gray-900"
                                        placeholder="e.g. Property Transfer Authentication"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">Fixed Price (IDR)</label>
                                    <input 
                                        type="number"
                                        value={service.price}
                                        onChange={e => handleServiceChange(index, 'price', e.target.value)}
                                        className="w-full px-6 py-4 bg-white border-gray-200 border-2 rounded-2xl focus:border-blue-900 outline-none transition-all font-bold text-gray-900"
                                    />
                                </div>
                                <div className="md:col-span-3">
                                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">Description</label>
                                    <textarea 
                                        value={service.description}
                                        onChange={e => handleServiceChange(index, 'description', e.target.value)}
                                        rows={2}
                                        className="w-full px-6 py-4 bg-white border-gray-200 border-2 rounded-2xl focus:border-blue-900 outline-none transition-all font-bold text-gray-900 resize-none"
                                        placeholder="Briefly explain what's included in this service..."
                                    />
                                </div>
                            </div>
                        </motion.div>
                    ))}

                    {services.length === 0 && (
                        <div className="py-12 text-center bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                            <Briefcase className="mx-auto text-gray-300 mb-4" size={48} />
                            <p className="text-gray-400 font-bold">No services listed yet. Add your first legal bundle.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Verification Assets */}
            <div className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm space-y-8">
                <h3 className="text-xl font-black text-gray-900 flex items-center gap-3">
                    <span className="w-1.5 h-6 bg-blue-900 rounded-full"></span> Verification & Identity
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="group bg-gray-50 p-8 rounded-3xl border-2 border-dashed border-gray-200 hover:border-blue-900/30 transition-all cursor-pointer relative overflow-hidden">
                        <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-6">Office Photo / Logo</label>
                        <div className="flex flex-col items-center justify-center py-6">
                            <Camera className="text-gray-300 mb-4" size={48} />
                            <p className="text-xs font-black text-blue-900 uppercase tracking-widest">Click to upload professional headshot</p>
                        </div>
                        <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => setFiles({ ...files, foto: e.target.files?.[0] || null })} />
                        {files.foto && <p className="mt-4 text-xs font-bold text-blue-900 text-center">Selected: {files.foto.name}</p>}
                    </div>

                    <div className="group bg-gray-50 p-8 rounded-3xl border-2 border-dashed border-gray-200 hover:border-blue-900/30 transition-all cursor-pointer relative overflow-hidden">
                        <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-6">SK Document / Certificate</label>
                        <div className="flex flex-col items-center justify-center py-6">
                            <FileText className="text-gray-300 mb-4" size={48} />
                            <p className="text-xs font-black text-blue-900 uppercase tracking-widest">Click to upload official document (PDF/JPG)</p>
                        </div>
                        <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => setFiles({ ...files, file_sertifikat: e.target.files?.[0] || null })} />
                        {files.file_sertifikat && <p className="mt-4 text-xs font-bold text-blue-900 text-center">Selected: {files.file_sertifikat.name}</p>}
                    </div>
                </div>
            </div>

            {/* Interactive Portfolio Management inside Edit Mode */}
            <PortfolioManager isEmbedded={true} />

            <div className="flex items-center justify-between pt-10 border-t border-gray-100">
                <button type="button" onClick={onCancel} className="px-10 py-5 text-zinc-400 hover:text-zinc-600 font-black uppercase tracking-widest text-xs transition-colors">
                    Discard Changes
                </button>
                <button 
                    disabled={loading}
                    className="group bg-blue-900 hover:bg-black text-white px-12 py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-xs transition-all shadow-xl hover:shadow-blue-900/20 active:scale-95 disabled:opacity-50 flex items-center gap-3"
                >
                    {loading ? 'Processing...' : (
                        <>
                            <Save size={18} /> Publish Legal Firm Profile
                        </>
                    )}
                </button>
            </div>
        </form>
    );
}
