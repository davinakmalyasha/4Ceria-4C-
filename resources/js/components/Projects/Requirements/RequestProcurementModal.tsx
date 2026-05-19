import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Send, ShoppingCart, Info, DollarSign } from 'lucide-react';

interface RequestProcurementModalProps {
    isOpen: boolean;
    requirement: any | null;
    isLoading: boolean;
    onClose: () => void;
    onSubmit: (data: {
        quantity_needed: number;
        estimated_unit_cost: number;
        message: string;
        offer_to_buy: boolean;
    }) => Promise<void>;
}

export default function RequestProcurementModal({
    isOpen, requirement, isLoading, onClose, onSubmit
}: RequestProcurementModalProps) {
    const [quantity, setQuantity] = useState('');
    const [estimatedUnitCost, setEstimatedUnitCost] = useState('');
    const [message, setMessage] = useState('');
    const [offerToBuy, setOfferToBuy] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);

    // Reset inputs when opened or requirement changes
    useEffect(() => {
        if (isOpen && requirement) {
            setQuantity('');
            setEstimatedUnitCost(requirement.estimated_unit_cost ? String(requirement.estimated_unit_cost) : '');
            setMessage('');
            setOfferToBuy(false);
            setLocalError(null);
        }
    }, [isOpen, requirement]);

    if (!isOpen || !requirement) return null;

    const qtyVal = parseFloat(quantity) || 0;
    const priceVal = parseFloat(estimatedUnitCost) || 0;
    const totalCost = qtyVal * priceVal;

    const formattedTotal = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
    }).format(totalCost);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null);

        if (qtyVal <= 0) {
            setLocalError('Please enter a valid positive quantity.');
            return;
        }

        if (!message.trim()) {
            setLocalError('Please provide a reason or technical justification.');
            return;
        }

        try {
            await onSubmit({
                quantity_needed: qtyVal,
                estimated_unit_cost: priceVal,
                message: message.trim(),
                offer_to_buy: offerToBuy
            });
        } catch (err: any) {
            setLocalError(err.response?.data?.message || 'Failed to submit procurement request.');
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-lg bg-white rounded-[2.5rem] p-10 shadow-2xl overflow-hidden"
            >
                <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-500" />
                
                <div className="text-center mb-6">
                    <div className="w-14 h-14 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-100 shadow-sm">
                        <ShoppingCart size={24} />
                    </div>
                    <h4 className="text-xl font-black text-slate-900 tracking-tight">
                        Request Material Procurement
                    </h4>
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-1">
                        Submit request for additional project resources
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Read Only Material Cards */}
                    <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Material Name</span>
                            <span className="text-sm font-bold text-slate-950 truncate block mt-0.5">
                                {requirement.name}
                            </span>
                        </div>
                        <div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Quality Grade</span>
                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-200/60 text-slate-700 mt-1 border border-slate-300/40">
                                {requirement.quality_level || 'Standard'}
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Quantity Needed */}
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">
                                Quantity Needed ({requirement.unit})
                            </label>
                            <input 
                                type="number" 
                                step="0.01" 
                                required 
                                autoFocus
                                placeholder="0.00"
                                value={quantity}
                                disabled={isLoading}
                                onChange={e => setQuantity(e.target.value)}
                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-base font-black text-center focus:ring-4 focus:ring-slate-500/5 focus:border-slate-400 outline-none transition-all"
                            />
                        </div>

                        {/* Estimated Price */}
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">
                                Price Per Unit (Rp)
                            </label>
                            <input 
                                type="number" 
                                step="1" 
                                required 
                                placeholder="Estimated unit cost"
                                value={estimatedUnitCost}
                                disabled={isLoading}
                                onChange={e => setEstimatedUnitCost(e.target.value)}
                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-base font-black text-center focus:ring-4 focus:ring-slate-500/5 focus:border-slate-400 outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* Dynamic Total Calculation */}
                    <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/60 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <DollarSign size={16} className="text-indigo-500" />
                            <span className="text-[10px] font-black text-indigo-900 uppercase tracking-widest">Total Cost Estimate</span>
                        </div>
                        <span className="text-base font-black text-indigo-600">
                            {formattedTotal}
                        </span>
                    </div>

                    {/* Technical Reason Textarea */}
                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">
                            Reason / Technical Justification
                        </label>
                        <textarea 
                            rows={3}
                            required
                            placeholder="Provide a reason for restocking (e.g. initial structural estimate changes, damaged items, extra work needed)..."
                            value={message}
                            disabled={isLoading}
                            onChange={e => setMessage(e.target.value)}
                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-slate-500/5 focus:border-slate-400 outline-none transition-all resize-none"
                        />
                    </div>

                    {/* Offer to buy / Reimbursement Checkbox */}
                    <label className="flex items-start gap-3 p-3.5 hover:bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer select-none transition-colors">
                        <input 
                            type="checkbox"
                            checked={offerToBuy}
                            disabled={isLoading}
                            onChange={e => setOfferToBuy(e.target.checked)}
                            className="mt-0.5 rounded text-indigo-500 border-slate-200 focus:ring-indigo-500/10 focus:ring-offset-0 focus:ring-4 w-4 h-4 transition-all"
                        />
                        <div className="flex-1">
                            <span className="text-xs font-black text-slate-900 block leading-tight">
                                Offer to Purchase Directly
                            </span>
                            <span className="text-[10px] text-slate-400 font-bold block mt-0.5 leading-normal">
                                I will fund this procurement immediately and seek reimbursement from the Owner/PM later.
                            </span>
                        </div>
                    </label>

                    {localError && (
                        <p className="text-[11px] text-red-500 font-bold text-center bg-red-50 py-2 rounded-xl border border-red-100/60 shadow-sm animate-pulse">
                            {localError}
                        </p>
                    )}

                    <div className="flex gap-4 pt-2">
                        <button 
                            type="button" 
                            onClick={onClose} 
                            disabled={isLoading}
                            className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            disabled={isLoading || !quantity || !message}
                            className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                        >
                            {isLoading ? (
                                <Loader2 className="animate-spin" size={16} />
                            ) : (
                                <Send size={16} />
                            )}
                            Submit Request
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}
