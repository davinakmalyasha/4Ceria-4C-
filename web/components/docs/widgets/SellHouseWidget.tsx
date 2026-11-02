import React, { useState } from 'react';
import { ShieldCheck, Home, Plus, Minus } from 'lucide-react';

export default function SellHouseWidget() {
    const [width, setWidth] = useState(8);
    const [length, setLength] = useState(12);
    const [cert, setCert] = useState('SHM');
    const [bedrooms, setBedrooms] = useState(3);

    const area = width * length;
    const basePricePerMeter = 6500000; // Rp 6.5 million
    const computedPrice = area * basePricePerMeter + bedrooms * 25000000;

    const formatRupiah = (val: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            maximumFractionDigits: 0
        }).format(val);
    };

    return (
        <div className="p-4 bg-white rounded-2xl border border-neutral-200 shadow-sm max-w-sm mx-auto my-3 flex flex-col gap-4">
            {/* Input Controllers */}
            <div className="space-y-3.5 bg-neutral-50 p-4 rounded-xl border border-neutral-100">
                <div className="flex justify-between items-center text-[10px] font-bold text-neutral-400 uppercase">
                    <span>Land Dimensions</span>
                    <span className="text-neutral-700">{width}m × {length}m ({area}m²)</span>
                </div>
                <div className="flex gap-2">
                    <input type="range" min="5" max="15" value={width} onChange={e => setWidth(Number(e.target.value))} className="w-1/2 h-1 bg-neutral-200 rounded-lg appearance-none accent-red-500" />
                    <input type="range" min="8" max="25" value={length} onChange={e => setLength(Number(e.target.value))} className="w-1/2 h-1 bg-neutral-200 rounded-lg appearance-none accent-red-500" />
                </div>

                <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase">Ownership Cert</span>
                    <select value={cert} onChange={e => setCert(e.target.value)} className="px-2 py-1 bg-white border border-neutral-200 rounded-lg text-xs font-bold focus:outline-none">
                        <option>SHM</option>
                        <option>HGB</option>
                    </select>
                </div>

                <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase">Bedrooms</span>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setBedrooms(b => Math.max(1, b - 1))} className="p-1 bg-white border border-neutral-200 rounded-lg"><Minus className="w-3 h-3 text-neutral-500" /></button>
                        <span className="text-xs font-extrabold text-neutral-800">{bedrooms}</span>
                        <button onClick={() => setBedrooms(b => Math.min(8, b + 1))} className="p-1 bg-white border border-neutral-200 rounded-lg"><Plus className="w-3 h-3 text-neutral-500" /></button>
                    </div>
                </div>
            </div>

            {/* Simulated Live Preview Card */}
            <div className="bg-white border border-red-100 rounded-xl p-3.5 shadow-sm relative overflow-hidden transition-all hover:border-red-200">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-1 bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">
                        <ShieldCheck className="w-3 h-3" /> {cert} Verified
                    </div>
                    <Home className="w-4 h-4 text-red-500" />
                </div>
                <h5 className="font-extrabold text-neutral-800 text-xs mt-2">Modern House {area}m²</h5>
                <p className="text-[9px] text-neutral-400">{bedrooms} Bedrooms • Fully Furnished • Gated Community</p>
                <div className="h-px bg-neutral-100 my-2" />
                <div className="flex justify-between items-end">
                    <span className="text-[9px] text-neutral-400 font-bold uppercase">Marketplace Price</span>
                    <span className="text-sm font-black text-red-500">{formatRupiah(computedPrice)}</span>
                </div>
            </div>
        </div>
    );
}
