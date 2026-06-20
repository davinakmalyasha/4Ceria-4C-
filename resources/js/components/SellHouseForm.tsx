import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
    CheckCircle, ChevronLeft, MapPin, UploadCloud, 
    X, Home, Maximize, Plus, Trash2, Bed, Bath, Layout 
} from 'lucide-react';
import { useSellHouse, RoomEntry } from '../hooks/useSellHouse';
import { ReverseGeoData } from './LocationPickerMap';

const LocationPickerMap = React.lazy(() => import('./LocationPickerMap'));

interface Props {
    onCancel: () => void;
    onSuccess: () => void;
}

export default function SellHouseForm({ onCancel, onSuccess }: Props) {
    const { formData, handleChange, setFormData, submit, isLoading, error } = useSellHouse(onSuccess);

    const [mainPreviews, setMainPreviews] = useState<string[]>([]);
    const [roomPreviews, setRoomPreviews] = useState<string[][]>([]);

    const mainPicsSignature = (formData.house_pic || []).map(f => f.name + f.size).join(',');
    useEffect(() => {
        const files = formData.house_pic || [];
        const urls = files.map(file => URL.createObjectURL(file));
        setMainPreviews(urls);
        return () => {
            urls.forEach(url => URL.revokeObjectURL(url));
        };
    }, [mainPicsSignature]);

    const roomPicsSignature = formData.rooms.map(r => (r.pics || []).map(f => f.name + f.size).join(',')).join('|');
    useEffect(() => {
        const urlsList = formData.rooms.map(room => {
            const pics = room.pics || [];
            return pics.map(file => URL.createObjectURL(file));
        });
        setRoomPreviews(urlsList);
        return () => {
            urlsList.forEach(urls => urls.forEach(url => URL.revokeObjectURL(url)));
        };
    }, [roomPicsSignature]);

    const formatNumber = (val: string) => {
        if (!val) return '';
        const num = val.replace(/\D/g, '');
        return num.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) handleChange('house_pic', Array.from(e.target.files));
    };

    const addRoom = () => {
        setFormData(prev => ({
            ...prev,
            rooms: [...prev.rooms, { name: '', type: 'room', width: '', length: '', desc: '', pics: null }]
        }));
    };

    const handleRoomFileChange = (index: number, files: FileList | null) => {
        if (!files) return;
        const newRooms = [...formData.rooms];
        const existingDocs = newRooms[index].pics || [];
        newRooms[index] = { ...newRooms[index], pics: [...existingDocs, ...Array.from(files)] };
        setFormData(prev => ({ ...prev, rooms: newRooms }));
    };

    const removeRoomPic = (roomIndex: number, picIndex: number) => {
        const newRooms = [...formData.rooms];
        const newPics = (newRooms[roomIndex].pics || []).filter((_, i) => i !== picIndex);
        newRooms[roomIndex] = { ...newRooms[roomIndex], pics: newPics.length > 0 ? newPics : null };
        setFormData(prev => ({ ...prev, rooms: newRooms }));
    };

    const removeRoom = (index: number) => {
        setFormData(prev => ({
            ...prev,
            rooms: prev.rooms.filter((_, i) => i !== index)
        }));
    };

    const updateRoom = (index: number, field: string, value: string) => {
        const newRooms = [...formData.rooms];
        newRooms[index] = { ...newRooms[index], [field]: value } as RoomEntry;
        setFormData(prev => ({ ...prev, rooms: newRooms }));
    };

    return (
        <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <style>{`
                input[type=number]::-webkit-inner-spin-button, 
                input[type=number]::-webkit-outer-spin-button { 
                  -webkit-appearance: none; 
                  margin: 0; 
                }
                input[type=number] { -moz-appearance: textfield; }
            `}</style>
            
            <div className="px-8 py-6 bg-gradient-to-r from-gray-900 to-gray-800 text-white flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <button 
                        type="button"
                        onClick={onCancel}
                        className="p-2 hover:bg-white/10 rounded-xl transition-colors shrink-0"
                        title="Back to Dashboard"
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Home size={20} className="text-red-500" /> Start Selling Your House
                        </h2>
                        <p className="text-xs text-white/50 mt-1 uppercase tracking-widest font-black">Property Details & Listing Registration</p>
                    </div>
                </div>
            </div>

            <form onSubmit={submit} className="p-8 space-y-8">
                {error && <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 font-medium text-sm italic">Failed: {error}</div>}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest flex items-center gap-2 border-b border-gray-100 pb-2">
                            <Plus size={16} className="text-red-500" /> Basic Information
                        </h3>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Listing Title</label>
                            <input required type="text" placeholder="e.g. Modern Minimalist Villa with Pool" className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all" value={formData.name} onChange={e => handleChange('name', e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Pricing (Rp)</label>
                            <div className="relative mt-1">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">Rp</span>
                                <input required type="text" placeholder="50,000,000" className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition-all" value={formatNumber(formData.price)} onChange={e => handleChange('price', e.target.value)} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Bed (BR)</label>
                                <input required type="number" className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none" value={formData.br} onChange={e => handleChange('br', e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Bath (BA)</label>
                                <input required type="number" className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none" value={formData.ba} onChange={e => handleChange('ba', e.target.value)} />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Description</label>
                            <textarea required rows={4} placeholder="Describe the soul of your property..." className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none resize-none" value={formData.house_desc} onChange={e => handleChange('house_desc', e.target.value)} />
                        </div>
                    </div>

                    {/* Media & Location */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest flex items-center gap-2 border-b border-gray-100 pb-2">
                             <MapPin size={16} className="text-red-500" /> Location & Media
                        </h3>
                        <div className="pt-2">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Pin Property Location</label>
                            <React.Suspense fallback={<div className="h-[300px] w-full bg-zinc-900/10 rounded-2xl border border-gray-150 flex items-center justify-center text-[10px] text-gray-400 font-mono tracking-widest uppercase">Loading Interactive Map...</div>}>
                                <LocationPickerMap 
                                    latitude={parseFloat(formData.lat)} 
                                    longitude={parseFloat(formData.lng)} 
                                    onChange={(lat, lng, address) => {
                                        handleChange('lat', lat.toString());
                                        handleChange('lng', lng.toString());
                                        if(address) {
                                            setFormData(prev => ({
                                                ...prev,
                                                province: address.province,
                                                kab_kota: address.city,
                                                kecamatan: address.kecamatan,
                                                kelurahan: address.kelurahan,
                                                postal_code: address.postal_code,
                                                street_name: address.street_name
                                            }));
                                        }
                                    }} 
                                />
                            </React.Suspense>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Province</label>
                                <input required type="text" className="w-full mt-1 p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" value={formData.province} onChange={e => handleChange('province', e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">City</label>
                                <input required type="text" className="w-full mt-1 p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" value={formData.kab_kota} onChange={e => handleChange('kab_kota', e.target.value)} />
                            </div>
                        </div>

                        {/* Image Upload */}
                        <div className="pt-2">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Listing Photos</label>
                            <label className="cursor-pointer flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50 hover:bg-red-50 hover:border-red-300 transition-all group">
                                <UploadCloud className="w-10 h-10 text-gray-300 group-hover:text-red-500 mb-2 transition-colors" />
                                <span className="text-[10px] font-black uppercase text-gray-400 group-hover:text-red-600">Upload Main Photos</span>
                                <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
                            </label>
                            {formData.house_pic && formData.house_pic.length > 0 && (
                                <div className="flex gap-2 mt-3 flex-wrap">
                                    {formData.house_pic.map((file, i) => (
                                        <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-100 shadow-sm transition-transform hover:scale-105">
                                            <img src={mainPreviews[i]} alt="Preview" className="w-full h-full object-cover" />
                                            <button type="button" onClick={() => { const newFiles = formData.house_pic!.filter((_, idx) => idx !== i); handleChange('house_pic', newFiles.length > 0 ? newFiles : null); }} className="absolute top-0 right-0 bg-black/40 text-white p-1 rounded-bl-lg">
                                                <X size={10} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Rooms Section */}
                <div className="pt-6 border-t border-gray-100">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                <Layout size={18} className="text-red-500" /> Property Rooms & Spaces
                            </h3>
                            <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 italic">Optional: Specify internal spaces now or later</p>
                        </div>
                        <button type="button" onClick={addRoom} className="text-[10px] font-black text-[#FF2D20] px-4 py-2 rounded-xl border border-red-100 hover:bg-red-50 transition-all flex items-center gap-1.5 shadow-sm active:scale-95">
                            <Plus size={14} /> Add Space
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                            {room.pics && room.pics.map((file, picIdx) => (
                                                <div key={picIdx} className="relative w-12 h-12 rounded-lg overflow-hidden border border-gray-100 shadow-sm group/pic">
                                                    <img src={roomPreviews[index]?.[picIdx]} alt="Room Preview" className="w-full h-full object-cover" />
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
                                                    No photos added for this space
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {formData.rooms.length === 0 && (
                            <div className="md:col-span-2 py-10 text-center bg-gray-50/50 rounded-[2rem] border-2 border-dashed border-gray-100">
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest italic">No spaces defined yet. Add rooms to boost listing quality.</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="pt-8 flex justify-end gap-4 border-t border-gray-100">
                    <button type="button" onClick={onCancel} disabled={isLoading} className="px-6 py-3.5 rounded-xl font-bold text-gray-400 hover:text-gray-900 transition-colors flex items-center gap-2">
                        <ChevronLeft size={18} /> Back to My Properties
                    </button>
                    <button type="submit" disabled={isLoading} className="px-10 py-3.5 rounded-2xl font-black text-white bg-[#FF2D20] hover:bg-black shadow-[0_8px_20px_-10px_rgb(255,45,32)] transition-all active:scale-95 disabled:opacity-70 flex items-center gap-2">
                        {isLoading ? 'Processing...' : <><CheckCircle size={20} /> Publish Market Listing</>}
                    </button>
                </div>
            </form>
        </div>
    );
}
