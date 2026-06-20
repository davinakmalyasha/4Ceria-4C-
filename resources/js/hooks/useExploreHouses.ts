import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import type { House } from '../types/explore';
import { SortOption, ViewMode, ITEMS_PER_PAGE, MAX_COMPARE, getDistance, getCoords } from '../types/explore';
import axios from 'axios';

interface UseExploreHousesProps {
    houses: House[];
    onSelectHouse?: (id: number) => void;
}

export function useExploreHouses({ houses: initialHouses, onSelectHouse }: UseExploreHousesProps) {
    const [housesState, setHousesState] = useState<House[]>(initialHouses);
    const [isLoadingHouses, setIsLoadingHouses] = useState(false);
    const [popupInfo, setPopupInfo] = useState<House | null>(null);
    const [selectedHouseId, setSelectedHouseId] = useState<number | null>(null);
    const expandedHouse = useMemo(() => housesState.find(h => h.id === selectedHouseId), [housesState, selectedHouseId]);

    const mapRef = useRef<MapRef>(null);
    const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [selectedCity, setSelectedCity] = useState<string>('all');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [priceRange, setPriceRange] = useState<[number, number]>([0, 20_000_000_000]); // Large default max
    const [minBedrooms, setMinBedrooms] = useState(0);
    const [minBathrooms, setMinBathrooms] = useState(0);
    const [minArea, setMinArea] = useState(0);
    const [sortBy, setSortBy] = useState<SortOption>('default');
    const [showFilters, setShowFilters] = useState(false);

    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [wishlist, setWishlist] = useState<Set<number>>(() => {
        try { return new Set(JSON.parse(localStorage.getItem('house_wishlist') || '[]')); } catch { return new Set(); }
    });

    const [compareIds, setCompareIds] = useState<number[]>([]);
    const [showCompare, setShowCompare] = useState(false);
    const compareHouses = useMemo(() => housesState.filter(h => compareIds.includes(h.id)), [housesState, compareIds]);
    
    const toggleCompare = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        setCompareIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < MAX_COMPARE ? [...prev, id] : prev);
    };

    const [recentlyViewed, setRecentlyViewed] = useState<number[]>(() => {
        try { return JSON.parse(localStorage.getItem('house_recently_viewed') || '[]'); } catch { return []; }
    });
    
    const recentHouses = useMemo(
        () => recentlyViewed.map(id => housesState.find(h => h.id === id)).filter(Boolean) as House[],
        [recentlyViewed, housesState],
    );

    const priceBounds = useMemo(() => {
        // Local defaults or calculate based on initialHouses if available
        if (initialHouses.length === 0) return { min: 0, max: 20_000_000_000 };
        const prices = initialHouses.map(h => h.price).filter(Boolean);
        return { min: Math.min(...prices), max: Math.max(...prices) };
    }, [initialHouses]);

    // Initial load sync
    useEffect(() => {
        if (initialHouses.length > 0) {
            setHousesState(initialHouses);
        }
    }, [initialHouses]);

    // Search input debouncer
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 300); // 300ms Debounce

        return () => clearTimeout(handler);
    }, [searchQuery]);

    // Request houses on filter change
    useEffect(() => {
        let isMounted = true;
        setIsLoadingHouses(true);

        const params: Record<string, any> = {
            page: currentPage,
            per_page: ITEMS_PER_PAGE,
            search: debouncedSearchQuery,
            city: selectedCity === 'all' ? '' : selectedCity,
            price_min: priceRange[0],
            price_max: priceRange[1],
            bedrooms: minBedrooms > 0 ? minBedrooms : '',
            bathrooms: minBathrooms > 0 ? minBathrooms : '',
            min_area: minArea > 0 ? minArea : '',
            sort: sortBy
        };

        axios.get('/houses', { params })
            .then(res => {
                if (!isMounted) return;
                setHousesState(res.data.data || []);
                setTotalPages(res.data.meta?.last_page || res.data.last_page || 1);
            })
            .catch(err => {
                console.error("Failed to load houses with parameters", err);
            })
            .finally(() => {
                if (isMounted) setIsLoadingHouses(false);
            });

        return () => {
            isMounted = false;
        };
    }, [currentPage, debouncedSearchQuery, selectedCity, priceRange, minBedrooms, minBathrooms, minArea, sortBy]);

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

    const wishlistTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const recentlyViewedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (wishlistTimeout.current) clearTimeout(wishlistTimeout.current);
        wishlistTimeout.current = setTimeout(() => {
            try {
                localStorage.setItem('house_wishlist', JSON.stringify([...wishlist]));
            } catch (err) {
                console.error('Failed to sync wishlist to storage', err);
            }
        }, 500); // 500ms Debounce
        return () => {
            if (wishlistTimeout.current) clearTimeout(wishlistTimeout.current);
        };
    }, [wishlist]);

    useEffect(() => {
        if (recentlyViewedTimeout.current) clearTimeout(recentlyViewedTimeout.current);
        recentlyViewedTimeout.current = setTimeout(() => {
            try {
                localStorage.setItem('house_recently_viewed', JSON.stringify(recentlyViewed));
            } catch (err) {
                console.error('Failed to sync recently viewed to storage', err);
            }
        }, 1000); // 1s Debounce
        return () => {
            if (recentlyViewedTimeout.current) clearTimeout(recentlyViewedTimeout.current);
        };
    }, [recentlyViewed]);

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
        // Check local state or fall back to default cities list
        const listToInspect = housesState.length > 0 ? housesState : initialHouses;
        listToInspect.forEach(h => { if (h.address?.city) s.add(h.address.city); });
        return Array.from(s).sort();
    }, [housesState, initialHouses]);

    const quickStats = useMemo(() => {
        if (housesState.length === 0) return null;
        const prices = housesState.map(h => h.price).filter(Boolean);
        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        const beds = housesState.map(h => h.rooms?.bedrooms || 0);
        const bedCounts: Record<number, number> = {};
        beds.forEach(b => { bedCounts[b] = (bedCounts[b] || 0) + 1; });
        const commonBed = Object.entries(bedCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
        const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
        const newThisWeek = housesState.filter(h => h.created_at && new Date(h.created_at) > weekAgo).length;
        return { avgPrice, commonBed: Number(commonBed?.[0] || 0), newThisWeek, total: housesState.length };
    }, [housesState]);

    // Reset pagination to page 1 on filter trigger
    useEffect(() => { 
        setCurrentPage(1); 
    }, [debouncedSearchQuery, selectedCity, priceRange, minBedrooms, minBathrooms, minArea, sortBy]);

    // Auto-focus map on search results
    useEffect(() => {
        if (!mapRef.current || housesState.length === 0 || !debouncedSearchQuery) return;

        const timer = setTimeout(() => {
            if (housesState.length === 1) {
                const c = getCoords(housesState[0]);
                if (c) mapRef.current?.flyTo({ center: [c.longitude, c.latitude], zoom: 13, duration: 1200 });
            } else if (housesState.length > 1) {
                const coords = housesState.map(h => getCoords(h)).filter(Boolean) as { latitude: number; longitude: number }[];
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
        }, 800);

        return () => clearTimeout(timer);
    }, [housesState.length, debouncedSearchQuery]);

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
        recentHouses, cities, processedHouses: housesState, quickStats,
        totalPages, paginatedHouses: housesState, activeFilterCount, isLoadingHouses,
        fetchHouseDetails, toggleWishlist, toggleCompare, flyToUser, resetAllFilters,
    };
}
