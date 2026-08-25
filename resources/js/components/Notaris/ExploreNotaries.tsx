import React, { useState, useMemo } from 'react';
import { Search, Grid, List, CheckCircle, Star, Filter, Heart, Gavel, Scale, ShieldCheck, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatCurrency as formatIdr } from '../../types/explore';

interface Notary {
    id: number;
    nama: string;
    wilayah_kerja: string;
    nomor_sk: string;
    spesialisasi: string;
    rate_harga: number;
    pengalaman_tahun: number;
    average_rating?: number;
    user?: {
        pic?: string;
    };
    is_verified?: boolean;
    services?: any[];
}

const NotaryCard = ({ notary, viewMode, onSelect }: { notary: Notary; viewMode: 'grid' | 'list'; onSelect: (n: Notary) => void; }) => {
    const isGrid = viewMode === 'grid';
    const isVerified = notary.is_verified ?? (notary.pengalaman_tahun > 10);
    const serviceCount = notary.services?.length || 0;

    return (
        <motion.div 
            whileHover={{ y: -4 }}
            className={`bg-white rounded-2xl hover:shadow-2xl hover:shadow-blue-600/10 transition-all border border-zinc-100 overflow-hidden cursor-pointer group ${isGrid ? 'flex flex-col' : 'flex flex-row items-center p-4'}`}
            onClick={() => onSelect(notary)}
        >
            <div className={`relative ${isGrid ? 'w-full h-32 bg-zinc-50 flex items-center justify-center p-4' : 'w-24 h-24 shrink-0 rounded-xl overflow-hidden'}`}>
                {/* Legal Accent Bar */}
                {isGrid && <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-900" />}
                
                <div className={`${isGrid ? 'w-20 h-20 -mb-12 shadow-xl z-10' : 'w-full h-full'} rounded-full bg-zinc-900 flex items-center justify-center text-white font-bold text-2xl border-4 border-white overflow-hidden`}>
                    {notary?.user?.pic ? <img src={`/storage/${notary.user.pic}`} alt={notary.nama} className="w-full h-full object-cover" /> : notary.nama.charAt(0).toUpperCase()}
                </div>

                {serviceCount > 0 && isGrid && (
                    <div className="absolute top-4 right-4 bg-blue-900 text-white text-[8px] font-black uppercase px-2 py-1 rounded-full shadow-lg border border-white/20 backdrop-blur-md">
                        {serviceCount} Services
                    </div>
                )}
            </div>

            <div className={`p-6 ${isGrid ? 'pt-10 flex flex-col items-center text-center' : 'flex-1 pl-6 flex flex-col justify-center'}`}>
                <div className="flex items-center gap-1.5 mb-1 justify-center">
                    <h4 className="text-lg font-black text-zinc-900 line-clamp-1">{notary.nama}</h4>
                    {isVerified && <ShieldCheck className="w-4 h-4 text-blue-900 shrink-0" />}
                </div>
                
                <div className="flex items-center gap-2 mb-4 justify-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-900">{notary.spesialisasi || 'Notaris & PPAT'}</p>
                    <span className="text-zinc-300">|</span>
                    <div className="flex items-center gap-1 text-sm font-black text-zinc-900">
                        <Star className="w-3.5 h-3.5 fill-yellow-500 text-yellow-500" /> {notary.average_rating ? Number(notary.average_rating).toFixed(1) : "New"}
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-5 justify-center">
                    <span className="bg-blue-50 text-blue-900 text-[10px] font-black uppercase px-2 py-0.5 rounded border border-blue-100 flex items-center gap-1">
                        <MapPin size={10} /> {notary.wilayah_kerja}
                    </span>
                    <span className="bg-zinc-100 text-zinc-600 text-[10px] font-black uppercase px-2 py-0.5 rounded border border-zinc-200">
                        {notary.pengalaman_tahun} Yrs Exp
                    </span>
                </div>

                <div className="mt-auto pt-4 border-t border-zinc-50 w-full flex items-center justify-between">
                    <div className="text-left">
                        <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Consult Fee</span>
                        <span className="text-sm font-black text-zinc-900">{formatIdr(notary.rate_harga || 0)}</span>
                    </div>
                    
                    <button 
                        className="px-4 py-2 bg-blue-900 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-black transition-colors"
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect(notary);
                        }}
                    >
                        Inquire
                    </button>
                </div>
            </div>
        </motion.div>
    );
};

export default function ExploreNotaries({ notaries, isLoading, onSelect }: { notaries: Notary[]; isLoading: boolean; onSelect: (n: Notary) => void; }) {
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        return notaries.filter(n => n.nama.toLowerCase().includes(search.toLowerCase()) || n.wilayah_kerja.toLowerCase().includes(search.toLowerCase()));
    }, [notaries, search]);

    return (
        <div className="space-y-6 w-full max-w-7xl mx-auto pb-10">
            <div className="flex flex-col gap-2">
                <h3 className="text-3xl font-black text-gray-900">Notaris & PPAT Services</h3>
                <p className="text-gray-500">Secure your property transactions with our verified legal experts.</p>
            </div>

            <div className="bg-white p-4 rounded-2xl shadow-xl shadow-zinc-200/50 border border-zinc-100 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                    <input 
                        type="text" 
                        placeholder="Search by name or city..." 
                        value={search} 
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-zinc-50 border-zinc-100 focus:bg-white focus:border-blue-900 rounded-xl transition-all font-medium text-zinc-900" 
                    />
                </div>
                
                <div className="flex bg-gray-100 p-1 rounded-xl">
                    {[{ id: 'grid', icon: Grid }, { id: 'list', icon: List }].map(m => (
                        <button key={m.id} onClick={() => setViewMode(m.id as any)} className={`p-2 rounded-lg transition-colors ${viewMode === m.id ? 'bg-white shadow text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                            <m.icon className="w-4 h-4" />
                        </button>
                    ))}
                </div>
            </div>

            {isLoading ? (
                <div className="text-center py-20 text-gray-400 font-medium">Loading notaries...</div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                    <Scale className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No legal professionals found matching your criteria.</p>
                </div>
            ) : (
                <div className={`grid gap-6 ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1 md:grid-cols-2'}`}>
                    {filtered.map(notary => (
                        <NotaryCard key={notary.id} notary={notary} viewMode={viewMode} onSelect={onSelect} />
                    ))}
                </div>
            )}
        </div>
    );
}
