import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, CheckCircle, DollarSign, Home, Maximize, Layers, Info, Save } from 'lucide-react';
import axios from 'axios';

interface Props {
    house: any;
    onClose: () => void;
    onSuccess: (updatedHouse: any) => void;
}

export default function EditPropertyModal({ house, onClose, onSuccess }: Props) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const formatNumber = (num: string) => {
        const value = num.replace(/\D/g, '');
        return value.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    };

    const [formData, setFormData] = useState({
        name: house.name || '',
        price: formatNumber(String(house.price || '')),
        house_desc: house.description || house.house_desc || '',
        width: String(house.dimensions?.width ?? house.width ?? ''),
        length: String(house.dimensions?.length ?? house.length ?? ''),
        floors: String(house.dimensions?.floors ?? house.floors ?? '1'),
        br: String(house.rooms?.bedrooms ?? house.br ?? ''),
        ba: String(house.rooms?.bathrooms ?? house.ba ?? ''),
    });

    const handleChange = (field: string, value: string) => {
        if (field === 'price') {
            setFormData(prev => ({ ...prev, [field]: formatNumber(value) }));
        } else {
            setFormData(prev => ({ ...prev, [field]: value }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const rawPrice = formData.price.replace(/\./g, '');
            const payload = {
                ...formData,
                price: rawPrice,
            };

            const response = await axios.put(`/houses/${house.id}`, payload);
            onSuccess(response.data.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to update property.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
                <div className="px-8 py-6 bg-gray-50 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-gray-900 to-gray-800 text-white">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Home className="text-red-500" size={20} /> Edit Property Details
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6">
                    {error && (
                        <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl text-sm font-medium flex items-center gap-2">
                            <Info size={16} /> {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Property Name</label>
                            <input 
                                required 
                                type="text" 
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all placeholder:text-gray-300" 
                                placeholder="e.g. Modern Villa with Pool"
                                value={formData.name} 
                                onChange={e => handleChange('name', e.target.value)} 
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Asking Price (Rp)</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none group-focus-within:text-[#FF2D20] text-gray-400 transition-colors font-bold">Rp</div>
                                <input 
                                    required 
                                    type="text" 
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all text-xl font-black text-gray-900" 
                                    placeholder="500.000.000"
                                    value={formData.price} 
                                    onChange={e => handleChange('price', e.target.value)} 
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Width (m)</label>
                                <input 
                                    required 
                                    type="number" 
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all" 
                                    value={formData.width} 
                                    onChange={e => handleChange('width', e.target.value)} 
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Length (m)</label>
                                <input 
                                    required 
                                    type="number" 
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all" 
                                    value={formData.length} 
                                    onChange={e => handleChange('length', e.target.value)} 
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Bedrooms</label>
                                <input 
                                    required 
                                    type="number" 
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all" 
                                    value={formData.br} 
                                    onChange={e => handleChange('br', e.target.value)} 
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Bathrooms</label>
                                <input 
                                    required 
                                    type="number" 
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all" 
                                    value={formData.ba} 
                                    onChange={e => handleChange('ba', e.target.value)} 
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Floors</label>
                                <input 
                                    required 
                                    type="number" 
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all" 
                                    value={formData.floors} 
                                    onChange={e => handleChange('floors', e.target.value)} 
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Property Description</label>
                            <textarea 
                                required 
                                rows={4}
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all resize-none" 
                                value={formData.house_desc} 
                                onChange={e => handleChange('house_desc', e.target.value)} 
                            />
                        </div>
                    </div>
                </form>

                <div className="p-6 bg-white border-t border-gray-100 flex justify-end gap-4">
                    <button 
                        type="button" 
                        onClick={onClose} 
                        className="px-6 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit" 
                        onClick={handleSubmit}
                        disabled={isLoading} 
                        className="px-8 py-3 rounded-xl font-bold text-white bg-[#FF2D20] hover:bg-red-600 shadow-lg shadow-red-500/20 transition-all active:scale-95 disabled:opacity-70 flex items-center gap-2"
                    >
                        {isLoading ? 'Saving Changes...' : <><Save size={18} /> Update Property</>}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
