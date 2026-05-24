import React, { useState } from 'react';
import { Plus, Minus, Truck, Check } from 'lucide-react';
import { motion } from 'framer-motion';

export default function BuyMaterialWidget() {
    const [qty, setQty] = useState(5);
    const [shipping, setShipping] = useState<'regular' | 'radar'>('radar');
    const [checkedOut, setCheckedOut] = useState(false);

    const pricePerUnit = 72000; // Rp 72k per cement bag
    const subtotal = qty * pricePerUnit;
    const shippingFee = shipping === 'radar' ? 45000 : 20000;
    const total = subtotal + shippingFee;

    const formatRupiah = (val: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            maximumFractionDigits: 0
        }).format(val);
    };

    return (
        <div className="p-4 bg-white rounded-2xl border border-neutral-200 shadow-sm max-w-sm mx-auto my-3 transition-all hover:shadow-md">
            {/* Marketplace Item Preview */}
            <div className="flex gap-2.5 items-center mb-3">
                <div className="w-12 h-12 rounded-xl bg-neutral-100 border border-neutral-200 flex items-center justify-center font-bold text-[10px] text-neutral-400 shrink-0">
                    50kg
                </div>
                <div className="flex-grow">
                    <h4 className="font-extrabold text-neutral-800 text-xs">Semen Tiga Roda Portland</h4>
                    <p className="text-[9px] text-emerald-600 font-bold">In Stock • Ready for Shipping</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => setQty(q => Math.max(1, q - 1))} className="p-0.5 bg-neutral-50 border border-neutral-200 rounded-lg"><Minus className="w-3 h-3 text-neutral-500" /></button>
                    <span className="text-xs font-black text-neutral-800">{qty}</span>
                    <button onClick={() => setQty(q => Math.min(50, q + 1))} className="p-0.5 bg-neutral-50 border border-neutral-200 rounded-lg"><Plus className="w-3 h-3 text-neutral-500" /></button>
                </div>
            </div>

            <div className="h-px bg-neutral-100 my-3" />

            {/* Shipping selection & price checkout computation */}
            <div className="space-y-2 bg-neutral-50 p-3 rounded-xl border border-neutral-100">
                <div className="flex justify-between items-center text-[9px] font-bold text-neutral-400 uppercase">
                    <span>Shipping Logistics</span>
                    <span className="text-neutral-700">{shipping === 'radar' ? 'Job Radar Courier' : 'Regular truck'}</span>
                </div>
                <div className="flex gap-1.5">
                    <button 
                        onClick={() => setShipping('radar')} 
                        className={`flex-grow py-1.5 px-2 rounded-lg text-[9px] font-extrabold border transition-all ${
                            shipping === 'radar' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-neutral-500 border-neutral-200 hover:bg-neutral-100'
                        }`}
                    >
                        Radar Courier (Rp 45k)
                    </button>
                    <button 
                        onClick={() => setShipping('regular')} 
                        className={`flex-grow py-1.5 px-2 rounded-lg text-[9px] font-extrabold border transition-all ${
                            shipping === 'regular' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-neutral-500 border-neutral-200 hover:bg-neutral-100'
                        }`}
                    >
                        Regular Cargo (Rp 20k)
                    </button>
                </div>

                <div className="flex justify-between text-[10px] text-neutral-500 font-bold pt-2 border-t border-neutral-200/50">
                    <span>Subtotal</span>
                    <span>{formatRupiah(subtotal)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-neutral-500 font-bold">
                    <span>Shipping Fee</span>
                    <span>{formatRupiah(shippingFee)}</span>
                </div>
                <div className="flex justify-between text-xs font-black text-neutral-800 pt-1">
                    <span>Total Payout</span>
                    <span className="text-red-500">{formatRupiah(total)}</span>
                </div>
            </div>

            {/* Actions Panel */}
            {!checkedOut ? (
                <button 
                    onClick={() => setCheckedOut(true)}
                    className="w-full py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-xl mt-3 flex items-center justify-center gap-1.5 transition-all shadow-sm"
                >
                    <Truck className="w-3.5 h-3.5" /> Checkout Materials
                </button>
            ) : (
                <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center gap-2 text-emerald-700 text-[10px] font-extrabold mt-3 text-center"
                >
                    <Check className="w-4 h-4 shrink-0" />
                    Purchase Placed! Escrow funded, courier matched via Radar.
                </motion.div>
            )}
        </div>
    );
}
