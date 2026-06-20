import React, { useRef, useState, useEffect, memo } from 'react';
import Map, { Marker, NavigationControl, FullscreenControl } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Locate, MapPin, Loader2, Search, X } from 'lucide-react';

export interface ReverseGeoData {
    province: string;
    city: string;
    kecamatan: string;
    kelurahan: string;
    postal_code: string;
    street_name: string;
}

interface LocationPickerMapProps {
    latitude: number;
    longitude: number;
    onChange: (lat: number, lng: number, geoData?: ReverseGeoData) => void;
    label?: string;
    heightClass?: string;
}

async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeoData> {
    try {
        const res = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`);
        const data = await res.json();
        const addr = data.address || {};

        return {
            province: addr.state || addr.province || '',
            city: addr.city || addr.county || addr.town || addr.city_district || '',
            kecamatan: addr.suburb || addr.district || addr.city_district || '',
            kelurahan: addr.village || addr.neighbourhood || addr.hamlet || '',
            postal_code: addr.postcode || '',
            street_name: addr.road || addr.pedestrian || addr.footway || '',
        };
    } catch {
        return { province: '', city: '', kecamatan: '', kelurahan: '', postal_code: '', street_name: '' };
    }
}

const LocationPickerMap = memo(function LocationPickerMap({ latitude, longitude, onChange, label, heightClass = 'h-[300px]' }: LocationPickerMapProps) {
    const mapRef = useRef<MapRef>(null);
    const geocodeTimeout = useRef<NodeJS.Timeout | null>(null);
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<any[]>([]);

    const lat = latitude || -6.1751;
    const lng = longitude || 106.8271;

    useEffect(() => {
        return () => {
            if (geocodeTimeout.current) {
                clearTimeout(geocodeTimeout.current);
            }
        };
    }, []);

    const handleGeoLookup = (newLat: number, newLng: number) => {
        if (geocodeTimeout.current) {
            clearTimeout(geocodeTimeout.current);
        }
        setIsGeocoding(true);
        geocodeTimeout.current = setTimeout(async () => {
            const geoData = await reverseGeocode(newLat, newLng);
            onChange(newLat, newLng, geoData);
            setIsGeocoding(false);
        }, 500); // 500ms Debounce to prevent OSM Nominatim rate-limiting
    };

    const handleMapClick = (e: any) => {
        handleGeoLookup(e.lngLat.lat, e.lngLat.lng);
    };

    const handleMarkerDragEnd = (e: any) => {
        handleGeoLookup(e.lngLat.lat, e.lngLat.lng);
    };

    const handleLocateMe = () => {
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition((position) => {
                const newLat = position.coords.latitude;
                const newLng = position.coords.longitude;
                mapRef.current?.flyTo({ center: [newLng, newLat], zoom: 15, duration: 1200 });
                handleGeoLookup(newLat, newLng);
            });
        }
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        setIsSearching(true);
        try {
            const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(searchQuery)}`);
            const data = await res.json();
            setSearchResults(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Search failed', err);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    const selectResult = (result: any) => {
        const newLat = parseFloat(result.lat);
        const newLng = parseFloat(result.lon);
        mapRef.current?.flyTo({ center: [newLng, newLat], zoom: 16, duration: 1000 });
        handleGeoLookup(newLat, newLng);
        setSearchResults([]);
        setSearchQuery(result.display_name);
    };

    return (
        <div className={`${heightClass} w-full rounded-2xl overflow-hidden shadow-sm border border-gray-200 relative group`}>
            {/* Search Overlay */}
            <div className="absolute top-4 left-4 right-14 z-20">
                <form onSubmit={handleSearch} className="relative">
                    <input 
                        type="text" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search street, building, or city..."
                        className="w-full pl-10 pr-10 py-2.5 bg-white/95 backdrop-blur-md rounded-xl border border-gray-200 shadow-sm focus:ring-2 focus:ring-red-500/20 outline-none text-sm font-medium"
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    {searchQuery && (
                        <button 
                            type="button" 
                            onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            <X size={16} />
                        </button>
                    )}
                </form>

                {searchResults.length > 0 && (
                    <div className="mt-2 bg-white/95 backdrop-blur-md rounded-xl border border-gray-200 shadow-xl overflow-hidden max-h-[180px] overflow-y-auto z-30">
                        {searchResults.map((result, idx) => (
                            <button
                                key={idx}
                                onClick={() => selectResult(result)}
                                className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors block truncate"
                            >
                                <span className="font-bold text-gray-800 break-words line-clamp-1">{result.display_name}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <Map 
                ref={mapRef}
                initialViewState={{ longitude: lng, latitude: lat, zoom: 12 }}
                onClick={handleMapClick}
                cursor="crosshair"
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
                }}
            >
                <FullscreenControl position="top-right" />
                <NavigationControl position="top-right" />

                <Marker longitude={lng} latitude={lat} anchor="bottom" draggable onDragEnd={handleMarkerDragEnd}>
                    <div className="text-[#FF2D20] drop-shadow-md cursor-pointer hover:scale-110 transition-transform">
                        <MapPin size={32} strokeWidth={2.5} fill="currentColor" />
                    </div>
                </Marker>
            </Map>

            <button 
                type="button"
                onClick={handleLocateMe} 
                className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-md p-2.5 rounded-xl text-[#FF2D20] hover:text-red-700 hover:bg-white shadow-[0_4px_12px_rgb(0,0,0,0.15)] transition-all z-10 font-bold text-sm flex items-center gap-2 border border-red-50"
            >
                <Locate size={16} strokeWidth={2.5} /> <span>Use My Location</span>
            </button>

            <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-md px-3 py-2 rounded-xl border border-gray-100 shadow-sm text-[10px] font-bold text-gray-500 uppercase tracking-widest z-10 pointer-events-none">
                {isGeocoding ? (
                    <span className="flex items-center gap-1 text-red-500"><Loader2 size={12} className="animate-spin" /> Detecting...</span>
                ) : (
                    <span>📍 Set Location</span>
                )}
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    return prevProps.latitude === nextProps.latitude && 
           prevProps.longitude === nextProps.longitude &&
           prevProps.heightClass === nextProps.heightClass &&
           prevProps.label === nextProps.label;
});

export default LocationPickerMap;
