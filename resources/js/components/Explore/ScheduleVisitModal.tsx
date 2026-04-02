import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Clock, DollarSign, MessageSquare, CheckCircle, Home } from 'lucide-react';
import { formatCurrency } from '../../types/explore';
import type { House } from '../../types/explore';

interface Props {
    house: House;
    onClose: () => void;
}

export default function ScheduleVisitModal({ house, onClose }: Props) {
    const [mode, setMode] = useState<'visit' | 'offer'>('visit');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('10:00');
    const [offerPrice, setOfferPrice] = useState('');
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setTimeout(() => {
            setIsSubmitting(false);
            setShowSuccess(true);
        }, 1500);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 p-6">
                    <div className="absolute right-0 top-0 w-40 h-40 bg-[#FF2D20] rounded-full blur-[80px] opacity-30 mix-blend-screen" />
                    <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors">
                        <X size={16} />
                    </button>
                    <div className="flex items-center gap-3 relative z-10">
                        <div className="w-14 h-14 rounded-xl bg-white/10 border border-white/10 overflow-hidden shrink-0">
                            {house.housePic?.[0]?.dir ? <img src={`/storage/${house.housePic[0].dir}`} className="w-full h-full object-cover" /> : <Home className="w-full h-full p-3 text-white/40" />}
                        </div>
                        <div className="text-white">
                            <h3 className="font-extrabold text-lg leading-tight line-clamp-1">{house.name}</h3>
                            <p className="text-gray-300 text-sm font-bold">{formatCurrency(house.price)}</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 md:p-8 overflow-y-auto">
                    <AnimatePresence mode="wait">
                        {showSuccess ? (
                            <motion.div key="success" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-10 text-center">
                                <div className="w-20 h-20 rounded-full bg-red-50 text-[#FF2D20] flex items-center justify-center mb-6"><CheckCircle size={40} /></div>
                                <h3 className="text-2xl font-black text-gray-900 mb-2">{mode === 'visit' ? 'Kunjungan Dijadwalkan!' : 'Penawaran Terkirim!'}</h3>
                                <p className="text-gray-500 font-medium max-w-xs">Admin kami akan segera menghubungi Anda untuk mengonfirmasi {mode === 'visit' ? 'jadwal kunjungan' : 'penawaran harga'} properti ini.</p>
                                <button onClick={onClose} className="mt-6 px-6 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-colors">Tutup</button>
                            </motion.div>
                        ) : (
                            <motion.form key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onSubmit={handleSubmit} className="space-y-5">
                                {/* Mode Toggle */}
                                <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
                                    {(['visit', 'offer'] as const).map(m => (
                                        <button key={m} type="button" onClick={() => setMode(m)}
                                            className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${mode === m ? 'bg-white text-gray-900 shadow-md' : 'text-gray-500 hover:text-gray-700'}`}>
                                            {m === 'visit' ? <><Calendar size={14} /> Jadwalkan Kunjungan</> : <><DollarSign size={14} /> Ajukan Penawaran</>}
                                        </button>
                                    ))}
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5"><Calendar size={14} className="text-[#FF2D20]" /> Tanggal</label>
                                        <input type="date" value={date} onChange={e => setDate(e.target.value)} required min={new Date().toISOString().split('T')[0]}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#FF2D20] focus:ring-4 focus:ring-red-100 outline-none transition-all text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5"><Clock size={14} className="text-[#FF2D20]" /> Waktu</label>
                                        <input type="time" value={time} onChange={e => setTime(e.target.value)} required
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#FF2D20] focus:ring-4 focus:ring-red-100 outline-none transition-all text-sm" />
                                    </div>
                                </div>

                                {mode === 'offer' && (
                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                                        <label className="block text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5"><DollarSign size={14} className="text-[#FF2D20]" /> Harga Penawaran (Rp)</label>
                                        <input type="number" value={offerPrice} onChange={e => setOfferPrice(e.target.value)} required placeholder="0"
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#FF2D20] focus:ring-4 focus:ring-red-100 outline-none transition-all text-sm font-bold text-xl" />
                                        {offerPrice && <p className="text-xs text-[#FF2D20] font-bold mt-1">{Number(offerPrice).toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })}</p>}
                                    </motion.div>
                                )}

                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5"><MessageSquare size={14} className="text-[#FF2D20]" /> Pesan (Opsional)</label>
                                    <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} placeholder="Informasi tambahan untuk agen kami..."
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#FF2D20] focus:ring-4 focus:ring-red-100 outline-none transition-all text-sm resize-none" />
                                </div>

                                <button type="submit" disabled={isSubmitting}
                                    className="w-full py-4 bg-[#FF2D20] hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-bold text-lg transition-all shadow-lg shadow-red-500/30 flex items-center justify-center gap-2">
                                    {isSubmitting ? <span className="animate-pulse">Memproses...</span> : mode === 'visit' ? 'Jadwalkan Sekarang' : 'Kirim Penawaran'}
                                </button>
                            </motion.form>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
}
