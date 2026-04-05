import React, { useState } from 'react';
import { ShoppingCart, Package, CheckCircle, MapPin, Plus, Minus, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../../context/CartContext';

interface MaterialCardProps {
    material: any;
    onOpenDetails?: () => void;
}

export default function MaterialCard({ material, onOpenDetails }: MaterialCardProps) {
    const { addItem, items } = useCart();
    const [quantity, setQuantity] = useState(1);
    const [isAdded, setIsAdded] = useState(false);
    
    const cartItem = items.find(item => item.id === material.id);
    const formattedPrice = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(material.price);

    const handleAdd = () => {
        addItem(material, quantity);
        setIsAdded(true);
        setTimeout(() => setIsAdded(false), 2000);
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -5 }}
            className="group bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm hover:shadow-2xl hover:shadow-red-500/10 transition-all duration-500 flex flex-col h-full"
        >
            {/* Image Section */}
            <div 
                className="aspect-[4/3] relative overflow-hidden bg-gray-50 cursor-pointer"
                onClick={() => onOpenDetails?.()}
            >
                {material.images && material.images.length > 0 ? (
                    <img 
                        src={`/storage/${material.images[0].image_path}`} 
                        alt={material.name} 
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Package size={48} className="text-gray-200" />
                    </div>
                )}
                
                {/* Badge Category */}
                <div className="absolute top-4 left-4">
                    <span className="px-3 py-1 bg-white/90 backdrop-blur-md rounded-full text-[10px] font-black text-gray-900 uppercase tracking-widest shadow-sm border border-white/20">
                        {material.category}
                    </span>
                </div>

                {/* Stock Warning Overlay */}
                {material.stock < 10 && material.is_available && (
                    <div className="absolute top-4 right-4">
                        <span className="px-3 py-1 bg-amber-500 text-white rounded-full text-[8px] font-black uppercase tracking-widest shadow-lg">
                            Low Stock
                        </span>
                    </div>
                )}

                {/* Availability Overlay */}
                {!material.is_available && (
                    <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px] flex items-center justify-center">
                        <span className="px-4 py-2 bg-white text-gray-900 rounded-2xl font-black text-xs uppercase tracking-widest">Out of Stock</span>
                    </div>
                )}
            </div>

            {/* Content Section */}
            <div className="p-6 flex-1 flex flex-col">
                <div className="mb-4 cursor-pointer" onClick={() => onOpenDetails?.()}>
                    <h4 className="text-lg font-black text-gray-900 line-clamp-1 group-hover:text-red-500 transition-colors tracking-tight">
                        {material.name}
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-2xl font-black text-gray-900">{formattedPrice}</span>
                        <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">/ {material.unit}</span>
                    </div>
                </div>

                <div className="space-y-4 mb-6 flex-1">
                    <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed font-medium">
                        {material.description || "Premium building materials sourced from verified suppliers for your construction project."}
                    </p>
                    
                    <div className="flex flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 rounded-lg border border-gray-100">
                            <CheckCircle size={10} className="text-green-500" />
                            <span className="text-[10px] font-extrabold text-gray-600 uppercase tracking-tight">Verified</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 rounded-lg border border-gray-100">
                            <Package size={10} className="text-blue-500" />
                            <span className="text-[10px] font-extrabold text-gray-600 uppercase tracking-tight">{material.stock} {material.unit} Stock</span>
                        </div>
                    </div>

                    {/* Quantity Selector UI */}
                    {material.is_available && (
                        <div className="flex items-center justify-between p-2 bg-gray-50 rounded-2xl border border-gray-100">
                            <div className="flex items-center gap-4 px-2">
                                <button 
                                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                    className="p-1 hover:bg-white rounded-lg transition-colors text-gray-400 hover:text-red-500"
                                >
                                    <Minus size={14} />
                                </button>
                                <span className="text-sm font-black text-gray-900 min-w-[20px] text-center">{quantity}</span>
                                <button 
                                    onClick={() => setQuantity(quantity + 1)}
                                    className="p-1 hover:bg-white rounded-lg transition-colors text-gray-400 hover:text-red-500"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pr-2">{material.unit}</span>
                        </div>
                    )}
                </div>

                {/* Footer / Supplier */}
                <div className="pt-4 border-t border-gray-100 flex items-center justify-between mt-auto">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-gray-900 text-white flex items-center justify-center text-[10px] font-black uppercase ring-4 ring-gray-100">
                            {material.supplier?.store_name?.charAt(0) || "S"}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-gray-900 uppercase tracking-[0.05em]">{material.supplier?.store_name || "Official Store"}</span>
                            <span className="text-[9px] font-bold text-gray-400 -mt-0.5">{material.supplier?.category || "Building Materials"}</span>
                        </div>
                    </div>
                    
                    <button 
                        onClick={handleAdd}
                        disabled={!material.is_available || isAdded}
                        className={`group/btn relative px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all duration-300 flex items-center gap-2 shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                            isAdded 
                                ? 'bg-green-500 text-white shadow-green-500/20' 
                                : 'bg-[#FF2D20] text-white hover:shadow-red-500/20 hover:scale-105'
                        }`}
                    >
                        {isAdded ? (
                            <CheckCircle size={16} />
                        ) : (
                            <ShoppingCart size={16} />
                        )}
                        <span>{isAdded ? 'Added' : 'Quote'}</span>
                    </button>
                </div>
            </div>
        </motion.div>
    );
}
