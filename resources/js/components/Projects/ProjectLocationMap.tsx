import React from 'react';
import Map, { Marker, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPin } from 'lucide-react';

interface ProjectLocationMapProps {
    latitude: string | number;
    longitude: string | number;
    title: string;
    showGoToLocationButton?: boolean;
}

export default function ProjectLocationMap({ latitude, longitude, title, showGoToLocationButton = false }: ProjectLocationMapProps) {
    // Ensure we have numbers for the map coordinates
    const lat = typeof latitude === 'string' ? parseFloat(latitude) : latitude;
    const lng = typeof longitude === 'string' ? parseFloat(longitude) : longitude;

    // Safety check for invalid coordinates
    if (isNaN(lat) || isNaN(lng)) return null;

    return (
        <div className="h-[250px] w-full rounded-3xl overflow-hidden shadow-sm border border-gray-100 relative mb-6 group">
            <Map
                initialViewState={{ 
                    longitude: lng, 
                    latitude: lat, 
                    zoom: 14 
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
                }}
                scrollZoom={false}
                dragPan={true}
            >
                <NavigationControl position="top-right" showCompass={false} />

                <Marker longitude={lng} latitude={lat} anchor="bottom">
                    <div className="flex flex-col items-center">
                        <div className="bg-[#FF2D20] p-2.5 rounded-full shadow-xl border-4 border-white transform transition-transform group-hover:scale-110">
                            <MapPin size={22} className="text-white fill-white" />
                        </div>
                        <div className="mt-2 px-4 py-1.5 bg-white/95 backdrop-blur-md rounded-xl border border-gray-100 shadow-xl whitespace-nowrap">
                            <span className="text-[11px] font-black text-gray-900 tracking-tight uppercase">{title}</span>
                        </div>
                    </div>
                </Marker>
            </Map>
            <div className="absolute top-4 left-4 z-10">
                <span className="bg-gray-900/10 backdrop-blur-md text-[10px] font-bold text-gray-900 px-3 py-1 rounded-full uppercase tracking-widest border border-gray-900/5">Project Site</span>
            </div>
            {showGoToLocationButton && (
                <div className="absolute top-[82px] right-[10px] z-10">
                    <a
                        href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-[29px] h-[29px] bg-white hover:bg-gray-55 flex items-center justify-center rounded-md shadow-md border border-gray-200/80 transition-all hover:scale-105"
                        title="Go to Google Maps Location"
                    >
                        <MapPin size={14} className="text-[#FF2D20] fill-[#FF2D20]/10" />
                    </a>
                </div>
            )}
        </div>
    );
}
