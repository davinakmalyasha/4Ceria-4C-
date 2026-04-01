import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlusCircle, Home, MapPin, Search, ChevronLeft } from 'lucide-react';

interface Props {
    houses: any[];
    onAddProperty: () => void;
    onBack?: () => void;
}

export default function MyHousesContent({ houses, onAddProperty, onBack }: Props) {
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
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
                                transition={{ delay: idx * 0.05 }}
                                className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-xl transition-all group flex flex-col"
                            >
                                <div className="h-48 bg-gray-200 relative overflow-hidden">
                                    {house.housePic && house.housePic.length > 0 ? (
                                        <img src={`/storage/${house.housePic[0].dir}`} alt={house.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                                            <Home size={32} />
                                        </div>
                                    )}
                                    <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-gray-900 shadow-sm">
                                        For Sale
                                    </div>
                                </div>
                                <div className="p-5 flex-1 flex flex-col">
                                    <h4 className="font-bold text-lg text-gray-900 group-hover:text-[#FF2D20] transition-colors">{house.name}</h4>
                                    <p className="flex items-start gap-1 text-sm text-gray-500 mt-2 mb-4">
                                        <MapPin size={14} className="mt-0.5 shrink-0" />
                                        <span className="truncate">{house.address?.city}, {house.address?.province}</span>
                                    </p>
                                    <div className="mt-auto pt-4 border-t border-gray-100 flex justify-between items-center">
                                        <span className="text-xl font-extrabold text-[#FF2D20]">{formatCurrency(house.price)}</span>
                                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">ID: #{house.id}</span>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
