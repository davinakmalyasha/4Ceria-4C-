import React, { useState } from 'react';
import { Bell, Check, MessageSquare, DollarSign, Shield, Gavel } from 'lucide-react';

interface Notif { id: number; icon: React.ElementType; iconColor: string; msg: string; time: string; read: boolean }

const INITIAL: Notif[] = [
    { id: 1, icon: Gavel, iconColor: 'text-red-500', msg: 'New bid received on Villa Bali project', time: '2m ago', read: false },
    { id: 2, icon: DollarSign, iconColor: 'text-emerald-500', msg: 'Payment of Rp 25.000.000 released to escrow', time: '15m ago', read: false },
    { id: 3, icon: Check, iconColor: 'text-blue-500', msg: 'Milestone "Foundation" approved by client', time: '1h ago', read: false },
    { id: 4, icon: MessageSquare, iconColor: 'text-amber-500', msg: 'Andi Pratama sent you a message', time: '3h ago', read: false },
    { id: 5, icon: Shield, iconColor: 'text-purple-500', msg: 'Your firm verification has been approved', time: '1d ago', read: false },
];

export default function NotificationWidget() {
    const [notifs, setNotifs] = useState<Notif[]>(INITIAL);
    const unread = notifs.filter(n => !n.read).length;

    const markRead = (id: number) => {
        setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    };

    const markAllRead = () => {
        setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    };

    return (
        <div className="p-5 bg-white rounded-2xl border border-neutral-200 shadow-sm max-w-sm mx-auto my-4 transition-all hover:shadow-md">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Bell className="w-4 h-4 text-neutral-700" />
                        {unread > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                                {unread}
                            </span>
                        )}
                    </div>
                    <h4 className="font-extrabold text-neutral-800 text-sm">Notifications</h4>
                </div>
                {unread > 0 && (
                    <button onClick={markAllRead} className="text-[10px] text-red-500 font-bold hover:underline">
                        Mark all read
                    </button>
                )}
            </div>

            <div className="space-y-1.5">
                {notifs.map(n => (
                    <div key={n.id} className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all ${
                        n.read ? 'bg-neutral-50 border-neutral-100 opacity-50' : 'bg-white border-neutral-200 hover:bg-neutral-50'
                    }`}>
                        <n.icon className={`w-4 h-4 ${n.iconColor} mt-0.5 shrink-0`} />
                        <div className="flex-1 min-w-0">
                            <p className={`text-xs leading-snug ${n.read ? 'text-neutral-400' : 'text-neutral-800 font-bold'}`}>
                                {n.msg}
                            </p>
                            <p className="text-[10px] text-neutral-400 mt-0.5">{n.time}</p>
                        </div>
                        {!n.read && (
                            <button onClick={() => markRead(n.id)} className="text-[9px] text-neutral-400 hover:text-neutral-600 font-bold shrink-0 mt-0.5">
                                Read
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
