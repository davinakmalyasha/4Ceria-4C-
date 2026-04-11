import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Home, GitCompareArrows, BedDouble, Bath, Maximize, MapPin } from 'lucide-react';
import type { House } from '../../types/explore';
import { formatCurrency, MAX_COMPARE } from '../../types/explore';

interface CompareToolProps {
    compareIds: number[];
    setCompareIds: (ids: number[]) => void;
    compareHouses: House[];
    showCompare: boolean;
    setShowCompare: (show: boolean) => void;
    onToggleCompare: (e: React.MouseEvent, id: number) => void;
    onSelectHouse: (id: number) => void;
}

export default function CompareTool({
    compareIds, setCompareIds, compareHouses,
    showCompare, setShowCompare, onToggleCompare, onSelectHouse,
}: CompareToolProps) {
    const modalContent = (
        <AnimatePresence>
            {showCompare && compareHouses.length > 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
                    onClick={() => setShowCompare(false)}
                >
                    <motion.div
                        initial={{ y: 50, scale: 0.95 }}
                        animate={{ y: 0, scale: 1 }}
                        exit={{ y: 20, scale: 0.95 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white rounded-[2rem] shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
                    >
                        <div className="p-6 border-b border-gray-100 gap-4 flex justify-between items-center bg-gray-50/50">
                            <div className="pr-10">
                                <h3 className="text-2xl font-bold text-gray-900">Compare Properties</h3>
                                <p className="text-sm text-gray-500">Side-by-side comparison of {compareHouses.length} selected properties</p>
                            </div>
                            <button onClick={() => setShowCompare(false)} className="p-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-full transition-all text-gray-500 hover:text-[#FF2D20] shadow-sm">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-x-auto overflow-y-auto p-6 bg-white scrollbar-thin">
                            <table className="w-full text-left border-collapse min-w-[900px] table-fixed">
                                <thead>
                                    <tr>
                                        <th className="w-48 border-b-2 border-gray-100 pb-4 font-bold text-gray-400 uppercase tracking-widest text-[10px]">Features</th>
                                        {compareHouses.map(h => (
                                            <th key={`head-${h.id}`} className="w-[350px] border-b-2 border-gray-100 pb-4 pr-8 align-bottom">
                                                <div className="w-full h-44 bg-gray-100 rounded-2xl overflow-hidden mb-4 shadow-inner relative group/img">
                                                    <button onClick={(e) => onToggleCompare(e, h.id)} className="absolute top-2 right-2 bg-white/90 p-1.5 rounded-full z-10 hover:bg-red-50 hover:text-red-500 transition-colors opacity-0 group-hover/img:opacity-100 shadow-sm">
                                                        <X size={14} />
                                                    </button>
                                                    {h.housePic?.length ? <img src={`/storage/${h.housePic[0].dir}`} className="w-full h-full object-cover" /> : <Home className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-300 opacity-50" size={40} />}
                                                </div>
                                                <h4 className="text-lg font-extrabold text-gray-900 line-clamp-1">{h.name}</h4>
                                                <p className="text-[#FF2D20] font-black text-xl mt-1">{formatCurrency(h.price)}</p>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="text-sm divide-y divide-gray-100">
                                    <tr>
                                        <td className="py-6 font-bold text-gray-400 uppercase tracking-widest text-[10px] align-top">Location</td>
                                        {compareHouses.map(h => <td key={`loc-${h.id}`} className="py-6 pr-8 font-semibold text-gray-900 leading-six">{h.address?.street}<br /><span className="text-gray-500 font-medium text-xs">{h.address?.city}, {h.address?.province}</span></td>)}
                                    </tr>
                                    <tr>
                                        <td className="py-6 font-bold text-gray-400 uppercase tracking-widest text-[10px] align-top">Rooms</td>
                                        {compareHouses.map(h => <td key={`room-${h.id}`} className="py-6 pr-8 font-semibold text-gray-900"><div className="flex gap-4"><span className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg"><BedDouble size={16} className="text-gray-400" /> {h.rooms?.bedrooms || 0}</span><span className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg"><Bath size={16} className="text-gray-400" /> {h.rooms?.bathrooms || 0}</span></div></td>)}
                                    </tr>
                                    <tr>
                                        <td className="py-6 font-bold text-gray-400 uppercase tracking-widest text-[10px] align-top">Area Size</td>
                                        {compareHouses.map(h => <td key={`area-${h.id}`} className="py-6 pr-8 font-semibold text-gray-900"><div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg"><Maximize size={16} className="text-gray-400" /> {h.dimensions?.width}x{h.dimensions?.length}m ({(h.dimensions?.width || 0) * (h.dimensions?.length || 0)} m²)</div></td>)}
                                    </tr>
                                    <tr>
                                        <td className="py-6 font-bold text-gray-400 uppercase tracking-widest text-[10px] align-top">Price per m²</td>
                                        {compareHouses.map(h => { const a = (h.dimensions?.width || 0) * (h.dimensions?.length || 0); return <td key={`price-${h.id}`} className="py-6 pr-8 font-semibold text-gray-900">{a > 0 ? <span className="bg-red-50 text-[#FF2D20] px-3 py-1.5 rounded-lg">{formatCurrency(h.price / a)}/m²</span> : '-'}</td>; })}
                                    </tr>
                                    <tr>
                                        <td className="py-6 font-bold text-gray-400 uppercase tracking-widest text-[10px] align-top">Action</td>
                                        {compareHouses.map(h => <td key={`act-${h.id}`} className="py-6 pr-8"><button onClick={() => { setShowCompare(false); onSelectHouse(h.id); }} className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-[#FF2D20] transition-all hover:shadow-lg active:scale-[0.98]">View Property</button></td>)}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return (
        <>
            {/* Floating Bar */}
            <AnimatePresence>
                {compareIds.length > 0 && (
                    <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white rounded-2xl shadow-[0_12px_40px_rgb(0,0,0,0.2)] border border-gray-200 p-4 z-[150] flex items-center gap-6 min-w-[320px]">
                        <div className="flex items-center gap-3">
                            <div className="bg-gray-100 p-2.5 rounded-xl text-gray-900"><GitCompareArrows size={20} /></div>
                            <div>
                                <p className="text-sm font-bold text-gray-900">{compareIds.length} properties selected</p>
                                <p className="text-[11px] text-gray-500">Max {MAX_COMPARE} properties to compare</p>
                            </div>
                        </div>
                        <div className="flex gap-2 ml-auto">
                            <button onClick={() => setCompareIds([])} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">Clear</button>
                            <button onClick={() => setShowCompare(true)} disabled={compareIds.length < 2} className="px-6 py-2 bg-[#FF2D20] text-white text-sm font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-700 transition-colors shadow-md">Compare</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Compare Modal rendered via Portal */}
            {createPortal(modalContent, document.body)}
        </>
    );
}
