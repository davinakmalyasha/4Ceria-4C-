import React from 'react';
import { DollarSign, Percent, Ruler, Hash, Clock } from 'lucide-react';
import { NegotiationOfferDTO } from '../../../../types/negotiation.types';

interface Props {
    feeType: NegotiationOfferDTO['fee_type'];
    amount: number;
    onTypeChange: (type: NegotiationOfferDTO['fee_type']) => void;
    onAmountChange: (amount: number) => void;
    estimatedTotal: number;
}

const FEE_TYPE_CONFIG = [
    { id: 'fixed', label: 'Fixed Fee', icon: DollarSign },
    { id: 'percentage', label: 'Percentage', icon: Percent },
    { id: 'sqm', label: 'Per Sqm', icon: Ruler },
    { id: 'unit', label: 'Per Unit', icon: Hash },
    { id: 'hourly', label: 'Hourly', icon: Clock },
];

export const FeeSelector: React.FC<Props> = ({ 
    feeType, amount, onTypeChange, onAmountChange, estimatedTotal 
}) => {
    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Select Fee Structure</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    {FEE_TYPE_CONFIG.map((type) => (
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
                        type="number" 
                        required 
                        min="0"
                        step="any"
                        value={amount || ''} 
                        onChange={(e) => onAmountChange(Number(e.target.value))}
                        className={`w-full ${feeType === 'percentage' ? 'px-6' : 'pl-14 pr-6'} py-4 bg-gray-50 border-2 border-gray-100 focus:border-slate-900 rounded-2xl font-black text-2xl text-slate-900 outline-none transition-all`}
                        placeholder="0"
                    />
                    {feeType === 'percentage' && (
                        <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-gray-400">%</span>
                    )}
                </div>
                
                {(feeType === 'percentage' || feeType === 'sqm') && (
                    <div className="flex items-center justify-between px-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Estimated Total:</span>
                        <span className="text-sm font-black text-slate-900">Rp {(estimatedTotal || 0).toLocaleString('id-ID')}</span>
                    </div>
                )}
            </div>
        </div>
    );
};
