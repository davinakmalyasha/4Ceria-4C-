import React from 'react';
import { motion } from 'framer-motion';
import { Shield, ArrowRight, CheckCircle2 } from 'lucide-react';
import { NotarisService } from '../../types/notaris.types';
import { formatCurrency } from '../../types/explore';

interface LegalServiceCardProps {
    service: NotarisService;
    onBook?: () => void;
}

export default function LegalServiceCard({ service, onBook }: LegalServiceCardProps) {
    return (
        <motion.div 
            whileHover={{ y: -5 }}
            className="group bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-blue-900/5 transition-all flex flex-col h-full"
        >
            <div className="flex items-start justify-between mb-6">
                <div className="p-3 bg-blue-50 text-blue-900 rounded-2xl group-hover:bg-blue-900 group-hover:text-white transition-colors">
                    <Shield size={24} />
                </div>
                <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Fixed Price</p>
                    <p className="text-xl font-black text-blue-900">{formatCurrency(service.price)}</p>
                </div>
            </div>

            <h4 className="text-xl font-black text-gray-900 mb-3 group-hover:text-blue-900 transition-colors">{service.title}</h4>
            
            {service.description && (
                <p className="text-sm font-medium text-gray-500 leading-relaxed mb-6 flex-grow">
                    {service.description}
                </p>
            )}

            <div className="space-y-3 mb-8">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-600">
                    <CheckCircle2 size={14} className="text-emerald-500" /> Professional Authentication
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-gray-600">
                    <CheckCircle2 size={14} className="text-emerald-500" /> Digital Document Safekeeping
                </div>
            </div>

            <button 
                onClick={onBook}
                className="w-full flex items-center justify-center gap-2 py-4 bg-gray-50 text-gray-900 rounded-2xl font-black text-[10px] uppercase tracking-widest group-hover:bg-blue-900 group-hover:text-white transition-all transform active:scale-95"
            >
                Inquire Service <ArrowRight size={14} />
            </button>
        </motion.div>
    );
}
