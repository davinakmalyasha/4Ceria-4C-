import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, CheckCircle, DollarSign, Home, Maximize, Layers, Info, Save, Layout, Plus, Trash2, UploadCloud, ChevronLeft } from 'lucide-react';
import axios from 'axios';
import { RoomEntry } from '../hooks/useSellHouse';

interface Props {
    house: any;
    onClose: () => void;
    onSuccess: (updatedHouse: any) => void;
    onDelete: (id: number) => void;
}

export default function EditPropertyModal({ house, onClose, onSuccess, onDelete }: Props) {
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
        existingHousePics: house.housePic || [],
        newHousePics: [] as File[],
        deletedHousePicIds: [] as number[],
        rooms: (house.roomList || []).map((r: any) => ({
            id: r.id,
            name: r.name,
            type: r.type,
            width: String(r.width),
            length: String(r.length),
            desc: r.desc || '',
            pics: null, // For new uploads
            existingPics: r.pics || [] // Load existing URLs
        })) as (RoomEntry & { id?: number, existingPics?: { dir: string }[] })[]
    });

    const handleChange = (field: string, value: any) => {
        if (field === 'price') {
            setFormData(prev => ({ ...prev, [field]: formatNumber(value) }));
        } else {
            setFormData(prev => ({ ...prev, [field]: value }));
        }
    };

    const addRoom = () => {
        setFormData(prev => ({
            ...prev,
            rooms: [...prev.rooms, { name: '', type: 'room', width: '', length: '', desc: '', pics: null }]
        }));
    };

    const updateRoom = (index: number, field: string, value: any) => {
        const newRooms = [...formData.rooms];
        newRooms[index] = { ...newRooms[index], [field]: value };
        setFormData(prev => ({ ...prev, rooms: newRooms }));
    };

    const removeRoom = (index: number) => {
        setFormData(prev => ({
            ...prev,
            rooms: prev.rooms.filter((_, i) => i !== index)
        }));
    };

    const handleRoomFileChange = (index: number, files: FileList | null) => {
        if (!files) return;
        const newRooms = [...formData.rooms];
        const existingPics = newRooms[index].pics || [];
        newRooms[index] = { ...newRooms[index], pics: [...existingPics, ...Array.from(files)] };
        setFormData(prev => ({ ...prev, rooms: newRooms }));
    };

    const removeRoomPic = (roomIndex: number, picIndex: number) => {
        const newRooms = [...formData.rooms];
        const newPics = (newRooms[roomIndex].pics || []).filter((_, i) => i !== picIndex);
        newRooms[roomIndex] = { ...newRooms[roomIndex], pics: newPics.length > 0 ? newPics : null };
        setFormData(prev => ({ ...prev, rooms: newRooms }));
    };

    const handleHouseFileChange = (files: FileList | null) => {
        if (!files) return;
        setFormData(prev => ({ ...prev, newHousePics: [...prev.newHousePics, ...Array.from(files)] }));
    };

    const removeNewHousePic = (index: number) => {
        setFormData(prev => ({ ...prev, newHousePics: prev.newHousePics.filter((_, i) => i !== index) }));
    };

    const markHousePicForDeletion = (id: number) => {
        setFormData(prev => ({ ...prev, deletedHousePicIds: [...prev.deletedHousePicIds, id] }));
    };

    const unmarkHousePicForDeletion = (id: number) => {
        setFormData(prev => ({ ...prev, deletedHousePicIds: prev.deletedHousePicIds.filter(i => i !== id) }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const payload = new FormData();
            payload.append('_method', 'PUT');
            
            payload.append('name', formData.name);
            payload.append('price', formData.price.replace(/\./g, ''));
            payload.append('house_desc', formData.house_desc);
            payload.append('width', formData.width);
            payload.append('length', formData.length);
            payload.append('floors', formData.floors);
            payload.append('br', formData.br);
            payload.append('ba', formData.ba);

            // House Gallery Changes
            formData.newHousePics.forEach((file, idx) => {
                payload.append(`house_pics[${idx}]`, file);
            });
            formData.deletedHousePicIds.forEach((id, idx) => {
                payload.append(`deleted_house_pics[${idx}]`, String(id));
            });

            formData.rooms.forEach((room, index) => {
                if (room.id) {
                    payload.append(`rooms[${index}][id]`, String(room.id));
                }
                payload.append(`rooms[${index}][name]`, room.name);
                payload.append(`rooms[${index}][type]`, room.type);
                payload.append(`rooms[${index}][width]`, room.width);
                payload.append(`rooms[${index}][length]`, room.length);
                payload.append(`rooms[${index}][desc]`, room.desc || '');
                
                if (room.pics && room.pics.length > 0) {
                    room.pics.forEach((file, picIdx) => {
                        payload.append(`rooms[${index}][pics][${picIdx}]`, file);
                    });
                }
            });

            const response = await axios.post(`/houses/${house.id}`, payload, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            onSuccess(response.data.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to update property.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <style>{`
                input[type=number]::-webkit-inner-spin-button,
                input[type=number]::-webkit-outer-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }
                input[type=number] {
                    -moz-appearance: textfield;
                }
            `}</style>
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

                    <div className="space-y-6">
                        {/* Main House Gallery Section */}
                        <div className="pb-6 border-b border-gray-100">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                    <UploadCloud size={18} className="text-red-500" /> Property Gallery
                                </h3>
                                <label className="cursor-pointer text-[10px] font-black text-[#FF2D20] px-4 py-2 rounded-xl border border-red-100 hover:bg-red-50 transition-all flex items-center gap-1.5 shadow-sm">
                                    <Plus size={14} /> Add House Photos
                                    <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleHouseFileChange(e.target.files)} />
                                </label>
                            </div>

                            <div className="grid grid-cols-4 gap-3">
                                {/* Existing House Photos */}
                                {formData.existingHousePics.map((pic: any) => {
                                    const isDeleted = formData.deletedHousePicIds.includes(pic.id);
                                    return (
                                        <div key={pic.id} className={`relative aspect-square rounded-2xl overflow-hidden border border-gray-100 group ${isDeleted ? 'opacity-40 grayscale' : ''}`}>
                                            <img src={`/storage/${pic.dir}`} className="w-full h-full object-cover" />
                                            {isDeleted ? (
                                                <button type="button" onClick={() => unmarkHousePicForDeletion(pic.id)} className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-[10px] font-bold uppercase tracking-widest">
                                                    Undo Delete
                                                </button>
                                            ) : (
                                                <button type="button" onClick={() => markHousePicForDeletion(pic.id)} className="absolute top-2 right-2 p-1.5 bg-black/40 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500">
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}

                                {/* New House Photos Previews */}
                                {formData.newHousePics.map((file, idx) => (
                                    <div key={`new-${idx}`} className="relative aspect-square rounded-2xl overflow-hidden border border-red-100 shadow-lg shadow-red-500/5 group">
                                        <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" />
                                        <div className="absolute top-2 left-2 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest">New</div>
                                        <button type="button" onClick={() => removeNewHousePic(idx)} className="absolute top-2 right-2 p-1.5 bg-black/40 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}

                                {formData.existingHousePics.length === 0 && formData.newHousePics.length === 0 && (
                                    <div className="col-span-4 py-8 text-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-100 text-[10px] text-gray-400 font-bold uppercase tracking-widest italic">
                                        No photos uploaded for this property
                                    </div>
                                )}
                            </div>
                        </div>

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

                        {/* Rooms Section */}
                        <div className="pt-6 border-t border-gray-100">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                        <Layout size={18} className="text-red-500" /> Property Rooms & Spaces
                                    </h3>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 italic">Optional: Manage current and new spaces</p>
                                </div>
                                <button type="button" onClick={addRoom} className="text-[10px] font-black text-[#FF2D20] px-4 py-2 rounded-xl border border-red-100 hover:bg-red-50 transition-all flex items-center gap-1.5 shadow-sm active:scale-95">
                                    <Plus size={14} /> Add Space
                                </button>
                            </div>
                            
                            <div className="grid grid-cols-1 gap-4">
                                {formData.rooms.map((room, index) => (
                                    <div key={index} className="p-5 bg-gray-50 rounded-2xl border border-gray-100 relative group flex gap-4 transition-all hover:bg-white hover:shadow-xl hover:border-red-100/50">
                                        <button type="button" onClick={() => removeRoom(index)} className="absolute top-2 right-2 p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
                                            <Trash2 size={16} />
                                        </button>
                                        
                                        <div className="space-y-4 flex-1">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="col-span-2">
                                                    <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">Space Name</label>
                                                    <input required type="text" placeholder="e.g. Master Bedroom" className="w-full p-2.5 bg-white border border-gray-100 rounded-xl text-sm focus:ring-1 focus:ring-red-500 focus:outline-none font-bold" value={room.name} onChange={e => updateRoom(index, 'name', e.target.value)} />
                                                </div>
                                                <div>
                                                    <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">Category</label>
                                                    <select className="w-full p-2.5 bg-white border border-gray-100 rounded-xl text-xs font-bold focus:ring-1 focus:ring-red-500 cursor-pointer" value={room.type} onChange={e => updateRoom(index, 'type', e.target.value)}>
                                                        <option value="room">General</option>
                                                        <option value="bedroom">Bedroom</option>
                                                        <option value="bathroom">Bathroom</option>
                                                        <option value="others">Others</option>
                                                    </select>
                                                </div>
                                                <div className="flex gap-2">
                                                    <div className="flex-1">
                                                        <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">W (m)</label>
                                                        <input required type="number" className="w-full p-2.5 bg-white border border-gray-100 rounded-xl text-xs focus:ring-1 focus:ring-red-500" value={room.width} onChange={e => updateRoom(index, 'width', e.target.value)} />
                                                    </div>
                                                    <div className="flex-1">
                                                        <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">L (m)</label>
                                                        <input required type="number" className="w-full p-2.5 bg-white border border-gray-100 rounded-xl text-xs focus:ring-1 focus:ring-red-500" value={room.length} onChange={e => updateRoom(index, 'length', e.target.value)} />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Room Photos */}
                                            <div className="mt-4 pt-4 border-t border-gray-100/50">
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className="block text-[9px] font-black text-gray-400 uppercase">Room Photos (Optional)</label>
                                                    <label className="cursor-pointer text-[9px] font-black text-[#FF2D20] hover:text-black transition-colors flex items-center gap-1 uppercase">
                                                        <Plus size={10} /> Add Photos
                                                        <input 
                                                            type="file" 
                                                            multiple 
                                                            accept="image/*" 
                                                            className="hidden" 
                                                            onChange={(e) => handleRoomFileChange(index, e.target.files)} 
                                                        />
                                                    </label>
                                                </div>
                                                
                                                <div className="flex gap-2 flex-wrap min-h-[40px]">
                                                    {/* Existing Photos */}
                                                    {room.existingPics && room.existingPics.map((pic: { dir: string }, picIdx: number) => (
                                                        <div key={`existing-${picIdx}`} className="relative w-12 h-12 rounded-lg overflow-hidden border border-gray-100 shadow-sm opacity-80 hover:opacity-100 transition-opacity">
                                                            <img src={`/storage/${pic.dir}`} alt="Existing Room Pic" className="w-full h-full object-cover" />
                                                            <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                                                <CheckCircle size={12} className="text-white" />
                                                            </div>
                                                        </div>
                                                    ))}
                                                    
                                                    {/* New Uploads */}
                                                    {room.pics && room.pics.map((file: File, picIdx: number) => (
                                                        <div key={picIdx} className="relative w-12 h-12 rounded-lg overflow-hidden border border-gray-100 shadow-sm group/pic">
                                                            <img src={URL.createObjectURL(file)} alt="Room Preview" className="w-full h-full object-cover" />
                                                            <button 
                                                                type="button" 
                                                                onClick={() => removeRoomPic(index, picIdx)}
                                                                className="absolute top-0 right-0 bg-black/40 text-white p-0.5 rounded-bl-md opacity-0 group-hover/pic:opacity-100 transition-opacity"
                                                            >
                                                                <X size={8} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    {(!room.pics || room.pics.length === 0) && (
                                                        <div className="flex items-center gap-2 text-[9px] text-gray-300 italic">
                                                            <UploadCloud size={12} />
                                                            No new photos added
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {formData.rooms.length === 0 && (
                                    <div className="py-10 text-center bg-gray-50/50 rounded-[2rem] border-2 border-dashed border-gray-100">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest italic">No spaces defined. Add rooms to boost listing quality.</p>
                                    </div>
                                )}
                            </div>
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
                    <div className="flex-1" />
                    <button 
                        type="button" 
                        onClick={() => onDelete(house.id)}
                        className="px-6 py-3 rounded-xl font-bold text-red-500 hover:bg-red-50 transition-colors flex items-center gap-2 text-sm"
                    >
                        <Trash2 size={16} /> Delete Property
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
