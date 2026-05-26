import React from 'react';
import { AlertCircle, Phone } from 'lucide-react';

interface Props {
    formData: Record<string, string>;
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    onFile: (e: React.ChangeEvent<HTMLInputElement>, field: string) => void;
    currentPhoto?: string;
    currentPortfolio?: string;
    currentCert?: string;
    hasNewPhoto: boolean;
    hasNewPortfolio: boolean;
    hasNewCert: boolean;
    excludeFiles?: boolean;
}

export const EnterpriseFormFields: React.FC<Props> = ({
    formData, onChange, onFile,
    currentPhoto, currentPortfolio, currentCert,
    hasNewPhoto, hasNewPortfolio, hasNewCert,
    excludeFiles = false,
}) => (
    <>
        {/* Professional Identity */}
        <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 space-y-4">
            <h3 className="font-bold text-gray-800 border-b pb-2 text-sm">Professional Identity</h3>
            <div className="grid grid-cols-2 gap-4">
                <Field label="Hourly Rate (IDR)" name="rate_harga" value={formData.rate_harga} onChange={onChange} type="number" placeholder="e.g. 150000" required />
                <Field label="Years of Experience" name="pengalaman_tahun" value={formData.pengalaman_tahun} onChange={onChange} type="number" placeholder="e.g. 5" />
                <Field label="Location / City" name="lokasi" value={formData.lokasi} onChange={onChange} placeholder="Jakarta" />
                <Field label="Specialization" name="spesialisasi" value={formData.spesialisasi} onChange={onChange} placeholder="Agile, Risk Management..." />
                <div className="col-span-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-2">
                        WhatsApp Number {!formData.no_telp && <AlertCircle size={14} className="text-red-500 animate-pulse" />}
                    </label>
                    <div className="relative">
                        <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="tel" name="no_telp" value={formData.no_telp} onChange={onChange} className="w-full pl-11 pr-4 py-3 bg-white border rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-medium" placeholder="08123456789" />
                    </div>
                </div>
            </div>
        </div>

        {/* About & Pitch */}
        <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 space-y-4">
            <h3 className="font-bold text-gray-800 border-b pb-2 text-sm">About & Pitch</h3>
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Bio / Description</label>
                <textarea name="deskripsi" value={formData.deskripsi} onChange={onChange} rows={3} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-2 focus:ring-red-500/20 resize-none outline-none font-medium" placeholder="Tell clients about your expertise..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Education</label>
                    <textarea name="pendidikan" value={formData.pendidikan} onChange={onChange} rows={2} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-2 focus:ring-red-500/20 resize-none outline-none font-medium" placeholder="Degrees, certifications..." />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Why Hire Me</label>
                    <textarea name="alasan_hire" value={formData.alasan_hire} onChange={onChange} rows={2} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-2 focus:ring-red-500/20 resize-none outline-none font-medium" placeholder="What makes you the best?" />
                </div>
            </div>
        </div>

        {/* Files & Documents */}
        {!excludeFiles && (
            <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 space-y-4">
                <h3 className="font-bold text-gray-800 border-b pb-2 text-sm">Documents & Gallery</h3>
                <div className="grid grid-cols-3 gap-4">
                    <FileField label="Profile Photo" accept="image/*" onChange={(e) => onFile(e, 'foto')} hasExisting={!!currentPhoto} hasNew={hasNewPhoto} />
                    <FileField label="Portfolio PDF" accept=".pdf,.zip,.jpg,.png" onChange={(e) => onFile(e, 'file_portofolio')} hasExisting={!!currentPortfolio} hasNew={hasNewPortfolio} />
                    <FileField label="Certificate" accept=".pdf,.jpg,.png" onChange={(e) => onFile(e, 'file_sertifikat')} hasExisting={!!currentCert} hasNew={hasNewCert} />
                </div>
            </div>
        )}
    </>
);

/* ─── Tiny Subcomponents ──────── */

const Field: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string; placeholder?: string; required?: boolean }> = (
    { label, name, value, onChange, type = 'text', placeholder, required }
) => (
    <div>
        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">{label}</label>
        <input type={type} name={name} value={value} onChange={onChange} required={required} placeholder={placeholder} className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-medium" />
    </div>
);

const FileField: React.FC<{ label: string; accept: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; hasExisting: boolean; hasNew: boolean }> = (
    { label, accept, onChange, hasExisting, hasNew }
) => (
    <div>
        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">{label}</label>
        <input type="file" accept={accept} onChange={onChange} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" />
        {hasExisting && !hasNew && <span className="text-xs text-red-500 mt-1 block font-medium">✓ Current file saved</span>}
    </div>
);
