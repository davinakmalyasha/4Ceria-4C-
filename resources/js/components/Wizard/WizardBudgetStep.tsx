import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, Shield, Pencil, Hammer, Package, Armchair, KeyRound, Check, Info, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { PhaseKey, PHASE_CONFIG } from '../../types/phase.types';
import { WizardFormData } from '../../hooks/useProjectWizard';

const ICON_MAP: Record<string, React.ElementType> = { Shield, Pencil, Hammer, Package, Sofa: Armchair, Key: KeyRound };

interface WizardBudgetStepProps {
    budget: string;
    onBudgetChange: (val: string) => void;
    updateDimensions: (key: any, value: any) => void;
    neededPhases: PhaseKey[];
    form: WizardFormData;
}

export default function WizardBudgetStep({ 
    budget, onBudgetChange, updateDimensions, neededPhases, form 
}: WizardBudgetStepProps) {
    const [showTip, setShowTip] = useState(true);
    
    const minBudget = form.project_dimensions?.min_budget || '';
    const maxBudget = budget;

    const handleMinBudgetChange = (val: string) => {
        updateDimensions('min_budget', val);
    };

    return (
        <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-6">
            <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
                            <Coins size={13} className="text-gray-400" /> Anggaran Minimum (Rp)
                        </label>
                        <input
                            type="number" 
                            value={minBudget} 
                            onChange={e => handleMinBudgetChange(e.target.value)} 
                            required
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#FF2D20] focus:ring-4 focus:ring-red-100 outline-none transition-all text-lg font-black text-gray-900"
                            placeholder="Rp 0"
                        />
                        <p className="text-[10px] font-semibold text-gray-500 mt-1">
                            {minBudget ? Number(minBudget).toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }) : 'Rp 0'}
                        </p>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-750 mb-1.5 flex items-center gap-1.5">
                            <Coins size={13} className="text-[#FF2D20]" /> Anggaran Maksimum (Rp)
                        </label>
                        <input
                            type="number" 
                            value={maxBudget} 
                            onChange={e => onBudgetChange(e.target.value)} 
                            required
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#FF2D20] focus:ring-4 focus:ring-red-100 outline-none transition-all text-lg font-black text-gray-900"
                            placeholder="Rp 0"
                        />
                        <p className="text-[10px] font-semibold text-[#FF2D20] mt-1">
                            {maxBudget ? Number(maxBudget).toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }) : 'Rp 0'}
                        </p>
                    </div>
                </div>

                {minBudget && maxBudget && Number(minBudget) > Number(maxBudget) && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-800 text-xs font-bold rounded-xl flex items-center gap-2">
                        <AlertTriangle size={14} className="shrink-0" /> Anggaran minimum tidak boleh melebihi anggaran maksimum.
                    </div>
                )}

                <AnimatePresence mode="wait">
                    {showTip && (() => {
                        if (form.project_category === 'new_build' && form.project_dimensions.building_size) {
                            const min = form.project_dimensions.building_size * 5000000;
                            const userB = Number(maxBudget || 0);

                            let type: 'info' | 'warning' | 'success' = 'info';
                            let content = '';

                            if (userB > 0 && userB < min) {
                                type = 'warning';
                                content = `Budget Anda di bawah standar pasar (Min: Rp ${min.toLocaleString('id-ID')}). Banyak profesional mungkin mengabaikan proyek Anda.`;
                            } else if (userB >= min) {
                                type = 'success';
                                content = `Budget Anda sesuai dengan standar pasar perumahan untuk ukuran ${form.project_dimensions.building_size} m².`;
                            } else {
                                type = 'info';
                                content = `Biaya bangun baru rata-rata saat ini berkisar antara Rp 5jt - Rp 7jt per meter persegi (m²).`;
                            }

                            const styles = {
                                info: 'bg-blue-500/5 border border-blue-500/25 text-blue-800',
                                warning: 'bg-amber-500/5 border border-amber-500/25 text-amber-800',
                                success: 'bg-emerald-500/5 border border-emerald-500/25 text-emerald-800',
                            };

                            const Icon = {
                                info: Info,
                                warning: AlertTriangle,
                                success: CheckCircle2,
                            }[type];

                            return (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10 }} 
                                    animate={{ opacity: 1, y: 0 }} 
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className={`p-4 rounded-2xl flex items-start justify-between gap-3 backdrop-blur-sm transition-all ${styles[type]}`}
                                >
                                    <div className="flex items-start gap-2.5">
                                        <Icon size={16} className="mt-0.5 shrink-0" />
                                        <div>
                                            <h4 className="text-xs font-black uppercase tracking-wider mb-0.5">
                                                {type === 'warning' ? 'Perhatian' : type === 'success' ? 'Standar Sesuai' : 'Informasi Pasar'}
                                            </h4>
                                            <p className="text-xs font-semibold leading-relaxed">{content}</p>
                                        </div>
                                    </div>
                                    <button 
                                        type="button" 
                                        onClick={() => setShowTip(false)}
                                        className="p-1 rounded-lg hover:bg-black/5 transition-colors text-gray-500 hover:text-gray-700 shrink-0"
                                    >
                                        <X size={14} />
                                    </button>
                                </motion.div>
                            );
                        }
                        return null;
                    })()}
                </AnimatePresence>
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
