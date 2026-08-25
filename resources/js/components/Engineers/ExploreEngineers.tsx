import React, { useState, useMemo } from 'react';
import { Search, Grid, List, Star, Filter, Heart, ShieldCheck, Zap, HardHat } from 'lucide-react';
import { motion } from 'framer-motion';
import CustomDropdown from '../UI/CustomDropdown';
import { formatCurrency as formatIdr } from '../../types/explore';

interface Engineer {
    id: number;
    nama: string;
    specialization?: string;
    rate_harga?: number;
    pengalaman_tahun?: number;
    average_rating?: number;
    is_verified?: boolean;
    user?: {
        pic?: string;
    };
}

const EngineerCard = ({ engineer, viewMode, onSelect, type }: { engineer: Engineer; viewMode: 'grid' | 'list'; onSelect: (e: Engineer) => void; type: 'structural' | 'mep'; }) => {
    const isGrid = viewMode === 'grid';
    const isVerified = engineer.is_verified ?? true;

    return (
        <motion.div 
            whileHover={{ y: -4 }}
            className={`bg-white rounded-2xl hover:shadow-2xl hover:shadow-slate-900/10 transition-all border border-zinc-100 overflow-hidden cursor-pointer group ${isGrid ? 'flex flex-col' : 'flex flex-row items-center p-4'}`}
            onClick={() => onSelect(engineer)}
        >
            <div className={`relative ${isGrid ? 'w-full h-32 bg-slate-50 flex items-center justify-center p-4' : 'w-24 h-24 shrink-0 rounded-xl overflow-hidden'}`}>
                <div className="absolute top-0 left-0 w-full h-1.5 bg-slate-900" />
                
                <div className={`${isGrid ? 'w-20 h-20 -mb-12 shadow-xl z-10 scale-100 group-hover:scale-105 transition-transform duration-500' : 'w-full h-full'} rounded-full bg-slate-900 flex items-center justify-center text-white font-bold text-2xl border-4 border-white overflow-hidden`}>
                    {engineer?.user?.pic ? <img src={`/storage/${engineer.user.pic}`} alt={engineer?.nama} className="w-full h-full object-cover" /> : (engineer?.nama || 'E').charAt(0).toUpperCase()}
                </div>
            </div>

            <div className={`p-6 ${isGrid ? 'pt-10 flex flex-col items-center text-center' : 'flex-1 pl-6 flex flex-col justify-center'}`}>
                <div className="flex items-center gap-1.5 mb-1 justify-center">
                    <h4 className="text-lg font-black text-zinc-900 line-clamp-1">{engineer?.nama || 'Engineer'}</h4>
                    {isVerified && <ShieldCheck className="w-4 h-4 text-slate-900 shrink-0" />}
                </div>
                
                <div className="flex items-center gap-2 mb-4 justify-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{type === 'structural' ? 'Structural' : 'MEP'} Engineering</p>
                    <span className="text-zinc-200">•</span>
                    <div className="flex items-center gap-1 text-xs font-black text-zinc-900">
                        <Star className="w-3 h-3 fill-slate-900 text-slate-900" /> {engineer?.average_rating ? Number(engineer.average_rating).toFixed(1) : "New"}
                    </div>
                </div>

                <div className={`flex gap-1.5 ${isGrid ? 'justify-center w-full mt-1' : ''} mb-5 flex-wrap`}>
                    <span className="bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded flex items-center gap-1">
                        <Zap size={10} /> Certified
                    </span>
                    <span className="bg-zinc-100 text-zinc-600 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-zinc-200">
                        {engineer?.pengalaman_tahun || 0} Yrs Experience
                    </span>
                </div>

                <div className={`mt-auto pt-4 border-t border-zinc-50 w-full flex items-center ${isGrid ? 'justify-center' : 'justify-between'}`}>
                    <div className="text-center">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Est. Rate</span>
                        <span className="text-lg font-black text-zinc-900">{formatIdr(engineer?.rate_harga || 500000)}</span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default function ExploreEngineers({ engineers, isLoading, onSelect, type }: { engineers: Engineer[]; isLoading: boolean; onSelect: (e: Engineer) => void; type: 'structural' | 'mep'; }) {
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [query, setQuery] = useState('');

    const filtered = useMemo(() => {
        return (engineers || []).filter(e => (e?.nama || '').toLowerCase().includes(query.toLowerCase()));
    }, [engineers, query]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-8">
                <div className="relative w-full md:w-80">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input 
                        type="text" 
                        placeholder={`Search ${type.toUpperCase()}...`} 
                        value={query} 
                        onChange={(e) => setQuery(e.target.value)} 
                        className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border-zinc-100 focus:bg-white focus:border-slate-900 rounded-xl transition-all font-medium text-xs text-zinc-900" 
                    />
                </div>
                
                <div className="flex bg-gray-100 p-1 rounded-xl shrink-0">
                    {[{ id: 'grid', icon: Grid }, { id: 'list', icon: List }].map(m => (
                        <button 
                            key={m.id} 
                            onClick={() => setViewMode(m.id as any)} 
                            className={`p-1.5 rounded-lg transition-colors ${viewMode === m.id ? 'bg-white shadow text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <m.icon className="w-3.5 h-3.5" />
                        </button>
                    ))}
                </div>
            </div>

            {isLoading ? (
                <div className="text-center py-10 text-gray-400 font-black uppercase tracking-widest text-xs">Synchronizing Engineering Database...</div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-10 bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
                    <p className="text-zinc-400 font-black uppercase tracking-widest text-[10px]">No Specialists Found</p>
                </div>
            ) : (
                <div className={`grid gap-6 ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1 md:grid-cols-2'}`}>
                    {filtered.map(engineer => (
                        <EngineerCard key={engineer.id} engineer={engineer} viewMode={viewMode} onSelect={onSelect} type={type} />
                    ))}
                </div>
            )}
        </div>
    );
}
