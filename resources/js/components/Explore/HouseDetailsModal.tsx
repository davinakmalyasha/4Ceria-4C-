import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Home, X, MapPin, BedDouble, Bath, Maximize, Heart, User,
    ChevronLeft, ChevronRight, Eye, Building, BarChart3,
    Calendar, MessageCircle, Mail, Phone,
} from 'lucide-react';
import type { House } from '../../types/explore';
import { formatCurrency } from '../../types/explore';
import ScheduleVisitModal from './ScheduleVisitModal';
import FirmSquadProfile from '../Dashboard/FirmSquadProfile';
import { Shield } from 'lucide-react';


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
    currentUser: any;
    onClose: () => void;
    onToggleWishlist: (e: React.MouseEvent, id: number) => void;
    onSelectHouse: (id: number) => void;
    onOpenChat: (ownerId: number) => void;
}

export default function HouseDetailsModal({ house, allHouses, wishlist, currentUser, onClose, onToggleWishlist, onSelectHouse, onOpenChat }: Props) {
    const isOwner = house.user_id === currentUser?.id;
    const [showSchedule, setShowSchedule] = useState(false);
    const [showSquadProfile, setShowSquadProfile] = useState(false);

    const area = (house.dimensions?.width || 0) * (house.dimensions?.length || 0);
    const pricePerM2 = area > 0 ? house.price / area : 0;
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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <motion.div initial={{ y: 50, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0, scale: 0.95 }} transition={{ type: 'spring', duration: 0.5, bounce: 0.3 }}
                className="bg-white rounded-[2.5rem] overflow-hidden shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col relative" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-5 right-5 bg-black/20 hover:bg-black/40 backdrop-blur-md text-white p-2.5 rounded-full transition-all z-20"><X size={20} strokeWidth={2.5} /></button>
                <div className="overflow-y-auto w-full flex-1 pb-44 relative scrollbar-thin bg-white">
                    {/* Hero Section with Padding */}
                    <div className="p-4 sm:p-6 lg:p-8">
                        <div className="w-full h-80 sm:h-[450px] lg:h-[500px] relative bg-gray-100 rounded-[2.5rem] overflow-hidden shadow-xl">
                            <ManualSlider images={house.housePic} altText={house.name} />
                            <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none z-10" />
                            <div className="absolute bottom-20 left-12 right-12 sm:bottom-32 sm:left-20 sm:right-20 z-20 pointer-events-none">
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="px-3 py-1 bg-[#FF2D20] text-white text-[10px] font-black rounded-full uppercase tracking-widest shadow-lg">For Sale</span>
                                    {house.created_at && (() => { const d = new Date(house.created_at); const w = new Date(); w.setDate(w.getDate()-7); return d > w ? <span className="px-3 py-1 bg-gray-900 text-white text-[10px] font-black rounded-full uppercase tracking-widest shadow-lg">New</span> : null; })()}
                                </div>
                                <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white leading-tight drop-shadow-2xl">{house.name}</h2>
                                <div className="flex items-center gap-2 mt-3 text-white/90 font-medium text-sm sm:text-lg">
                                    <MapPin size={20} className="text-[#FF2D20]" />
                                    <span>{house.address?.street}, {house.address?.city}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="px-8 sm:px-14 lg:px-20 pb-20">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-16 lg:gap-20">
                            {/* Main Content Column */}
                            <div className="lg:col-span-2 space-y-16">
                                <div className="grid grid-cols-3 sm:grid-cols-6 gap-6">
                                    {stats.map((s, i) => (<div key={i} className="flex flex-col items-center text-center p-4 bg-gray-50 rounded-[1.5rem] border border-gray-100 hover:border-[#FF2D20]/20 hover:bg-white hover:shadow-md transition-all"><s.icon size={24} className="text-[#FF2D20] mb-2" /><span className="font-extrabold text-gray-900 text-xl leading-tight">{s.value}</span><span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">{s.label}</span></div>))}
                                </div>

                                <div className="space-y-6">
                                    <p className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-3"><span className="w-10 h-[3px] bg-[#FF2D20] inline-block rounded-full"></span> About This Property</p>
                                    <p className="text-gray-600 text-lg leading-relaxed font-light whitespace-pre-wrap">{house.description}</p>
                                    <div className="flex gap-6 text-xs text-gray-400 font-medium">
                                        {house.created_at && <span className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-full"><Calendar size={14} /> Listed {new Date(house.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</span>}
                                        <span className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-full"><Eye size={14} /> {house.views || 0} views</span>
                                    </div>
                                </div>

                                {house.roomList && house.roomList.length > 0 && (
                                    <div className="space-y-6">
                                        <p className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-3"><span className="w-10 h-[3px] bg-[#FF2D20] inline-block rounded-full"></span> Internal Spaces</p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                            {house.roomList.map((room, idx) => (
                                                <div key={idx} className="bg-gray-50 rounded-3xl border border-gray-100 overflow-hidden group hover:border-[#FF2D20]/20 transition-all hover:bg-white hover:shadow-xl">
                                                    {room.pics?.length > 0 && <div className="h-40 overflow-hidden"><img src={`/storage/${room.pics[0].dir}`} alt={room.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /></div>}
                                                    <div className="p-5"><h5 className="font-extrabold text-gray-900 text-base">{room.name}</h5><p className="text-xs font-bold text-[#FF2D20] mt-1 bg-red-50 inline-block px-2 py-0.5 rounded-md">{room.width}m × {room.length}m · {room.width * room.length} m²</p>{room.description && <p className="text-sm text-gray-500 mt-3 line-clamp-3 leading-relaxed">{room.description}</p>}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Sidebar Column */}
                            <div className="lg:col-span-1 space-y-10">
                                <div className="bg-gray-50 rounded-[2rem] p-8 border border-gray-100 space-y-6">
                                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Location</p>
                                    <div className="flex items-start gap-4">
                                        <div className="bg-[#FF2D20] p-3.5 rounded-2xl text-white shadow-lg shadow-red-500/20 shrink-0"><MapPin size={24} /></div>
                                        <div>
                                            <p className="text-lg font-bold text-gray-900 leading-tight">{house.address?.street}</p>
                                            <p className="text-sm text-gray-500 mt-2 leading-relaxed">{house.address?.kelurahan}, {house.address?.kecamatan}<br />{house.address?.city}, {house.address?.province}<br />{house.address?.postal_code}</p>
                                        </div>
                                    </div>
                                </div>

                                {house.owner && !isOwner && (
                                    <div className="bg-gray-900 rounded-[2rem] p-8 text-white space-y-6 shadow-2xl relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF2D20] rounded-full blur-[60px] opacity-20 -mr-16 -mt-16" />
                                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest relative z-10">Listing Agent</p>
                                        <div className="flex items-center gap-4 relative z-10">
                                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF2D20] to-red-700 flex items-center justify-center text-white text-2xl font-black shrink-0 shadow-xl">{house.owner.name.charAt(0).toUpperCase()}</div>
                                            <div>
                                                <h5 className="font-extrabold text-lg">{house.owner.name}</h5>
                                                <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mt-0.5">Verified Partner</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 relative z-10 pt-2">
                                            {house.owner.phones && house.owner.phones.length > 0 && (
                                                <a
                                                    href={`https://wa.me/${house.owner.phones[0].replace(/\D/g, '')}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center justify-center gap-2 py-3 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl font-bold text-xs transition-all shadow-lg shadow-green-500/20"
                                                >
                                                    <MessageCircle size={14} fill="currentColor" /> WhatsApp
                                                </a>
                                            )}
                                            {house.owner.email && (
                                                <a
                                                    href={`mailto:${house.owner.email}`}
                                                    className="flex items-center justify-center gap-2 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs transition-all border border-white/10"
                                                >
                                                    <Mail size={14} /> Email
                                                </a>
                                            )}
                                        </div>
                                        {house.owner.role_type && ['arsitek', 'kontraktor'].includes(house.owner.role_type) && (
                                            <button
                                                onClick={() => setShowSquadProfile(true)}
                                                className="w-full relative z-10 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
                                            >
                                                <Shield size={14} /> View Squad Profile
                                            </button>
                                        )}
                                    </div>
                                )}

                                {similarHouses.length > 0 && (
                                    <div className="space-y-6">
                                        <p className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-3"><span className="w-10 h-[3px] bg-[#FF2D20] inline-block rounded-full"></span> Similar Properties</p>
                                        <div className="space-y-4">
                                            {similarHouses.map(sh => (
                                                <div key={`sim-${sh.id}`} onClick={() => onSelectHouse(sh.id)} className="flex items-center gap-4 bg-white rounded-2xl border border-gray-100 p-3 cursor-pointer hover:border-[#FF2D20]/30 hover:shadow-xl transition-all group">
                                                    <div className="w-24 h-24 rounded-xl overflow-hidden bg-gray-200 shrink-0">{sh.housePic?.length ? <img src={`/storage/${sh.housePic[0].dir}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" /> : <div className="w-full h-full flex items-center justify-center"><Home size={24} className="text-gray-400" /></div>}</div>
                                                    <div className="flex-1 min-w-0">
                                                        <h5 className="font-bold text-gray-900 text-sm truncate">{sh.name}</h5>
                                                        <p className="text-xs text-gray-500 truncate mt-0.5">{sh.address?.city}</p>
                                                        <p className="text-base font-black text-[#FF2D20] mt-1">{formatCurrency(sh.price)}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-2xl border-t border-gray-100 px-8 py-6 sm:px-16 sm:py-8 flex flex-col sm:flex-row items-center justify-between gap-6 z-10 shadow-[0_-10px_30px_rgb(0,0,0,0.05)]">
                    <div className="w-full sm:w-auto text-center sm:text-left">
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-0.5">Asking Price</p>
                        <p className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">{formatCurrency(house.price)}</p>
                    </div>
                    <div className="flex gap-3 w-full sm:w-auto items-center">
                        {!isOwner && (
                            <>
                                <button onClick={(e) => onToggleWishlist(e, house.id)} className={`p-3.5 rounded-xl font-bold transition-all border ${wishlist.has(house.id) ? 'bg-[#FF2D20] text-white border-[#FF2D20]' : 'bg-white text-gray-600 border-gray-200 hover:text-[#FF2D20]'}`}><Heart size={18} fill={wishlist.has(house.id) ? 'currentColor' : 'none'} /></button>
                                {house.owner?.phones && house.owner.phones.length > 0 && (
                                    <a
                                        href={`https://wa.me/${house.owner.phones[0].replace(/\D/g, '')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-3.5 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl font-bold transition-all shadow-lg shadow-green-500/20"
                                        title="WhatsApp Agent"
                                    >
                                        <MessageCircle size={18} fill="currentColor" />
                                    </a>
                                )}
                                <button onClick={() => setShowSchedule(true)} className="flex-1 sm:flex-none bg-[#FF2D20] hover:bg-black text-white px-8 py-3.5 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-2 shadow-[0_4px_14px_0_rgb(255,45,32,0.39)] hover:shadow-none hover:-translate-y-0.5"><User size={18} /> Schedule Viewing</button>
                            </>
                        )}
                        {isOwner && (
                            <div className="px-6 py-3.5 rounded-xl bg-gray-100 text-gray-500 font-bold text-sm italic">
                                This is your listed property
                            </div>
                        )}
                    </div>
                </div>

                {/* Schedule Visit Modal */}
                <AnimatePresence>
                    {showSchedule && <ScheduleVisitModal house={house} onClose={() => setShowSchedule(false)} onOpenChat={onOpenChat} />}
                </AnimatePresence>

                {showSquadProfile && (
                    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md overflow-y-auto" onClick={() => setShowSquadProfile(false)}>
                        <div className="w-full max-w-5xl my-8 relative pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                            <FirmSquadProfile 
                                ownerId={house.owner.id || house.user_id || 0} 
                                isGuestMode={true} 
                                onCloseGuest={() => setShowSquadProfile(false)} 
                                onOpenChat={(userObj) => onOpenChat(userObj.id)} 
                            />
                        </div>
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
}
