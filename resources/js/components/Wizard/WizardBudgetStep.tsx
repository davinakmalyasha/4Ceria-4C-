import React from 'react';
import { motion } from 'framer-motion';
import { Coins, Shield, Pencil, Hammer, Package, Armchair, KeyRound, Check } from 'lucide-react';
import { PhaseKey, PHASE_CONFIG } from '../../types/phase.types';

const ICON_MAP: Record<string, React.ElementType> = { Shield, Pencil, Hammer, Package, Sofa: Armchair, Key: KeyRound };

interface WizardBudgetStepProps {
    budget: string;
    onBudgetChange: (val: string) => void;
    neededPhases: PhaseKey[];
}

export default function WizardBudgetStep({ budget, onBudgetChange, neededPhases }: WizardBudgetStepProps) {
    return (
        <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-6">
            <div>
                <label className="block text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <Coins size={16} className="text-[#FF2D20]" /> Anggaran (Budget Rp)
                </label>
                <input
                    type="number" value={budget} onChange={e => onBudgetChange(e.target.value)} required
                    className="w-full px-4 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#FF2D20] focus:ring-4 focus:ring-red-100 outline-none transition-all text-2xl font-black text-gray-900"
                    placeholder="Rp 0"
                />
                <p className="text-sm font-semibold text-[#FF2D20] mt-2">
                    {Number(budget || 0).toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })}
                </p>
            </div>

            <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Layanan yang akan diaktifkan</p>
                <div className="flex flex-wrap gap-2">
                    {neededPhases.map(key => {
                        const cfg = PHASE_CONFIG[key];
                        if (!cfg) return null;
                        const Icon = ICON_MAP[cfg.icon] || Shield;
                        return (
                            <span key={key} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold">
                                <Icon size={13} /> {cfg.label} <Check size={12} />
                            </span>
                        );
                    })}
                </div>
            </div>
        </motion.div>
    );
}
