import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import type { House } from '../types/explore';
import { SortOption, ViewMode, ITEMS_PER_PAGE, MAX_COMPARE, getDistance, getCoords } from '../types/explore';

interface UseExploreHousesProps {
    houses: House[];
    onSelectHouse?: (id: number) => void;
}

export function useExploreHouses({ houses, onSelectHouse }: UseExploreHousesProps) {
    const [popupInfo, setPopupInfo] = useState<House | null>(null);
    const [selectedHouseId, setSelectedHouseId] = useState<number | null>(null);
    const expandedHouse = useMemo(() => houses.find(h => h.id === selectedHouseId), [houses, selectedHouseId]);

    const mapRef = useRef<MapRef>(null);
    const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCity, setSelectedCity] = useState<string>('all');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [priceRange, setPriceRange] = useState<[number, number]>([0, 0]);
    const [minBedrooms, setMinBedrooms] = useState(0);
    const [minBathrooms, setMinBathrooms] = useState(0);
    const [minArea, setMinArea] = useState(0);
    const [sortBy, setSortBy] = useState<SortOption>('default');
    const [showFilters, setShowFilters] = useState(false);

    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [currentPage, setCurrentPage] = useState(1);
    const [wishlist, setWishlist] = useState<Set<number>>(() => {
        try { return new Set(JSON.parse(localStorage.getItem('house_wishlist') || '[]')); } catch { return new Set(); }
    });

    const [compareIds, setCompareIds] = useState<number[]>([]);
    const [showCompare, setShowCompare] = useState(false);
    const compareHouses = useMemo(() => houses.filter(h => compareIds.includes(h.id)), [houses, compareIds]);
    const toggleCompare = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        setCompareIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < MAX_COMPARE ? [...prev, id] : prev);
    };

    const [recentlyViewed, setRecentlyViewed] = useState<number[]>(() => {
        try { return JSON.parse(localStorage.getItem('house_recently_viewed') || '[]'); } catch { return []; }
    });
    const recentHouses = useMemo(
        () => recentlyViewed.map(id => houses.find(h => h.id === id)).filter(Boolean) as House[],
        [recentlyViewed, houses],
    );

    const priceBounds = useMemo(() => {
        if (houses.length === 0) return { min: 0, max: 1_000_000_000 };
        const prices = houses.map(h => h.price).filter(Boolean);
        return { min: Math.min(...prices), max: Math.max(...prices) };
    }, [houses]);

    useEffect(() => { setPriceRange([priceBounds.min, priceBounds.max]); }, [priceBounds]);

    useEffect(() => {
        if (!navigator.geolocation) return;
        const watchId = navigator.geolocation.watchPosition(
            (pos) => setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
            () => { /* silently fail */ },
            { enableHighAccuracy: true, maximumAge: 10000 },
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsDropdownOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => { localStorage.setItem('house_wishlist', JSON.stringify([...wishlist])); }, [wishlist]);
    useEffect(() => { localStorage.setItem('house_recently_viewed', JSON.stringify(recentlyViewed)); }, [recentlyViewed]);

    const fetchHouseDetails = (id: number) => {
        setRecentlyViewed(prev => { const next = prev.filter(x => x !== id); next.unshift(id); return next.slice(0, 5); });
        onSelectHouse?.(id);
        setSelectedHouseId(id);
    };

    const toggleWishlist = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        setWishlist(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
    };

    const flyToUser = useCallback(() => {
        if (userLocation && mapRef.current) mapRef.current.flyTo({ center: [userLocation.longitude, userLocation.latitude], zoom: 14, duration: 1500 });
    }, [userLocation]);

    const cities = useMemo(() => {
        const s = new Set<string>();
        houses.forEach(h => { if (h.address?.city) s.add(h.address.city); });
        return Array.from(s).sort();
    }, [houses]);

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
                if (userLocation) result.sort((a, b) => (getDistance(a, userLocation) ?? Infinity) - (getDistance(b, userLocation) ?? Infinity));
                break;
        }
        return result;
    }, [houses, selectedCity, searchQuery, priceRange, minBedrooms, minBathrooms, minArea, sortBy, userLocation]);

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

    const totalPages = Math.max(1, Math.ceil(processedHouses.length / ITEMS_PER_PAGE));
    const paginatedHouses = useMemo(
        () => processedHouses.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
        [processedHouses, currentPage],
    );

    useEffect(() => { setCurrentPage(1); }, [searchQuery, selectedCity, priceRange, minBedrooms, minBathrooms, minArea, sortBy]);

    // Auto-focus map on search results
    useEffect(() => {
        if (!mapRef.current || processedHouses.length === 0 || !searchQuery) return;

        const timer = setTimeout(() => {
            if (processedHouses.length === 1) {
                const c = getCoords(processedHouses[0]);
                if (c) mapRef.current?.flyTo({ center: [c.longitude, c.latitude], zoom: 13, duration: 1200 });
            } else if (processedHouses.length > 1) {
                const coords = processedHouses.map(h => getCoords(h)).filter(Boolean) as { latitude: number; longitude: number }[];
                if (coords.length > 0) {
                    const minLat = Math.min(...coords.map(c => c.latitude));
                    const maxLat = Math.max(...coords.map(c => c.latitude));
                    const minLng = Math.min(...coords.map(c => c.longitude));
                    const maxLng = Math.max(...coords.map(c => c.longitude));
                    
                    mapRef.current?.fitBounds(
                        [[minLng, minLat], [maxLng, maxLat]],
                        { padding: 80, duration: 1000 }
                    );
                }
            }
        }, 800); // Wait for user to stop typing

        return () => clearTimeout(timer);
    }, [processedHouses.length, searchQuery]);

    const activeFilterCount = [selectedCity !== 'all', minBedrooms > 0, minBathrooms > 0, minArea > 0, priceRange[0] > priceBounds.min || priceRange[1] < priceBounds.max].filter(Boolean).length;

    const resetAllFilters = () => {
        setSearchQuery(''); setSelectedCity('all'); setPriceRange([priceBounds.min, priceBounds.max]);
        setMinBedrooms(0); setMinBathrooms(0); setMinArea(0); setSortBy('default');
    };

    return {
        popupInfo, setPopupInfo, selectedHouseId, setSelectedHouseId, expandedHouse,
        mapRef, userLocation, searchQuery, setSearchQuery,
        selectedCity, setSelectedCity, isDropdownOpen, setIsDropdownOpen, dropdownRef,
        priceRange, setPriceRange, priceBounds,
        minBedrooms, setMinBedrooms, minBathrooms, setMinBathrooms,
        minArea, setMinArea, sortBy, setSortBy, showFilters, setShowFilters,
        viewMode, setViewMode, currentPage, setCurrentPage,
        wishlist, compareIds, setCompareIds, showCompare, setShowCompare, compareHouses,
        recentHouses, cities, processedHouses, quickStats,
        totalPages, paginatedHouses, activeFilterCount,
        fetchHouseDetails, toggleWishlist, toggleCompare, flyToUser, resetAllFilters,
    };
}
