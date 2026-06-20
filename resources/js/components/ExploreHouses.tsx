import React from 'react';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
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
import CompareTool from './Explore/CompareTool';

interface ExploreHousesProps {
    houses: House[];
    isLoading?: boolean;
    onSelectHouse?: (id: number) => void;
}

export default function ExploreHouses({ houses = [], isLoading = false, onSelectHouse }: ExploreHousesProps) {
    const { user } = useAuth();
    const s = useExploreHouses({ houses, onSelectHouse });

    return (
        <div className="flex flex-col gap-4">
            {/* Map */}
            <ExploreMap
                processedHouses={s.processedHouses} allHouses={houses} mapRef={s.mapRef as any}
                userLocation={s.userLocation} searchQuery={s.searchQuery} setSearchQuery={s.setSearchQuery}
                selectedCity={s.selectedCity} setSelectedCity={s.setSelectedCity}
                isDropdownOpen={s.isDropdownOpen} setIsDropdownOpen={s.setIsDropdownOpen}
                dropdownRef={s.dropdownRef as any} cities={s.cities}
                popupInfo={s.popupInfo} setPopupInfo={s.setPopupInfo}
                onFlyToUser={s.flyToUser} onSelectHouse={s.fetchHouseDetails}
                showFilters={s.showFilters} setShowFilters={s.setShowFilters}
                activeFilterCount={s.activeFilterCount}
                sortBy={s.sortBy} setSortBy={s.setSortBy}
                viewMode={s.viewMode} setViewMode={s.setViewMode}
            />

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

            {/* Filter Panel (Expands directly below map) */}
            <FilterPanel showFilters={s.showFilters} priceRange={s.priceRange} setPriceRange={s.setPriceRange} priceBounds={s.priceBounds}
                minBedrooms={s.minBedrooms} setMinBedrooms={s.setMinBedrooms} minBathrooms={s.minBathrooms} setMinBathrooms={s.setMinBathrooms}
                minArea={s.minArea} setMinArea={s.setMinArea} activeFilterCount={s.activeFilterCount} processedCount={s.processedHouses.length} onReset={s.resetAllFilters} />

            {/* House Grid / List */}
            <div>
                {(isLoading || s.isLoadingHouses) ? (
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
                                processedHouses={s.processedHouses} sortBy={s.sortBy} userLocation={s.userLocation} currentUser={user}
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

            {/* Details Modal - Handled globally in Dashboard */}

            {/* Compare Tool */}
            <CompareTool compareIds={s.compareIds} setCompareIds={s.setCompareIds} compareHouses={s.compareHouses}
                showCompare={s.showCompare} setShowCompare={s.setShowCompare} onToggleCompare={s.toggleCompare} onSelectHouse={s.fetchHouseDetails} />
        </div>
    );
}
