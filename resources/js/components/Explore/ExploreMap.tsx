import React, { useMemo } from 'react';
import Map, { Marker, Popup, NavigationControl, FullscreenControl } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AnimatePresence, motion } from 'framer-motion';
import { Home, MapPin, Search, Navigation, ChevronDown, Locate, X } from 'lucide-react';
import type { House } from '../../types/explore';
import { formatCurrency, getCoords } from '../../types/explore';

interface ExploreMapProps {
    processedHouses: House[];
    allHouses: House[];
    mapRef: React.RefObject<MapRef>;
    userLocation: { latitude: number; longitude: number } | null;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    selectedCity: string;
    setSelectedCity: (city: string) => void;
    isDropdownOpen: boolean;
    setIsDropdownOpen: (open: boolean) => void;
    dropdownRef: React.RefObject<HTMLDivElement>;
    cities: string[];
    popupInfo: House | null;
    setPopupInfo: (house: House | null) => void;
    onFlyToUser: () => void;
    onSelectHouse: (id: number) => void;
}

export default function ExploreMap({
    processedHouses, allHouses, mapRef, userLocation,
    searchQuery, setSearchQuery, selectedCity, setSelectedCity,
    isDropdownOpen, setIsDropdownOpen, dropdownRef, cities,
    popupInfo, setPopupInfo, onFlyToUser, onSelectHouse,
}: ExploreMapProps) {
    const pins = useMemo(() => processedHouses.map((house, index) => {
        const coords = getCoords(house);
        if (!coords) return null;
        return (
            <Marker key={`marker-${index}`} longitude={coords.longitude} latitude={coords.latitude} anchor="bottom">
                <div className="bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-full border border-gray-100 shadow-[0_4px_12px_rgb(0,0,0,0.15)] flex items-center justify-center cursor-pointer hover:bg-[#FF2D20] transition-all duration-300 transform hover:-translate-y-1 hover:shadow-[0_8px_20px_rgb(255,45,32,0.3)] group"
                    onMouseEnter={() => setPopupInfo(house)} onMouseLeave={() => setPopupInfo(null)}
                    onClick={(e) => { e.stopPropagation(); onSelectHouse(house.id); }}>
                    <span className="font-bold text-sm tracking-tight text-gray-900 group-hover:text-white transition-colors">{formatCurrency(house.price)}</span>
                </div>
            </Marker>
        );
    }), [processedHouses]);

    const popupCoords = popupInfo ? getCoords(popupInfo) : null;

    return (
        <div className="h-[400px] w-full rounded-2xl overflow-hidden shadow-lg border border-gray-200 relative">
            <Map ref={mapRef}
                initialViewState={{ longitude: userLocation?.longitude ?? 106.8271, latitude: userLocation?.latitude ?? -6.1751, zoom: 11 }}
                style={{ width: '100%', height: '100%' }}
                mapStyle={{ version: 8, sources: { 'raster-tiles': { type: 'raster', tiles: ['https://cartodb-basemaps-a.global.ssl.fastly.net/rastertiles/voyager/{z}/{x}/{y}.png'], tileSize: 256, attribution: '&copy; OpenStreetMap contributors, &copy; CARTO' } }, layers: [{ id: 'simple-tiles', type: 'raster', source: 'raster-tiles', minzoom: 0, maxzoom: 22 }] }}>
                <FullscreenControl position="top-right" />
                <NavigationControl position="top-right" />

                {userLocation && (
                    <Marker longitude={userLocation.longitude} latitude={userLocation.latitude} anchor="center">
                        <div className="relative flex items-center justify-center">
                            <div className="absolute w-10 h-10 rounded-full bg-red-500/20 animate-ping" />
                            <div className="absolute w-6 h-6 rounded-full bg-red-500/30" />
                            <div className="w-3.5 h-3.5 rounded-full bg-[#FF2D20] border-2 border-white shadow-lg z-10" />
                        </div>
                    </Marker>
                )}
                {pins}
                {popupInfo && popupCoords && (
                    <Popup anchor="top" longitude={popupCoords.longitude} latitude={popupCoords.latitude} onClose={() => setPopupInfo(null)} closeOnClick={false} className="z-50">
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

            {/* Map Overlay Controls - Only City Dropdown remains */}
            <div className="absolute top-4 left-4 right-16 flex justify-end gap-3 z-10">
                <div ref={dropdownRef} className="relative">
                    <button onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="h-full px-4 py-3 bg-white/95 backdrop-blur-xl rounded-xl border border-white/50 shadow-[0_4px_20px_rgb(0,0,0,0.1)] text-sm font-semibold text-gray-700 flex items-center gap-2 hover:bg-white transition-all min-w-[160px] justify-between">
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
                                    <button key={city} onClick={() => { setSelectedCity(city); setIsDropdownOpen(false); const h = allHouses.find(h => h.address?.city === city); if (h) { const c = getCoords(h); if (c) mapRef.current?.flyTo({ center: [c.longitude, c.latitude], zoom: 12, duration: 1200 }); } }}
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
                <button onClick={onFlyToUser} className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-xl p-3 rounded-xl border border-white/50 shadow-[0_4px_20px_rgb(0,0,0,0.1)] text-[#FF2D20] hover:text-red-700 hover:bg-white transition-all z-10 group" title="Go to my location">
                    <Locate size={18} className="group-hover:scale-110 transition-transform" />
                </button>
            )}
            <div className="absolute bottom-4 right-16 bg-white/95 backdrop-blur-xl px-4 py-2 rounded-xl border border-white/50 shadow-[0_4px_20px_rgb(0,0,0,0.1)] text-xs font-bold text-gray-600 z-10">
                {processedHouses.length} {processedHouses.length === 1 ? 'property' : 'properties'} found
            </div>
        </div>
    );
}
