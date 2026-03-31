import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Home, Heart, Share2, Copy, Check, MapPin, BedDouble, Bath, Maximize,
    GitCompareArrows, Flame, Eye, Star,
} from 'lucide-react';
import type { House, ViewMode, SortOption } from '../../types/explore';
import { formatCurrency, getHouseBadge, getDistance, BADGE_CONFIG } from '../../types/explore';

// ─── Auto Hover Slider ─────────────────────────────────────────
const AutoHoverSlider = ({ images, altText }: { images?: { dir: string }[]; altText: string }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isHovered, setIsHovered] = useState(false);

    useEffect(() => {
        if (!isHovered || !images || images.length <= 1) return;
        const interval = setInterval(() => setCurrentIndex((p) => (p + 1) % images.length), 1500);
        return () => clearInterval(interval);
    }, [isHovered, images]);

    if (!images || images.length === 0) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gradient-to-br from-gray-50 to-gray-200">
                <Home size={32} className="mb-2 opacity-50" />
                <span className="text-[10px] font-bold tracking-widest uppercase">No Image</span>
            </div>
        );
    }

    return (
        <div className="w-full h-full relative" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => { setIsHovered(false); setCurrentIndex(0); }}>
            <AnimatePresence mode="popLayout" initial={false}>
                <motion.img key={currentIndex} src={`/storage/${images[currentIndex].dir}`} alt={`${altText} ${currentIndex + 1}`}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out" />
            </AnimatePresence>
            {images.length > 1 && (
                <div className="absolute bottom-[20px] left-0 right-0 flex justify-center gap-1.5 z-10 pointer-events-none">
                    {images.map((_, idx) => (
                        <div key={idx} className={`h-1.5 rounded-full bg-white transition-all duration-300 shadow-[0_1px_3px_rgb(0,0,0,0.5)] ${idx === currentIndex ? 'w-4 opacity-100' : 'w-1.5 opacity-50'}`} />
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── Share Popup ────────────────────────────────────────────────
const ShareButton = ({ house }: { house: House }) => {
    const [showMenu, setShowMenu] = useState(false);
    const [copied, setCopied] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setShowMenu(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const url = `${window.location.origin}/house/${house.id}`;
    const text = `Check out ${house.name} - ${formatCurrency(house.price)}`;

    const copyLink = () => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); };

    return (
        <div ref={ref} className="relative">
            <button onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                className="p-2 rounded-full bg-white/90 backdrop-blur-sm shadow-md hover:bg-white hover:scale-110 transition-all text-gray-600 hover:text-gray-900 z-20">
                <Share2 size={14} />
            </button>
            <AnimatePresence>
                {showMenu && (
                    <motion.div initial={{ opacity: 0, scale: 0.9, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
                        className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-[0_12px_40px_rgb(0,0,0,0.15)] border border-gray-100 p-2 z-[60] min-w-[180px]" onClick={(e) => e.stopPropagation()}>
                        <button onClick={copyLink} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                            {copied ? 'Copied!' : 'Copy Link'}
                        </button>
                        <a href={`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`} target="_blank" rel="noopener noreferrer"
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                            <span className="text-base">💬</span> WhatsApp
                        </a>
                        <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer"
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                            <span className="text-base">𝕏</span> Twitter / X
                        </a>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ─── Skeleton Card ──────────────────────────────────────────────
export const SkeletonCard = ({ viewMode }: { viewMode: ViewMode }) => (
    <div className={`bg-white rounded-[1.5rem] overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/60 animate-pulse ${viewMode === 'list' ? 'flex flex-row' : 'flex flex-col'}`}>
        <div className={`bg-gray-200 ${viewMode === 'list' ? 'w-72 min-h-[200px]' : 'h-[240px] m-3 rounded-2xl'}`} />
        <div className={`flex flex-col flex-1 ${viewMode === 'list' ? 'p-6' : 'px-6 pb-6 pt-2'}`}>
            <div className="h-6 bg-gray-200 rounded-lg w-3/4 mb-3" />
            <div className="h-4 bg-gray-100 rounded w-1/2 mb-4" />
            <div className="h-4 bg-gray-100 rounded w-full mb-2" />
            <div className="h-4 bg-gray-100 rounded w-2/3 mb-5" />
            <div className="h-12 bg-gray-100 rounded-xl w-full mb-4" />
            <div className="h-12 bg-gray-200 rounded-xl w-full" />
        </div>
    </div>
);

// ─── Main HouseCard ─────────────────────────────────────────────
interface HouseCardProps {
    house: House;
    viewMode: ViewMode;
    wishlist: Set<number>;
    compareIds: number[];
    processedHouses: House[];
    sortBy: SortOption;
    userLocation: { latitude: number; longitude: number } | null;
    onToggleWishlist: (e: React.MouseEvent, id: number) => void;
    onToggleCompare: (e: React.MouseEvent, id: number) => void;
    onSelect: (id: number) => void;
}

export default function HouseCard({
    house, viewMode, wishlist, compareIds, processedHouses,
    sortBy, userLocation, onToggleWishlist, onToggleCompare, onSelect,
}: HouseCardProps) {
    const badge = useMemo(() => getHouseBadge(house, processedHouses), [house, processedHouses]);
    const distance = useMemo(() => getDistance(house, userLocation), [house, userLocation]);

    return (
        <div onClick={() => onSelect(house.id)}
            className={`bg-white rounded-[1.5rem] overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/60 hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] transition-all duration-500 group cursor-pointer hover:-translate-y-1 relative ${viewMode === 'list' ? 'flex flex-row' : 'flex flex-col'}`}>

            {/* Image Section */}
            <div className={`relative overflow-hidden bg-gray-100 ${viewMode === 'list' ? 'w-80 min-h-[220px] rounded-l-[1.5rem]' : 'p-3 w-full h-[240px]'}`}>
                <div className={`relative w-full h-full overflow-hidden ${viewMode === 'list' ? '' : 'rounded-2xl border border-gray-100'}`}>
                    <AutoHoverSlider images={house.housePic} altText={house.name} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-80 group-hover:opacity-90 transition-opacity duration-500 pointer-events-none" />

                    {/* Badges */}
                    <div className="absolute top-3 left-3 right-3 flex justify-between items-start pointer-events-none z-10">
                        <div className="flex flex-col gap-1.5 items-start">
                            <div className="bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-full text-[10px] font-black tracking-widest text-[#FF2D20] uppercase shadow-[0_2px_10px_rgb(0,0,0,0.1)]">For Sale</div>
                            {badge && (() => { const conf = BADGE_CONFIG[badge]; const Icon = conf.icon; return (<div className={`px-2.5 py-1 rounded-full text-[10px] font-bold shadow-md flex items-center gap-1 ${conf.colors}`}><Icon size={10} /> {conf.label}</div>); })()}
                        </div>
                        {sortBy === 'nearest' && userLocation && distance !== null && (
                            <div className="bg-blue-600/90 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-bold text-white shadow-md">
                                {distance < 1 ? `${(distance * 1000).toFixed(0)}m` : `${distance.toFixed(1)}km`}
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="absolute top-3 right-3 flex flex-col gap-2 z-20">
                        <button onClick={(e) => onToggleWishlist(e, house.id)}
                            className={`p-2 rounded-full shadow-md backdrop-blur-sm transition-all hover:scale-110 ${wishlist.has(house.id) ? 'bg-[#FF2D20] text-white' : 'bg-white/90 text-gray-600 hover:bg-white hover:text-[#FF2D20]'}`}>
                            <Heart size={14} fill={wishlist.has(house.id) ? 'currentColor' : 'none'} />
                        </button>
                        <button onClick={(e) => onToggleCompare(e, house.id)} title="Compare"
                            className={`p-2 rounded-full shadow-md backdrop-blur-sm transition-all hover:scale-110 ${compareIds.includes(house.id) ? 'bg-blue-600 text-white' : 'bg-white/90 text-gray-600 hover:bg-white hover:text-blue-600'}`}>
                            <GitCompareArrows size={14} />
                        </button>
                        <ShareButton house={house} />
                    </div>

                    <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-none z-10">
                        <span className="text-white font-black text-2xl tracking-tight drop-shadow-md">{formatCurrency(house.price)}</span>
                    </div>
                </div>
            </div>

            {/* Content Section */}
            <div className={`flex flex-col flex-1 ${viewMode === 'list' ? 'p-6' : 'px-6 pb-6 pt-1'} opacity-90 group-hover:opacity-100 transition-opacity duration-300`}>
                <h4 className="text-xl font-bold text-gray-900 line-clamp-1 group-hover:text-[#FF2D20] transition-colors duration-300 leading-tight">{house.name}</h4>
                <div className="flex items-center gap-1.5 mt-2 text-gray-400">
                    <MapPin size={14} className="shrink-0" />
                    <span className="text-sm truncate font-medium">{house.address?.street ? `${house.address.street}, ${house.address.city}` : house.address?.city || 'Location unavailable'}</span>
                </div>
                <p className={`text-sm text-gray-500 mt-4 leading-relaxed ${viewMode === 'list' ? 'line-clamp-3' : 'line-clamp-2 h-10'}`}>{house.description}</p>

                <div className="mt-auto pt-4">
                    <div className="w-full flex justify-between items-center text-xs font-semibold text-gray-600 bg-gray-50/80 rounded-xl p-3 border border-gray-100/50 group-hover:bg-[#FF2D20]/5 group-hover:border-[#FF2D20]/10 transition-colors duration-300">
                        <div className="flex items-center gap-1.5"><BedDouble size={15} className="text-gray-400 group-hover:text-[#FF2D20] transition-colors" /><span className="pt-0.5">{house.rooms?.bedrooms || 0} Beds</span></div>
                        <div className="w-[1px] h-4 bg-gray-200" />
                        <div className="flex items-center gap-1.5"><Bath size={15} className="text-gray-400 group-hover:text-[#FF2D20] transition-colors" /><span className="pt-0.5">{house.rooms?.bathrooms || 0} Baths</span></div>
                        <div className="w-[1px] h-4 bg-gray-200" />
                        <div className="flex items-center gap-1.5"><Maximize size={15} className="text-gray-400 group-hover:text-[#FF2D20] transition-colors" /><span className="pt-0.5">{house.dimensions?.width}x{house.dimensions?.length}m</span></div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); onSelect(house.id); }}
                        className="mt-4 w-full bg-gray-900 hover:bg-[#FF2D20] text-white py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-300 shadow-[0_4px_14px_0_rgb(0,0,0,0.05)] hover:shadow-[0_6px_20px_rgba(255,45,32,0.23)] hover:-translate-y-0.5 flex items-center justify-center gap-2">
                        View Property Details
                    </button>
                </div>
            </div>
        </div>
    );
}
