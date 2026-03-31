import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Home, X, MapPin, BedDouble, Bath, Maximize, Heart, User,
    ChevronLeft, ChevronRight, Eye, Building, BarChart3,
    Calendar, MessageCircle, Mail, Phone,
} from 'lucide-react';
import type { House } from '../../types/explore';
import { formatCurrency } from '../../types/explore';

const ManualSlider = ({ images, altText }: { images?: { dir: string }[]; altText: string }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const next = (e: React.MouseEvent) => { e.stopPropagation(); if (images) setCurrentIndex((p) => (p + 1) % images.length); };
    const prev = (e: React.MouseEvent) => { e.stopPropagation(); if (images) setCurrentIndex((p) => (p - 1 + images.length) % images.length); };
    if (!images || images.length === 0) {
        return (<div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gradient-to-br from-gray-50 to-gray-200"><Home size={64} className="mb-4 opacity-20" /><span className="font-semibold tracking-wide">Image Not Provided</span></div>);
    }
    return (
        <div className="w-full h-full relative group">
            <AnimatePresence mode="popLayout" initial={false}>
                <motion.img key={currentIndex} src={`/storage/${images[currentIndex].dir}`} alt={`${altText} ${currentIndex + 1}`}
                    initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}
                    className="absolute inset-0 w-full h-full object-cover" />
            </AnimatePresence>
            {images.length > 1 && (<>
                <button onClick={prev} className="absolute left-6 top-1/2 -translate-y-1/2 bg-black/20 hover:bg-black/50 text-white p-3 rounded-full backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-lg z-20"><ChevronLeft size={24} /></button>
                <button onClick={next} className="absolute right-6 top-1/2 -translate-y-1/2 bg-black/20 hover:bg-black/50 text-white p-3 rounded-full backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-lg z-20"><ChevronRight size={24} /></button>
                <div className="absolute top-6 left-0 right-0 flex justify-center gap-2 z-10">
                    {images.map((_, idx) => (<button key={idx} onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); }} className={`h-1.5 rounded-full bg-white transition-all shadow-[0_2px_4px_rgb(0,0,0,0.4)] hover:opacity-100 ${idx === currentIndex ? 'w-8 opacity-100' : 'w-2.5 opacity-40'}`} />))}
                </div>
            </>)}
        </div>
    );
};

interface Props {
    house: House;
    allHouses: House[];
    wishlist: Set<number>;
    onClose: () => void;
    onToggleWishlist: (e: React.MouseEvent, id: number) => void;
    onSelectHouse: (id: number) => void;
}

export default function HouseDetailsModal({ house, allHouses, wishlist, onClose, onToggleWishlist, onSelectHouse }: Props) {
    const area = (house.dimensions?.width || 0) * (house.dimensions?.length || 0);
    const pricePerM2 = area > 0 ? house.price / area : 0;
    const ownerPhone = house.owner?.phones?.[0];
    const waLink = ownerPhone ? `https://wa.me/${ownerPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi, I'm interested in "${house.name}" listed at ${formatCurrency(house.price)}. Is it still available?`)}` : null;
    const similarHouses = allHouses.filter(h => h.id !== house.id && (h.address?.city === house.address?.city || (h.price >= house.price * 0.7 && h.price <= house.price * 1.3))).slice(0, 3);
    const stats = [
        { icon: BedDouble, label: 'Beds', value: house.rooms?.bedrooms || 0 },
        { icon: Bath, label: 'Baths', value: house.rooms?.bathrooms || 0 },
        { icon: Maximize, label: 'Area', value: `${area} m²` },
        { icon: Building, label: 'Floors', value: house.dimensions?.floors || 1 },
        { icon: BarChart3, label: 'Price/m²', value: pricePerM2 > 0 ? `${(pricePerM2 / 1_000_000).toFixed(1)}jt` : '-' },
        { icon: Eye, label: 'Views', value: house.views || 0 },
    ];

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <motion.div initial={{ y: 50, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0, scale: 0.95 }} transition={{ type: 'spring', duration: 0.5, bounce: 0.3 }}
                className="bg-white rounded-[2rem] overflow-hidden shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col relative" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-5 right-5 bg-black/20 hover:bg-black/40 backdrop-blur-md text-white p-2.5 rounded-full transition-all z-20"><X size={20} strokeWidth={2.5} /></button>
                <div className="overflow-y-auto w-full flex-1 pb-24 relative scrollbar-thin">
                    <div className="w-full h-80 sm:h-[420px] relative bg-gray-100 shrink-0">
                        <ManualSlider images={house.housePic} altText={house.name} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none z-10" />
                        <div className="absolute bottom-6 left-6 right-6 z-20 pointer-events-none">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="px-3 py-1 bg-[#FF2D20] text-white text-xs font-bold rounded-full uppercase tracking-wider shadow-lg">For Sale</span>
                                {house.created_at && (() => { const d = new Date(house.created_at); const w = new Date(); w.setDate(w.getDate()-7); return d > w ? <span className="px-3 py-1 bg-emerald-500 text-white text-xs font-bold rounded-full uppercase tracking-wider shadow-lg">New</span> : null; })()}
                            </div>
                            <h2 className="text-3xl sm:text-5xl font-extrabold text-white leading-tight drop-shadow-2xl">{house.name}</h2>
                            <div className="flex items-center gap-1.5 mt-2 text-white/80"><MapPin size={14} /><span className="text-sm font-medium">{house.address?.street}, {house.address?.city}</span></div>
                        </div>
                    </div>
                    <div className="p-6 sm:p-10 bg-white space-y-10">
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
                            {stats.map((s, i) => (<div key={i} className="flex flex-col items-center text-center p-3 bg-gray-50 rounded-2xl border border-gray-100 hover:border-[#FF2D20]/20 hover:bg-[#FF2D20]/5 transition-colors"><s.icon size={20} className="text-[#FF2D20] mb-1.5" /><span className="font-extrabold text-gray-900 text-lg leading-tight">{s.value}</span><span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">{s.label}</span></div>))}
                        </div>
                        <div className="pb-8 border-b border-gray-100">
                            <p className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-3"><span className="w-8 h-[2px] bg-[#FF2D20] inline-block"></span> Location</p>
                            <div className="flex items-start gap-3 text-gray-600">
                                <div className="bg-red-50 p-3 rounded-2xl text-[#FF2D20] shrink-0"><MapPin size={24} /></div>
                                <p className="text-base leading-relaxed">{house.address?.street}, {house.address?.kelurahan},<br />{house.address?.kecamatan}, {house.address?.city},<br />{house.address?.province} {house.address?.postal_code}</p>
                            </div>
                        </div>
                        <div className="pb-8 border-b border-gray-100">
                            <p className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-3"><span className="w-8 h-[2px] bg-[#FF2D20] inline-block"></span> About This Property</p>
                            <p className="text-gray-600 text-base leading-loose font-light whitespace-pre-wrap">{house.description}</p>
                            <div className="flex gap-4 mt-4 text-xs text-gray-400">
                                {house.created_at && <span className="flex items-center gap-1"><Calendar size={12} /> Listed {new Date(house.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</span>}
                                <span className="flex items-center gap-1"><Eye size={12} /> {house.views || 0} views</span>
                            </div>
                        </div>
                        {house.roomList && house.roomList.length > 0 && (
                            <div className="pb-8 border-b border-gray-100">
                                <p className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-3"><span className="w-8 h-[2px] bg-[#FF2D20] inline-block"></span> Room Details</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {house.roomList.map((room, idx) => (
                                        <div key={idx} className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
                                            {room.pics?.length > 0 && <div className="h-32 overflow-hidden"><img src={`/storage/${room.pics[0].dir}`} alt={room.name} className="w-full h-full object-cover" /></div>}
                                            <div className="p-4"><h5 className="font-bold text-gray-900 text-sm">{room.name}</h5><p className="text-xs text-gray-500 mt-1">{room.width}m × {room.length}m · {room.width * room.length} m²</p>{room.description && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{room.description}</p>}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {house.owner && (
                            <div className="pb-8 border-b border-gray-100">
                                <p className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-3"><span className="w-8 h-[2px] bg-[#FF2D20] inline-block"></span> Listing Agent</p>
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-gray-50 rounded-2xl p-5 border border-gray-100">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF2D20] to-red-700 flex items-center justify-center text-white text-xl font-extrabold shrink-0 shadow-lg">{house.owner.name.charAt(0).toUpperCase()}</div>
                                    <div className="flex-1">
                                        <h5 className="font-bold text-gray-900">{house.owner.name}</h5>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-gray-500">
                                            {house.owner.email && <span className="flex items-center gap-1"><Mail size={12} className="text-gray-400" /> {house.owner.email}</span>}
                                            {ownerPhone && <span className="flex items-center gap-1"><Phone size={12} className="text-gray-400" /> {ownerPhone}</span>}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 shrink-0 w-full sm:w-auto">
                                        {waLink && <a href={waLink} target="_blank" rel="noopener noreferrer" className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-md"><MessageCircle size={16} /> WhatsApp</a>}
                                        {house.owner.email && <a href={`mailto:${house.owner.email}?subject=Inquiry: ${house.name}&body=Hi, I'm interested in ${house.name} (${formatCurrency(house.price)}).`} className="flex-1 sm:flex-none bg-gray-900 hover:bg-gray-800 text-white px-5 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-md"><Mail size={16} /> Email</a>}
                                    </div>
                                </div>
                            </div>
                        )}
                        {similarHouses.length > 0 && (
                            <div>
                                <p className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-3"><span className="w-8 h-[2px] bg-[#FF2D20] inline-block"></span> Similar Properties</p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    {similarHouses.map(sh => (
                                        <div key={`sim-${sh.id}`} onClick={() => onSelectHouse(sh.id)} className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden cursor-pointer hover:border-[#FF2D20]/30 hover:shadow-md transition-all group">
                                            <div className="h-28 overflow-hidden bg-gray-200">{sh.housePic?.length ? <img src={`/storage/${sh.housePic[0].dir}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" /> : <div className="w-full h-full flex items-center justify-center"><Home size={24} className="text-gray-400" /></div>}</div>
                                            <div className="p-3"><h5 className="font-bold text-gray-900 text-sm truncate">{sh.name}</h5><p className="text-xs text-gray-500 truncate mt-0.5">{sh.address?.city}</p><p className="text-sm font-extrabold text-[#FF2D20] mt-1">{formatCurrency(sh.price)}</p><div className="flex gap-3 mt-2 text-[10px] font-bold text-gray-500"><span>{sh.rooms?.bedrooms || 0} Beds</span><span>·</span><span>{sh.rooms?.bathrooms || 0} Baths</span></div></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-gray-100 p-4 sm:px-8 sm:py-5 flex flex-col sm:flex-row items-center justify-between gap-4 z-10">
                    <div className="w-full sm:w-auto text-center sm:text-left">
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-0.5">Asking Price</p>
                        <p className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">{formatCurrency(house.price)}</p>
                    </div>
                    <div className="flex gap-3 w-full sm:w-auto">
                        <button onClick={(e) => onToggleWishlist(e, house.id)} className={`p-3.5 rounded-xl font-bold transition-all border ${wishlist.has(house.id) ? 'bg-[#FF2D20] text-white border-[#FF2D20]' : 'bg-white text-gray-600 border-gray-200 hover:text-[#FF2D20]'}`}><Heart size={18} fill={wishlist.has(house.id) ? 'currentColor' : 'none'} /></button>
                        {waLink ? (
                            <a href={waLink} target="_blank" rel="noopener noreferrer" className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white px-6 py-3.5 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-2 shadow-md"><MessageCircle size={18} /> Contact via WhatsApp</a>
                        ) : (
                            <button className="flex-1 sm:flex-none bg-[#FF2D20] hover:bg-black text-white px-8 py-3.5 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-2 shadow-[0_4px_14px_0_rgb(255,45,32,0.39)] hover:shadow-none hover:-translate-y-0.5"><User size={18} /> Schedule Viewing</button>
                        )}
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
