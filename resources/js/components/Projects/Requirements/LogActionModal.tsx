import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ArrowDown, ArrowUp, Loader2, CheckCircle2 } from 'lucide-react';

interface LogActionModalProps {
    isOpen: boolean;
    mode: 'restock' | 'use';
    requirement: any | null;
    isLoading: boolean;
    onClose: () => void;
    onSubmit: (quantity: number, notes: string) => Promise<void>;
}

export default function LogActionModal({
    isOpen, mode, requirement, isLoading, onClose, onSubmit
}: LogActionModalProps) {
    const [quantity, setQuantity] = useState('');
    const [notes, setNotes] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);

    // Reset inputs when opened
    useEffect(() => {
        if (isOpen) {
            setQuantity('');
            setNotes('');
            setLocalError(null);
        }
    }, [isOpen]);

    if (!isOpen || !requirement) return null;

    const maxStock = Number(requirement.quantity_on_site || 0);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null);

        const qtyVal = parseFloat(quantity);
        if (isNaN(qtyVal) || qtyVal <= 0) {
            setLocalError('Please enter a valid positive quantity.');
            return;
        }

        if (mode === 'use' && qtyVal > maxStock) {
            setLocalError(`Insufficient site stock. Max available: ${maxStock} ${requirement.unit}`);
            return;
        }

        try {
            await onSubmit(qtyVal, notes);
        } catch (err: any) {
            setLocalError(err.response?.data?.message || `Failed to log ${mode} action.`);
        }
    };

    const isUseMode = mode === 'use';
    const accentColor = isUseMode ? 'emerald' : 'indigo';
    const HeaderIcon = isUseMode ? ArrowDown : ArrowUp;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-md bg-white rounded-[2.5rem] p-10 shadow-2xl overflow-hidden"
            >
                <div className={`absolute top-0 left-0 w-full h-1.5 bg-${isUseMode ? 'emerald' : 'indigo'}-500`} />
                
                <div className="text-center mb-6">
                    <div className={`w-14 h-14 bg-${accentColor}-50 text-${accentColor}-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-${accentColor}-100`}>
                        <HeaderIcon size={24} />
                    </div>
                    <h4 className="text-xl font-black text-slate-900 tracking-tight">
                        {isUseMode ? 'Log Material Usage' : 'Add Material Stock'}
                    </h4>
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-1">
                        {isUseMode ? 'Decrease site inventory' : 'Replenish available stock'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Available Stock</span>
                        <span className="text-md font-black text-slate-900">
                            {maxStock} {requirement.unit}
                        </span>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Quantity ({requirement.unit})</label>
                        <input 
                            type="number" step="0.01" required autoFocus
                            placeholder="0.00"
                            value={quantity}
                            disabled={isLoading}
                            onChange={e => setQuantity(e.target.value)}
                            className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xl font-black text-center focus:ring-4 focus:ring-slate-500/5 focus:border-slate-400 outline-none transition-all"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Notes / Reference</label>
                        <textarea 
                            rows={2}
                            placeholder={isUseMode ? "e.g., Used for slab foundation, column cast..." : "e.g., Delivery batch #5, invoice #301..."}
                            value={notes}
                            disabled={isLoading}
                            onChange={e => setNotes(e.target.value)}
                            className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-slate-500/5 focus:border-slate-400 outline-none transition-all resize-none"
                        />
                    </div>

                    {localError && <p className="text-[11px] text-red-500 font-bold text-center bg-red-50 py-2 rounded-xl">{localError}</p>}

                    <div className="flex gap-4 pt-2">
                        <button 
                            type="button" onClick={onClose} disabled={isLoading}
                            className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" disabled={isLoading || !quantity}
                            className={`flex-1 bg-${isUseMode ? 'emerald' : 'indigo'}-500 text-white py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg transition-all flex items-center justify-center gap-2 hover:bg-${isUseMode ? 'emerald' : 'indigo'}-600 active:scale-95`}
                        >
                            {isLoading ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                            Log {isUseMode ? 'Usage' : 'Stock'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}
