import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SlidersHorizontal, Ruler } from 'lucide-react';
import { formatCurrency } from '../../types/explore';

interface FilterPanelProps {
    showFilters: boolean;
    priceRange: [number, number];
    setPriceRange: (range: [number, number]) => void;
    priceBounds: { min: number; max: number };
    minBedrooms: number;
    setMinBedrooms: (n: number) => void;
    minBathrooms: number;
    setMinBathrooms: (n: number) => void;
    minArea: number;
    setMinArea: (n: number) => void;
    activeFilterCount: number;
    processedCount: number;
    onReset: () => void;
}

export default function FilterPanel({
    showFilters, priceRange, setPriceRange, priceBounds,
    minBedrooms, setMinBedrooms, minBathrooms, setMinBathrooms,
    minArea, setMinArea, activeFilterCount, processedCount, onReset,
}: FilterPanelProps) {
    const step = Math.max(1, Math.floor((priceBounds.max - priceBounds.min) / 100));

    return (
        <AnimatePresence>
            {showFilters && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }}
                    className="overflow-hidden">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                        <div className="flex gap-6 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                            {/* Price Range */}
                            <div className="min-w-[260px] shrink-0">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 block">Price Range</label>
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                                        <span>{formatCurrency(priceRange[0])}</span><span className="text-gray-300">—</span><span>{formatCurrency(priceRange[1])}</span>
                                    </div>
                                    <input type="range" min={priceBounds.min} max={priceBounds.max} step={step}
                                        value={priceRange[0]} onChange={(e) => setPriceRange([Math.min(Number(e.target.value), priceRange[1]), priceRange[1]])}
                                        className="w-full accent-[#FF2D20] h-1.5 rounded-full" />
                                    <input type="range" min={priceBounds.min} max={priceBounds.max} step={step}
                                        value={priceRange[1]} onChange={(e) => setPriceRange([priceRange[0], Math.max(Number(e.target.value), priceRange[0])])}
                                        className="w-full accent-[#FF2D20] h-1.5 rounded-full" />
                                </div>
                            </div>

                            {/* Bedrooms */}
                            <div className="min-w-[240px] shrink-0">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 block">Bedrooms</label>
                                <div className="flex gap-2">
                                    {[0, 1, 2, 3, 4].map(n => (
                                        <button key={n} onClick={() => setMinBedrooms(n)}
                                            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${minBedrooms === n ? 'bg-[#FF2D20] text-white shadow-[0_4px_12px_rgba(255,45,32,0.3)]' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                            {n === 0 ? 'Any' : `${n}+`}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Bathrooms */}
                            <div className="min-w-[240px] shrink-0">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 block">Bathrooms</label>
                                <div className="flex gap-2">
                                    {[0, 1, 2, 3, 4].map(n => (
                                        <button key={n} onClick={() => setMinBathrooms(n)}
                                            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${minBathrooms === n ? 'bg-[#FF2D20] text-white shadow-[0_4px_12px_rgba(255,45,32,0.3)]' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                            {n === 0 ? 'Any' : `${n}+`}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Area Size */}
                            <div className="min-w-[280px] shrink-0">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 block flex items-center gap-1.5"><Ruler size={12} /> Min Area (m²)</label>
                                <div className="flex gap-2">
                                    {[0, 50, 100, 200, 500].map(n => (
                                        <button key={n} onClick={() => setMinArea(n)}
                                            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${minArea === n ? 'bg-[#FF2D20] text-white shadow-[0_4px_12px_rgba(255,45,32,0.3)]' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                            {n === 0 ? 'Any' : `${n}+`}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {activeFilterCount > 0 && (
                            <div className="mt-5 pt-5 border-t border-gray-100 flex justify-between items-center">
                                <span className="text-sm text-gray-500">{activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active · {processedCount} results</span>
                                <button onClick={onReset} className="text-sm font-bold text-[#FF2D20] hover:text-red-700 transition-colors">Clear All Filters</button>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
