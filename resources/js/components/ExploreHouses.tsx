import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';
import Map, { Marker, Popup, NavigationControl, FullscreenControl, GeolocateControl } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Home, X, MapPin, Maximize, BedDouble, Bath, User,
    ChevronLeft, ChevronRight, Search, Navigation, ChevronDown, Locate,
    Heart, Share2, ArrowUpDown, LayoutGrid, List, SlidersHorizontal, Copy, Check, Ruler,
    Eye, Flame, Clock, Star, BarChart3, GitCompareArrows, Layers
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────
interface House {
    id: number;
    name: string;
    price: number;
    description: string;
    coordinate?: string;
    views?: number;
    created_at?: string;
    address?: { street?: string; kelurahan?: string; kecamatan?: string; city: string; province: string; postal_code?: string; coordinates?: string };
    dimensions?: { width: number; length: number; floors: number };
    rooms?: { bedrooms: number; bathrooms: number };
    housePic?: { dir: string }[];
}

interface ExploreHousesProps {
    houses: House[];
    isLoading?: boolean;
    onSelectHouse?: (id: number) => void;
}

type SortOption = 'default' | 'price_asc' | 'price_desc' | 'newest' | 'most_viewed' | 'nearest';
type ViewMode = 'grid' | 'list';
type HouseBadge = 'new' | 'popular' | 'hot_deal' | null;

const ITEMS_PER_PAGE = 8;
const MAX_COMPARE = 3;

// ─── Badge Logic ────────────────────────────────────────────────
const getHouseBadge = (house: House, allHouses: House[]): HouseBadge => {
    const created = house.created_at ? new Date(house.created_at) : null;
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    if (created && created > weekAgo) return 'new';
    if ((house.views || 0) >= 50) return 'popular';
    if (allHouses.length > 0) {
        const avgPrice = allHouses.reduce((s, h) => s + h.price, 0) / allHouses.length;
        if (house.price < avgPrice * 0.7) return 'hot_deal';
    }
    return null;
};

const BADGE_CONFIG: Record<string, { label: string; icon: typeof Flame; colors: string }> = {
    new: { label: 'New', icon: Star, colors: 'bg-emerald-500/90 text-white' },
    popular: { label: 'Popular', icon: Eye, colors: 'bg-amber-500/90 text-white' },
    hot_deal: { label: 'Hot Deal', icon: Flame, colors: 'bg-rose-500/90 text-white' },
};

// ─── Skeleton Card ──────────────────────────────────────────────
const SkeletonCard = ({ viewMode }: { viewMode: ViewMode }) => (
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

// ─── Auto Hover Slider (Grid Cards) ────────────────────────────
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

// ─── Manual Slider (Details Modal) ─────────────────────────────
const ManualSlider = ({ images, altText }: { images?: { dir: string }[]; altText: string }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const next = (e: React.MouseEvent) => { e.stopPropagation(); if (images) setCurrentIndex((p) => (p + 1) % images.length); };
    const prev = (e: React.MouseEvent) => { e.stopPropagation(); if (images) setCurrentIndex((p) => (p - 1 + images.length) % images.length); };

    if (!images || images.length === 0) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gradient-to-br from-gray-50 to-gray-200">
                <Home size={64} className="mb-4 opacity-20" /><span className="font-semibold tracking-wide">Image Not Provided</span>
            </div>
        );
    }
    return (
        <div className="w-full h-full relative group">
            <AnimatePresence mode="popLayout" initial={false}>
                <motion.img key={currentIndex} src={`/storage/${images[currentIndex].dir}`} alt={`${altText} ${currentIndex + 1}`}
                    initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}
                    className="absolute inset-0 w-full h-full object-cover" />
            </AnimatePresence>
            {images.length > 1 && (
                <>
                    <button onClick={prev} className="absolute left-6 top-1/2 -translate-y-1/2 bg-black/20 hover:bg-black/50 text-white p-3 rounded-full backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-lg z-20"><ChevronLeft size={24} /></button>
                    <button onClick={next} className="absolute right-6 top-1/2 -translate-y-1/2 bg-black/20 hover:bg-black/50 text-white p-3 rounded-full backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-lg z-20"><ChevronRight size={24} /></button>
                    <div className="absolute top-6 left-0 right-0 flex justify-center gap-2 z-10">
                        {images.map((_, idx) => (
                            <button key={idx} onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); }} className={`h-1.5 rounded-full bg-white transition-all shadow-[0_2px_4px_rgb(0,0,0,0.4)] hover:opacity-100 ${idx === currentIndex ? 'w-8 opacity-100' : 'w-2.5 opacity-40'}`} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

// ─── Share Popup ───────────────────────────────────────────────
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
    const text = `Check out ${house.name} - ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(house.price)}`;

    const copyLink = () => {
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

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

// ═══════════════════════════════════════════════════════════════
// ─── Main Component ───────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
export default function ExploreHouses({ houses = [], isLoading = false, onSelectHouse }: ExploreHousesProps) {
    // ── Core State ──
    const [popupInfo, setPopupInfo] = useState<House | null>(null);
    const [selectedHouseId, setSelectedHouseId] = useState<number | null>(null);
    const expandedHouse = useMemo(() => houses.find(h => h.id === selectedHouseId), [houses, selectedHouseId]);

    // ── Map State ──
    const mapRef = useRef<MapRef>(null);
    const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCity, setSelectedCity] = useState<string>('all');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // ── Filter State ──
    const [priceRange, setPriceRange] = useState<[number, number]>([0, 0]);
    const [minBedrooms, setMinBedrooms] = useState(0);
    const [minBathrooms, setMinBathrooms] = useState(0);
    const [minArea, setMinArea] = useState(0);
    const [sortBy, setSortBy] = useState<SortOption>('default');
    const [showFilters, setShowFilters] = useState(false);

    // ── View / Pagination / Wishlist ──
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [currentPage, setCurrentPage] = useState(1);
    const [wishlist, setWishlist] = useState<Set<number>>(() => {
        try { return new Set(JSON.parse(localStorage.getItem('house_wishlist') || '[]')); } catch { return new Set(); }
    });

    // ── Compare Mode ──
    const [compareIds, setCompareIds] = useState<number[]>([]);
    const [showCompare, setShowCompare] = useState(false);
    const compareHouses = useMemo(() => houses.filter(h => compareIds.includes(h.id)), [houses, compareIds]);
    const toggleCompare = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        setCompareIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < MAX_COMPARE ? [...prev, id] : prev);
    };

    // ── Recently Viewed ──
    const [recentlyViewed, setRecentlyViewed] = useState<number[]>(() => {
        try { return JSON.parse(localStorage.getItem('house_recently_viewed') || '[]'); } catch { return []; }
    });
    const recentHouses = useMemo(() => recentlyViewed.map(id => houses.find(h => h.id === id)).filter(Boolean) as House[], [recentlyViewed, houses]);

    // ── Derived Price Bounds ──
    const priceBounds = useMemo(() => {
        if (houses.length === 0) return { min: 0, max: 1_000_000_000 };
        const prices = houses.map(h => h.price).filter(Boolean);
        return { min: Math.min(...prices), max: Math.max(...prices) };
    }, [houses]);

    // Init price range from data
    useEffect(() => {
        setPriceRange([priceBounds.min, priceBounds.max]);
    }, [priceBounds]);

    // ── Geolocation ──
    useEffect(() => {
        if (!navigator.geolocation) return;
        const watchId = navigator.geolocation.watchPosition(
            (pos) => setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
            () => { /* silently fail */ },
            { enableHighAccuracy: true, maximumAge: 10000 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    // ── Close dropdown on outside click ──
    useEffect(() => {
        const handler = (e: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsDropdownOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // ── Persist wishlist ──
    useEffect(() => {
        localStorage.setItem('house_wishlist', JSON.stringify([...wishlist]));
    }, [wishlist]);

    // ── Persist recently viewed ──
    useEffect(() => {
        localStorage.setItem('house_recently_viewed', JSON.stringify(recentlyViewed));
    }, [recentlyViewed]);

    // ── Helpers ──
    const formatCurrency = (amount: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

    const getCoords = (house: House): { longitude: number; latitude: number } | null => {
        const s = house.coordinate || house.address?.coordinates;
        if (!s) return null;
        const p = s.split(',');
        if (p.length === 2) { const lat = parseFloat(p[0].trim()); const lng = parseFloat(p[1].trim()); if (!isNaN(lat) && !isNaN(lng)) return { latitude: lat, longitude: lng }; }
        return null;
    };

    const getDistance = (house: House): number | null => {
        if (!userLocation) return null;
        const coords = getCoords(house);
        if (!coords) return null;
        const R = 6371;
        const dLat = ((coords.latitude - userLocation.latitude) * Math.PI) / 180;
        const dLon = ((coords.longitude - userLocation.longitude) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos((userLocation.latitude * Math.PI) / 180) * Math.cos((coords.latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const fetchHouseDetails = (id: number) => {
        setRecentlyViewed(prev => { const next = prev.filter(x => x !== id); next.unshift(id); return next.slice(0, 5); });
        onSelectHouse ? onSelectHouse(id) : setSelectedHouseId(id);
    };
    const toggleWishlist = (e: React.MouseEvent, id: number) => { e.stopPropagation(); setWishlist(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; }); };
    const flyToUser = useCallback(() => { if (userLocation && mapRef.current) mapRef.current.flyTo({ center: [userLocation.longitude, userLocation.latitude], zoom: 14, duration: 1500 }); }, [userLocation]);

    // ── Derive unique cities ──
    const cities = useMemo(() => { const s = new Set<string>(); houses.forEach(h => { if (h.address?.city) s.add(h.address.city); }); return Array.from(s).sort(); }, [houses]);


    // ── Filter + Sort Pipeline ──
    const processedHouses = useMemo(() => {
        let result = houses.filter(h => {
            const matchesCity = selectedCity === 'all' || h.address?.city === selectedCity;
            const q = searchQuery.toLowerCase();
            const matchesSearch = !q || h.name.toLowerCase().includes(q) || h.description?.toLowerCase().includes(q) || h.address?.city?.toLowerCase().includes(q) || h.address?.street?.toLowerCase().includes(q);
            const matchesPrice = h.price >= priceRange[0] && h.price <= priceRange[1];
            const matchesBeds = (h.rooms?.bedrooms || 0) >= minBedrooms;
            const matchesBaths = (h.rooms?.bathrooms || 0) >= minBathrooms;
            const area = (h.dimensions?.width || 0) * (h.dimensions?.length || 0);
            const matchesArea = area >= minArea;
            return matchesCity && matchesSearch && matchesPrice && matchesBeds && matchesBaths && matchesArea;
        });

        switch (sortBy) {
            case 'price_asc': result.sort((a, b) => a.price - b.price); break;
            case 'price_desc': result.sort((a, b) => b.price - a.price); break;
            case 'newest': result.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()); break;
            case 'most_viewed': result.sort((a, b) => (b.views || 0) - (a.views || 0)); break;
            case 'nearest':
                if (userLocation) result.sort((a, b) => (getDistance(a) ?? Infinity) - (getDistance(b) ?? Infinity));
                break;
        }
        return result;
    }, [houses, selectedCity, searchQuery, priceRange, minBedrooms, minBathrooms, minArea, sortBy, userLocation]);

    // ── Quick Stats ──
    const quickStats = useMemo(() => {
        if (processedHouses.length === 0) return null;
        const prices = processedHouses.map(h => h.price).filter(Boolean);
        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        const beds = processedHouses.map(h => h.rooms?.bedrooms || 0);
        const bedCounts: Record<number, number> = {};
        beds.forEach(b => { bedCounts[b] = (bedCounts[b] || 0) + 1; });
        const commonBed = Object.entries(bedCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
        const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
        const newThisWeek = processedHouses.filter(h => h.created_at && new Date(h.created_at) > weekAgo).length;
        return { avgPrice, commonBed: Number(commonBed?.[0] || 0), newThisWeek, total: processedHouses.length };
    }, [processedHouses]);

    // ── Pagination ──
    const totalPages = Math.max(1, Math.ceil(processedHouses.length / ITEMS_PER_PAGE));
    const paginatedHouses = useMemo(() => processedHouses.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE), [processedHouses, currentPage]);

    // Reset page when filters change
    useEffect(() => { setCurrentPage(1); }, [searchQuery, selectedCity, priceRange, minBedrooms, minBathrooms, minArea, sortBy]);

    // ── Map Pins ──
    const pins = useMemo(
        () => processedHouses.map((house, index) => {
            const coords = getCoords(house);
            if (!coords) return null;
            return (
                <Marker key={`marker-${index}`} longitude={coords.longitude} latitude={coords.latitude} anchor="bottom">
                    <div className="bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-full border border-gray-100 shadow-[0_4px_12px_rgb(0,0,0,0.15)] flex items-center justify-center cursor-pointer hover:bg-[#FF2D20] transition-all duration-300 transform hover:-translate-y-1 hover:shadow-[0_8px_20px_rgb(255,45,32,0.3)] group"
                        onMouseEnter={() => setPopupInfo(house)} onMouseLeave={() => setPopupInfo(null)}
                        onClick={(e) => { e.stopPropagation(); fetchHouseDetails(house.id); }}>
                        <span className="font-bold text-sm tracking-tight text-gray-900 group-hover:text-white transition-colors">{formatCurrency(house.price)}</span>
                    </div>
                </Marker>
            );
        }),
        [processedHouses]
    );

    const activeFilterCount = [selectedCity !== 'all', minBedrooms > 0, minBathrooms > 0, minArea > 0, priceRange[0] > priceBounds.min || priceRange[1] < priceBounds.max].filter(Boolean).length;

    const resetAllFilters = () => { setSearchQuery(''); setSelectedCity('all'); setPriceRange([priceBounds.min, priceBounds.max]); setMinBedrooms(0); setMinBathrooms(0); setMinArea(0); setSortBy('default'); };

    // ═════════════════════════════════════════════════════════════
    // ─── RENDER ─────────────────────────────────────────────────
    // ═════════════════════════════════════════════════════════════
    return (
        <div className="flex flex-col gap-8">
            {/* ── MAP ───────────────────────────────────────── */}
            <div className="h-[500px] w-full rounded-2xl overflow-hidden shadow-lg border border-gray-200 relative">
                <Map ref={mapRef}
                    initialViewState={{ longitude: userLocation?.longitude ?? 106.8271, latitude: userLocation?.latitude ?? -6.1751, zoom: 11 }}
                    style={{ width: '100%', height: '100%' }}
                    mapStyle={{ version: 8, sources: { 'raster-tiles': { type: 'raster', tiles: ['https://cartodb-basemaps-a.global.ssl.fastly.net/rastertiles/voyager/{z}/{x}/{y}.png'], tileSize: 256, attribution: '&copy; OpenStreetMap contributors, &copy; CARTO' } }, layers: [{ id: 'simple-tiles', type: 'raster', source: 'raster-tiles', minzoom: 0, maxzoom: 22 }] }}>
                    <FullscreenControl position="top-right" />
                    <NavigationControl position="top-right" />

                    {userLocation && (
                        <Marker longitude={userLocation.longitude} latitude={userLocation.latitude} anchor="center">
                            <div className="relative flex items-center justify-center">
                                <div className="absolute w-10 h-10 rounded-full bg-blue-500/20 animate-ping" />
                                <div className="absolute w-6 h-6 rounded-full bg-blue-500/30" />
                                <div className="w-3.5 h-3.5 rounded-full bg-blue-600 border-2 border-white shadow-lg z-10" />
                            </div>
                        </Marker>
                    )}
                    {pins}
                    {popupInfo && (
                        <Popup anchor="top" longitude={getCoords(popupInfo)?.longitude || 0} latitude={getCoords(popupInfo)?.latitude || 0} onClose={() => setPopupInfo(null)} closeOnClick={false} className="z-50">
                            <div className="p-1 w-48 pointer-events-none">
                                <div className="w-full h-24 bg-gray-100 rounded-lg mb-2 overflow-hidden relative shadow-inner">
                                    {popupInfo.housePic && popupInfo.housePic.length > 0 ? <img src={`/storage/${popupInfo.housePic[0].dir}`} alt={popupInfo.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-400"><Home size={20} className="opacity-50" /></div>}
                                </div>
                                <h4 className="font-bold text-gray-900 text-sm leading-tight line-clamp-1">{popupInfo.name}</h4>
                                <div className="mt-1 flex gap-2 text-[10px] font-bold text-gray-500">
                                    <span>{popupInfo.rooms?.bedrooms || 0} Beds</span><span>•</span><span>{popupInfo.rooms?.bathrooms || 0} Baths</span>
                                </div>
                            </div>
                        </Popup>
                    )}
                </Map>

                {/* Map Overlay Controls */}
                <div className="absolute top-4 left-4 right-16 flex gap-3 z-10">
                    <div className="flex-1 relative">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        <input type="text" placeholder="Search houses by name, street, or city..."
                            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-white/95 backdrop-blur-xl rounded-xl border border-white/50 shadow-[0_4px_20px_rgb(0,0,0,0.1)] text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF2D20]/30 focus:border-[#FF2D20]/50 transition-all" />
                        {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
                    </div>
                    <div ref={dropdownRef} className="relative">
                        <button onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="h-full px-4 bg-white/95 backdrop-blur-xl rounded-xl border border-white/50 shadow-[0_4px_20px_rgb(0,0,0,0.1)] text-sm font-semibold text-gray-700 flex items-center gap-2 hover:bg-white transition-all min-w-[160px] justify-between">
                            <div className="flex items-center gap-2 truncate"><MapPin size={14} className="text-[#FF2D20] shrink-0" /><span className="truncate">{selectedCity === 'all' ? 'All Cities' : selectedCity}</span></div>
                            <ChevronDown size={14} className={`shrink-0 text-gray-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        <AnimatePresence>
                            {isDropdownOpen && (
                                <motion.div initial={{ opacity: 0, y: -8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.95 }} transition={{ duration: 0.15 }}
                                    className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-xl rounded-xl border border-gray-100 shadow-[0_12px_40px_rgb(0,0,0,0.15)] overflow-hidden z-50 max-h-[220px] overflow-y-auto">
                                    <button onClick={() => { setSelectedCity('all'); setIsDropdownOpen(false); }} className={`w-full px-4 py-2.5 text-left text-sm font-medium transition-colors flex items-center gap-2 ${selectedCity === 'all' ? 'bg-[#FF2D20]/10 text-[#FF2D20]' : 'text-gray-700 hover:bg-gray-50'}`}>
                                        <Navigation size={12} className="shrink-0" /> All Cities
                                    </button>
                                    {cities.map(city => (
                                        <button key={city} onClick={() => { setSelectedCity(city); setIsDropdownOpen(false); const h = houses.find(h => h.address?.city === city); if (h) { const c = getCoords(h); if (c) mapRef.current?.flyTo({ center: [c.longitude, c.latitude], zoom: 12, duration: 1200 }); } }}
                                            className={`w-full px-4 py-2.5 text-left text-sm font-medium transition-colors flex items-center gap-2 ${selectedCity === city ? 'bg-[#FF2D20]/10 text-[#FF2D20]' : 'text-gray-700 hover:bg-gray-50'}`}>
                                            <MapPin size={12} className="shrink-0" /> {city}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {userLocation && (
                    <button onClick={flyToUser} className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-xl p-3 rounded-xl border border-white/50 shadow-[0_4px_20px_rgb(0,0,0,0.1)] text-blue-600 hover:text-blue-800 hover:bg-white transition-all z-10 group" title="Go to my location">
                        <Locate size={18} className="group-hover:scale-110 transition-transform" />
                    </button>
                )}
                <div className="absolute bottom-4 right-16 bg-white/95 backdrop-blur-xl px-4 py-2 rounded-xl border border-white/50 shadow-[0_4px_20px_rgb(0,0,0,0.1)] text-xs font-bold text-gray-600 z-10">
                    {processedHouses.length} {processedHouses.length === 1 ? 'property' : 'properties'} found
                </div>
            </div>

            {/* ── QUICK STATS ─────────────────────────────── */}
            {quickStats && (
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
                    <div className="flex items-center gap-3 bg-white px-5 py-3 rounded-2xl border border-gray-100 shadow-sm shrink-0">
                        <div className="p-2 bg-green-50 rounded-xl text-green-600"><BarChart3 size={18} /></div>
                        <div><p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Avg Market Price</p><p className="font-extrabold text-gray-900">{formatCurrency(quickStats.avgPrice)}</p></div>
                    </div>
                    <div className="flex items-center gap-3 bg-white px-5 py-3 rounded-2xl border border-gray-100 shadow-sm shrink-0">
                        <div className="p-2 bg-blue-50 rounded-xl text-blue-600"><BedDouble size={18} /></div>
                        <div><p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Most Common</p><p className="font-extrabold text-gray-900">{quickStats.commonBed} Bedrooms</p></div>
                    </div>
                    <div className="flex items-center gap-3 bg-white px-5 py-3 rounded-2xl border border-gray-100 shadow-sm shrink-0">
                        <div className="p-2 bg-rose-50 rounded-xl text-rose-600"><Star size={18} /></div>
                        <div><p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Hot Market</p><p className="font-extrabold text-gray-900">{quickStats.newThisWeek} new this week</p></div>
                    </div>
                </div>
            )}

            {/* ── RECENTLY VIEWED ─────────────────────────── */}
            {recentHouses.length > 0 && (
                <div>
                    <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2"><Clock size={16} className="text-[#FF2D20]" /> Recently Viewed</h4>
                    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
                        {recentHouses.map(h => (
                            <div key={`recent-${h.id}`} onClick={() => fetchHouseDetails(h.id)} className="w-[200px] shrink-0 bg-white rounded-xl border border-gray-100 shadow-sm p-2 flex gap-3 cursor-pointer hover:border-[#FF2D20] transition-colors group">
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

            {/* ── TOOLBAR ─────────────────────────────────── */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <h3 className="text-2xl font-bold text-gray-900">Featured Listings</h3>
                    <div className="flex items-center gap-3">
                        {/* Filter Toggle */}
                        <button onClick={() => setShowFilters(!showFilters)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${showFilters ? 'bg-[#FF2D20] text-white border-[#FF2D20] shadow-[0_4px_14px_rgba(255,45,32,0.3)]' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 shadow-sm'}`}>
                            <SlidersHorizontal size={15} /> Filters
                            {activeFilterCount > 0 && <span className="bg-white/20 text-[10px] font-black px-1.5 py-0.5 rounded-full">{activeFilterCount}</span>}
                        </button>

                        {/* Sort Dropdown */}
                        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)}
                            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-gray-200 text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D20]/20 cursor-pointer hover:border-gray-300 transition-all appearance-none pr-8"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}>
                            <option value="default">Default</option>
                            <option value="price_asc">Price: Low → High</option>
                            <option value="price_desc">Price: High → Low</option>
                            <option value="newest">Newest First</option>
                            <option value="most_viewed">Most Viewed</option>
                            {userLocation && <option value="nearest">Nearest to Me</option>}
                        </select>

                        {/* View Toggle */}
                        <div className="flex bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                            <button onClick={() => setViewMode('grid')} className={`p-2.5 transition-all ${viewMode === 'grid' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-600'}`}><LayoutGrid size={16} /></button>
                            <button onClick={() => setViewMode('list')} className={`p-2.5 transition-all ${viewMode === 'list' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-600'}`}><List size={16} /></button>
                        </div>
                    </div>
                </div>

                {/* ── FILTER PANEL ─────────────────────────── */}
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
                                            <input type="range" min={priceBounds.min} max={priceBounds.max} step={Math.max(1, Math.floor((priceBounds.max - priceBounds.min) / 100))}
                                                value={priceRange[0]} onChange={(e) => setPriceRange([Math.min(Number(e.target.value), priceRange[1]), priceRange[1]])}
                                                className="w-full accent-[#FF2D20] h-1.5 rounded-full" />
                                            <input type="range" min={priceBounds.min} max={priceBounds.max} step={Math.max(1, Math.floor((priceBounds.max - priceBounds.min) / 100))}
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
                                        <span className="text-sm text-gray-500">{activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active · {processedHouses.length} results</span>
                                        <button onClick={resetAllFilters} className="text-sm font-bold text-[#FF2D20] hover:text-red-700 transition-colors">Clear All Filters</button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── HOUSE GRID / LIST ───────────────────────── */}
            <div>
                {isLoading ? (
                    <div className={`${viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-8' : 'flex flex-col gap-6'}`}>
                        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} viewMode={viewMode} />)}
                    </div>
                ) : processedHouses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                        <Search size={48} className="mb-4 opacity-30" />
                        <p className="text-lg font-semibold text-gray-500">No properties found</p>
                        <p className="text-sm mt-1">Try adjusting your search or filters</p>
                        <button onClick={resetAllFilters} className="mt-4 px-6 py-2 bg-[#FF2D20] text-white rounded-lg text-sm font-bold hover:bg-red-600 transition-colors">Clear All Filters</button>
                    </div>
                ) : (
                    <div className={`${viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-8' : 'flex flex-col gap-6'}`}>
                        {paginatedHouses.map(house => (
                            <div key={house.id} onClick={() => fetchHouseDetails(house.id)}
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
                                                {(() => {
                                                    const badge = getHouseBadge(house, processedHouses);
                                                    if (!badge) return null;
                                                    const conf = BADGE_CONFIG[badge];
                                                    const Icon = conf.icon;
                                                    return (
                                                        <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold shadow-md flex items-center gap-1 ${conf.colors}`}>
                                                            <Icon size={10} /> {conf.label}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                            {sortBy === 'nearest' && userLocation && getDistance(house) !== null && (
                                                <div className="bg-blue-600/90 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-bold text-white shadow-md">
                                                    {getDistance(house)! < 1 ? `${(getDistance(house)! * 1000).toFixed(0)}m` : `${getDistance(house)!.toFixed(1)}km`}
                                                </div>
                                            )}
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="absolute top-3 right-3 flex flex-col gap-2 z-20">
                                            <button onClick={(e) => toggleWishlist(e, house.id)}
                                                className={`p-2 rounded-full shadow-md backdrop-blur-sm transition-all hover:scale-110 ${wishlist.has(house.id) ? 'bg-[#FF2D20] text-white' : 'bg-white/90 text-gray-600 hover:bg-white hover:text-[#FF2D20]'}`}>
                                                <Heart size={14} fill={wishlist.has(house.id) ? 'currentColor' : 'none'} />
                                            </button>
                                            <button onClick={(e) => toggleCompare(e, house.id)} title="Compare"
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
                                        <button onClick={(e) => { e.stopPropagation(); fetchHouseDetails(house.id); }}
                                            className="mt-4 w-full bg-gray-900 hover:bg-[#FF2D20] text-white py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-300 shadow-[0_4px_14px_0_rgb(0,0,0,0.05)] hover:shadow-[0_6px_20px_rgba(255,45,32,0.23)] hover:-translate-y-0.5 flex items-center justify-center gap-2">
                                            View Property Details
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── PAGINATION ──────────────────────────── */}
                {processedHouses.length > ITEMS_PER_PAGE && (
                    <div className="flex items-center justify-center gap-2 mt-10">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                            className="p-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm">
                            <ChevronLeft size={18} />
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1).map((page, idx, arr) => (
                            <React.Fragment key={page}>
                                {idx > 0 && arr[idx - 1] !== page - 1 && <span className="px-1 text-gray-300">...</span>}
                                <button onClick={() => setCurrentPage(page)}
                                    className={`min-w-[40px] h-10 rounded-xl text-sm font-bold transition-all ${currentPage === page ? 'bg-[#FF2D20] text-white shadow-[0_4px_12px_rgba(255,45,32,0.3)]' : 'border border-gray-200 text-gray-600 hover:bg-gray-50 shadow-sm'}`}>
                                    {page}
                                </button>
                            </React.Fragment>
                        ))}
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                            className="p-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm">
                            <ChevronRight size={18} />
                        </button>
                    </div>
                )}
            </div>

            {/* ── DETAILS MODAL ───────────────────────────── */}
            <AnimatePresence>
                {selectedHouseId && expandedHouse && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm"
                        onClick={() => setSelectedHouseId(null)}>
                        <motion.div initial={{ y: 50, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0, scale: 0.95 }}
                            transition={{ type: 'spring', duration: 0.5, bounce: 0.3 }}
                            className="bg-white rounded-[2rem] overflow-hidden shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col relative"
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                            <button onClick={() => setSelectedHouseId(null)} className="absolute top-5 right-5 bg-black/20 hover:bg-black/40 backdrop-blur-md text-white p-2.5 rounded-full transition-all z-20">
                                <X size={20} strokeWidth={2.5} />
                            </button>

                            <div className="overflow-y-auto w-full flex-1 pb-24 relative">
                                <div className="w-full h-80 sm:h-[420px] relative bg-gray-100 shrink-0">
                                    <ManualSlider images={expandedHouse.housePic} altText={expandedHouse.name} />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none z-10" />
                                    <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end z-20 pointer-events-none">
                                        <div>
                                            <span className="inline-block px-3 py-1 bg-[#FF2D20] text-white text-xs font-bold rounded-full uppercase tracking-wider mb-3 shadow-lg">For Sale</span>
                                            <h2 className="text-3xl sm:text-5xl font-extrabold text-white leading-tight drop-shadow-2xl">{expandedHouse.name}</h2>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 sm:p-10 bg-white">
                                    <div className="flex items-start gap-3 text-gray-600 mb-10 pb-8 border-b border-gray-100">
                                        <div className="bg-red-50 p-3 rounded-2xl text-[#FF2D20] shrink-0"><MapPin size={24} /></div>
                                        <div className="w-full">
                                            <p className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-1 opacity-50">Location</p>
                                            <p className="text-base sm:text-lg leading-relaxed">
                                                {expandedHouse.address?.street}, {expandedHouse.address?.kelurahan},<br />
                                                {expandedHouse.address?.kecamatan}, {expandedHouse.address?.city},<br />
                                                {expandedHouse.address?.province} {expandedHouse.address?.postal_code}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-6 mb-10 pb-8 border-b border-gray-100">
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2 mb-2 text-gray-400"><BedDouble size={20} /><span className="text-xs font-bold tracking-widest uppercase">Bedrooms</span></div>
                                            <span className="font-light text-gray-900 text-3xl">{expandedHouse.rooms?.bedrooms || 0}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2 mb-2 text-gray-400"><Bath size={20} /><span className="text-xs font-bold tracking-widest uppercase">Bathrooms</span></div>
                                            <span className="font-light text-gray-900 text-3xl">{expandedHouse.rooms?.bathrooms || 0}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2 mb-2 text-gray-400"><Maximize size={20} /><span className="text-xs font-bold tracking-widest uppercase">Dimensions</span></div>
                                            <span className="font-light text-gray-900 text-xl sm:text-2xl mt-1 tracking-tight truncate">
                                                {expandedHouse.dimensions?.width} <span className="text-gray-400 text-lg">x</span> {expandedHouse.dimensions?.length}m
                                            </span>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-6 display-flex items-center gap-3">
                                            <span className="w-8 h-[2px] bg-[#FF2D20] inline-block mb-1"></span> The Property
                                        </p>
                                        <p className="text-gray-600 text-base sm:text-lg leading-loose font-light whitespace-pre-wrap">{expandedHouse.description}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-gray-100 p-4 sm:px-8 sm:py-5 flex flex-col sm:flex-row items-center justify-between gap-4 z-10">
                                <div className="w-full sm:w-auto text-center sm:text-left">
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-0.5">Asking Price</p>
                                    <p className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">{formatCurrency(expandedHouse.price)}</p>
                                </div>
                                <div className="flex gap-3 w-full sm:w-auto">
                                    <button onClick={(e) => toggleWishlist(e, expandedHouse.id)}
                                        className={`p-3.5 rounded-xl font-bold transition-all border ${wishlist.has(expandedHouse.id) ? 'bg-[#FF2D20] text-white border-[#FF2D20]' : 'bg-white text-gray-600 border-gray-200 hover:text-[#FF2D20]'}`}>
                                        <Heart size={18} fill={wishlist.has(expandedHouse.id) ? 'currentColor' : 'none'} />
                                    </button>
                                    <button className="flex-1 sm:flex-none bg-[#FF2D20] hover:bg-black text-white px-8 py-3.5 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-2 shadow-[0_4px_14px_0_rgb(255,45,32,0.39)] hover:shadow-none hover:-translate-y-0.5">
                                        <User size={18} /> Schedule Viewing
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── COMPARE FLOATING BAR ────────────────────── */}
            <AnimatePresence>
                {compareIds.length > 0 && (
                    <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white rounded-2xl shadow-[0_12px_40px_rgb(0,0,0,0.2)] border border-gray-200 p-4 z-50 flex items-center gap-6 min-w-[320px]">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-100 p-2.5 rounded-xl text-blue-600"><GitCompareArrows size={20} /></div>
                            <div>
                                <p className="text-sm font-bold text-gray-900">{compareIds.length} properties selected</p>
                                <p className="text-[11px] text-gray-500">Max {MAX_COMPARE} properties to compare</p>
                            </div>
                        </div>
                        <div className="flex gap-2 ml-auto">
                            <button onClick={() => setCompareIds([])} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">Clear</button>
                            <button onClick={() => setShowCompare(true)} disabled={compareIds.length < 2} className="px-6 py-2 bg-[#FF2D20] text-white text-sm font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-700 transition-colors shadow-md">Compare</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── COMPARE MODAL ───────────────────────────── */}
            <AnimatePresence>
                {showCompare && compareHouses.length > 0 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6" onClick={() => setShowCompare(false)}>
                        <motion.div initial={{ y: 50, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }} onClick={(e) => e.stopPropagation()} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
                            <div className="p-6 border-b border-gray-100 gap-4 flex justify-between items-center bg-gray-50/50">
                                <div><h3 className="text-2xl font-bold text-gray-900">Compare Properties</h3><p className="text-sm text-gray-500">Side-by-side comparison of {compareHouses.length} selected properties</p></div>
                                <button onClick={() => setShowCompare(false)} className="p-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-full transition-all text-gray-500"><X size={20} /></button>
                            </div>
                            <div className="flex-1 overflow-x-auto overflow-y-auto p-6 bg-white scrollbar-thin">
                                <table className="w-full text-left border-collapse min-w-[800px]">
                                    <thead>
                                        <tr>
                                            <th className="w-40 border-b-2 border-gray-100 pb-4 font-bold text-gray-400 uppercase tracking-widest text-xs">Features</th>
                                            {compareHouses.map(h => (
                                                <th key={`head-${h.id}`} className="min-w-[280px] w-[30%] border-b-2 border-gray-100 pb-4 pr-6 align-bottom">
                                                    <div className="w-full h-40 bg-gray-100 rounded-2xl overflow-hidden mb-4 shadow-inner relative">
                                                        <button onClick={(e) => toggleCompare(e, h.id)} className="absolute top-2 right-2 bg-white/90 p-1.5 rounded-full z-10 hover:bg-red-50 hover:text-red-500 transition-colors"><X size={14}/></button>
                                                        {h.housePic?.length ? <img src={`/storage/${h.housePic[0].dir}`} className="w-full h-full object-cover" /> : <Home className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-300 opacity-50" size={40} />}
                                                    </div>
                                                    <h4 className="text-lg font-extrabold text-gray-900 line-clamp-1">{h.name}</h4>
                                                    <p className="text-[#FF2D20] font-black text-xl mt-1">{formatCurrency(h.price)}</p>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm divide-y divide-gray-100">
                                        <tr>
                                            <td className="py-5 font-bold text-gray-500 align-top">Location</td>
                                            {compareHouses.map(h => <td key={`loc-${h.id}`} className="py-5 pr-6 font-medium text-gray-900">{h.address?.street}<br/>{h.address?.city}, {h.address?.province}</td>)}
                                        </tr>
                                        <tr>
                                            <td className="py-5 font-bold text-gray-500 align-top">Rooms</td>
                                            {compareHouses.map(h => <td key={`room-${h.id}`} className="py-5 pr-6 font-medium text-gray-900"><div className="flex gap-4"><span className="flex items-center gap-1.5"><BedDouble size={16} className="text-gray-400"/> {h.rooms?.bedrooms || 0}</span><span className="flex items-center gap-1.5"><Bath size={16} className="text-gray-400"/> {h.rooms?.bathrooms || 0}</span></div></td>)}
                                        </tr>
                                        <tr>
                                            <td className="py-5 font-bold text-gray-500 align-top">Area Size</td>
                                            {compareHouses.map(h => <td key={`area-${h.id}`} className="py-5 pr-6 font-medium text-gray-900"><div className="flex items-center gap-1.5"><Maximize size={16} className="text-gray-400"/> {h.dimensions?.width}x{h.dimensions?.length}m ({(h.dimensions?.width||0)*(h.dimensions?.length||0)} m²)</div></td>)}
                                        </tr>
                                        <tr>
                                            <td className="py-5 font-bold text-gray-500 align-top">Price per m²</td>
                                            {compareHouses.map(h => {
                                                const area = (h.dimensions?.width || 0) * (h.dimensions?.length || 0);
                                                return <td key={`price-${h.id}`} className="py-5 pr-6 font-medium text-gray-900">{area > 0 ? formatCurrency(h.price / area) + '/m²' : '-'}</td>
                                            })}
                                        </tr>
                                        <tr>
                                            <td className="py-5 font-bold text-gray-500 align-top">Action</td>
                                            {compareHouses.map(h => <td key={`act-${h.id}`} className="py-5 pr-6"><button onClick={() => { setShowCompare(false); fetchHouseDetails(h.id); }} className="w-full py-2.5 bg-gray-900 text-white rounded-xl font-bold hover:bg-[#FF2D20] transition-colors">View Property</button></td>)}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
