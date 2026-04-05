import React from 'react';
import { motion } from 'framer-motion';
import { Building, MapPin, Package, Star, ArrowRight, CheckCircle } from 'lucide-react';

interface SupplierCardProps {
    supplier: any;
    onClick: () => void;
}

export default function SupplierCard({ supplier, onClick }: SupplierCardProps) {
    const rating = parseFloat(supplier.reviews_avg_rating) || 0;
    const reviewCount = supplier.reviews_count || 0;
    const productCount = supplier.materials_count || 0;

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -5 }}
            className="group bg-white rounded-[2.5rem] border border-gray-100 p-6 shadow-sm hover:shadow-2xl hover:shadow-red-500/10 transition-all duration-500 cursor-pointer flex flex-col h-full"
            onClick={onClick}
        >
            <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-[1.5rem] bg-gray-900 text-white flex items-center justify-center text-xl font-black shadow-lg shadow-gray-900/20 group-hover:scale-110 transition-transform duration-500">
                        {supplier.store_name?.charAt(0) || "S"}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h4 className="text-xl font-black text-gray-900 tracking-tight group-hover:text-red-500 transition-colors">
                                {supplier.store_name}
                            </h4>
                            <CheckCircle size={16} className="text-blue-500" />
                        </div>
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                            {supplier.category || "General Store"}
                        </span>
                    </div>
                </div>
                
                <div className="flex flex-col items-end">
                    <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">
                        <Star size={12} className="text-amber-500 fill-amber-500" />
                        <span className="text-xs font-black text-amber-700">{rating > 0 ? rating.toFixed(1) : "New"}</span>
                    </div>
                    {reviewCount > 0 && (
                        <span className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-tighter">
                            {reviewCount} reviews
                        </span>
                    )}
                </div>
            </div>

            <div className="space-y-3 mb-8 flex-1">
                <div className="flex items-start gap-2.5">
                    <MapPin size={14} className="text-red-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-gray-500 font-medium leading-relaxed line-clamp-2">
                        {supplier.address || "Verified Supplier Location"}
                    </p>
                </div>
                
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-xl border border-gray-100">
                        <Package size={12} className="text-blue-500" />
                        <span className="text-[10px] font-black text-gray-600 uppercase tracking-tight">
                            {productCount} Products Available
                        </span>
                    </div>
                </div>
            </div>

            <div className="pt-4 border-t border-gray-50 flex items-center justify-between group/footer">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover:text-gray-900 transition-colors">
                    Visit Storefront
                </span>
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-red-500 group-hover:text-white transition-all duration-300 transform group-hover:translate-x-1 shadow-inner">
                    <ArrowRight size={18} />
                </div>
            </div>
        </motion.div>
    );
}
