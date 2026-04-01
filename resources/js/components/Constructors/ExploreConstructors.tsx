import React from 'react';
import { Search, Grid, List, CheckCircle, ShieldCheck, AlertTriangle, Filter, Heart, Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { ConstructorData, ConstructorSortOption, ConstructorViewMode, CONSTRUCTOR_TYPES } from '../../types/constructor.types';
import { useConstructors } from '../../hooks/useConstructors';
import { useFavorites } from '../../hooks/useFavorites';

const ConstructorCard = ({ cons, viewMode, onSelect, isFav, onToggleFav }: { cons: ConstructorData; viewMode: ConstructorViewMode; onSelect: (c: ConstructorData) => void; isFav: boolean; onToggleFav: (e: React.MouseEvent, id: number) => void; }) => {
    const isGrid = viewMode === 'grid';
    const isCompany = !!cons?.nama_perusahaan;
    const verifiedBadge = (cons?.pengalaman || 0) > 3;
    const certifiedBadge = !!cons?.siup || !!cons?.npwp;
    const displayName = cons?.nama_perusahaan || cons?.nama || 'Constructor';
    const mockRating = (((cons?.id || 1) % 5) * 0.1 + 4.5).toFixed(1);
    const mockReviews = ((cons?.id || 1) * 7) % 120 + 10;
    const isVerified = (cons as any)?.is_verified ?? verifiedBadge; // Fallback: experienced show as verified


    return (
        <div 
            className={`bg-white rounded-2xl hover:shadow-xl hover:shadow-blue-500/10 transition-all border border-gray-100 overflow-hidden cursor-pointer ${isGrid ? 'flex flex-col' : 'flex flex-row items-center p-4'}`}
            onClick={() => onSelect(cons)}
        >
            <div className={`relative ${isGrid ? 'w-full h-32 bg-gray-50 flex items-center justify-center p-4' : 'w-24 h-24 shrink-0 rounded-xl overflow-hidden'}`}>
                <div className={`${isGrid ? 'w-20 h-20 -mb-12 shadow-lg z-10' : 'w-full h-full'} rounded-full bg-gradient-to-br from-blue-600 to-blue-900 flex items-center justify-center text-white font-bold text-2xl border-4 border-white overflow-hidden`}>
                    {cons?.user?.pic ? <img src={`/storage/${cons.user.pic}`} alt={displayName} className="w-full h-full object-cover" /> : displayName.charAt(0).toUpperCase()}
                </div>
                <button onClick={(e) => onToggleFav(e, cons.id)} className={`absolute top-4 right-4 z-20 p-2 rounded-full backdrop-blur-md bg-white/70 hover:bg-white transition-colors shadow-sm`}>
                    <Heart className={`w-5 h-5 ${isFav ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
                </button>
            </div>

            <div className={`p-6 ${isGrid ? 'pt-10 flex flex-col items-center text-center' : 'flex-1 pl-6 flex flex-col justify-center'}`}>
                <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-lg font-extrabold text-gray-900 line-clamp-1">{displayName}</h4>
                    {isVerified && <ShieldCheck className="w-5 h-5 text-green-500 shrink-0" />}
                </div>

                <div className="flex items-center gap-2 mb-3">
                    <p className="text-sm font-medium text-blue-600">{cons?.jenis || 'Kontraktor Umum'}</p>
                    <span className="text-gray-300">•</span>
                    <div className="flex items-center gap-1 text-sm font-bold text-gray-900">
                        <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" /> {mockRating} <span className="text-gray-400 font-medium">({mockReviews})</span>
                    </div>
                </div>

                <div className={`flex gap-2 ${isGrid ? 'justify-center w-full mt-2' : ''} mb-4 flex-wrap`}>
                    {isVerified && <span className="bg-green-100 text-green-800 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Verified</span>}
                    {certifiedBadge && <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Certified</span>}
                    {isCompany && <span className="bg-purple-100 text-purple-800 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Corporate</span>}
                    <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2.5 py-1 rounded-full">{cons?.pengalaman || 0} Yrs Exp</span>
                </div>

                <div className={`mt-auto pt-4 border-t border-gray-50 w-full flex items-center ${isGrid ? 'justify-center' : 'justify-between'}`}>
                    <div className="text-center w-full">
                        <span className="text-sm text-gray-500 block">Based in {cons?.alamat || 'Indonesia'}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function ExploreConstructors({ constructors, isLoading, onSelectConstructor }: { constructors: ConstructorData[]; isLoading: boolean; onSelectConstructor: (c: ConstructorData) => void; }) {
    const { viewMode, setViewMode, filters, setFilters, constructors: displayed, hasMore, loadMore } = useConstructors(constructors);
    const { isFavorite, toggleFavorite } = useFavorites('v1_fav_constructors');

    const handleToggleFav = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        toggleFavorite(id);
    };

    return (
        <div className="space-y-6 w-full max-w-7xl mx-auto pb-10">
            <div className="flex flex-col gap-2 relative z-10">
                <h3 className="text-3xl font-black text-gray-900">Hire Top Constructors</h3>
                <p className="text-gray-500">Find reliable and experienced contractors to execute your project flawlessly.</p>
            </div>

            {/* Premium Control Bar */}
            <div className="bg-white p-4 rounded-2xl shadow-md border border-gray-100 flex flex-col md:flex-row gap-4 items-center justify-between mb-8">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input type="text" placeholder="Search constructors..." value={filters.query} onChange={(e) => setFilters(p => ({ ...p, query: e.target.value }))} className="w-full pl-11 pr-4 py-3 bg-gray-50 border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 rounded-xl transition-all" />
                </div>
                
                <div className="flex w-full md:w-auto gap-3 items-center overflow-x-auto no-scrollbar pb-1 md:pb-0">
                    <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl">
                        <Filter className="w-4 h-4 text-gray-400" />
                        <select value={filters.jenis} onChange={(e) => setFilters(p => ({ ...p, jenis: e.target.value }))} className="bg-transparent border-none text-sm font-medium text-gray-700 focus:ring-0 cursor-pointer">
                            {CONSTRUCTOR_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>

                    <select value={filters.sort} onChange={(e) => setFilters(p => ({ ...p, sort: e.target.value as ConstructorSortOption }))} className="bg-gray-50 px-4 py-3 border-none rounded-xl text-sm font-medium text-gray-700 cursor-pointer focus:ring-2 focus:ring-blue-200 focus:bg-white">
                        <option value="recommended">Best Match</option>
                        <option value="experience_desc">Most Experienced</option>
                        <option value="experience_asc">Newest</option>
                    </select>

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
                <div className="text-center py-20 text-gray-400 font-medium">Loading constructors...</div>
            ) : displayed.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                    <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No constructors found matching your criteria.</p>
                </div>
            ) : (
                <>
                    <div className={`max-w-7xl mx-auto w-full grid gap-6 ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1 md:grid-cols-2'}`}>
                        {displayed.map(cons => (
                            <ConstructorCard key={cons.id || Math.random()} cons={cons} viewMode={viewMode} onSelect={onSelectConstructor} isFav={isFavorite(cons.id)} onToggleFav={handleToggleFav} />
                        ))}
                    </div>
                    {hasMore && (
                        <div className="mt-10 text-center">
                            <button onClick={loadMore} className="bg-white border-2 border-gray-200 hover:border-blue-500 text-gray-700 hover:text-blue-500 font-bold py-3 px-8 rounded-full transition-all shadow-sm">
                                Load More Professionals &darr;
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
