import React, { useState } from 'react';
import { ShoppingCart, Truck, Shield, Check, ChevronRight } from 'lucide-react';

const fmt = (v: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);

const STEPS = [
    { icon: ShoppingCart, label: 'Cart' },
    { icon: Truck, label: 'Shipping' },
    { icon: Shield, label: 'Escrow' },
] as const;

export default function CheckoutWidget() {
    const [step, setStep] = useState(0);
    const subtotal = 4750000;
    const shipping = 350000;

    return (
        <div className="p-5 bg-white rounded-2xl border border-neutral-200 shadow-sm max-w-sm mx-auto my-4 transition-all hover:shadow-md">
            {/* Step indicators */}
            <div className="flex items-center justify-between mb-4">
                {STEPS.map((s, i) => (
                    <div key={s.label} className="flex items-center gap-1">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                            i <= step ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-400'
                        }`}>
                            {i < step ? <Check className="w-3 h-3" /> : <s.icon className="w-3 h-3" />}
                        </div>
                        <span className={`text-[10px] font-bold ${i <= step ? 'text-neutral-800' : 'text-neutral-400'}`}>{s.label}</span>
                        {i < 2 && <ChevronRight className="w-3 h-3 text-neutral-300 ml-1" />}
                    </div>
                ))}
            </div>

            {/* Step 1: Cart */}
            {step === 0 && (
                <div className="space-y-2 mb-4">
                    {[{ name: 'Semen Portland 50kg', qty: 20, price: 2500000 }, { name: 'Besi Beton 12mm', qty: 50, price: 2250000 }].map(item => (
                        <div key={item.name} className="flex justify-between items-center p-2.5 bg-neutral-50 rounded-xl border border-neutral-100">
                            <div>
                                <p className="text-xs font-bold text-neutral-800">{item.name}</p>
                                <p className="text-[10px] text-neutral-400">Qty: {item.qty}</p>
                            </div>
                            <span className="text-xs font-extrabold text-neutral-700">{fmt(item.price)}</span>
                        </div>
                    ))}
                    <p className="text-right text-xs font-extrabold text-neutral-800">Subtotal: {fmt(subtotal)}</p>
                </div>
            )}

            {/* Step 2: Shipping */}
            {step === 1 && (
                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-100 mb-4 space-y-1.5">
                    <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Shipping Details</p>
                    {[['Total Weight', '1.350 kg'], ['Distance', '12 km'], ['Carrier', 'Truk Engkel'], ['Shipping Fee', fmt(shipping)]].map(([k, v]) => (
                        <div key={k} className="flex justify-between text-xs">
                            <span className="text-neutral-500">{k}</span>
                            <span className="font-bold text-neutral-800">{v}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Step 3: Escrow */}
            {step === 2 && (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 mb-4 text-center">
                    <Shield className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
                    <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider mb-1">Escrow Protected</p>
                    <p className="text-lg font-black text-emerald-700">{fmt(subtotal + shipping)}</p>
                    <p className="text-[10px] text-emerald-500 mt-1">Funds held until delivery confirmed</p>
                </div>
            )}

            {step < 2 ? (
                <button onClick={() => setStep(s => s + 1)} className="w-full py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all">
                    {step === 0 ? 'Calculate Shipping' : 'Confirm & Escrow'} <ChevronRight className="w-3.5 h-3.5" />
                </button>
            ) : (
                <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center gap-2 text-emerald-700 text-xs font-extrabold">
                    <Check className="w-4 h-4" /> Order placed! Escrow secured.
                </div>
            )}
        </div>
    );
}
