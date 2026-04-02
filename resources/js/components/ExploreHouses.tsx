import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Home, Search, Clock, BarChart3, BedDouble, Star,
    SlidersHorizontal, ArrowUpDown, LayoutGrid, List,
    ChevronLeft, ChevronRight, X
} from 'lucide-react';
import type { House } from '../types/explore';
import { formatCurrency, ITEMS_PER_PAGE } from '../types/explore';
import { useExploreHouses } from '../hooks/useExploreHouses';
import ExploreMap from './Explore/ExploreMap';
import FilterPanel from './Explore/FilterPanel';
import HouseCard, { SkeletonCard } from './Explore/HouseCard';
import HouseDetailsModal from './Explore/HouseDetailsModal';
import CompareTool from './Explore/CompareTool';

interface ExploreHousesProps {
    houses: House[];
    isLoading?: boolean;
    onSelectHouse?: (id: number) => void;
}

export default function ExploreHouses({ houses = [], isLoading = false, onSelectHouse }: ExploreHousesProps) {
    const s = useExploreHouses({ houses, onSelectHouse });

    return (
        <div className="flex flex-col gap-8">
            {/* Map */}
            <ExploreMap
                processedHouses={s.processedHouses} allHouses={houses} mapRef={s.mapRef as any}
                userLocation={s.userLocation} searchQuery={s.searchQuery} setSearchQuery={s.setSearchQuery}
                selectedCity={s.selectedCity} setSelectedCity={s.setSelectedCity}
                isDropdownOpen={s.isDropdownOpen} setIsDropdownOpen={s.setIsDropdownOpen}
                dropdownRef={s.dropdownRef as any} cities={s.cities}
                popupInfo={s.popupInfo} setPopupInfo={s.setPopupInfo}
                onFlyToUser={s.flyToUser} onSelectHouse={s.fetchHouseDetails}
            />

            {/* Quick Search - Above Stats */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative group">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#FF2D20] transition-colors" />
                <input 
                    type="text" 
                    placeholder="Search properties by name, city, or street address..."
                    value={s.searchQuery}
                    onChange={(e) => s.setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-12 py-3.5 bg-white border border-gray-200 rounded-2xl text-sm font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-4 focus:ring-[#FF2D20]/5 focus:border-[#FF2D20] transition-all shadow-sm group-hover:border-gray-300"
                />
                {s.searchQuery && (
                    <button 
                        onClick={() => s.setSearchQuery('')}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
                    >
                        <X size={14} />
                    </button>
                )}
            </motion.div>

            {/* Quick Stats */}
            {s.quickStats && (
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
                    {[
                        { icon: BarChart3, label: 'Avg Market Price', value: formatCurrency(s.quickStats.avgPrice), variant: 'gray' },
                        { icon: BedDouble, label: 'Most Common', value: `${s.quickStats.commonBed} Bedrooms`, variant: 'gray' },
                        { icon: Star, label: 'Hot Market', value: `${s.quickStats.newThisWeek} new this week`, variant: 'red' },
                    ].map((stat, i) => (
                        <div key={i} className="flex items-center gap-3 bg-white px-5 py-3 rounded-2xl border border-gray-100 shadow-sm shrink-0">
                            <div className={`p-2 rounded-xl ${stat.variant === 'red' ? 'bg-red-50 text-[#FF2D20]' : 'bg-gray-100 text-gray-500'}`}><stat.icon size={18} /></div>
                            <div><p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">{stat.label}</p><p className="font-extrabold text-gray-900">{stat.value}</p></div>
                        </div>
                    ))}
                </div>
            )}

            {/* Recently Viewed */}
            {s.recentHouses.length > 0 && (
                <div>
                    <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2"><Clock size={16} className="text-[#FF2D20]" /> Recently Viewed</h4>
                    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
                        {s.recentHouses.map(h => (
                            <div key={`recent-${h.id}`} onClick={() => s.fetchHouseDetails(h.id)} className="w-[200px] shrink-0 bg-white rounded-xl border border-gray-100 shadow-sm p-2 flex gap-3 cursor-pointer hover:border-[#FF2D20] transition-colors group">
                                <div className="w-16 h-16 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                                    {h.housePic?.length ? <img src={`/storage/${h.housePic[0].dir}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform" /> : <Home size={20} className="m-auto mt-4 text-gray-400" />}
                                </div>
                                <div className="flex flex-col justify-center overflow-hidden">
                                    <p className="text-[11px] font-bold text-gray-900 truncate">{h.name}</p>
                                    <p className="text-[10px] text-gray-500 truncate">{h.address?.city}</p>
                                    <p className="text-[10px] font-bold text-[#FF2D20] mt-1">{formatCurrency(h.price)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <h3 className="text-2xl font-bold text-gray-900">Featured Listings</h3>
                    <div className="flex items-center gap-3">
                        <button onClick={() => s.setShowFilters(!s.showFilters)}
                            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold border transition-all ${s.showFilters ? 'bg-[#FF2D20] text-white border-[#FF2D20] shadow-[0_4px_14px_rgba(255,45,32,0.3)]' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 shadow-sm'}`}>
                            <SlidersHorizontal size={15} /> Filters
                            {s.activeFilterCount > 0 && <span className="bg-white/20 text-[10px] font-black px-1.5 py-0.5 rounded-full">{s.activeFilterCount}</span>}
                        </button>
                        <select value={s.sortBy} onChange={(e) => s.setSortBy(e.target.value as typeof s.sortBy)}
                            className="px-5 py-3 rounded-2xl text-sm font-bold bg-white border border-gray-200 text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D20]/20 cursor-pointer hover:border-gray-300 transition-all appearance-none pr-10"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}>
                            <option value="default">Sort: Default</option>
                            <option value="price_asc">Price: Low → High</option>
                            <option value="price_desc">Price: High → Low</option>
                            <option value="newest">Newest First</option>
                            <option value="most_viewed">Most Viewed</option>
                            {s.userLocation && <option value="nearest">Nearest to Me</option>}
                        </select>
                        <div className="flex bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden p-1">
                            <button onClick={() => s.setViewMode('grid')} className={`p-2 rounded-xl transition-all ${s.viewMode === 'grid' ? 'bg-[#FF2D20] text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}><LayoutGrid size={16} /></button>
                            <button onClick={() => s.setViewMode('list')} className={`p-2 rounded-xl transition-all ${s.viewMode === 'list' ? 'bg-[#FF2D20] text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}><List size={16} /></button>
                        </div>
                    </div>
                </div>
                <FilterPanel showFilters={s.showFilters} priceRange={s.priceRange} setPriceRange={s.setPriceRange} priceBounds={s.priceBounds}
                    minBedrooms={s.minBedrooms} setMinBedrooms={s.setMinBedrooms} minBathrooms={s.minBathrooms} setMinBathrooms={s.setMinBathrooms}
                    minArea={s.minArea} setMinArea={s.setMinArea} activeFilterCount={s.activeFilterCount} processedCount={s.processedHouses.length} onReset={s.resetAllFilters} />
            </div>

            {/* House Grid / List */}
            <div>
                {isLoading ? (
                    <div className={`${s.viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-8' : 'flex flex-col gap-6'}`}>
                        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} viewMode={s.viewMode} />)}
                    </div>
                ) : s.processedHouses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                        <Search size={48} className="mb-4 opacity-30" />
                        <p className="text-lg font-semibold text-gray-500">No properties found</p>
                        <p className="text-sm mt-1">Try adjusting your search or filters</p>
                        <button onClick={s.resetAllFilters} className="mt-4 px-6 py-2 bg-[#FF2D20] text-white rounded-lg text-sm font-bold hover:bg-red-600 transition-colors">Clear All Filters</button>
                    </div>
                ) : (
                    <div className={`${s.viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-8' : 'flex flex-col gap-6'}`}>
                        {s.paginatedHouses.map(house => (
                            <HouseCard key={house.id} house={house} viewMode={s.viewMode} wishlist={s.wishlist} compareIds={s.compareIds}
                                processedHouses={s.processedHouses} sortBy={s.sortBy} userLocation={s.userLocation}
                                onToggleWishlist={s.toggleWishlist} onToggleCompare={s.toggleCompare} onSelect={s.fetchHouseDetails} />
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {s.processedHouses.length > ITEMS_PER_PAGE && (
                    <div className="flex items-center justify-center gap-2 mt-10">
                        <button onClick={() => s.setCurrentPage(p => Math.max(1, p - 1))} disabled={s.currentPage === 1}
                            className="p-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"><ChevronLeft size={18} /></button>
                        {Array.from({ length: s.totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === s.totalPages || Math.abs(p - s.currentPage) <= 1).map((page, idx, arr) => (
                            <React.Fragment key={page}>
                                {idx > 0 && arr[idx - 1] !== page - 1 && <span className="px-1 text-gray-300">...</span>}
                                <button onClick={() => s.setCurrentPage(page)}
                                    className={`min-w-[40px] h-10 rounded-xl text-sm font-bold transition-all ${s.currentPage === page ? 'bg-[#FF2D20] text-white shadow-[0_4px_12px_rgba(255,45,32,0.3)]' : 'border border-gray-200 text-gray-600 hover:bg-gray-50 shadow-sm'}`}>{page}</button>
                            </React.Fragment>
                        ))}
                        <button onClick={() => s.setCurrentPage(p => Math.min(s.totalPages, p + 1))} disabled={s.currentPage === s.totalPages}
                            className="p-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"><ChevronRight size={18} /></button>
                    </div>
                )}
            </div>

            {/* Details Modal */}
            <AnimatePresence>
                {s.selectedHouseId && s.expandedHouse && (
                    <HouseDetailsModal house={s.expandedHouse} allHouses={houses} wishlist={s.wishlist}
                        onClose={() => s.setSelectedHouseId(null)} onToggleWishlist={s.toggleWishlist} onSelectHouse={s.fetchHouseDetails} />
                )}
            </AnimatePresence>

            {/* Compare Tool */}
            <CompareTool compareIds={s.compareIds} setCompareIds={s.setCompareIds} compareHouses={s.compareHouses}
                showCompare={s.showCompare} setShowCompare={s.setShowCompare} onToggleCompare={s.toggleCompare} onSelectHouse={s.fetchHouseDetails} />
        </div>
    );
}
