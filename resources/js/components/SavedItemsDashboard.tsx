import React, { useState } from 'react';
import { Heart, Home, Users, Briefcase, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { House } from '../types/explore';
import { Architect } from '../types/architect.types';
import { ConstructorData } from '../types/constructor.types';
import { useFavorites } from '../hooks/useFavorites';
// We need the card components to display. Currently ArchitectCard/ConstructorCard are inside their Explore files.
// For the MVP of this dashboard, we will recreate simplified "mini-cards" tailored for the dashboard view to ensure <150 lines and absolute stability.

interface SavedItemsProps {
    houses: House[];
    architects: Architect[];
    constructors: ConstructorData[];
    onSelectHouse: (id: number) => void;
    onSelectArchitect: (a: Architect) => void;
    onSelectConstructor: (c: ConstructorData) => void;
}

export default function SavedItemsDashboard({ houses, architects, constructors, onSelectHouse, onSelectArchitect, onSelectConstructor }: SavedItemsProps) {
    const [activeTab, setActiveTab] = useState<'houses' | 'architects' | 'constructors'>('houses');
    
    // Using the same local storage keys established in the Explore views
    const { favorites: favHouses, toggleFavorite: toggleHouse } = useFavorites('house_wishlist');
    const { favorites: favArchitects, toggleFavorite: toggleArchitect } = useFavorites('v1_fav_architects');
    const { favorites: favConstructors, toggleFavorite: toggleConstructor } = useFavorites('v1_fav_constructors');

    const savedHouses = houses.filter(h => favHouses.includes(h.id));
    const savedArchitects = architects.filter(a => favArchitects.includes(a.id));
    const savedConstructors = constructors.filter(c => favConstructors.includes(c.id));

    const totalSaved = savedHouses.length + savedArchitects.length + savedConstructors.length;

    const tabs = [
        { id: 'houses', label: 'Saved Houses', icon: Home, count: savedHouses.length, data: savedHouses, onSelect: onSelectHouse, onRemove: toggleHouse, getId: (x: any) => x.id },
        { id: 'architects', label: 'Architects', icon: Users, count: savedArchitects.length, data: savedArchitects, onSelect: onSelectArchitect, onRemove: toggleArchitect, getId: (x: any) => x.id },
        { id: 'constructors', label: 'Constructors', icon: Briefcase, count: savedConstructors.length, data: savedConstructors, onSelect: onSelectConstructor, onRemove: toggleConstructor, getId: (x: any) => x.id },
    ] as const;

    const currentTabInfo = tabs.find(t => t.id === activeTab)!;

    const renderEmptyState = () => (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-gray-50 rounded-3xl border border-dashed border-gray-300">
            <Heart className="w-16 h-16 text-gray-300 mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">No items saved yet</h3>
            <p className="text-gray-500">Go explore the platform and click the heart icon to shortlist your favorites!</p>
        </div>
    );

    const renderHouseMiniCard = (h: House) => (
        <div key={h.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-all cursor-pointer group" onClick={() => onSelectHouse(h.id)}>
            <div className="w-20 h-20 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                {h.housePic?.[0]?.dir ? <img src={`/storage/${h.housePic[0].dir}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform" /> : <Home className="w-full h-full p-6 text-gray-200" />}
            </div>
            <div className="flex-1">
                <h4 className="font-bold text-gray-900 line-clamp-1">{h.name}</h4>
                <p className="text-xs text-gray-500">{h.address?.city || 'Unknown Location'}</p>
                <p className="text-[#FF2D20] font-black mt-1">Rp {h.price.toLocaleString('id-ID')}</p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); toggleHouse(h.id); }} className="p-3 text-red-500 hover:bg-red-50 rounded-full transition-colors"><Trash2 size={18} /></button>
        </div>
    );

    const renderProfessionalMiniCard = (p: any, type: 'architect' | 'constructor') => {
        const name = p.nama_perusahaan || p.nama || 'Professional';
        const role = type === 'architect' ? (p.spesialisasi || 'Arsitek') : (p.jenis || 'Kontraktor');
        const color = type === 'architect' ? 'text-red-600 bg-red-50' : 'text-blue-600 bg-blue-50';
        const toggle = type === 'architect' ? toggleArchitect : toggleConstructor;
        const select = type === 'architect' ? onSelectArchitect : onSelectConstructor;

        return (
            <div key={p.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-all cursor-pointer group" onClick={() => select(p)}>
                <div className={`w-16 h-16 rounded-full shrink-0 flex items-center justify-center font-bold text-xl overflow-hidden ${color}`}>
                    {p.user?.pic ? <img src={`/storage/${p.user.pic}`} className="w-full h-full object-cover" /> : name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                    <h4 className="font-bold text-gray-900 line-clamp-1">{name}</h4>
                    <p className="text-xs font-semibold text-gray-500">{role}</p>
                    <p className="text-sm font-black mt-1">Rp {(p.rate_harga || 500000).toLocaleString('id-ID')}<span className="text-xs font-normal text-gray-500">/hr</span></p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); toggle(p.id); }} className="p-3 text-red-500 hover:bg-red-50 rounded-full transition-colors"><Trash2 size={18} /></button>
            </div>
        );
    };

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-6xl mx-auto pb-20">
            <div className="flex flex-col gap-2 relative z-10">
                <h3 className="text-3xl font-black text-gray-900 flex items-center gap-3">
                    <Heart className="w-8 h-8 text-[#FF2D20] fill-[#FF2D20]" /> My Shortlist
                </h3>
                <p className="text-gray-500">You have saved <span className="font-bold text-gray-900">{totalSaved}</span> items across the platform.</p>
            </div>

            <div className="flex gap-2 p-1 bg-white border border-gray-100 rounded-2xl w-fit shadow-sm overflow-x-auto no-scrollbar">
                {tabs.map(tab => (
                    <button 
                        key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-white' : ''}`} />
                        {tab.label}
                        <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-900'}`}>{tab.count}</span>
                    </button>
                ))}
            </div>

            <div className="mt-8">
                {currentTabInfo.data.length === 0 ? renderEmptyState() : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {activeTab === 'houses' && currentTabInfo.data.map((h: any) => renderHouseMiniCard(h))}
                        {activeTab === 'architects' && currentTabInfo.data.map((a: any) => renderProfessionalMiniCard(a, 'architect'))}
                        {activeTab === 'constructors' && currentTabInfo.data.map((c: any) => renderProfessionalMiniCard(c, 'constructor'))}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
