import React from 'react';
import { motion } from 'framer-motion';
import { Home, MapPin, CheckCircle, UploadCloud, X, DollarSign, Maximize, Layers, ChevronLeft } from 'lucide-react';
import { useSellHouse, HouseFormData } from '../hooks/useSellHouse';
import LocationPickerMap from './LocationPickerMap';

interface Props {
    onCancel: () => void;
    onSuccess: () => void;
}

export default function SellHouseForm({ onCancel, onSuccess }: Props) {
    const { formData, handleChange, submit, isLoading, error } = useSellHouse(onSuccess);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) handleChange('house_pic', Array.from(e.target.files));
    };

    return (
        <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-8 text-white relative flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <button type="button" onClick={onCancel} className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-colors flex items-center gap-2 text-sm font-bold">
                        <ChevronLeft size={18} /> Back
                    </button>
                    <div>
                        <h2 className="text-3xl font-extrabold tracking-tight">Sell Your House</h2>
                        <p className="text-gray-400 mt-2">List your property on the 4C marketplace.</p>
                    </div>
                </div>
                <button onClick={onCancel} className="p-2 bg-white/10 rounded-full hover:bg-white/20 h-10 w-10 flex items-center justify-center transition-colors">
                    <X size={20} />
                </button>
            </div>

            <form onSubmit={submit} className="p-8 space-y-8">
                {error && <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 font-medium text-sm">{error}</div>}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold flex items-center gap-2 text-gray-900"><Home className="text-red-500" /> Basic Details</h3>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase">Property Name / Title</label>
                            <input required type="text" className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all" value={formData.name} onChange={e => handleChange('name', e.target.value)} placeholder="e.g. Modern Minimalist Villa" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase">Price (IDR)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">Rp</span>
                                <input required type="number" min="0" className="w-full mt-1 p-3 pl-10 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all" value={formData.price} onChange={e => handleChange('price', e.target.value)} placeholder="500000000" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase">Description</label>
                            <textarea required rows={4} className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all resize-none" value={formData.house_desc} onChange={e => handleChange('house_desc', e.target.value)} placeholder="Describe the property..." />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">Bedrooms</label>
                                <input required type="number" min="0" className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all" value={formData.br} onChange={e => handleChange('br', e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">Bathrooms</label>
                                <input required type="number" min="0" className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all" value={formData.ba} onChange={e => handleChange('ba', e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">Width (m)</label>
                                <input required type="number" min="0" className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all" value={formData.width} onChange={e => handleChange('width', e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">Length (m)</label>
                                <input required type="number" min="0" className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all" value={formData.length} onChange={e => handleChange('length', e.target.value)} />
                            </div>
                        </div>
                    </div>

                    {/* Location & Photos */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold flex items-center gap-2 text-gray-900"><MapPin className="text-red-500" /> Location & Media</h3>

                        {/* Map Picker */}
                        <div className="pt-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Pin Location</label>
                            <LocationPickerMap 
                                latitude={parseFloat(formData.lat)} 
                                longitude={parseFloat(formData.lng)} 
                                onChange={(lat, lng) => { handleChange('lat', lat.toString()); handleChange('lng', lng.toString()); }} 
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-2">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">Province</label>
                                <input required type="text" className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all" value={formData.province} onChange={e => handleChange('province', e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">City / Regency</label>
                                <input required type="text" className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all" value={formData.kab_kota} onChange={e => handleChange('kab_kota', e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">Kecamatan</label>
                                <input required type="text" className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all" value={formData.kecamatan} onChange={e => handleChange('kecamatan', e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">Kelurahan</label>
                                <input required type="text" className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all" value={formData.kelurahan} onChange={e => handleChange('kelurahan', e.target.value)} />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase">Street Name</label>
                            <input required type="text" className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all" value={formData.street_name} onChange={e => handleChange('street_name', e.target.value)} />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-1">
                                <label className="block text-xs font-bold text-gray-500 uppercase">Postal Code</label>
                                <input required type="number" className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all" value={formData.postal_code} onChange={e => handleChange('postal_code', e.target.value)} />
                            </div>
                        </div>

                        {/* Image Upload */}
                        <div className="pt-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Property Photos</label>
                            <label className="cursor-pointer flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 hover:bg-red-50 hover:border-red-300 transition-colors group">
                                <UploadCloud className="w-10 h-10 text-gray-400 group-hover:text-red-500 mb-2 transition-colors" />
                                <span className="text-sm font-medium text-gray-600 group-hover:text-red-600">Click to upload images</span>
                                <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
                            </label>
                            {formData.house_pic && <p className="text-xs text-gray-500 mt-2 font-medium">{formData.house_pic.length} files selected</p>}
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-gray-100 flex justify-end gap-4 mt-6">
                    <button type="button" onClick={onCancel} disabled={isLoading} className="px-6 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition-colors flex items-center gap-2">
                        <ChevronLeft size={18} /> Back to Dashboard
                    </button>
                    <button type="submit" disabled={isLoading} className="px-8 py-3 rounded-xl font-bold text-white bg-[#FF2D20] hover:bg-red-600 shadow-lg shadow-red-500/20 transition-all active:scale-95 disabled:opacity-70 flex items-center gap-2">
                        {isLoading ? 'Publishing...' : <><CheckCircle size={18} /> Publish Listing</>}
                    </button>
                </div>
            </form>
        </div>
    );
}
