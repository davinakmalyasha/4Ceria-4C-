import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Calendar, Image as ImageIcon, X } from 'lucide-react';
import { WizardFormData, ProjectDimensions } from '../../hooks/useProjectWizard';
import LocationPickerMap from '../LocationPickerMap';

interface WizardDetailsStepProps {
    form: WizardFormData;
    updateForm: (key: keyof WizardFormData, value: string) => void;
    images: File[];
    setImages: (imgs: File[]) => void;
}

export default function WizardDetailsStep({ form, updateForm, images, setImages }: WizardDetailsStepProps) {
    const handleImg = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        setImages([...images, ...files].slice(0, 3));
        e.target.value = '';
    };

    return (
        <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-5">
            {/* Row 1: Picture Upload (Left) & Location Map (Right) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                {/* Column 1: Picture Upload */}
                <div className="md:col-span-5 space-y-2">
                    <label className="block text-[11px] font-bold text-gray-900 flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><ImageIcon size={12} className="text-[#FF2D20]" /> Foto Proyek (Maks. 3)</span>
                        <span className="text-[9px] text-gray-405 font-bold">{images.length}/3 Terupload</span>
                    </label>
                    {images.length === 0 ? (
                        <div className="relative border border-dashed border-gray-300 rounded-2xl hover:bg-gray-50 transition-colors group flex flex-col items-center justify-center gap-2 cursor-pointer h-[220px] sm:h-[240px] lg:h-[260px]">
                            <input type="file" accept="image/*" multiple onChange={handleImg} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                            <ImageIcon className="h-8 w-8 text-gray-400 group-hover:text-[#FF2D20] transition-colors" />
                            <div className="flex flex-col items-center text-center px-4">
                                <span className="text-[11px] font-bold text-gray-700">Tarik & Lepas atau Klik untuk Upload</span>
                                <span className="text-[9px] text-gray-400 font-medium mt-0.5">Maksimal 3 Foto Proyek (.jpg, .png, .webp)</span>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col justify-between h-[220px] sm:h-[240px] lg:h-[260px]">
                            {images.length < 3 ? (
                                <div className="relative border border-dashed border-gray-300 rounded-2xl hover:bg-gray-50 transition-colors group flex flex-col items-center justify-center gap-1.5 cursor-pointer h-[160px] sm:h-[175px] lg:h-[190px]">
                                    <input type="file" accept="image/*" multiple onChange={handleImg} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                    <ImageIcon className="h-6 w-6 text-gray-400 group-hover:text-[#FF2D20] transition-colors" />
                                    <span className="text-[10px] font-bold text-gray-600">Tambah Foto ({images.length}/3)</span>
                                </div>
                            ) : (
                                <div className="border border-dashed border-gray-200 bg-gray-50/50 rounded-2xl flex flex-col items-center justify-center gap-1.5 h-[160px] sm:h-[175px] lg:h-[190px] text-gray-400">
                                    <ImageIcon className="h-6 w-6 opacity-40" />
                                    <span className="text-[10px] font-bold">Batas Maksimal Upload Tercapai</span>
                                </div>
                            )}
                            
                            <div className="flex gap-2.5 h-[50px] items-center overflow-x-auto pb-1 scrollbar-none">
                                {images.map((img, i) => (
                                    <div key={i} className="relative w-12 h-12 rounded-xl overflow-hidden group border border-gray-200 shadow-sm shrink-0">
                                        <img src={URL.createObjectURL(img)} className="w-full h-full object-cover" />
                                        <button 
                                            type="button" 
                                            onClick={() => setImages(images.filter((_, idx) => idx !== i))} 
                                            className="absolute inset-0 bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X size={14} className="stroke-[3]" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Column 2: Location Map */}
                <div className="md:col-span-7 space-y-2">
                    <label className="block text-[11px] font-bold text-gray-900 flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><MapPin size={12} className="text-[#FF2D20]" /> Lokasi Proyek</span>
                        {form.loc && <span className="text-[9px] text-gray-405 font-bold truncate max-w-[200px] normal-case">{form.loc}</span>}
                    </label>
                    <LocationPickerMap
                        latitude={parseFloat(form.lat)} 
                        longitude={parseFloat(form.lng)}
                        heightClass="h-[220px] sm:h-[240px] lg:h-[260px]"
                        onChange={(lat, lng, address) => {
                            updateForm('lat', lat.toString()); updateForm('lng', lng.toString());
                            if (address?.city || address?.province) {
                                const loc = [address.street_name, address.kecamatan, address.city, address.province].filter(Boolean).join(', ');
                                updateForm('loc', loc); updateForm('province', address.province);
                                updateForm('city', address.city); updateForm('kecamatan', address.kecamatan);
                                updateForm('kelurahan', address.kelurahan); updateForm('postal_code', address.postal_code);
                                updateForm('street_name', address.street_name);
                            }
                        }}
                    />
                </div>
            </div>

            {/* Row 2: Other Inputs (Title, Target Date, project type if maintenance, and Description) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 mt-4">
                {/* Inputs left side */}
                <div className="md:col-span-5 space-y-3.5">
                    <div>
                        <label className="block text-[11px] font-bold text-gray-900 mb-1">Judul Proyek</label>
                        <input 
                            value={form.title} 
                            onChange={e => updateForm('title', e.target.value)} 
                            required 
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-250/70 rounded-xl focus:border-[#FF2D20] focus:ring-2 focus:ring-red-100 outline-none transition-all text-xs font-semibold text-gray-800" 
                            placeholder="Cth: Renovasi Atap Rumah Minimalis" 
                        />
                    </div>

                    <div className={form.project_category === 'maintenance' ? 'grid grid-cols-2 gap-3' : 'w-full pr-0'}>
                        <div className={form.project_category === 'maintenance' ? '' : 'w-1/2 pr-1.5'}>
                            <label className="block text-[11px] font-bold text-gray-900 mb-1 flex items-center gap-1.5">
                                <Calendar size={12} className="text-[#FF2D20]" /> Target Selesai
                            </label>
                            <input 
                                type="date" 
                                value={form.deadline} 
                                onChange={e => updateForm('deadline', e.target.value)} 
                                required 
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-250/70 rounded-xl focus:border-[#FF2D20] focus:ring-2 focus:ring-red-100 outline-none transition-all text-xs font-semibold text-gray-800" 
                            />
                        </div>
                        {form.project_category === 'maintenance' && (
                            <div>
                                <label className="block text-[11px] font-bold text-gray-900 mb-1">Jenis Proyek</label>
                                <select 
                                    value={form.type} 
                                    onChange={e => updateForm('type', e.target.value)} 
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-250/70 rounded-xl outline-none focus:border-[#FF2D20] text-xs font-semibold text-gray-850"
                                >
                                    {['umum', 'fondasi', 'struktur', 'dinding', 'atap', 'lantai', 'ventilasi', 'listrik', 'plumbing'].map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </div>
                        )}
                    </div>
                </div>

                {/* Description right side */}
                <div className="md:col-span-7 flex flex-col">
                    <label className="block text-[11px] font-bold text-gray-900 mb-1">Deskripsi</label>
                    <textarea 
                        value={form.desc} 
                        onChange={e => updateForm('desc', e.target.value)} 
                        required 
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-250/70 rounded-xl focus:border-[#FF2D20] focus:ring-2 focus:ring-red-100 outline-none transition-all resize-none text-xs font-semibold text-gray-800 flex-1 min-h-[110px]" 
                        placeholder="Jelaskan detail proyek Anda..." 
                    />
                </div>
            </div>
        </motion.div>
    );
}
