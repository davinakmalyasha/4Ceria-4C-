import React, { useMemo } from 'react';
import Map, { Marker, Popup, NavigationControl, FullscreenControl } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AnimatePresence, motion } from 'framer-motion';
import { MapPin, Navigation, ChevronDown, Locate, Hammer } from 'lucide-react';
import { Project, formatCurrency } from '../../types/project.types';

interface ProjectMapProps {
    processedProjects: Project[];
    allProjects: Project[];
    mapRef: React.RefObject<MapRef | null>;
    userLocation: { latitude: number; longitude: number } | null;
    selectedCity: string;
    setSelectedCity: (city: string) => void;
    isDropdownOpen: boolean;
    setIsDropdownOpen: (open: boolean) => void;
    dropdownRef: React.RefObject<HTMLDivElement | null>;
    cities: string[];
    popupInfo: Project | null;
    setPopupInfo: (project: Project | null) => void;
    onFlyToUser: () => void;
    onSelectProject: (project: Project) => void;
}

export default function ProjectMap({
    processedProjects, allProjects, mapRef, userLocation,
    selectedCity, setSelectedCity,
    isDropdownOpen, setIsDropdownOpen, dropdownRef, cities,
    popupInfo, setPopupInfo, onFlyToUser, onSelectProject,
}: ProjectMapProps) {
    
    const getCoords = (p: Project) => {
        if (!p.latitude || !p.longitude) return null;
        return {
            latitude: parseFloat(p.latitude),
            longitude: parseFloat(p.longitude)
        };
    };

    const pins = useMemo(() => processedProjects.map((project, index) => {
        const coords = getCoords(project);
        if (!coords) return null;
        return (
            <Marker key={`marker-${project.id}`} longitude={coords.longitude} latitude={coords.latitude} anchor="bottom">
                <div className="bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-full border border-zinc-200 shadow-[0_4px_12px_rgb(0,0,0,0.15)] flex items-center justify-center cursor-pointer hover:bg-zinc-900 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-[0_8px_20px_rgb(0,0,0,0.3)] group"
                    onMouseEnter={() => setPopupInfo(project)} onMouseLeave={() => setPopupInfo(null)}
                    onClick={(e) => { e.stopPropagation(); onSelectProject(project); }}>
                    <span className="font-bold text-sm tracking-tight text-zinc-900 group-hover:text-white transition-colors">
                        {formatCurrency(project.budget)}
                    </span>
                </div>
            </Marker>
        );
    }), [processedProjects, setPopupInfo, onSelectProject]);

    const popupCoords = popupInfo ? getCoords(popupInfo) : null;

    return (
        <div className="h-[380px] w-full rounded-2xl overflow-hidden shadow-xl border border-zinc-200 relative mb-6">
            <Map ref={mapRef}
                initialViewState={{ 
                    longitude: userLocation?.longitude ?? 106.8271, 
                    latitude: userLocation?.latitude ?? -6.1751, 
                    zoom: 11 
                }}
                style={{ width: '100%', height: '100%' }}
                mapStyle={{ 
                    version: 8, 
                    sources: { 
                        'raster-tiles': { 
                            type: 'raster', 
                            tiles: ['https://cartodb-basemaps-a.global.ssl.fastly.net/rastertiles/voyager/{z}/{x}/{y}.png'], 
                            tileSize: 256, 
                            attribution: '&copy; OpenStreetMap contributors, &copy; CARTO' 
                        } 
                    }, 
                    layers: [{ id: 'simple-tiles', type: 'raster', source: 'raster-tiles', minzoom: 0, maxzoom: 22 }] 
                }}>
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
                            <div className="w-full h-24 bg-zinc-100 rounded-lg mb-2 overflow-hidden relative shadow-inner">
                                {popupInfo.images && popupInfo.images.length > 0 ? (
                                    <img src={popupInfo.images[0].url} alt={popupInfo.title} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-zinc-400">
                                        <Hammer size={24} className="opacity-30" />
                                    </div>
                                )}
                                <div className="absolute top-2 right-2 px-2 py-0.5 bg-zinc-900/80 backdrop-blur-sm text-white text-[10px] font-bold rounded-full border border-white/20">
                                    {popupInfo.status.toUpperCase()}
                                </div>
                            </div>
                            <h4 className="font-bold text-zinc-900 text-sm leading-tight line-clamp-1">{popupInfo.title}</h4>
                            <div className="mt-1 flex items-center gap-2 text-[10px] font-bold text-zinc-500">
                                <span className="capitalize">{popupInfo.type || 'Project'}</span>
                                {popupInfo.city && (
                                    <>
                                        <span>•</span>
                                        <span className="truncate">{popupInfo.city}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </Popup>
                )}
            </Map>

            {/* Map Overlay Controls */}
            <div className="absolute top-4 left-4 right-16 flex justify-end gap-3 z-10">
                <div ref={dropdownRef} className="relative">
                    <button onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="h-full px-4 py-3 bg-white/95 backdrop-blur-xl rounded-xl border border-zinc-200 shadow-[0_4px_20px_rgb(0,0,0,0.1)] text-sm font-semibold text-zinc-700 flex items-center gap-2 hover:bg-white transition-all min-w-[160px] justify-between">
                        <div className="flex items-center gap-2 truncate">
                            <MapPin size={14} className="text-[#FF2D20] shrink-0" />
                            <span className="truncate">{selectedCity === 'all' ? 'All Cities' : selectedCity}</span>
                        </div>
                        <ChevronDown size={14} className={`shrink-0 text-zinc-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence>
                        {isDropdownOpen && (
                            <motion.div initial={{ opacity: 0, y: -8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.95 }} transition={{ duration: 0.15 }}
                                className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-xl rounded-xl border border-zinc-100 shadow-[0_12px_40px_rgb(0,0,0,0.15)] overflow-hidden z-50 max-h-[220px] overflow-y-auto">
                                <button onClick={() => { setSelectedCity('all'); setIsDropdownOpen(false); }} className={`w-full px-4 py-2.5 text-left text-sm font-medium transition-colors flex items-center gap-2 ${selectedCity === 'all' ? 'bg-red-50 text-[#FF2D20]' : 'text-zinc-700 hover:bg-zinc-50'}`}>
                                    <Navigation size={12} className="shrink-0" /> All Cities
                                </button>
                                {cities.map(city => (
                                    <button 
                                        key={city} 
                                        onClick={() => { 
                                            setSelectedCity(city); 
                                            setIsDropdownOpen(false); 
                                            const proj = allProjects.find(p => p.city === city); 
                                            if (proj) { 
                                                const c = getCoords(proj); 
                                                if (c) mapRef.current?.flyTo({ center: [c.longitude, c.latitude], zoom: 12, duration: 1200 }); 
                                            } 
                                        }}
                                        className={`w-full px-4 py-2.5 text-left text-sm font-medium transition-colors flex items-center gap-2 ${selectedCity === city ? 'bg-red-50 text-[#FF2D20]' : 'text-zinc-700 hover:bg-zinc-50'}`}
                                    >
                                        <MapPin size={12} className="shrink-0" /> {city}
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {userLocation && (
                <button onClick={onFlyToUser} className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-xl p-3 rounded-xl border border-zinc-200 shadow-[0_4px_20px_rgb(0,0,0,0.1)] text-[#FF2D20] hover:text-red-700 hover:bg-white transition-all z-10 group" title="Go to my location">
                    <Locate size={18} className="group-hover:scale-110 transition-transform" />
                </button>
            )}
            
            <div className="absolute bottom-4 right-16 bg-white/95 backdrop-blur-xl px-4 py-2 rounded-xl border border-zinc-200 shadow-[0_4px_20px_rgb(0,0,0,0.1)] text-xs font-bold text-zinc-600 z-10">
                {processedProjects.length} {processedProjects.length === 1 ? 'project' : 'projects'} visible
            </div>
        </div>
    );
}
