import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCircle, Briefcase, MessageSquare, Star, X } from 'lucide-react';

interface Notification {
    id: number;
    icon: React.ReactNode;
    title: string;
    body: string;
    time: string;
    read: boolean;
}

const MOCK_NOTIFICATIONS: Notification[] = [
    { id: 1, icon: <Briefcase size={16} className="text-blue-500" />, title: 'Bid Diterima!', body: 'Proyek "Renovasi Atap" menerima penawaran dari Arsitek Budi.', time: '2 menit lalu', read: false },
    { id: 2, icon: <CheckCircle size={16} className="text-green-500" />, title: 'Milestone Disetujui', body: 'Milestone "Desain Awal" pada proyek Anda telah diverifikasi oleh Admin.', time: '1 jam lalu', read: false },
    { id: 3, icon: <Star size={16} className="text-amber-500" />, title: 'Profesional Ter-Verifikasi', body: 'Kontraktor "PT. Karya Mandiri" telah diverifikasi oleh Admin 4C.', time: '3 jam lalu', read: true },
    { id: 4, icon: <MessageSquare size={16} className="text-purple-500" />, title: 'Pesan Baru', body: 'Anda memiliki pesan baru dari Kontraktor Rina mengenai proyek Anda.', time: '5 jam lalu', read: true },
];

export default function NotificationsDropdown() {
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);
    const ref = useRef<HTMLDivElement>(null);

    const unreadCount = notifications.filter(n => !n.read).length;

    useEffect(() => {
        const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const markRead = (id: number) => {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    };

    const markAllRead = () => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    };

    return (
        <div ref={ref} className="relative">
            <button onClick={() => setOpen(!open)} className="relative p-2 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors">
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-[#FF2D20] text-white text-[10px] font-black rounded-full flex items-center justify-center ring-2 ring-white animate-pulse">
                        {unreadCount}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.95 }}
                        className="absolute right-0 top-full mt-2 w-[380px] bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-gray-100 z-[70] overflow-hidden"
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                            <h4 className="font-black text-gray-900">Notifikasi</h4>
                            <div className="flex items-center gap-2">
                                {unreadCount > 0 && (
                                    <button onClick={markAllRead} className="text-xs font-bold text-[#FF2D20] hover:underline">Tandai semua dibaca</button>
                                )}
                                <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={16} /></button>
                            </div>
                        </div>

                        <div className="max-h-[400px] overflow-y-auto">
                            {notifications.length === 0 ? (
                                <div className="py-12 text-center text-gray-400">
                                    <Bell size={32} className="mx-auto mb-3 opacity-30" />
                                    <p className="font-semibold">Belum ada notifikasi</p>
                                </div>
                            ) : (
                                notifications.map(n => (
                                    <div
                                        key={n.id}
                                        onClick={() => markRead(n.id)}
                                        className={`flex items-start gap-3 px-5 py-4 border-b border-gray-50 cursor-pointer transition-colors hover:bg-gray-50 ${!n.read ? 'bg-red-50/40' : ''}`}
                                    >
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${!n.read ? 'bg-white shadow-sm border border-gray-100' : 'bg-gray-100'}`}>
                                            {n.icon}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className={`text-sm font-bold leading-tight ${!n.read ? 'text-gray-900' : 'text-gray-600'}`}>{n.title}</p>
                                                {!n.read && <span className="w-2 h-2 bg-[#FF2D20] rounded-full shrink-0" />}
                                            </div>
                                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                                            <p className="text-[10px] text-gray-400 font-semibold mt-1">{n.time}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
