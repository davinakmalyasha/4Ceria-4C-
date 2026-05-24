import React, { useState } from 'react';
import { Check, Flame, ChevronRight, DollarSign } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function BiddingWidget() {
    const [price, setPrice] = useState(45000000);
    const [accepted, setAccepted] = useState(false);

    const formatRupiah = (val: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            maximumFractionDigits: 0
        }).format(val);
    };

    return (
        <div className="p-5 bg-white rounded-2xl border border-neutral-200 shadow-sm max-w-sm mx-auto my-4 transition-all hover:shadow-md">
            <div className="flex justify-between items-start mb-3">
                <div>
                    <span className="text-[10px] bg-red-50 text-red-500 font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Active Bidding Board
                    </span>
                    <h4 className="font-extrabold text-neutral-800 text-sm mt-1">2-Story Villa Architecture</h4>
                </div>
                <Flame className="w-5 h-5 text-red-500 animate-pulse" />
            </div>

            <div className="bg-neutral-50 rounded-xl p-4 mb-4 border border-neutral-100">
                <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Current Bid Proposal</p>
                <div className="flex items-center gap-1 mt-1 text-neutral-800">
                    <DollarSign className="w-4 h-4 text-emerald-500" />
                    <span className="text-lg font-black tracking-tight">{formatRupiah(price)}</span>
                </div>
                <p className="text-[10px] text-neutral-400 mt-1">Estimasi Waktu: <span className="text-neutral-700 font-bold">14 Hari</span></p>
            </div>

            {!accepted ? (
                <div className="space-y-2">
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setPrice(p => Math.max(30000000, p - 2500000))}
                            className="w-1/2 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold rounded-xl transition-all"
                        >
                            Lower Offer
                        </button>
                        <button 
                            onClick={() => setPrice(p => Math.min(60000000, p + 2500000))}
                            className="w-1/2 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold rounded-xl transition-all"
                        >
                            Raise Offer
                        </button>
                    </div>
                    <button 
                        onClick={() => setAccepted(true)}
                        className="w-full py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all"
                    >
                        Accept Contractor Bid <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            ) : (
                <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center gap-2 text-emerald-700 text-xs font-extrabold text-center"
                >
                    <Check className="w-4 h-4 shrink-0" />
                    Bid Accepted! Project bound to Architect.
                </motion.div>
            )}
        </div>
    );
}
