import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Search, Menu, ChevronRight, Package, Zap, Loader2 } from 'lucide-react';
import MaterialCard from './MaterialCard';
import SupplierCard from './SupplierCard';
import { useCart } from '../../context/CartContext';

export default function MarketplaceTab({ 
    onOpenChat, 
    onOpenDetails,
    onOpenCart,
    onOpenStore
}: { 
    onOpenChat?: (profOrId: any) => void,
    onOpenDetails?: (material: any) => void,
    onOpenCart?: () => void,
    onOpenStore?: (storeId: number) => void
}) {
    const { itemCount, totalAmount } = useCart();
    const [materials, setMaterials] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('All');
    
    // Categories for filtering
    const categories = [
        'All',
        'General Store',
        'Cement & Masonry',
        'Steel & Metals',
        'Wood & Lumber',
        'Electrical & Plumbing',
        'Finishing & Painting',
        'Tools & Safety'
    ];

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [matRes, supRes] = await Promise.all([
                axios.get('/marketplace/materials'),
                axios.get('/marketplace/suppliers')
            ]);
            setMaterials(matRes.data.data || []);
            setSuppliers(supRes.data.data || []);
        } catch (err) {
            console.error('Failed to fetch marketplace data', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const filteredMaterials = (materials || []).filter((m: any) => {
        const matchesCategory = activeCategory === 'All' || m.category === activeCategory;
        const matchesSearch = m.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             m.description?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch && m.is_available;
    });

    const filteredSuppliers = (suppliers || []).filter((s: any) => {
        const matchesSearch = s.store_name?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesSearch;
    });

    const isStoreView = activeCategory === 'General Store';

    return (
        <motion.div 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: -20 }} 
            className="w-full"
        >
            <div className="flex flex-col gap-2 mb-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center justify-between w-full">
                        <div>
                            <h3 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                                <ShoppingCart size={28} className="text-red-500" />
                                {isStoreView ? 'Verified Suppliers' : 'Materials Marketplace'}
                            </h3>
                            <p className="text-gray-500 font-medium">
                                {isStoreView 
                                    ? 'Connect directly with wholesalers and retail stores for mass supply.' 
                                    : 'Source premium construction materials directly from verified suppliers.'
                                }
                            </p>
                        </div>

                        {itemCount > 0 && (
                            <button 
                                onClick={onOpenCart}
                                className="flex items-center gap-3 px-6 py-3 bg-white border border-red-100 text-red-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-50 transition-all shadow-sm active:scale-95 group shrink-0"
                            >
                                <div className="relative">
                                    <ShoppingCart size={18} />
                                    <span className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 text-white text-[8px] flex items-center justify-center rounded-full border border-white">
                                        {itemCount}
                                    </span>
                                </div>
                                <span className="hidden sm:inline">View Cart ({new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(totalAmount)})</span>
                                <span className="sm:hidden">Cart</span>
                            </button>
                        )}
                    </div>
                
                    {/* Search Bar */}
                    <div className="relative group max-w-md w-full">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-red-500 transition-colors" size={20} />
                        <input 
                            type="text" 
                            placeholder={isStoreView ? "Search for stores or brands..." : "Find materials, brands, or suppliers..."} 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-100 rounded-3xl focus:ring-4 focus:ring-red-500/5 focus:border-red-500/50 outline-none transition-all shadow-sm"
                        />
                    </div>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                {/* Desktop Sidebar: Categories */}
                <div className="md:col-span-1 space-y-6">
                    <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm sticky top-6">
                        <h4 className="font-black text-gray-900 mb-6 flex items-center gap-3 text-xs uppercase tracking-widest">
                            <Menu size={16} className="text-red-500" /> Categories
                        </h4>
                        <div className="space-y-1">
                            {categories.map(cat => (
                                <button 
                                    key={cat} 
                                    onClick={() => setActiveCategory(cat)}
                                    className={`w-full text-left px-4 py-3 rounded-2xl text-sm font-bold transition-all flex items-center justify-between group ${
                                        activeCategory === cat 
                                        ? 'bg-red-50 text-red-500 shadow-sm' 
                                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                                    }`}
                                >
                                    {cat}
                                    <ChevronRight size={14} className={`transition-all ${
                                        activeCategory === cat ? 'translate-x-1' : 'opacity-0 group-hover:opacity-100'
                                    }`} />
                                </button>
                            ))}
                        </div>
                        
                        <div className="mt-8 pt-8 border-t border-gray-100">
                             <div className="bg-zinc-900 p-6 rounded-3xl relative overflow-hidden group cursor-pointer">
                                 <Zap size={40} className="absolute -right-4 -bottom-4 text-white/10 group-hover:scale-150 transition-transform duration-700 font-sans" />
                                 <h5 className="text-white font-bold text-xs mb-2">Need bulk pricing?</h5>
                                 <p className="text-zinc-400 text-[10px] mb-4 leading-relaxed">Connect directly with wholesalers for better rates.</p>
                                 <button className="w-full py-2 bg-white text-gray-900 text-[10px] font-black rounded-xl uppercase tracking-widest transition-all hover:bg-red-500 hover:text-white">Request RFQ</button>
                             </div>
                        </div>
                    </div>
                </div>

                {/* Main Content: Material Grid or Store Grid */}
                <div className="md:col-span-3">
                    {isLoading ? (
                        <div className="w-full h-96 flex flex-col items-center justify-center gap-4 bg-white/50 backdrop-blur-sm rounded-[2.5rem] border border-gray-50">
                            <Loader2 className="w-12 h-12 text-red-500 animate-spin" />
                            <p className="text-gray-400 font-bold uppercase tracking-widest text-xs animate-pulse">Syncing Marketplace Catalog...</p>
                        </div>
                    ) : isStoreView ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <AnimatePresence>
                                {filteredSuppliers.map((supplier) => (
                                    <SupplierCard 
                                        key={supplier.id} 
                                        supplier={supplier} 
                                        onClick={() => onOpenStore?.(supplier.id)}
                                    />
                                ))}
                            </AnimatePresence>
                        </div>
                    ) : filteredMaterials.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            <AnimatePresence>
                                {filteredMaterials.map((material) => (
                                    <MaterialCard 
                                        key={material.id} 
                                        material={material} 
                                        onOpenDetails={() => onOpenDetails?.(material)}
                                    />
                                ))}
                            </AnimatePresence>
                        </div>
                    ) : (
                        <div className="bg-white border border-gray-100 rounded-[2.5rem] p-20 text-center flex flex-col items-center justify-center min-h-[500px]">
                            <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-8 relative">
                                <Package size={40} className="text-gray-200" />
                                <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white border-2 border-white">
                                    <Search size={12} />
                                </div>
                            </div>
                            <h3 className="text-2xl font-black text-gray-900 mb-2">No materials found</h3>
                            <p className="text-gray-500 max-w-sm mx-auto mb-8 font-medium italic">We couldn't find any materials matching "{searchQuery}" in the {activeCategory} category.</p>
                            <button 
                                onClick={() => { setActiveCategory('All'); setSearchQuery(''); }}
                                className="px-8 py-3.5 bg-gray-900 text-white font-bold rounded-2xl hover:bg-gray-800 transition-all shadow-lg active:scale-95 transition-all text-xs uppercase tracking-widest"
                            >
                                Reset All Filters
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
