import React, { useMemo } from 'react';
import Map, { Marker, Popup, NavigationControl, FullscreenControl } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AnimatePresence, motion } from 'framer-motion';
import { 
    MapPin, Navigation, ChevronDown, Locate, Hammer,
    Search, SlidersHorizontal, LayoutGrid, List, KanbanSquare, 
    Wallet, MessageSquare, CheckCircle 
} from 'lucide-react';
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
    
    // Toolbar controls overlay inside map
    search: string;
    onSearchChange: (val: string) => void;
    sortBy: 'newest' | 'budget_desc' | 'budget_asc' | 'deadline_asc';
    onSortChange: (val: 'newest' | 'budget_desc' | 'budget_asc' | 'deadline_asc') => void;
    viewMode: 'grid' | 'list' | 'board';
    onViewModeChange: (val: 'grid' | 'list' | 'board') => void;
    totalBudget?: number;
    activeBidsCount?: number;
    completedCount?: number;
    onViewMyBids?: () => void;
    onViewActiveBids?: () => void;
    userRole?: string;
}

export default function ProjectMap({
    processedProjects, allProjects, mapRef, userLocation,
    selectedCity, setSelectedCity,
    isDropdownOpen, setIsDropdownOpen, dropdownRef, cities,
    popupInfo, setPopupInfo, onFlyToUser, onSelectProject,
    search, onSearchChange, sortBy, onSortChange,
    viewMode, onViewModeChange, totalBudget, activeBidsCount,
    completedCount, onViewMyBids, onViewActiveBids, userRole
}: ProjectMapProps) {
    const isUser = userRole === 'user';
    const isClickable = (isUser && (activeBidsCount || 0) > 0 && onViewActiveBids) || (!isUser && onViewMyBids);
    
    const getCoords = (p: Project) => {
        if (!p.latitude || !p.longitude) return null;
        return {
            latitude: parseFloat(p.latitude),
            longitude: parseFloat(p.longitude)
        };
    };

    const pins = useMemo(() => processedProjects.map((project) => {
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
        <div className="h-[420px] w-full rounded-2xl overflow-hidden shadow-xl border border-zinc-200 relative">
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
                <FullscreenControl position="bottom-right" />
                <NavigationControl position="bottom-right" />

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

            {/* Floating Control Dock at Map Top */}
            <div className="absolute top-4 left-4 right-4 bg-white/95 backdrop-blur-md p-2 rounded-2xl border border-zinc-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.12)] z-10 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 select-none">
                {/* City Dropdown, Search & Locate */}
                <div className="flex items-center gap-2 flex-1 min-w-[320px]">
                    {/* City Dropdown */}
                    <div ref={dropdownRef} className="relative shrink-0">
                        <button onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="h-full px-3 py-1.5 bg-zinc-50 border border-zinc-200/60 rounded-xl text-xs font-semibold text-zinc-700 flex items-center gap-1.5 hover:bg-white transition-all min-w-[120px] justify-between">
                            <div className="flex items-center gap-1.5 truncate">
                                <MapPin size={13} className="text-[#FF2D20] shrink-0" />
                                <span className="truncate">{selectedCity === 'all' ? 'All Cities' : selectedCity}</span>
                            </div>
                            <ChevronDown size={12} className={`shrink-0 text-zinc-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        <AnimatePresence>
                            {isDropdownOpen && (
                                <motion.div initial={{ opacity: 0, y: -8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.95 }} transition={{ duration: 0.15 }}
                                    className="absolute top-full left-0 mt-2 bg-white border border-zinc-150 shadow-[0_12px_40px_rgb(0,0,0,0.15)] rounded-xl overflow-hidden z-50 max-h-[220px] w-[180px] overflow-y-auto">
                                    <button onClick={() => { setSelectedCity('all'); setIsDropdownOpen(false); }} className={`w-full px-4 py-2 text-left text-xs font-semibold transition-colors flex items-center gap-2 ${selectedCity === 'all' ? 'bg-red-50 text-[#FF2D20]' : 'text-zinc-700 hover:bg-zinc-50'}`}>
                                        <Navigation size={11} className="shrink-0" /> All Cities
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
                                            className={`w-full px-4 py-2 text-left text-xs font-semibold transition-colors flex items-center gap-2 ${selectedCity === city ? 'bg-red-50 text-[#FF2D20]' : 'text-zinc-700 hover:bg-zinc-50'}`}
                                        >
                                            <MapPin size={11} className="shrink-0" /> {city}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Search Input */}
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input 
                            type="text"
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            placeholder="Search projects..."
                            className="w-full pl-9 pr-3 py-1.5 bg-zinc-50 border border-zinc-200/60 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#FF2D20]/15 focus:border-[#FF2D20] transition-all font-semibold text-gray-800"
                        />
                    </div>
                    {userLocation && (
                        <button onClick={onFlyToUser} className="p-2 bg-zinc-50 hover:bg-zinc-100 rounded-xl border border-zinc-200 text-[#FF2D20] transition-colors" title="My location">
                            <Locate size={14} />
                        </button>
                    )}
                </div>

                {/* Dense Stats Capsule */}
                {totalBudget !== undefined && (
                    <div className="flex items-center bg-zinc-50 border border-gray-200/50 rounded-xl px-3 py-2 gap-3 text-[10px] font-bold text-gray-500 shadow-sm whitespace-nowrap overflow-x-auto scrollbar-hide">
                        <div className="flex items-center gap-1.5">
                            <Wallet size={11} className="text-zinc-500" />
                            <span className="text-[9px] text-gray-400 uppercase font-semibold">Budget:</span>
                            <span className="text-gray-900 font-extrabold">{formatCurrency(totalBudget)}</span>
                        </div>
                        <div className="w-[1px] h-3 bg-gray-200" />
                        <div onClick={isClickable ? (isUser ? onViewActiveBids : onViewMyBids) : undefined} className={`flex items-center gap-1.5 ${isClickable ? 'cursor-pointer hover:text-[#FF2D20] transition-colors' : ''}`}>
                            <MessageSquare size={11} className="text-zinc-500" />
                            <span className="text-[9px] text-gray-400 uppercase font-semibold">Proposals:</span>
                            <span className="text-gray-900 font-extrabold">{activeBidsCount || 0}</span>
                        </div>
                        <div className="w-[1px] h-3 bg-gray-200" />
                        <div className="flex items-center gap-1.5">
                            <CheckCircle size={11} className="text-zinc-500" />
                            <span className="text-[9px] text-gray-400 uppercase font-semibold">Done:</span>
                            <span className="text-gray-900 font-extrabold">{completedCount || 0}</span>
                        </div>
                    </div>
                )}

                {/* Controls & Visibility count */}
                <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
                    {/* Sort Dropdown */}
                    <div className="relative bg-zinc-50 border border-zinc-200 rounded-xl text-xs flex items-center pr-2 pl-1 shadow-xs">
                        <select 
                            value={sortBy}
                            onChange={(e) => onSortChange(e.target.value as any)}
                            className="bg-transparent border-none outline-none py-1.5 pl-2 pr-6 focus:ring-0 font-bold text-gray-700 cursor-pointer appearance-none text-[10px]"
                        >
                            <option value="newest">Newest</option>
                            <option value="budget_desc">Highest Budget</option>
                            <option value="budget_asc">Lowest Budget</option>
                            <option value="deadline_asc">Soonest</option>
                        </select>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                            <SlidersHorizontal className="w-2.5 h-2.5 text-gray-400" />
                        </div>
                    </div>

                    {/* View Modes */}
                    <div className="flex items-center bg-gray-150 p-0.5 rounded-xl border border-zinc-200/80 shadow-xs">
                        <button onClick={() => onViewModeChange('grid')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white text-[#FF2D20] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="Grid">
                            <LayoutGrid size={12} />
                        </button>
                        <button onClick={() => onViewModeChange('list')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white text-[#FF2D20] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="List">
                            <List size={12} />
                        </button>
                        <button onClick={() => onViewModeChange('board')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'board' ? 'bg-white text-[#FF2D20] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="Kanban">
                            <KanbanSquare size={12} />
                        </button>
                    </div>

                    {/* Visible Badge */}
                    <div className="bg-slate-900 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider shrink-0 shadow-sm shadow-slate-950/10">
                        {processedProjects.length} Visible
                    </div>
                </div>
            </div>
        </div>
    );
}
