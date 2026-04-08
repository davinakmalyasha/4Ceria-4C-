import React from 'react';
import Map, { Marker, NavigationControl } from 'react-map-gl/maplibre';
import { MapPin } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';

interface Props {
    title: string;
    setTitle: (v: string) => void;
    description: string;
    setDescription: (v: string) => void;
    budget: string;
    setBudget: (v: string) => void;
    type: string;
    setType: (v: string) => void;
    deadline: string;
    setDeadline: (v: string) => void;
    lat: number | null;
    setLat: (v: number | null) => void;
    lng: number | null;
    setLng: (v: number | null) => void;
    updating: boolean;
    onSubmit: (e: React.FormEvent) => void;
    onCancel: () => void;
}

export const ProjectDetailEdit: React.FC<Props> = ({
    title, setTitle, description, setDescription,
    budget, setBudget, type, setType, deadline, setDeadline,
    lat, setLat, lng, setLng, updating, onSubmit, onCancel
}) => {

    return (
        <form onSubmit={onSubmit} className="space-y-8 pb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Project Heading</label>
                    <input 
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        className="w-full px-5 py-4 rounded-2xl border border-zinc-100 focus:border-red-500 bg-zinc-50/50 outline-none transition-all font-bold text-zinc-900 text-[15px] shadow-inner"
                        required
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Financial Cap (IDR)</label>
                    <input 
                        type="number"
                        value={budget}
                        onChange={e => setBudget(e.target.value)}
                        className="w-full px-5 py-4 rounded-2xl border border-zinc-100 focus:border-red-500 bg-zinc-50/50 outline-none transition-all font-bold text-zinc-900 text-[15px] shadow-inner"
                        required
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Expertise Level</label>
                    <select 
                        value={type}
                        onChange={e => setType(e.target.value)}
                        className="w-full px-5 py-4 rounded-2xl border border-zinc-100 focus:border-red-500 bg-zinc-50/50 outline-none transition-all font-bold text-zinc-900 text-[15px] shadow-inner appearance-none"
                    >
                        <option value="arsitek">Architectural Only</option>
                        <option value="kontraktor">Construction Only</option>
                        <option value="both">Full Spectrum (Both)</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Desired Completion</label>
                    <input 
                        type="date"
                        value={deadline}
                        onChange={e => setDeadline(e.target.value)}
                        className="w-full px-5 py-4 rounded-2xl border border-zinc-100 focus:border-red-500 bg-zinc-50/50 outline-none transition-all font-bold text-zinc-900 text-[15px] shadow-inner"
                    />
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Comprehensive Brief</label>
                <textarea 
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={6}
                    className="w-full px-5 py-4 rounded-2xl border border-zinc-100 focus:border-red-500 bg-zinc-50/50 outline-none transition-all font-bold text-zinc-900 text-[15px] shadow-inner resize-none"
                    required
                />
            </div>

            <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span> Geolocate Project Site
                </label>
                <div className="h-[350px] w-full rounded-3xl overflow-hidden border border-zinc-100 shadow-xl relative ring-8 ring-zinc-50">
                    <Map
                        initialViewState={{ 
                            longitude: lng || 106.8456, 
                            latitude: lat || -6.2088, 
                            zoom: 12 
                        }}
                        style={{ width: '100%', height: '100%' }}
                        mapStyle={{ 
                            version: 8, 
                            sources: { 
                                'raster-tiles': { 
                                    type: 'raster', 
                                    tiles: ['https://cartodb-basemaps-a.global.ssl.fastly.net/rastertiles/voyager/{z}/{x}/{y}.png'], 
                                    tileSize: 256, 
                                    attribution: '&copy; OpenStreetMap contributors' 
                                } 
                            }, 
                            layers: [{ id: 'simple-tiles', type: 'raster', source: 'raster-tiles' }] 
                        }}
                        onClick={(e) => {
                            setLat(e.lngLat.lat);
                            setLng(e.lngLat.lng);
                        }}
                    >
                        <NavigationControl position="top-right" showCompass={false} />
                        {lat && lng && (
                            <Marker longitude={lng} latitude={lat} anchor="bottom">
                                <div className="bg-red-600 p-2.5 rounded-full shadow-2xl border-2 border-white ring-8 ring-red-500/20">
                                    <MapPin size={22} className="text-white" />
                                </div>
                            </Marker>
                        )}
                    </Map>
                </div>
            </div>

            <div className="flex gap-4">
                <button 
                    type="submit"
                    disabled={updating}
                    className="flex-1 bg-zinc-900 hover:bg-black text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.3em] shadow-2xl shadow-zinc-200 transition-all active:scale-95 disabled:opacity-50"
                >
                    {updating ? 'Processing...' : 'Synchronize Updates'}
                </button>

                <button 
                    type="button"
                    onClick={onCancel}
                    className="px-8 border border-zinc-200 hover:bg-zinc-50 text-zinc-500 font-bold text-xs uppercase tracking-widest rounded-2xl transition-colors"
                >
                    Cancel
                </button>
            </div>
        </form>
    );
};
