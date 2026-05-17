import React from 'react';
import { Check, Plus, Trash2, Shield, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ServiceItem {
    title: string;
    price: number | string;
    description?: string;
}

interface Props {
    services: ServiceItem[];
    selectedServices: ServiceItem[];
    onToggle: (service: ServiceItem) => void;
}

export const ServiceCatalogPicker: React.FC<Props> = ({ services, selectedServices, onToggle }) => {
    if (!Array.isArray(services)) return null;

    const isSelected = (title: string) => (Array.isArray(selectedServices) ? selectedServices : []).some(s => s.title === title);
    
    const totalPrice = (Array.isArray(selectedServices) ? selectedServices : []).reduce((sum, s) => sum + (Number(s.price) || 0), 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-blue-900 text-white flex items-center justify-center shadow-lg shadow-blue-900/20">
                        <Shield size={16} />
                    </div>
                    <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest">Service Catalog</h4>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-100">
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Total Selection</span>
                    <span className="text-sm font-black text-emerald-700">Rp {(totalPrice || 0).toLocaleString('id-ID')}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {services.map((service, i) => {
                    const active = isSelected(service.title);
                    return (
                        <motion.div
                            key={i}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => onToggle(service)}
                            className={`p-5 rounded-2xl border-2 transition-all cursor-pointer relative group overflow-hidden ${
                                active 
                                ? 'bg-blue-900 border-blue-900 shadow-xl shadow-blue-900/10' 
                                : 'bg-white border-gray-100 hover:border-gray-200 shadow-sm'
                            }`}
                        >
                            <div className="flex justify-between items-start relative z-10">
                                <div className="space-y-1 pr-8">
                                    <h5 className={`text-sm font-black leading-tight ${active ? 'text-white' : 'text-gray-900'}`}>
                                        {service.title}
                                    </h5>
                                    <p className={`text-[13px] font-bold ${active ? 'text-blue-100' : 'text-blue-600'}`}>
                                        Rp {(Number(service.price) || 0).toLocaleString('id-ID')}
                                    </p>
                                </div>
                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
                                    active ? 'bg-white text-blue-900' : 'bg-gray-50 text-gray-300'
                                }`}>
                                    {active ? <Check size={14} /> : <Plus size={14} />}
                                </div>
                            </div>
                            
                            {service.description && (
                                <div className={`mt-3 pt-3 border-t text-[11px] font-medium leading-relaxed ${
                                    active ? 'border-white/10 text-blue-100' : 'border-gray-50 text-gray-400'
                                }`}>
                                    {service.description}
                                </div>
                            )}

                            {/* Background Decoration */}
                            <div className={`absolute -bottom-4 -right-4 w-20 h-20 rounded-full transition-colors ${
                                active ? 'bg-white/5' : 'bg-gray-50/50'
                            }`} />
                        </motion.div>
                    );
                })}
            </div>

            {services.length === 0 && (
                <div className="p-8 text-center bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                    <Info className="mx-auto text-gray-300 mb-2" size={24} />
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">No services found in your profile catalog</p>
                </div>
            )}
        </div>
    );
};
