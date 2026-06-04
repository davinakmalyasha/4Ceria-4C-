import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Edit3, Trash2, Home, MapPin, Maximize, Bed, Bath, Layers, Info, Calendar, User, Plus, Layout } from 'lucide-react';
import axios from 'axios';
import AddRoomModal from './AddRoomModal';
import { useToast } from '../context/ToastContext';


interface Props {
    house: any;
    onClose: () => void;
    onEdit: (house: any) => void;
    onDelete: (houseId: number) => void;
    onHouseUpdated: (house: any) => void;
    formatCurrency: (n: number) => string;
}

const RoomCarousel = ({ images }: { images: any[] }) => {
    const [index, setIndex] = useState(0);
    if (!images || images.length === 0) return (
        <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-300">
            <Home size={24} />
        </div>
    );

    return (
        <div className="relative w-full h-full group/room overflow-hidden rounded-xl">
            <img 
                src={`/storage/${images[index].dir}`} 
                className="w-full h-full object-cover transition-transform duration-500 group-hover/room:scale-110" 
            />
            {images.length > 1 && (
                <>
                    <button 
                        onClick={(e) => { e.stopPropagation(); setIndex(prev => (prev - 1 + images.length) % images.length); }}
                        className="absolute left-1 top-1/2 -translate-y-1/2 p-1 bg-white/80 rounded-full opacity-0 group-hover/room:opacity-100 transition-opacity"
                    >
                        <ChevronLeft size={12} />
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); setIndex(prev => (prev + 1) % images.length); }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 p-1 bg-white/80 rounded-full opacity-0 group-hover/room:opacity-100 transition-opacity"
                    >
                        <ChevronRight size={12} />
                    </button>
                </>
            )}
        </div>
    );
};

export default function PropertyDetailModal({ house, onClose, onEdit, onDelete, onHouseUpdated, formatCurrency }: Props) {
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const [showAddRoom, setShowAddRoom] = useState(false);
    const { showToast } = useToast();

    const images = house.housePic || [];
    const rooms = house.roomList || [];

    useEffect(() => {
        if (images.length <= 1) return;
        const interval = setInterval(() => {
            setActiveImageIndex(prev => (prev + 1) % images.length);
        }, 4000);
        return () => clearInterval(interval);
    }, [images.length]);

    const nextImage = () => setActiveImageIndex(prev => (prev + 1) % images.length);
    const prevImage = () => setActiveImageIndex(prev => (prev - 1 + images.length) % images.length);

    const handleDeleteRoom = async (roomId: number) => {
        try {
            const response = await axios.delete(`/rooms/${roomId}`);
            onHouseUpdated(response.data.house);
            showToast('Room deleted successfully', 'success');
        } catch (err) {
            showToast('Failed to delete room', 'error');
        }
    };


    const getRoomIcon = (type: string) => {
        switch (type) {
            case 'bedroom': return <Bed size={14} className="text-[#FF2D20]" />;
            case 'bathroom': return <Bath size={14} className="text-[#FF2D20]" />;
            case 'room': return <Layout size={14} className="text-[#FF2D20]" />;
            default: return <Info size={14} className="text-[#FF2D20]" />;
        }
    };

    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row"
            >
                {/* Left: Image Carousel */}
                <div className="md:w-1/2 h-64 md:h-auto bg-gray-100 relative group">
                    <AnimatePresence mode="wait">
                        {images.length > 0 ? (
                            <motion.img 
                                key={activeImageIndex}
                                src={`/storage/${images[activeImageIndex].dir}`}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 italic text-xs flex-col gap-2">
                                <Home size={48} />
                                No images available
                            </div>
                        )}
                    </AnimatePresence>

                    {images.length > 1 && (
                        <>
                            <button onClick={prevImage} className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/80 backdrop-blur-md rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white text-gray-800">
                                <ChevronLeft size={20} />
                            </button>
                            <button onClick={nextImage} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/80 backdrop-blur-md rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white text-gray-800">
                                <ChevronRight size={20} />
                            </button>
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 px-3 py-1.5 bg-black/20 backdrop-blur-md rounded-full">
                                {images.map((_: any, i: number) => (
                                    <div key={i} className={`h-1.5 rounded-full transition-all ${i === activeImageIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`} />
                                ))}
                            </div>
                        </>
                    )}
                    
                    <button onClick={onClose} className="absolute top-4 left-4 p-2 bg-white/80 backdrop-blur-md rounded-full shadow-lg md:hidden text-gray-800">
                        <ChevronLeft size={20} />
                    </button>
                </div>

                {/* Right: Content */}
                <div className="md:w-1/2 flex flex-col h-full overflow-y-auto">
                    <div className="p-6 md:p-8 flex-1">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <span className="inline-block px-3 py-1 bg-red-50 text-red-600 text-[10px] font-bold uppercase tracking-wider rounded-full mb-2">For Sale</span>
                                <h2 className="text-3xl font-extrabold text-gray-900 leading-tight">{house.name}</h2>
                            </div>
                            <button onClick={onClose} className="hidden md:flex p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-900">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="flex items-center gap-2 mb-6">
                            <span className="text-3xl font-black text-[#FF2D20]">{formatCurrency(house.price)}</span>
                        </div>

                        <div className="grid grid-cols-4 gap-4 mb-8 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                            <div className="flex flex-col items-center justify-center p-2">
                                <Bed className="w-5 h-5 text-gray-400 mb-1" />
                                <span className="font-bold text-gray-900">{house.rooms?.bedrooms ?? house.br ?? '0'}</span>
                                <span className="text-[10px] text-gray-500 uppercase font-bold">Beds</span>
                            </div>
                            <div className="flex flex-col items-center justify-center p-2">
                                <Bath className="w-5 h-5 text-gray-400 mb-1" />
                                <span className="font-bold text-gray-900">{house.rooms?.bathrooms ?? house.ba ?? '0'}</span>
                                <span className="text-[10px] text-gray-500 uppercase font-bold">Baths</span>
                            </div>
                            <div className="flex flex-col items-center justify-center p-2">
                                <Maximize className="w-5 h-5 text-gray-400 mb-1" />
                                <span className="font-bold text-gray-900">
                                    {(house.dimensions?.width ?? house.width ?? 0) * (house.dimensions?.length ?? house.length ?? 0)}
                                </span>
                                <span className="text-[10px] text-gray-500 uppercase font-bold">m²</span>
                            </div>
                            <div className="flex flex-col items-center justify-center p-2">
                                <Layers className="w-5 h-5 text-gray-400 mb-1" />
                                <span className="font-bold text-gray-900">{house.dimensions?.floors ?? house.floors ?? '1'}</span>
                                <span className="text-[10px] text-gray-500 uppercase font-bold">Floors</span>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <section>
                                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-2 uppercase tracking-wide">
                                    <Info size={16} className="text-[#FF2D20]" /> Description
                                </h3>
                                <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">{house.description || house.house_desc}</p>
                            </section>

                            <section>
                                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-2 uppercase tracking-wide">
                                    <MapPin size={16} className="text-[#FF2D20]" /> Location Details
                                </h3>
                                <div className="text-sm text-gray-600 bg-gray-50 p-4 rounded-xl space-y-1">
                                    <p><strong className="text-gray-900">Street:</strong> {house.address?.street || house.street_name}</p>
                                    <p><strong className="text-gray-900">Area:</strong> {house.address?.kelurahan || house.kelurahan}, {house.address?.kecamatan || house.kecamatan}</p>
                                    <p><strong className="text-gray-900">Region:</strong> {house.address?.city || house.kab_kota}, {house.address?.province || house.province}</p>
                                    <p><strong className="text-gray-900">Postal Code:</strong> {house.address?.postal_code || house.postal_code}</p>
                                </div>
                            </section>

                            <section>
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 uppercase tracking-wide">
                                        <Home size={16} className="text-[#FF2D20]" /> Property Rooms
                                    </h3>
                                    <button 
                                        onClick={() => setShowAddRoom(true)}
                                        className="text-[10px] font-bold text-[#FF2D20] hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 transition-colors flex items-center gap-1.5"
                                    >
                                        <Plus size={12} /> Add Room
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {rooms.length > 0 ? (
                                        rooms.map((room: any) => (
                                            <div key={room.id} className="bg-gray-50 rounded-2xl border border-gray-100 p-3 flex gap-4 group/item">
                                                <div className="w-24 h-24 shrink-0">
                                                    <RoomCarousel images={room.pics} />
                                                </div>
                                                <div className="flex-1 min-w-0 flex flex-col justify-between">
                                                    <div>
                                                        <div className="flex justify-between items-start">
                                                            <div className="flex items-center gap-1.5 font-bold text-gray-900 text-sm">
                                                                {getRoomIcon(room.type)}
                                                                <span className="truncate">{room.name}</span>
                                                            </div>
                                                            <button 
                                                                onClick={() => handleDeleteRoom(room.id)}
                                                                className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover/item:opacity-100"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                        <div className="flex items-center gap-3 mt-1 text-[10px] font-bold text-gray-400 uppercase">
                                                            <span className="flex items-center gap-1"><Maximize size={10} /> {room.width}x{room.length} m</span>
                                                            <span className="px-1.5 py-0.5 bg-gray-200 rounded text-[8px]">{room.type}</span>
                                                        </div>
                                                    </div>
                                                    <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed mt-1 italic">{room.description}</p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="border-2 border-dashed border-gray-100 rounded-2xl p-8 text-center bg-gray-50/50">
                                            <p className="text-xs text-gray-400 italic">No rooms added yet</p>
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>
                    </div>

                    <AnimatePresence>
                        {showAddRoom && (
                            <AddRoomModal 
                                houseId={house.id} 
                                onClose={() => setShowAddRoom(false)} 
                                onSuccess={(updated: any) => {
                                    onHouseUpdated(updated);
                                    setShowAddRoom(false);
                                }}
                            />
                        )}
                    </AnimatePresence>

                    <div className="p-6 bg-white border-t border-gray-100 flex gap-3">
                        <button 
                            onClick={() => onEdit(house)}
                            className="flex-1 bg-gray-900 hover:bg-black text-white py-3.5 rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                            <Edit3 size={18} /> Edit Property
                        </button>
                        <button 
                            onClick={() => onDelete(house.id)}
                            className="flex-1 bg-red-50 hover:bg-red-100 text-[#FF2D20] py-3.5 rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                            <Trash2 size={18} /> Delete Listing
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
