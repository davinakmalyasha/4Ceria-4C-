import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCircle, Briefcase, MessageSquare, Star, X, Info } from 'lucide-react';
import axios from 'axios';

interface Notification {
    id: number;
    type: string;
    title: string;
    body: string;
    read_at: string | null;
    created_at: string;
    data?: any;
}

export default function NotificationsDropdown() {
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const unreadCount = notifications.filter(n => !n.read_at).length;

    const fetchNotifications = async () => {
        setIsLoading(true);
        try {
            const res = await axios.get('/notifications');
            setNotifications(res.data.data);
        } catch (err) {
            console.error('Failed to fetch notifications:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
        
        const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const markRead = async (id: number) => {
        try {
            await axios.post(`/notifications/${id}/read`);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
        } catch (err) {
            console.error('Failed to mark notification as read:', err);
        }
    };

    const markAllRead = async () => {
        try {
            await axios.post('/notifications/read-all');
            setNotifications(prev => prev.map(n => ({ ...n, read_at: new Date().toISOString() })));
        } catch (err) {
            console.error('Failed to mark all notifications as read:', err);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'bid_received': return <Briefcase size={16} className="text-blue-500" />;
            case 'bid_accepted': return <CheckCircle size={16} className="text-green-500" />;
            case 'milestone_updated': return <Star size={16} className="text-amber-500" />;
            default: return <Info size={16} className="text-gray-500" />;
        }
    };

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'Baru saja';
        if (diffMins < 60) return `${diffMins}m lalu`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}j lalu`;
        return date.toLocaleDateString('id-ID');
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
                                        onClick={() => !n.read_at && markRead(n.id)}
                                        className={`flex items-start gap-3 px-5 py-4 border-b border-gray-50 cursor-pointer transition-colors hover:bg-gray-50 ${!n.read_at ? 'bg-red-50/40' : ''}`}
                                    >
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${!n.read_at ? 'bg-white shadow-sm border border-gray-100' : 'bg-gray-100'}`}>
                                            {getIcon(n.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className={`text-sm font-bold leading-tight ${!n.read_at ? 'text-gray-900' : 'text-gray-600'}`}>{n.title}</p>
                                                {!n.read_at && <span className="w-2 h-2 bg-[#FF2D20] rounded-full shrink-0" />}
                                            </div>
                                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                                            <p className="text-[10px] text-gray-400 font-semibold mt-1">{formatTime(n.created_at)}</p>
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
