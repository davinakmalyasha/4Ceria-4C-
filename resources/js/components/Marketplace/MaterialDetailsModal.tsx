import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { 
    X, Package, MapPin, CheckCircle, ShoppingCart, 
    MessageCircle, Mail, Phone, ChevronLeft, ChevronRight,
    Box, Tag, Info, Building, ShieldCheck
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import AddMaterialToProjectModal from '../Modals/AddMaterialToProjectModal';
import { useAuth } from '../../context/AuthContext';

const ManualSlider = ({ images, altText }: { images?: { image_path: string }[]; altText: string }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const next = (e: React.MouseEvent) => { e.stopPropagation(); if (images) setCurrentIndex((p) => (p + 1) % images.length); };
    const prev = (e: React.MouseEvent) => { e.stopPropagation(); if (images) setCurrentIndex((p) => (p - 1 + images.length) % images.length); };
    
    if (!images || images.length === 0) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gradient-to-br from-gray-50 to-gray-200">
                <Package size={64} className="mb-4 opacity-20" />
                <span className="font-semibold tracking-wide text-xs uppercase">No Images Available</span>
            </div>
        );
    }

    return (
        <div className="w-full h-full relative group">
            <AnimatePresence mode="popLayout" initial={false}>
                <motion.img 
                    key={currentIndex} 
                    src={`/storage/${images[currentIndex].image_path}`} 
                    alt={`${altText} ${currentIndex + 1}`}
                    initial={{ opacity: 0, scale: 1.05 }} 
                    animate={{ opacity: 1, scale: 1 }} 
                    exit={{ opacity: 0 }} 
                    transition={{ duration: 0.6 }}
                    className="absolute inset-0 w-full h-full object-cover" 
                />
            </AnimatePresence>
            
            {images.length > 1 && (
                <>
                    <button onClick={prev} className="absolute left-6 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 text-white p-3 rounded-2xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-lg z-20"><ChevronLeft size={20} /></button>
                    <button onClick={next} className="absolute right-6 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 text-white p-3 rounded-2xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-lg z-20"><ChevronRight size={20} /></button>
                    <div className="absolute top-6 left-0 right-0 flex justify-center gap-1.5 z-10">
                        {images.map((_, idx) => (
                            <button 
                                key={idx} 
                                onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); }} 
                                className={`h-1 rounded-full transition-all duration-500 bg-white shadow-sm ${idx === currentIndex ? 'w-8 opacity-100' : 'w-2 opacity-40 hover:opacity-100'}`} 
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

interface Props {
    material: any;
    onClose: () => void;
    onOpenChat?: (profOrId: any) => void;
}

export default function MaterialDetailsModal({ material, onClose, onOpenChat }: Props) {
    const { addItem, items } = useCart();
    const { user } = useAuth();
    const [quantity, setQuantity] = useState(1);
    const [isAdded, setIsAdded] = useState(false);
    const [showAddToProject, setShowAddToProject] = useState(false);

    const formattedPrice = new Intl.NumberFormat('id-ID', { 
        style: 'currency', 
        currency: 'IDR', 
        minimumFractionDigits: 0 
    }).format(material.price);

    const handleAddToCart = () => {
        addItem(material, quantity);
        setIsAdded(true);
        setTimeout(() => setIsAdded(false), 2000);
    };

    const stats = [
        { icon: Tag, label: 'Category', value: material.category },
        { icon: Box, label: 'Stock', value: `${material.stock} ${material.unit}` },
        { icon: ShieldCheck, label: 'Status', value: 'Verified' },
    ];

    return (
        <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-gray-900/40 backdrop-blur-sm" 
            onClick={onClose}
        >
            <motion.div 
                initial={{ y: 50, opacity: 0, scale: 0.95 }} 
                animate={{ y: 0, opacity: 1, scale: 1 }} 
                exit={{ y: 20, opacity: 0, scale: 0.95 }} 
                transition={{ type: 'spring', duration: 0.5, bounce: 0.3 }}
                className="bg-white rounded-[2.5rem] overflow-hidden shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col relative" 
                onClick={(e) => e.stopPropagation()}
            >
                <button 
                    onClick={onClose} 
                    className="absolute top-5 right-5 bg-white/80 hover:bg-white backdrop-blur-md text-gray-900 p-2.5 rounded-full transition-all z-20 shadow-sm border border-gray-100"
                >
                    <X size={20} strokeWidth={2.5} />
                </button>

                <div className="overflow-y-auto w-full flex-1 pb-32 relative scrollbar-thin bg-white">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 lg:gap-8 p-4 sm:p-6 lg:p-8">
                        {/* Image Gallery Column */}
                        <div className="lg:col-span-7">
                            <div className="w-full aspect-[4/3] relative bg-gray-100 rounded-[2rem] overflow-hidden shadow-xl border border-gray-100">
                                <ManualSlider images={material.images} altText={material.name} />
                                <div className="absolute top-6 left-6">
                                    <span className="px-4 py-2 bg-white/90 backdrop-blur-md rounded-2xl text-[10px] font-black text-gray-900 uppercase tracking-widest shadow-sm border border-white/20">
                                        {material.category}
                                    </span>
                                </div>
                            </div>

                            {/* Mobile/Quick Stats */}
                            <div className="grid grid-cols-3 gap-4 mt-8">
                                {stats.map((s, i) => (
                                    <div key={i} className="flex flex-col items-center text-center p-4 bg-gray-50 rounded-[1.5rem] border border-gray-100">
                                        <s.icon size={20} className="text-red-500 mb-2" />
                                        <span className="font-extrabold text-gray-900 text-sm leading-tight line-clamp-1">{s.value}</span>
                                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1">{s.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Product Info Column */}
                        <div className="lg:col-span-5 space-y-8 mt-8 lg:mt-0">
                            <div>
                                <h2 className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight tracking-tight">{material.name}</h2>
                                <div className="flex items-baseline gap-2 mt-2">
                                    <span className="text-3xl font-black text-red-500">{formattedPrice}</span>
                                    <span className="text-sm text-gray-400 font-bold uppercase tracking-widest">/ {material.unit}</span>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <p className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-3">
                                    <span className="w-8 h-[2px] bg-red-500 inline-block rounded-full"></span> 
                                    Description
                                </p>
                                <p className="text-gray-600 text-base leading-relaxed font-medium whitespace-pre-wrap">
                                    {material.description || "Premium building materials sourced from verified suppliers for your construction project. Quality guaranteed for long-term durability and structural integrity."}
                                </p>
                            </div>

                            {/* Supplier Section */}
                            <div className="pt-8 border-t border-gray-50 space-y-6">
                                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Store Profile</p>
                                
                                <div className="bg-gray-900 rounded-[2rem] p-6 text-white space-y-6 shadow-2xl relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-red-500 rounded-full blur-[50px] opacity-20 -mr-12 -mt-12" />
                                    
                                    <div className="flex items-center gap-4 relative z-10">
                                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white text-xl font-black shrink-0 shadow-xl border border-white/10">
                                            {material.supplier?.store_name?.charAt(0).toUpperCase() || 'S'}
                                        </div>
                                        <div>
                                            <h5 className="font-extrabold text-base leading-tight">{material.supplier?.store_name || "Official Store"}</h5>
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <CheckCircle size={12} className="text-red-400" />
                                                <p className="text-red-400 text-[10px] font-black uppercase tracking-wider">Verified Supplier</p>
                                            </div>
                                        </div>
                                    </div>

                                    {material.supplier?.bio && (
                                        <p className="text-xs text-gray-300 font-medium leading-relaxed italic border-l-2 border-red-500/50 pl-3">
                                            {material.supplier.bio}
                                        </p>
                                    )}

                                    <div className="space-y-3 pt-2">
                                        <div className="flex items-start gap-3">
                                            <MapPin size={14} className="text-red-500 mt-0.5 shrink-0" />
                                            <p className="text-[11px] text-gray-400 font-bold leading-relaxed">{material.supplier?.address || "Jakarta, Indonesia"}</p>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="grid grid-cols-2 gap-3 relative z-10 pt-4">
                                        {material.supplier?.no_telp && (
                                            <a
                                                href={`https://wa.me/${material.supplier.no_telp.replace(/\D/g, '')}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center justify-center gap-2 py-3 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg active:scale-95"
                                            >
                                                <MessageCircle size={14} fill="currentColor" /> WhatsApp
                                            </a>
                                        )}
                                        {material.supplier?.user?.email && (
                                            <a
                                                href={`mailto:${material.supplier.user.email}`}
                                                className="flex items-center justify-center gap-2 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border border-white/10 active:scale-95"
                                            >
                                                <Mail size={14} /> Email
                                            </a>
                                        )}
                                        <button
                                            onClick={() => {
                                                if (onOpenChat && material.supplier?.user_id) {
                                                    onOpenChat(material.supplier.user_id);
                                                    onClose();
                                                }
                                            }}
                                            className="col-span-2 flex items-center justify-center gap-2 py-3.5 bg-white text-gray-900 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all hover:bg-gray-100 active:scale-95"
                                        >
                                            <MessageCircle size={14} /> Send Internal Message
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sticky Footer */}
                <div className="p-8 border-t border-gray-100 bg-white/80 backdrop-blur-xl flex items-center gap-6 shadow-[0_-10px_40px_rgba(0,0,0,0.03)] relative z-30">
                    <div className="flex items-center gap-4 px-6 py-3 bg-gray-50 rounded-2xl border border-gray-100">
                        <button 
                            onClick={() => setQuantity(Math.max(1, quantity - 1))}
                            className="p-1.5 hover:bg-white rounded-lg transition-all text-gray-400 hover:text-red-500 shadow-sm active:scale-90"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <div className="flex flex-col items-center">
                            <span className="text-xl font-black text-gray-900">{quantity}</span>
                            <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter -mt-1">{material.unit}</span>
                        </div>
                        <button 
                            onClick={() => setQuantity(quantity + 1)}
                            className="p-1.5 hover:bg-white rounded-lg transition-all text-gray-400 hover:text-red-500 shadow-sm active:scale-90"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>

                    <button 
                        onClick={handleAddToCart}
                        disabled={!material.is_available || isAdded}
                        className={`flex-1 px-8 py-5 rounded-2xl font-black text-sm uppercase tracking-[0.2em] transition-all duration-500 flex items-center justify-center gap-3 shadow-2xl active:scale-95 ${
                            isAdded 
                                ? 'bg-green-500 text-white shadow-green-500/20' 
                                : 'bg-gray-900 text-white hover:bg-red-500 hover:shadow-red-500/30'
                        }`}
                    >
                        {isAdded ? <CheckCircle size={20} /> : <ShoppingCart size={20} />}
                        {isAdded ? 'Item Added' : 'Add to Catalog'}
                    </button>

                    {user && (
                        <button 
                            onClick={() => setShowAddToProject(true)}
                            className="px-8 py-5 rounded-2xl font-black text-sm uppercase tracking-[0.2em] transition-all duration-500 flex items-center justify-center gap-3 border-2 border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white shadow-lg active:scale-95"
                        >
                            <Box size={20} />
                            Add to Project
                        </button>
                    )}
                </div>

                <AnimatePresence>
                    {showAddToProject && (
                        <AddMaterialToProjectModal 
                            material={material} 
                            onClose={() => setShowAddToProject(false)} 
                        />
                    )}
                </AnimatePresence>
            </motion.div>
        </motion.div>
    );
}
