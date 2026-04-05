import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UploadCloud, Plus, Package, DollarSign, Box, Tag, FileText, Settings, Loader2, Image as ImageIcon, Trash2 } from 'lucide-react';

interface MaterialFormModalProps {
    material?: any;
    onClose: () => void;
    onSuccess: () => void;
}

export default function MaterialFormModal({ material, onClose, onSuccess }: MaterialFormModalProps) {
    const isEdit = !!material;
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    
    const [formData, setFormData] = useState({
        name: material?.name || '',
        description: material?.description || '',
        price: material?.price || '',
        unit: material?.unit || 'pcs',
        category: material?.category || 'General Store',
        stock: material?.stock || 0,
        is_available: material?.is_available !== undefined ? material?.is_available : true,
    });

    // For multiple images
    const [existingImages, setExistingImages] = useState<any[]>(material?.images || []);
    const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
    const [newImagePreviews, setNewImagePreviews] = useState<string[]>([]);
    const [deletedImageIds, setDeletedImageIds] = useState<number[]>([]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
        setFormData({ ...formData, [e.target.name]: value });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            setNewImageFiles(prev => [...prev, ...files]);
            
            const newPreviews = files.map(file => URL.createObjectURL(file));
            setNewImagePreviews(prev => [...prev, ...newPreviews]);
        }
    };

    const removeExistingImage = (id: number) => {
        setDeletedImageIds(prev => [...prev, id]);
        setExistingImages(prev => prev.filter(img => img.id !== id));
    };

    const removeNewImage = (index: number) => {
        setNewImageFiles(prev => prev.filter((_, i) => i !== index));
        setNewImagePreviews(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const data = new FormData();
            Object.entries(formData).forEach(([key, value]) => {
                data.append(key, value.toString());
            });

            // Append new images
            newImageFiles.forEach((file) => {
                data.append('images[]', file);
            });

            // Append deleted image ids if editing
            if (isEdit && deletedImageIds.length > 0) {
                deletedImageIds.forEach(id => {
                    data.append('deleted_image_ids[]', id.toString());
                });
            }

            if (isEdit) {
                data.append('_method', 'PUT');
                await axios.post(`/merchant/materials/${material.id}`, data, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            } else {
                await axios.post('/merchant/materials', data, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }

            onSuccess();
        } catch (err: any) {
            const errorMsg = err.response?.data?.errors 
                ? Object.values(err.response.data.errors).flat().join(' ') 
                : (err.response?.data?.message || 'Failed to save material');
            setError(errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            />
            
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]"
            >
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center">
                            {isEdit ? <Settings size={20} /> : <Plus size={20} />}
                        </div>
                        <div>
                            <h3 className="font-black text-gray-900">{isEdit ? 'Edit Material' : 'Add New Material'}</h3>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{isEdit ? 'Modify product details' : 'List a new product in the marketplace'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 bg-gray-50 text-gray-400 hover:text-red-500 rounded-2xl transition-all">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="overflow-y-auto p-8 space-y-8">
                    {error && <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-sm border border-red-100">{error}</div>}

                    {/* Image Collection Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Product Gallery</label>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{existingImages.length + newImageFiles.length} Images</span>
                        </div>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {/* Existing Images */}
                            <AnimatePresence>
                                {existingImages.map((img) => (
                                    <motion.div 
                                        key={`exist-${img.id}`}
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.8 }}
                                        className="aspect-square rounded-2xl overflow-hidden relative group border border-gray-100"
                                    >
                                        <img src={`/storage/${img.image_path}`} alt="product" className="w-full h-full object-cover" />
                                        <button 
                                            type="button"
                                            onClick={() => removeExistingImage(img.id)}
                                            className="absolute top-2 right-2 p-1.5 bg-white/90 backdrop-blur-sm text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </motion.div>
                                ))}

                                {/* New Image Previews */}
                                {newImagePreviews.map((preview, index) => (
                                    <motion.div 
                                        key={`new-${index}`}
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.8 }}
                                        className="aspect-square rounded-2xl overflow-hidden relative group border-2 border-dashed border-red-200"
                                    >
                                        <img src={preview} alt="preview" className="w-full h-full object-cover" />
                                        <button 
                                            type="button"
                                            onClick={() => removeNewImage(index)}
                                            className="absolute top-2 right-2 p-1.5 bg-white/90 backdrop-blur-sm text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                        >
                                            <X size={14} />
                                        </button>
                                        <div className="absolute bottom-0 left-0 right-0 bg-red-500/80 text-white text-[8px] font-black uppercase tracking-tighter py-1 text-center">New</div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>

                            {/* Upload Button */}
                            <label className="aspect-square rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:border-red-500/50 hover:bg-red-50/10 transition-all group">
                                <UploadCloud size={24} className="text-gray-300 group-hover:text-red-500 transition-colors" />
                                <span className="text-[10px] font-black text-gray-400 group-hover:text-red-500 uppercase tracking-widest mt-2">{existingImages.length + newImageFiles.length === 0 ? 'Upload Photos' : 'Add More'}</span>
                                <input type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
                            </label>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-gray-50">
                        {/* Info Fields */}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Material Name</label>
                                <div className="relative">
                                    <Package size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input type="text" name="name" value={formData.name} onChange={handleChange} required className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-red-500/5 focus:border-red-500/50 outline-none transition-all" placeholder="e.g. Portland Cement" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Price (IDR)</label>
                                    <div className="relative">
                                        <DollarSign size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input type="number" name="price" value={formData.price} onChange={handleChange} required className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-red-500/5 focus:border-red-500/50 outline-none transition-all" placeholder="85000" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Unit</label>
                                    <select name="unit" value={formData.unit} onChange={handleChange} required className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-red-500/5 focus:border-red-500/50 outline-none transition-all font-bold text-sm">
                                        <option value="pcs">Pcs</option>
                                        <option value="zak">Zak</option>
                                        <option value="meter">Meter</option>
                                        <option value="m3">M3</option>
                                        <option value="kg">Kg</option>
                                        <option value="ton">Ton</option>
                                        <option value="batang">Batang</option>
                                        <option value="lembar">Lembar</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Category</label>
                                <div className="relative">
                                    <Tag size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <select name="category" value={formData.category} onChange={handleChange} required className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-red-500/5 focus:border-red-500/50 outline-none transition-all font-bold text-sm">
                                        <option value="General Store">General Store</option>
                                        <option value="Cement & Masonry">Cement & Masonry</option>
                                        <option value="Steel & Metals">Steel & Metals</option>
                                        <option value="Wood & Lumber">Wood & Lumber</option>
                                        <option value="Electrical & Plumbing">Electrical & Plumbing</option>
                                        <option value="Finishing & Painting">Finishing & Painting</option>
                                        <option value="Tools & Safety">Tools & Safety</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Stock Available</label>
                                <div className="relative">
                                    <Box size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input type="number" name="stock" value={formData.stock} onChange={handleChange} required className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-red-500/5 focus:border-red-500/50 outline-none transition-all" placeholder="500" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Product Description</label>
                        <div className="relative">
                            <FileText size={16} className="absolute left-4 top-4 text-gray-400" />
                            <textarea name="description" value={formData.description} onChange={handleChange} rows={4} className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-red-500/5 focus:border-red-500/50 outline-none transition-all resize-none font-medium" placeholder="Detail specifications, brands, or delivery notes..."></textarea>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <input 
                            type="checkbox" 
                            name="is_available" 
                            id="is_available" 
                            checked={formData.is_available} 
                            onChange={handleChange}
                            className="w-5 h-5 rounded-md text-red-500 focus:ring-red-500/20"
                        />
                        <label htmlFor="is_available" className="text-sm font-bold text-gray-700">Display this material in the Marketplace</label>
                    </div>
                </form>

                <div className="p-8 border-t border-gray-100 bg-gray-50/5 flex items-center gap-4">
                    <button 
                        type="submit" 
                        onClick={handleSubmit}
                        disabled={isLoading} 
                        className="flex-1 px-8 py-4 bg-gray-900 text-white font-bold rounded-[1.25rem] hover:bg-gray-800 transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={20} /> : <ImageIcon size={20} />}
                        {isLoading ? 'Saving Product...' : (isEdit ? 'Save Changes' : 'Add to Catalog')}
                    </button>
                    <button 
                        onClick={onClose}
                        className="px-8 py-4 bg-white border border-gray-200 text-gray-500 font-bold rounded-[1.25rem] hover:bg-gray-50 transition-all"
                    >
                        Cancel
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
