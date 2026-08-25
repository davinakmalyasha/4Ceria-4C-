import React from 'react';
import { Search, Grid, List, CheckCircle, Star, Filter, Heart, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { InteriorDesigner, InteriorSortOption, InteriorViewMode, INTERIOR_SPECS } from '../../types/interior.types';
import { useInterior } from '../../hooks/useInterior';
import { useFavorites } from '../../hooks/useFavorites';
import CustomDropdown from '../UI/CustomDropdown';
import { formatCurrency as formatIdr } from '../../types/explore';

const InteriorCard = ({ designer, viewMode, onSelect, isFav, onToggleFav }: { designer: InteriorDesigner; viewMode: InteriorViewMode; onSelect: (d: InteriorDesigner) => void; isFav: boolean; onToggleFav: (e: React.MouseEvent, id: number) => void; }) => {
    const isGrid = viewMode === 'grid';
    const expertBadge = (designer?.pengalaman_tahun || 0) > 5;
    const popularBadge = (designer?.rate_harga || 0) < 500000 && (designer?.pengalaman_tahun || 0) > 2;
    const isVerified = (designer as any)?.is_verified ?? expertBadge;

    return (
        <motion.div 
            whileHover={{ y: -4 }}
            className={`bg-white rounded-2xl hover:shadow-2xl hover:shadow-red-600/10 transition-all border border-zinc-100 overflow-hidden cursor-pointer group ${isGrid ? 'flex flex-col' : 'flex flex-row items-center p-4'}`}
            onClick={() => onSelect(designer)}
        >
            <div className={`relative ${isGrid ? 'w-full h-32 bg-zinc-50 flex items-center justify-center p-4' : 'w-24 h-24 shrink-0 rounded-xl overflow-hidden'}`}>
                {/* Red Accent Bar */}
                {isGrid && <div className="absolute top-0 left-0 w-full h-1.5 bg-red-600" />}
                
                <div className={`${isGrid ? 'w-20 h-20 -mb-12 shadow-xl z-10 scale-100 group-hover:scale-105 transition-transform duration-500' : 'w-full h-full'} rounded-full bg-zinc-900 flex items-center justify-center text-white font-bold text-2xl border-4 border-white overflow-hidden`}>
                    {designer?.user?.pic ? <img src={`/storage/${designer.user.pic}`} alt={designer?.nama || 'Designer'} className="w-full h-full object-cover" /> : (designer?.nama || 'D').charAt(0).toUpperCase()}
                    {!designer?.user?.pic && <div className="absolute inset-0 bg-gradient-to-br from-red-600/20 to-transparent" />}
                </div>
                <button onClick={(e) => onToggleFav(e, designer.id)} className={`absolute top-4 right-4 z-20 p-2 rounded-full backdrop-blur-md transition-all shadow-sm border ${isFav ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white/80 border-zinc-100 text-zinc-400 hover:bg-red-50 hover:text-red-600 hover:border-red-100'}`}>
                    <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                </button>
            </div>

            <div className={`p-6 ${isGrid ? 'pt-10 flex flex-col items-center text-center' : 'flex-1 pl-6 flex flex-col justify-center'}`}>
                <div className="flex items-center gap-1.5 mb-1 justify-center">
                    <h4 className="text-lg font-black text-zinc-900 line-clamp-1 decoration-red-600 group-hover:underline underline-offset-4 decoration-2">{designer?.nama || 'Interior Designer'}</h4>
                    {isVerified && <ShieldCheck className="w-4 h-4 text-red-600 shrink-0" />}
                </div>
                
                <div className="flex items-center gap-2 mb-4 justify-center">
                    <p className="text-xs font-bold uppercase tracking-wider text-red-600">{designer?.spesialisasi || 'Interior Umum'}</p>
                    <span className="text-zinc-300">|</span>
                    <div className="flex items-center gap-1 text-sm font-black text-zinc-900">
                        <Star className="w-3.5 h-3.5 fill-red-600 text-red-600" /> {designer?.average_rating ? Number(designer.average_rating).toFixed(1) : "New"}
                    </div>
                </div>

                <div className={`flex gap-1.5 ${isGrid ? 'justify-center w-full mt-1' : ''} mb-5 flex-wrap`}>
                    {isVerified && <span className="bg-red-50 text-red-700 text-[10px] font-black uppercase tracking-tighter px-2 py-0.5 rounded border border-red-100 flex items-center gap-1">Verified</span>}
                    {expertBadge && <span className="bg-zinc-900 text-white text-[10px] font-black uppercase tracking-tighter px-2 py-0.5 rounded flex items-center gap-1"><ShieldCheck className="w-2.5 h-2.5" /> Expert</span>}
                    {popularBadge && <span className="bg-red-600 text-white text-[10px] font-black uppercase tracking-tighter px-2 py-0.5 rounded">Popular</span>}
                    <span className="bg-zinc-100 text-zinc-600 text-[10px] font-black uppercase tracking-tighter px-2 py-0.5 rounded border border-zinc-200">{designer?.pengalaman_tahun || 0} Yrs</span>
                </div>

                <div className={`mt-auto pt-4 border-t border-zinc-50 w-full flex items-center ${isGrid ? 'justify-center' : 'justify-between'}`}>
                    <div className="text-center">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Rate per Hour</span>
                        <span className="text-xl font-black text-zinc-900">{formatIdr(designer?.rate_harga || 0)}</span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default function ExploreInterior({ designers, isLoading, onSelectDesigner }: { designers: InteriorDesigner[]; isLoading: boolean; onSelectDesigner: (d: InteriorDesigner) => void; }) {
    const { viewMode, setViewMode, filters, setFilters, designers: displayed, hasMore, loadMore } = useInterior(designers);
    const { isFavorite, toggleFavorite } = useFavorites('v1_fav_interior');

    const handleToggleFav = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        toggleFavorite(id);
    };

    return (
        <div className="space-y-6 w-full max-w-7xl mx-auto pb-10">
            <div className="flex flex-col gap-2 relative z-10">
                <h3 className="text-3xl font-black text-gray-900">Find Your Interior Designer</h3>
                <p className="text-gray-500">Discover top-rated interior designers to furnish and beautify your space.</p>
            </div>

            {/* Premium Control Bar */}
            <div className="bg-white p-4 rounded-2xl shadow-xl shadow-zinc-200/50 border border-zinc-100 flex flex-col md:flex-row gap-4 items-center justify-between mb-8 relative z-20">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                    <input type="text" placeholder="Search by name or style..." value={filters.query} onChange={(e) => setFilters(p => ({ ...p, query: e.target.value }))} className="w-full pl-11 pr-4 py-3 bg-zinc-50 border-zinc-100 focus:bg-white focus:border-red-600 focus:ring-4 focus:ring-red-600/5 rounded-xl transition-all font-medium text-zinc-900" />
                </div>
                
                <div className="flex w-full md:w-auto gap-3 items-center flex-wrap md:flex-nowrap">
                    <CustomDropdown 
                        options={INTERIOR_SPECS.map(s => ({ label: s, value: s }))}
                        value={filters.specialization}
                        onChange={(v) => setFilters(p => ({ ...p, specialization: v }))}
                        icon={<Filter className="w-4 h-4" />}
                        className="w-48 shrink-0"
                    />

                    <CustomDropdown 
                        options={[
                            { label: 'Best Match', value: 'recommended' },
                            { label: 'Price: Low to High', value: 'price_asc' },
                            { label: 'Price: High to Low', value: 'price_desc' },
                            { label: 'Most Experienced', value: 'experience_desc' }
                        ]}
                        value={filters.sort}
                        onChange={(v) => setFilters(p => ({ ...p, sort: v as InteriorSortOption }))}
                        className="w-48 shrink-0"
                    />

                    <div className="flex bg-gray-100 p-1 rounded-xl">
                        {[{ id: 'grid', icon: Grid }, { id: 'list', icon: List }].map(m => (
                            <button key={m.id} onClick={() => setViewMode(m.id as any)} className={`p-2 rounded-lg transition-colors ${viewMode === m.id ? 'bg-white shadow text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                                <m.icon className="w-4 h-4" />
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Results */}
            {isLoading ? (
                <div className="text-center py-20 text-gray-400 font-medium">Loading professionals...</div>
            ) : displayed.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                    <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No interior designers found matching your criteria.</p>
                </div>
            ) : (
                <>
                    <div className={`max-w-7xl mx-auto w-full grid gap-6 ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1 md:grid-cols-2'}`}>
                        {displayed.map(designer => (
                            <InteriorCard key={designer.id || Math.random()} designer={designer} viewMode={viewMode} onSelect={onSelectDesigner} isFav={isFavorite(designer.id)} onToggleFav={handleToggleFav} />
                        ))}
                    </div>
                    {hasMore && (
                        <div className="mt-10 text-center">
                            <button onClick={loadMore} className="bg-zinc-900 hover:bg-red-600 text-white font-black py-4 px-10 rounded-full transition-all shadow-lg hover:shadow-red-600/20 active:scale-95 uppercase tracking-widest text-xs">
                                Load More Professionals &darr;
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
