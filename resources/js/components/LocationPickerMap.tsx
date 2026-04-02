import React, { useRef, useState } from 'react';
import Map, { Marker, NavigationControl, FullscreenControl } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Locate, MapPin, Loader2 } from 'lucide-react';

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
}

async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeoData> {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=id`,
            { headers: { 'User-Agent': '4Ceria-App' } }
        );
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

export default function LocationPickerMap({ latitude, longitude, onChange }: LocationPickerMapProps) {
    const mapRef = useRef<MapRef>(null);
    const [isGeocoding, setIsGeocoding] = useState(false);

    const lat = latitude || -6.1751;
    const lng = longitude || 106.8271;

    const handleGeoLookup = async (newLat: number, newLng: number) => {
        setIsGeocoding(true);
        const geoData = await reverseGeocode(newLat, newLng);
        onChange(newLat, newLng, geoData);
        setIsGeocoding(false);
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

    return (
        <div className="h-[300px] w-full rounded-2xl overflow-hidden shadow-sm border border-gray-200 relative group">
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
                className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-md p-2.5 rounded-xl text-blue-600 hover:text-blue-800 hover:bg-white shadow-[0_4px_12px_rgb(0,0,0,0.15)] transition-all z-10 font-medium text-sm flex items-center gap-2 border border-blue-100"
            >
                <Locate size={16} /> <span>Use My Location</span>
            </button>

            <div className="absolute top-4 left-4 right-14 bg-white/90 backdrop-blur-md px-4 py-2.5 rounded-xl border border-gray-100 shadow-sm text-xs font-bold text-gray-700 z-10 flex items-center justify-between pointer-events-none">
                <span>Click anywhere on the map to set property location</span>
                {isGeocoding ? (
                    <span className="flex items-center gap-1 text-red-500"><Loader2 size={12} className="animate-spin" /> Detecting...</span>
                ) : (
                    <span className="opacity-50 hidden sm:block">Or drag the pin</span>
                )}
            </div>
        </div>
    );
}
