import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Search, Filter, Edit2, Trash2, Box, Package, CheckCircle, XCircle, AlertCircle, ShoppingCart, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import MaterialFormModal from './MaterialFormModal.tsx';

export default function MerchantInventory() {
    const [materials, setMaterials] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingMaterial, setEditingMaterial] = useState<any>(null);
    const [isDeleting, setIsDeleting] = useState<number | null>(null);

    const fetchMaterials = async () => {
        setIsLoading(true);
        try {
            // Reusing the index method, but filter by the current supplier logic 
            // In a real app, this should probably be a dedicated /merchant/materials endpoint
            const res = await axios.get('/merchant/materials'); 
            setMaterials(res.data.data || []);
        } catch (err) {
            console.error('Failed to fetch inventory', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchMaterials();
    }, []);

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this material?')) return;
        setIsDeleting(id);
        try {
            await axios.delete(`/merchant/materials/${id}`);
            setMaterials(prev => prev.filter(m => m.id !== id));
        } catch (err) {
            alert('Failed to delete material');
        } finally {
            setIsDeleting(null);
        }
    };

    const handleToggleAvailability = async (material: any) => {
        try {
            const res = await axios.put(`/merchant/materials/${material.id}`, {
                is_available: !material.is_available
            });
            setMaterials(prev => prev.map(m => m.id === material.id ? res.data.data : m));
        } catch (err) {
            console.error('Toggle failed', err);
        }
    };

    const filteredMaterials = materials.filter(m => 
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.category.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="relative flex-1 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-red-500 transition-colors" size={18} />
                    <input 
                        type="text" 
                        placeholder="Search inventory by name or category..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-white border border-gray-100 rounded-2xl focus:ring-4 focus:ring-red-500/5 focus:border-red-500/50 outline-none transition-all shadow-sm"
                    />
                </div>
                <div className="flex items-center gap-3">
                    <button className="p-3 bg-white border border-gray-100 text-gray-500 rounded-2xl hover:bg-gray-50 transition-all shadow-sm">
                        <Filter size={20} />
                    </button>
                    <button 
                        onClick={() => { setEditingMaterial(null); setShowModal(true); }}
                        className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white font-bold rounded-2xl hover:bg-gray-800 transition-all shadow-lg shadow-gray-200 active:scale-95"
                    >
                        <Plus size={20} /> Add Material
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center p-20 gap-4">
                    <Loader2 className="w-10 h-10 text-red-500 animate-spin" />
                    <p className="text-gray-400 font-medium animate-pulse">Syncing your catalog...</p>
                </div>
            ) : filteredMaterials.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    <AnimatePresence>
                        {filteredMaterials.map((m) => (
                            <motion.div 
                                key={m.id}
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm group hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300 flex flex-col"
                            >
                                <div className="aspect-[4/3] bg-gray-50 relative overflow-hidden">
                                    {m.image_path ? (
                                        <img src={`/storage/${m.image_path}`} alt={m.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Package size={48} className="text-gray-200" />
                                        </div>
                                    )}
                                    <div className="absolute top-4 left-4">
                                        <span className="px-3 py-1 bg-white/90 backdrop-blur-md rounded-full text-[10px] font-black text-gray-900 uppercase tracking-widest shadow-sm">
                                            {m.category}
                                        </span>
                                    </div>
                                    <div className="absolute top-4 right-4 flex gap-2 translate-y-[-10px] opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                                        <button 
                                            onClick={() => { setEditingMaterial(m); setShowModal(true); }}
                                            className="p-2 bg-white text-gray-600 rounded-xl hover:text-blue-500 shadow-lg transition-colors"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button 
                                            onClick={() => handleDelete(m.id)}
                                            disabled={isDeleting === m.id}
                                            className="p-2 bg-white text-gray-600 rounded-xl hover:text-red-500 shadow-lg transition-colors"
                                        >
                                            {isDeleting === m.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                        </button>
                                    </div>
                                </div>
                                <div className="p-5 flex-1 flex flex-col">
                                    <h4 className="font-bold text-gray-900 mb-1 group-hover:text-red-500 transition-colors">{m.name}</h4>
                                    <div className="flex items-center gap-2 mb-4">
                                        <span className="text-sm font-black text-gray-900">Rp {parseInt(m.price).toLocaleString()}</span>
                                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">/ {m.unit}</span>
                                    </div>
                                    <div className="mt-auto pt-4 border-t border-dotted border-gray-100 flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <Box size={14} className="text-gray-400" />
                                            <span className="text-xs font-bold text-gray-500 tracking-tight">{m.stock} In Stock</span>
                                        </div>
                                        <button 
                                            onClick={() => handleToggleAvailability(m)}
                                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                                m.is_available ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'
                                            }`}
                                        >
                                            {m.is_available ? <CheckCircle size={10} /> : <XCircle size={10} />}
                                            {m.is_available ? 'Available' : 'Draft'}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            ) : (
                <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-[2.5rem] p-20 text-center">
                    <div className="w-20 h-20 bg-white rounded-3xl shadow-sm flex items-center justify-center mx-auto mb-6 transform rotate-3">
                        <Package size={32} className="text-gray-300" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">No items in your catalog</h3>
                    <p className="text-gray-500 max-w-sm mx-auto mb-8">Start adding your building materials to make them visible to thousands of builders.</p>
                    <button 
                        onClick={() => { setEditingMaterial(null); setShowModal(true); }}
                        className="px-8 py-3 bg-gray-900 text-white font-bold rounded-2xl hover:bg-gray-800 transition-all shadow-lg active:scale-95"
                    >
                        Add Your First Material
                    </button>
                </div>
            )}

            {showModal && (
                <MaterialFormModal 
                    material={editingMaterial}
                    onClose={() => setShowModal(false)}
                    onSuccess={() => {
                        setShowModal(false);
                        fetchMaterials();
                    }}
                />
            )}
        </div>
    );
}
