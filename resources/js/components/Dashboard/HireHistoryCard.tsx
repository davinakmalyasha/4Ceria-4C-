import React from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Phone, Briefcase, Calendar, ExternalLink } from 'lucide-react';
import { HireHistory } from '../../types/hire_history.types';

interface HireHistoryCardProps {
    hire: HireHistory;
    onOpenChat: (userId: number) => void;
}

export const HireHistoryCard: React.FC<HireHistoryCardProps> = ({ hire, onOpenChat }) => {
    const formattedDate = new Date(hire.hired_at).toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const openWhatsApp = () => {
        if (!hire.phone) return;
        // Remove non-numeric characters
        const cleanPhone = hire.phone.replace(/\D/g, '');
        // If it starts with 0, replace with 62
        const finalPhone = cleanPhone.startsWith('0') ? '62' + cleanPhone.substring(1) : cleanPhone;
        window.open(`https://wa.me/${finalPhone}`, '_blank');
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="group bg-white rounded-[2rem] p-6 shadow-sm hover:shadow-xl hover:shadow-black/5 border border-gray-100 transition-all duration-500"
        >
            <div className="flex items-start gap-5">
                {/* Avatar / Icon */}
                <div className="relative">
                    {hire.avatar ? (
                        <img 
                            src={hire.avatar} 
                            alt={hire.name} 
                            className="w-20 h-20 rounded-3xl object-cover ring-4 ring-gray-50 group-hover:ring-red-50 transition-all"
                        />
                    ) : (
                        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-red-200">
                            {hire.name.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div className="absolute -bottom-2 -right-2 bg-white p-1.5 rounded-xl shadow-lg border border-gray-100">
                        <Briefcase size={14} className="text-red-500" />
                    </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                        <div>
                            <h4 className="text-lg font-black text-gray-900 group-hover:text-[#FF2D20] transition-colors truncate">
                                {hire.name}
                            </h4>
                            <p className="text-[11px] font-black uppercase tracking-widest text-gray-400 mt-0.5">
                                {hire.role}
                            </p>
                        </div>
                        <div className="text-right">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-50 text-gray-500 rounded-full text-[10px] font-bold">
                                <Calendar size={12} />
                                {formattedDate}
                            </span>
                        </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-xl text-[11px] font-semibold text-gray-600 border border-gray-100">
                            <span className="text-gray-400">Project:</span>
                            <span className="truncate max-w-[150px]">{hire.project_title}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="mt-6 pt-6 border-t border-gray-50 grid grid-cols-2 gap-3">
                <button
                    onClick={() => onOpenChat(hire.user_id)}
                    className="flex items-center justify-center gap-2 py-3 bg-red-50 hover:bg-red-100 text-[#FF2D20] rounded-2xl text-xs font-black uppercase tracking-widest transition-all group/btn"
                >
                    <MessageSquare size={16} className="group-hover/btn:scale-110 transition-transform" />
                    Chat on 4C
                </button>
                <button
                    onClick={openWhatsApp}
                    disabled={!hire.phone}
                    className={`flex items-center justify-center gap-2 py-3 ${hire.phone ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600' : 'bg-gray-50 text-gray-300 cursor-not-allowed'} rounded-2xl text-xs font-black uppercase tracking-widest transition-all group/wa`}
                >
                    <Phone size={16} className="group-hover/wa:scale-110 transition-transform" />
                    WhatsApp
                </button>
            </div>
        </motion.div>
    );
};
