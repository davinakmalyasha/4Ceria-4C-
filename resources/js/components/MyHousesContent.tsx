import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlusCircle, Home, MapPin, Search, ChevronLeft, Edit3, Trash2, Eye, Info } from 'lucide-react';
import axios from 'axios';
import PropertyDetailModal from './PropertyDetailModal';
import EditPropertyModal from './EditPropertyModal';

interface Props {
    houses: any[];
    onAddProperty: () => void;
    onBack?: () => void;
    onHouseDeleted?: (houseId: number) => void;
    onHouseUpdated?: (house: any) => void;
}

export default function MyHousesContent({ houses, onAddProperty, onBack, onHouseDeleted, onHouseUpdated }: Props) {
    const [selectedHouse, setSelectedHouse] = useState<any | null>(null);
    const [editingHouse, setEditingHouse] = useState<any | null>(null);
    const [isDeleting, setIsDeleting] = useState<number | null>(null);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    };

    const handleDelete = async (houseId: number) => {
        if (!confirm('Are you sure you want to delete this property listing? This action cannot be undone.')) return;
        
        setIsDeleting(houseId);
        try {
            await axios.delete(`/houses/${houseId}`);
            onHouseDeleted?.(houseId);
            setSelectedHouse(null);
        } catch (err) {
            alert('Failed to delete property listing. Please try again.');
        } finally {
            setIsDeleting(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                    {onBack && (
                        <button onClick={onBack} className="p-2 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors text-gray-600">
                            <ChevronLeft size={20} />
                        </button>
                    )}
                    <div>
                        <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <Home className="text-[#FF2D20] w-6 h-6" /> My Properties
                        </h3>
                        <p className="text-gray-500 text-sm mt-1">Manage listings for the properties you are selling.</p>
                    </div>
                </div>
                <button 
                    onClick={onAddProperty} 
                    className="bg-[#FF2D20] hover:bg-red-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-red-500/20 active:scale-95 transition-all flex items-center gap-2"
                >
                    <PlusCircle size={18} /> Add New Property
                </button>
            </div>

            {houses.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 text-center shadow-sm border border-gray-100 flex flex-col items-center justify-center">
                    <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
                        <Home size={32} />
                    </div>
                    <h4 className="text-xl font-bold text-gray-900">No properties listed yet</h4>
                    <p className="text-gray-500 max-w-sm mt-2">You haven't listed any houses for sale. Click the button above to post your first property.</p>
                    <button onClick={onAddProperty} className="mt-6 font-bold text-[#FF2D20] hover:underline">
                        Start selling now
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <AnimatePresence>
                        {houses.map((house, idx) => (
                            <motion.div 
                                key={house.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ delay: idx * 0.05 }}
                                onClick={() => setSelectedHouse(house)}
                                className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-2xl transition-all group flex flex-col cursor-pointer relative"
                            >
                                <div className="h-56 bg-gray-200 relative overflow-hidden">
                                    {/* Action Buttons Overlay */}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 z-10 backdrop-blur-[2px]">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setSelectedHouse(house); }} 
                                            className="p-3 bg-white hover:bg-red-50 rounded-2xl text-gray-700 hover:text-[#FF2D20] shadow-xl hover:scale-110 transition-all font-bold flex items-center gap-2"
                                        >
                                            <Eye size={18} /> <span className="text-xs">View</span>
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setEditingHouse(house); }} 
                                            className="p-3 bg-white hover:bg-blue-50 rounded-2xl text-gray-700 hover:text-blue-600 shadow-xl hover:scale-110 transition-all font-bold flex items-center gap-2"
                                        >
                                            <Edit3 size={18} /> <span className="text-xs">Edit</span>
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDelete(house.id); }} 
                                            disabled={isDeleting === house.id}
                                            className="p-3 bg-white hover:bg-red-50 rounded-2xl text-gray-700 hover:text-red-600 shadow-xl hover:scale-110 transition-all font-bold flex items-center gap-2 disabled:opacity-50"
                                        >
                                            <Trash2 size={18} /> <span className="text-xs">Delete</span>
                                        </button>
                                    </div>

                                    {house.housePic && house.housePic.length > 0 ? (
                                        <img 
                                            src={`/storage/${house.housePic[0].dir}`} 
                                            alt={house.name} 
                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-100 italic text-xs flex-col gap-2">
                                            <Home size={32} />
                                            No Images Available
                                        </div>
                                    )}
                                    <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-2xl text-[10px] font-bold text-gray-900 shadow-sm border border-white/20 uppercase tracking-wider">
                                        For Sale
                                    </div>
                                    {house.housePic && house.housePic.length > 1 && (
                                        <div className="absolute bottom-4 right-4 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-lg text-[10px] font-bold text-white shadow-sm flex items-center gap-1">
                                            <PlusCircle size={10} /> {house.housePic.length} Photos
                                        </div>
                                    )}
                                </div>
                                <div className="p-6 flex-1 flex flex-col">
                                    <h4 className="font-extrabold text-xl text-gray-900 group-hover:text-[#FF2D20] transition-colors line-clamp-1">{house.name}</h4>
                                    <p className="flex items-start gap-1 text-sm text-gray-500 mt-2 mb-4 bg-gray-50 p-2 rounded-xl border border-gray-100">
                                        <MapPin size={14} className="mt-0.5 shrink-0 text-[#FF2D20]" />
                                        <span className="truncate">{house.address?.city || house.kab_kota}, {house.address?.province || house.province}</span>
                                    </p>
                                    <div className="mt-auto pt-4 border-t border-gray-100 flex justify-between items-center">
                                        <span className="text-2xl font-black text-[#FF2D20] tracking-tight">{formatCurrency(house.price)}</span>
                                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded-lg font-bold">ID: #{house.id}</span>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            {/* Modals */}
            <AnimatePresence>
                {selectedHouse && (
                    <PropertyDetailModal
                        house={selectedHouse}
                        onClose={() => setSelectedHouse(null)}
                        onEdit={(h) => { setSelectedHouse(null); setEditingHouse(h); }}
                        onDelete={handleDelete}
                        formatCurrency={formatCurrency}
                    />
                )}
                {editingHouse && (
                    <EditPropertyModal
                        house={editingHouse}
                        onClose={() => setEditingHouse(null)}
                        onSuccess={(updated) => {
                            setEditingHouse(null);
                            onHouseUpdated?.(updated);
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
