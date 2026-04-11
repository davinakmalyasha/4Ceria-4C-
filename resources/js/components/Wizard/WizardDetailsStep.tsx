import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Calendar, Image as ImageIcon, X } from 'lucide-react';
import { WizardFormData } from '../../hooks/useProjectWizard';
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
            {/* Images */}
            <div className="relative border-2 border-dashed border-gray-300 rounded-2xl p-5 text-center hover:bg-gray-50 transition-colors group">
                <input type="file" accept="image/*" multiple onChange={handleImg} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                <ImageIcon className="mx-auto h-8 w-8 text-gray-400 group-hover:text-[#FF2D20] transition-colors mb-1" />
                <p className="text-xs font-semibold text-gray-600">Upload foto (Maks. 3)</p>
            </div>
            {images.length > 0 && (
                <div className="flex gap-2">
                    {images.map((img, i) => (
                        <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden group">
                            <img src={URL.createObjectURL(img)} className="w-full h-full object-cover" />
                            <button type="button" onClick={() => setImages(images.filter((_, idx) => idx !== i))} className="absolute top-0.5 right-0.5 bg-black/60 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={10} /></button>
                        </div>
                    ))}
                </div>
            )}

            <div>
                <label className="block text-sm font-bold text-gray-900 mb-1.5">Judul Proyek</label>
                <input value={form.title} onChange={e => updateForm('title', e.target.value)} required className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#FF2D20] focus:ring-4 focus:ring-red-100 outline-none transition-all" placeholder="Cth: Renovasi Atap Rumah Minimalis" />
            </div>

            <div>
                <label className="block text-sm font-bold text-gray-900 mb-1.5">Deskripsi</label>
                <textarea value={form.desc} onChange={e => updateForm('desc', e.target.value)} required rows={3} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#FF2D20] focus:ring-4 focus:ring-red-100 outline-none transition-all resize-none" placeholder="Jelaskan proyek Anda..." />
            </div>

            <div>
                <label className="block text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-2"><MapPin size={14} className="text-[#FF2D20]" /> Lokasi</label>
                <LocationPickerMap
                    latitude={parseFloat(form.lat)} longitude={parseFloat(form.lng)}
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

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-2"><Calendar size={14} className="text-[#FF2D20]" /> Target Selesai</label>
                    <input type="date" value={form.deadline} onChange={e => updateForm('deadline', e.target.value)} required className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#FF2D20] focus:ring-4 focus:ring-red-100 outline-none transition-all" />
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-900 mb-1.5">Jenis Proyek</label>
                    <select value={form.type} onChange={e => updateForm('type', e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-[#FF2D20]">
                        {['umum', 'fondasi', 'struktur', 'dinding', 'atap', 'lantai', 'ventilasi', 'listrik', 'plumbing'].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                </div>
            </div>
        </motion.div>
    );
}
