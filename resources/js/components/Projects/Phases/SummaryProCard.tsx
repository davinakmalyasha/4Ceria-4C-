import React from 'react';
import { Star, MessageCircle, Smartphone } from 'lucide-react';

interface SummaryProCardProps {
    pro: any;
    roleLabel: string;
    onOpenChat?: (user: any) => void;
}

export default function SummaryProCard({ pro, roleLabel, onOpenChat }: SummaryProCardProps) {
    if (!pro) return null;

    const name = String(pro?.user?.name || pro?.nama || pro?.name || 'Professional');
    const rating = pro?.average_rating || 5.0;
    const phone = pro?.user?.phone_number || pro?.phone_number;
    const isExternal = !!pro?.is_external;

    const waUrl = phone 
        ? `https://wa.me/${String(phone).replace(/\D/g, '').replace(/^0/, '62')}`
        : '#';

    return (
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center overflow-hidden border border-slate-100 shadow-inner shrink-0">
                    {pro?.foto ? (
                        <img src={`/storage/${pro.foto}`} alt={name} className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-xl font-black text-slate-300">{name.charAt(0)}</span>
                    )}
                </div>
                <div>
                    <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{roleLabel}</span>
                        {isExternal && (
                            <span className="px-1.5 py-0.5 bg-slate-900 text-white text-[7px] font-black rounded-md tracking-tighter uppercase">External</span>
                        )}
                    </div>
                    <h4 className="text-base font-black text-slate-900 tracking-tight leading-tight">{name}</h4>
                    <div className="flex items-center gap-1 mt-1">
                        <Star size={11} className="text-amber-400 fill-amber-400" />
                        <span className="text-xs font-bold text-slate-500">{rating} Rating</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
                {phone && (
                    <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-[#25D366] text-white rounded-xl text-[9px] font-black uppercase tracking-wider hover:bg-[#20bd5a] hover:scale-105 active:scale-95 transition-all shadow-sm"
                    >
                        <Smartphone size={12} /> WhatsApp
                    </a>
                )}
                {onOpenChat && pro?.user && (
                    <button
                        onClick={() => onOpenChat(pro.user)}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-wider hover:bg-black hover:scale-105 active:scale-95 transition-all shadow-sm"
                    >
                        <MessageCircle size={12} /> Open Chat
                    </button>
                )}
            </div>
        </div>
    );
}
