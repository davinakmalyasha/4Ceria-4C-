import React, { useState } from 'react';
import { Truck, Navigation2, Check } from 'lucide-react';
import { motion } from 'framer-motion';

export default function RadarWidget() {
    const [status, setStatus] = useState<'available' | 'delivering' | 'delivered'>('available');

    const handleAccept = () => {
        setStatus('delivering');
        setTimeout(() => {
            setStatus('delivered');
        }, 2200);
    };

    return (
        <div className="p-5 bg-white rounded-2xl border border-neutral-200 shadow-sm max-w-sm mx-auto my-4 transition-all hover:shadow-md">
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-1.5">
                    <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                        <Truck className="w-4 h-4 text-red-500" />
                    </div>
                    <div>
                        <h4 className="font-extrabold text-neutral-800 text-xs">Iron Bars & Cement Delivery</h4>
                        <p className="text-[9px] text-neutral-400 font-bold uppercase">Job ID: #4C-9821</p>
                    </div>
                </div>
                <span className="text-xs font-black text-emerald-600">Rp 120.000</span>
            </div>

            <div className="space-y-1.5 my-3.5 pl-2 border-l border-neutral-200">
                <div className="text-[10px] text-neutral-500">
                    <span className="font-extrabold text-neutral-700">Pickup:</span> Mitra Jasa Baja Cemerlang
                </div>
                <div className="text-[10px] text-neutral-500">
                    <span className="font-extrabold text-neutral-700">Dropoff:</span> Project Villa Ubud (Sector B)
                </div>
            </div>

            {status === 'available' && (
                <button 
                    onClick={handleAccept}
                    className="w-full py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all"
                >
                    <Navigation2 className="w-3.5 h-3.5 fill-white rotate-45" />
                    Accept Courier Job
                </button>
            )}

            {status === 'delivering' && (
                <div className="w-full py-2 bg-amber-50 text-amber-700 border border-amber-100 rounded-xl text-center text-xs font-extrabold flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                    En Route (Simulating Delivery)...
                </div>
            )}

            {status === 'delivered' && (
                <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center gap-1.5 text-emerald-700 text-xs font-extrabold"
                >
                    <Check className="w-4 h-4" /> Delivered! Rp 120.000 added to balance.
                </motion.div>
            )}
        </div>
    );
}
