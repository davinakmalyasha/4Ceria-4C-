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
        <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                
                {/* Column 1: Info & Media */}
                <div className="space-y-3.5">
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

                    <div>
                        <label className="block text-[11px] font-bold text-gray-900 mb-1">Deskripsi</label>
                        <textarea 
                            value={form.desc} 
                            onChange={e => updateForm('desc', e.target.value)} 
                            required 
                            rows={2} 
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-250/70 rounded-xl focus:border-[#FF2D20] focus:ring-2 focus:ring-red-100 outline-none transition-all resize-none text-xs font-semibold text-gray-800 h-[64px]" 
                            placeholder="Jelaskan detail proyek Anda..." 
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
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
                        {form.project_category === 'maintenance' ? (
                            <div>
                                <label className="block text-[11px] font-bold text-gray-900 mb-1">Jenis Proyek</label>
                                <select 
                                    value={form.type} 
                                    onChange={e => updateForm('type', e.target.value)} 
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-255/70 rounded-xl outline-none focus:border-[#FF2D20] text-xs font-semibold text-gray-800"
                                >
                                    {['umum', 'fondasi', 'struktur', 'dinding', 'atap', 'lantai', 'ventilasi', 'listrik', 'plumbing'].map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </div>
                        ) : (
                            <div className="flex flex-col justify-end">
                                {/* Space-saving inline image dropzone */}
                                <div className="relative border border-dashed border-gray-300 rounded-xl py-2 px-3 text-center hover:bg-gray-50 transition-colors group flex items-center justify-center gap-2 cursor-pointer h-[34px]">
                                    <input type="file" accept="image/*" multiple onChange={handleImg} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                    <ImageIcon className="h-4 w-4 text-gray-400 group-hover:text-[#FF2D20] transition-colors" />
                                    <span className="text-[10px] font-bold text-gray-600">Upload (Maks. 3)</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Previews & dropzone fallback if maintenance */}
                    {form.project_category === 'maintenance' && (
                        <div className="relative border border-dashed border-gray-300 rounded-xl py-2 px-3 text-center hover:bg-gray-50 transition-colors group flex items-center justify-center gap-2 cursor-pointer h-[34px]">
                            <input type="file" accept="image/*" multiple onChange={handleImg} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                            <ImageIcon className="h-4 w-4 text-gray-400 group-hover:text-[#FF2D20] transition-colors" />
                            <span className="text-[10px] font-bold text-gray-600">Upload Foto (Maks. 3)</span>
                        </div>
                    )}

                    {images.length > 0 && (
                        <div className="flex gap-2 mt-1 shrink-0">
                            {images.map((img, i) => (
                                <div key={i} className="relative w-11 h-11 rounded-lg overflow-hidden group border border-gray-150">
                                    <img src={URL.createObjectURL(img)} className="w-full h-full object-cover" />
                                    <button 
                                        type="button" 
                                        onClick={() => setImages(images.filter((_, idx) => idx !== i))} 
                                        className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Column 2: Location Map */}
                <div className="space-y-2">
                    <label className="block text-[11px] font-bold text-gray-900 flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><MapPin size={12} className="text-[#FF2D20]" /> Lokasi Proyek</span>
                        {form.loc && <span className="text-[9px] text-gray-450 font-bold truncate max-w-[200px] normal-case">{form.loc}</span>}
                    </label>
                    <LocationPickerMap
                        latitude={parseFloat(form.lat)} 
                        longitude={parseFloat(form.lng)}
                        heightClass="h-[185px] sm:h-[195px] lg:h-[200px]"
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
        </motion.div>
    );
}
