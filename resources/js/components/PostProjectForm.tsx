import React, { useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, MapPin, Calendar, Briefcase, Coins, CheckCircle, ChevronRight, ChevronLeft, Image as ImageIcon, X } from 'lucide-react';
import LocationPickerMap from './LocationPickerMap';

interface PostProjectFormProps { onCancel: () => void; onSuccess: () => void; }

export default function PostProjectForm({ onCancel, onSuccess }: PostProjectFormProps) {
    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const [f, setF] = useState({ 
        title: '', desc: '', budget: '', loc: '', type: 'umum', target: 'both', deadline: '',
        lat: '-6.200000', lng: '106.816666', province: '', city: '', kecamatan: '', kelurahan: '', postal_code: '', street_name: ''
    });
    const [images, setImages] = useState<File[]>([]);
    const update = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (step < 3) return setStep(step + 1);
        setIsLoading(true); setError('');
        const formData = new FormData();
        formData.append('title', f.title); formData.append('description', f.desc);
        formData.append('budget', f.budget); formData.append('lokasi', f.loc);
        formData.append('jenis_proyek', f.type); formData.append('target_role', f.target);
        formData.append('deadline', f.deadline);
        formData.append('latitude', f.lat); formData.append('longitude', f.lng);
        formData.append('province', f.province); formData.append('city', f.city);
        formData.append('kecamatan', f.kecamatan); formData.append('kelurahan', f.kelurahan);
        formData.append('postal_code', f.postal_code); formData.append('street_name', f.street_name);
        images.forEach((img, i) => formData.append(`images[${i}]`, img));

        try { await axios.post('/projects', formData); onSuccess(); }
        catch (err: any) { setError(err.response?.data?.message || 'Failed to post project'); setIsLoading(false); }
    };

    const handleImg = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        setImages(prev => [...prev, ...files].slice(0, 3));
        e.target.value = '';
    };

    const steps = [
        { id: 1, title: 'Visi Proyek', desc: 'Ceritakan apa yang ingin Anda bangun atau renovasi.' },
        { id: 2, title: 'Logistik', desc: 'Lokasi dan timeline pengerjaan proyek Anda.' },
        { id: 3, title: 'Budget & Pekerja', desc: 'Atur anggaran dan pilih jenis profesional.' }
    ];

    const canAdvance = () => {
        if (step === 1) return f.title.trim() && f.desc.trim();
        if (step === 2) return f.loc.trim() && f.deadline;
        return f.budget.trim();
    };

    return (
        <div className="max-w-2xl mx-auto bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/60 overflow-hidden">
            <div className="bg-gray-900 px-8 py-6 flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-white">Post Proyek Baru</h2>
                    <p className="text-gray-400 text-sm mt-1">{steps[step-1].title} - {steps[step-1].desc}</p>
                </div>
                <div className="flex gap-2">
                    {[1, 2, 3].map(i => (
                        <div key={i} className={`w-3 h-3 rounded-full transition-colors ${step >= i ? 'bg-[#FF2D20]' : 'bg-gray-700'}`} />
                    ))}
                </div>
            </div>

            <form onSubmit={handleSubmit} className="p-8">
                {error && <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm font-semibold border border-red-200">{error}</div>}

                <div className="min-h-[340px]">
                    <AnimatePresence mode="wait">
                        {step === 1 && (
                            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                                <div className="relative border-2 border-dashed border-gray-300 rounded-2xl p-6 text-center hover:bg-gray-50 transition-colors group">
                                    <input type="file" accept="image/*" multiple onChange={handleImg} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                    <ImageIcon className="mx-auto h-10 w-10 text-gray-400 group-hover:text-[#FF2D20] transition-colors mb-2" />
                                    <p className="text-sm font-semibold text-gray-700">Klik untuk unggah foto (Maks. 3)</p>
                                    <p className="text-xs text-gray-500 mt-1">{images.length}/3 gambar dipilih</p>
                                </div>
                                {images.length > 0 && (
                                    <div className="flex gap-3">
                                        {images.map((img, i) => (
                                            <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden group">
                                                <img src={URL.createObjectURL(img)} className="w-full h-full object-cover" />
                                                <button type="button" onClick={() => setImages(images.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 bg-black/60 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={12} /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2">Judul Proyek</label>
                                    <input value={f.title} onChange={update('title')} required className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#FF2D20] focus:ring-4 focus:ring-red-100 outline-none transition-all" placeholder="Cth: Renovasi Atap Rumah Minimalis" />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2">Deskripsi Detail</label>
                                    <textarea value={f.desc} onChange={update('desc')} required rows={4} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#FF2D20] focus:ring-4 focus:ring-red-100 outline-none transition-all resize-none" placeholder="Jelaskan spesifikasi, material, dan ekspektasi Anda..." />
                                </div>
                            </motion.div>
                        )}

                        {step === 2 && (
                            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2 flex items-center gap-2"><MapPin size={16} className="text-[#FF2D20]" /> Lokasi Proyek (Peta)</label>
                                    <LocationPickerMap 
                                        latitude={parseFloat(f.lat)} 
                                        longitude={parseFloat(f.lng)} 
                                        onChange={(lat, lng, address) => {
                                            setF(prev => ({ ...prev, lat: lat.toString(), lng: lng.toString() }));
                                            if (address && (address.city || address.province)) {
                                                const locString = [address.street_name, address.kecamatan, address.city, address.province].filter(Boolean).join(', ');
                                                setF(prev => ({
                                                    ...prev,
                                                    loc: locString,
                                                    province: address.province,
                                                    city: address.city,
                                                    kecamatan: address.kecamatan,
                                                    kelurahan: address.kelurahan,
                                                    postal_code: address.postal_code,
                                                    street_name: address.street_name
                                                }));
                                            }
                                        }} 
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2">Detail Lokasi Singkat</label>
                                    <input value={f.loc} onChange={update('loc')} required className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#FF2D20] focus:ring-4 focus:ring-red-100 outline-none transition-all" placeholder="Provinsi, Kota, Kecamatan..." />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                                        <MapPin size={16} className="text-blue-500" /> Alamat Lengkap / Nama Jalan
                                    </label>
                                    <input 
                                        value={f.street_name} 
                                        onChange={update('street_name')} 
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#FF2D20] focus:ring-4 focus:ring-red-100 outline-none transition-all" 
                                        placeholder="Cth: Jl. Merdeka No. 45, RT 03/RW 02, Kel. Sukamaju" 
                                    />
                                    <p className="text-xs text-gray-400 mt-1.5">Diisi otomatis dari peta, namun Anda bisa mengedit untuk detail yang lebih akurat.</p>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-900 mb-2 flex items-center gap-2"><Calendar size={16} className="text-[#FF2D20]" /> Target Selesai</label>
                                        <input type="date" value={f.deadline} onChange={update('deadline')} required className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#FF2D20] focus:ring-4 focus:ring-red-100 outline-none transition-all" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-900 mb-2 flex items-center gap-2"><Briefcase size={16} className="text-[#FF2D20]" /> Pekerjaan</label>
                                        <select value={f.type} onChange={update('type')} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-[#FF2D20]">
                                            {['umum', 'fondasi', 'struktur', 'dinding', 'atap', 'lantai', 'ventilasi', 'listrik', 'plumbing'].map(opt => <option key={opt} value={opt} className="capitalize">{opt}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 3 && (
                            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2 flex items-center gap-2"><Coins size={16} className="text-[#FF2D20]" /> Anggaran Bersih (Budget Rp)</label>
                                    <input type="number" value={f.budget} onChange={update('budget')} required className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#FF2D20] focus:ring-4 focus:ring-red-100 outline-none transition-all text-xl font-bold text-gray-900" placeholder="Rp 0" />
                                    <p className="text-sm font-semibold text-[#FF2D20] mt-2">Format: {Number(f.budget || 0).toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })}</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2 flex items-center gap-2"><Briefcase size={16} className="text-[#FF2D20]" /> Target Profesional</label>
                                    <select value={f.target} onChange={update('target')} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-[#FF2D20]">
                                        <option value="both">Keduanya (Arsitek & Kontraktor)</option>
                                        <option value="arsitek">Khusus Arsitek (Desain)</option>
                                        <option value="kontraktor">Khusus Kontraktor (Pembangunan)</option>
                                    </select>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="mt-8 flex items-center justify-between border-t border-gray-100 pt-6">
                    {step > 1 ? (
                        <button type="button" onClick={() => setStep(step - 1)} className="px-5 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition-colors flex items-center gap-2"><ChevronLeft size={18} /> Kembali</button>
                    ) : (
                        <button type="button" onClick={onCancel} className="px-5 py-3 rounded-xl font-bold text-gray-500 hover:text-gray-900 transition-colors">Batal</button>
                    )}
                    <button type="submit" disabled={!canAdvance() || isLoading} className="px-8 py-3 rounded-xl font-bold text-white bg-gray-900 hover:bg-[#FF2D20] disabled:bg-gray-200 disabled:text-gray-400 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center gap-2">
                        {isLoading ? 'Memproses...' : step === 3 ? <><CheckCircle size={18} /> Publikasikan</> : <>Lanjut <ChevronRight size={18} /></>}
                    </button>
                </div>
            </form>
        </div>
    );
}
