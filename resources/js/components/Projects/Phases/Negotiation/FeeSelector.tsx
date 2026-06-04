import React from 'react';
import { DollarSign, Percent, Ruler, Hash, Clock } from 'lucide-react';
import { NegotiationOfferDTO } from '../../../../types/negotiation.types';

const formatRupiah = (val: string | number) => {
    if (val === undefined || val === null || val === '') return '';
    const num = val.toString().replace(/\D/g, '');
    if (!num) return '';
    return num.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

interface Props {
    feeType: NegotiationOfferDTO['fee_type'];
    amount: number;
    onTypeChange: (type: NegotiationOfferDTO['fee_type']) => void;
    onAmountChange: (amount: number) => void;
    estimatedTotal: number;
    roleType?: string;
    area?: number;
    length?: number;
    width?: number;
    onLengthChange?: (val: number) => void;
    onWidthChange?: (val: number) => void;
}

const FEE_TYPE_CONFIG = [
    { id: 'fixed', label: 'Fixed Fee', icon: DollarSign },
    { id: 'percentage', label: 'Percentage', icon: Percent },
    { id: 'sqm', label: 'Per Sqm', icon: Ruler },
    { id: 'unit', label: 'Per Unit', icon: Hash },
    { id: 'hourly', label: 'Hourly', icon: Clock },
];

export const FeeSelector: React.FC<Props> = ({ 
    feeType, amount, onTypeChange, onAmountChange, estimatedTotal, roleType, area, length, width, onLengthChange, onWidthChange
}) => {
    const feeTypes = React.useMemo(() => {
        if (roleType === 'notaris') {
            return FEE_TYPE_CONFIG.filter(type => ['fixed'].includes(type.id));
        }
        if (roleType === 'project_manager') {
            return FEE_TYPE_CONFIG.filter(type => ['fixed', 'percentage'].includes(type.id));
        }
        if (roleType === 'arsitek' || roleType === 'architect' || roleType === 'interior') {
            // Custom Architects and Interior Designers primarily use Fixed, Percentage, or Per SQM
            return FEE_TYPE_CONFIG.filter(type => ['fixed', 'percentage', 'sqm'].includes(type.id));
        }
        if (roleType === 'kontraktor') {
            // Contractors use Fixed (Lump Sum), Unit Price, and Per SQM — no percentage/hourly
            return FEE_TYPE_CONFIG.filter(type => ['fixed', 'unit', 'sqm'].includes(type.id));
        }
        return FEE_TYPE_CONFIG;
    }, [roleType]);

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Select Fee Structure</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    {feeTypes.map((type) => (
                        <button
                            key={type.id}
                            type="button"
                            onClick={() => onTypeChange(type.id as any)}
                            className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all gap-2 ${
                                feeType === type.id 
                                ? 'border-slate-900 bg-slate-50 text-slate-900' 
                                : 'border-gray-100 bg-white text-gray-400 hover:border-gray-200'
                            }`}
                        >
                            <type.icon size={18} />
                            <span className="text-[10px] font-black uppercase tracking-tight">{type.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-4">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                    {feeType === 'percentage' ? 'Percentage Rate' : 'Base Rate Amount'}
                </label>
                <div className="relative">
                    {feeType !== 'percentage' && (
                        <span className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-gray-400">Rp</span>
                    )}
                    <input 
                        type={feeType === 'percentage' ? 'number' : 'text'}
                        required 
                        min={roleType === 'notaris' ? "0" : (feeType === 'percentage' ? "0.01" : "1")}
                        step="any"
                        value={feeType === 'percentage' ? (amount || '') : formatRupiah(amount)} 
                        onChange={(e) => {
                            if (feeType === 'percentage') {
                                onAmountChange(Number(e.target.value));
                            } else {
                                const raw = e.target.value.replace(/\D/g, '');
                                onAmountChange(raw ? parseInt(raw, 10) : 0);
                            }
                        }}
                        className={`w-full ${feeType === 'percentage' ? 'px-6' : 'pl-14 pr-6'} py-4 bg-gray-50 border-2 border-gray-100 focus:border-slate-900 rounded-2xl font-black text-2xl text-slate-900 outline-none transition-all`}
                        placeholder="0"
                    />
                    {feeType === 'percentage' && (
                        <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-gray-400">%</span>
                    )}
                </div>

                {feeType === 'sqm' && (
                    <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Panjang Area (m)</label>
                            <div className="relative">
                                <input 
                                    type="number" 
                                    required 
                                    min="1"
                                    value={length || ''} 
                                    onChange={(e) => onLengthChange?.(Number(e.target.value))}
                                    className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 focus:border-slate-900 rounded-2xl font-bold text-base text-slate-900 outline-none transition-all"
                                    placeholder="Cth: 10"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">m</span>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Lebar Area (m)</label>
                            <div className="relative">
                                <input 
                                    type="number" 
                                    required 
                                    min="1"
                                    value={width || ''} 
                                    onChange={(e) => onWidthChange?.(Number(e.target.value))}
                                    className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 focus:border-slate-900 rounded-2xl font-bold text-base text-slate-900 outline-none transition-all"
                                    placeholder="Cth: 8"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">m</span>
                            </div>
                        </div>
                    </div>
                )}
                
                {(feeType === 'percentage' || feeType === 'sqm') && (
                    <div className="space-y-1.5 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                        {feeType === 'sqm' && area && area > 0 && (
                            <div className="flex flex-col gap-0.5 px-1 pb-1 border-b border-slate-100 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                <div className="flex items-center justify-between">
                                    <span>Project Area Size:</span>
                                    <span className="text-slate-700 font-black">{area} sqm</span>
                                </div>
                                {length && width && length > 0 && width > 0 ? (
                                    <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold tracking-tight lowercase">
                                        <span>Formula:</span>
                                        <span>{length}m (panjang) × {width}m (lebar) = {area}m²</span>
                                    </div>
                                ) : null}
                            </div>
                        )}
                        <div className="flex items-center justify-between px-1 pt-0.5">
                            <span className="text-[10px] font-bold text-gray-500 uppercase">
                                {feeType === 'sqm' ? 'Calculated Fee (Rate × Area):' : 'Estimated Total:'}
                            </span>
                            <span className="text-sm font-black text-slate-900">Rp {(estimatedTotal || 0).toLocaleString('id-ID')}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
