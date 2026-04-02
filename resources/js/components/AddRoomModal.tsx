import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Plus, Trash2, Home, Bed, Bath, Layout, Save, Info } from 'lucide-react';
import axios from 'axios';

interface Props {
    houseId: number;
    onClose: () => void;
    onSuccess: (updatedHouse: any) => void;
}

export default function AddRoomModal({ houseId, onClose, onSuccess }: Props) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [files, setFiles] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);

    const [formData, setFormData] = useState({
        name: '',
        type: 'room', // room, bedroom, bathroom, others
        width: '',
        length: '',
        desc: ''
    });

    const roomTypes = [
        { id: 'room', label: 'General Room', icon: Layout },
        { id: 'bedroom', label: 'Bedroom', icon: Bed },
        { id: 'bathroom', label: 'Bathroom', icon: Bath },
        { id: 'others', label: 'Others', icon: Info },
    ];

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files);
            setFiles(prev => [...prev, ...newFiles]);
            
            const newPreviews = newFiles.map(file => URL.createObjectURL(file));
            setPreviews(prev => [...prev, ...newPreviews]);
        }
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
        setPreviews(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        const data = new FormData();
        data.append('name', formData.name);
        data.append('type', formData.type);
        data.append('width', formData.width);
        data.append('length', formData.length);
        data.append('desc', formData.desc);
        
        files.forEach((file) => {
            data.append('room_pic[]', file);
        });

        try {
            const response = await axios.post(`/houses/${houseId}/rooms`, data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            onSuccess(response.data.house);
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to add room.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
                {/* Header */}
                <div className="px-8 py-6 bg-gradient-to-r from-gray-900 to-gray-800 text-white flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Plus className="text-red-500" size={20} /> Add Property Room
                        </h2>
                        <p className="text-xs text-white/60 mt-0.5">Specify details and photos for this room</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6">
                    {error && (
                        <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl text-sm font-medium flex items-center gap-2 italic">
                            <Info size={16} /> {error}
                        </div>
                    )}

                    {/* Room Type Selector */}
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Room Category</label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {roomTypes.map((type) => (
                                <button
                                    key={type.id}
                                    type="button"
                                    onClick={() => setFormData({ ...formData, type: type.id })}
                                    className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${
                                        formData.type === type.id 
                                        ? 'border-[#FF2D20] bg-red-50 text-[#FF2D20]' 
                                        : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200'
                                    }`}
                                >
                                    <type.icon size={20} />
                                    <span className="text-[10px] font-bold uppercase">{type.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Room Name</label>
                            <input 
                                required 
                                type="text" 
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none" 
                                placeholder="e.g. Master Bedroom"
                                value={formData.name} 
                                onChange={e => setFormData({ ...formData, name: e.target.value })} 
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Width (m)</label>
                                <input 
                                    required 
                                    type="number" 
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none" 
                                    value={formData.width} 
                                    onChange={e => setFormData({ ...formData, width: e.target.value })} 
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Length (m)</label>
                                <input 
                                    required 
                                    type="number" 
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none" 
                                    value={formData.length} 
                                    onChange={e => setFormData({ ...formData, length: e.target.value })} 
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
                        <textarea 
                            required 
                            rows={3}
                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none resize-none" 
                            placeholder="Describe special features like built-in wardrobes, balcony, etc."
                            value={formData.desc} 
                            onChange={e => setFormData({ ...formData, desc: e.target.value })} 
                        />
                    </div>

                    {/* Room Photos */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Room Photos</label>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                            <AnimatePresence>
                                {previews.map((src, index) => (
                                    <motion.div 
                                        key={src}
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.8 }}
                                        className="relative aspect-square rounded-xl overflow-hidden group border border-gray-200"
                                    >
                                        <img src={src} className="w-full h-full object-cover" alt="preview" />
                                        <button 
                                            type="button"
                                            onClick={() => removeFile(index)} 
                                            className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X size={12} />
                                        </button>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl hover:border-red-500 hover:bg-red-50 transition-all cursor-pointer text-gray-400 hover:text-red-500">
                                <Upload size={20} />
                                <span className="text-[10px] font-bold mt-1">Upload</span>
                                <input type="file" multiple className="hidden" onChange={handleFileChange} accept="image/*" />
                            </label>
                        </div>
                    </div>
                </form>

                <div className="p-6 bg-white border-t border-gray-100 flex justify-end gap-3">
                    <button 
                        type="button" 
                        onClick={onClose} 
                        className="px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit" 
                        onClick={handleSubmit}
                        disabled={isLoading} 
                        className="px-8 py-3 rounded-xl font-bold text-white bg-[#FF2D20] hover:bg-red-600 shadow-lg shadow-red-500/20 transition-all active:scale-95 disabled:opacity-70 flex items-center gap-2"
                    >
                        {isLoading ? 'Processing...' : <><Save size={18} /> Add Room</>}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
