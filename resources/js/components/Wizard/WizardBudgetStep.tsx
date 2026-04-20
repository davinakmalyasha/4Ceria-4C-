import React from 'react';
import { motion } from 'framer-motion';
import { Coins, Shield, Pencil, Hammer, Package, Armchair, KeyRound, Check } from 'lucide-react';
import { PhaseKey, PHASE_CONFIG } from '../../types/phase.types';
import { WizardFormData } from '../../hooks/useProjectWizard';

const ICON_MAP: Record<string, React.ElementType> = { Shield, Pencil, Hammer, Package, Sofa: Armchair, Key: KeyRound };

interface WizardBudgetStepProps {
    budget: string;
    onBudgetChange: (val: string) => void;
    wantsPM: boolean;
    onWantsPMChange: (val: boolean) => void;
    neededPhases: PhaseKey[];
    form: WizardFormData;
}

export default function WizardBudgetStep({ 
    budget, onBudgetChange, wantsPM, onWantsPMChange, neededPhases, form 
}: WizardBudgetStepProps) {
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
                {(() => {
                    if (form.project_category === 'new_build' && form.project_dimensions.building_size) {
                        const min = form.project_dimensions.building_size * 5000000;
                        const avg = form.project_dimensions.building_size * 7000000;
                        const userB = Number(budget || 0);
                        
                        if (userB > 0 && userB < min) {
                            return <div className="mt-4 p-3 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-200">⚠️ Peringatan: Budget Anda di bawah standar pasar (Min: Rp {min.toLocaleString('id-ID')}). Banyak profesional mungkin mengabaikan proyek Anda.</div>;
                        } else if (userB >= min) {
                            return <div className="mt-4 p-3 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-200">✅ Budget Anda sesuai dengan standar pasar perumahan {form.project_dimensions.building_size} m².</div>;
                        }
                        
                        return <div className="mt-4 p-3 bg-blue-50 text-blue-700 text-xs font-bold rounded-xl border border-blue-200">💡 Info Pasar: Biaya bangun baru rata-rata Rp 5jt - Rp 7jt per meter persegi (m²).</div>;
                    }
                    return null;
                })()}
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

            {/* PM Toggle */}
            <div className="p-5 bg-[#FF2D20]/5 border border-[#FF2D20]/10 rounded-2xl flex items-start gap-4">
                <div className="pt-1">
                    <input
                        type="checkbox"
                        id="wants_pm_wizard"
                        checked={wantsPM}
                        onChange={(e) => onWantsPMChange(e.target.checked)}
                        className="w-5 h-5 text-[#FF2D20] bg-white border-gray-300 rounded focus:ring-[#FF2D20] cursor-pointer"
                    />
                </div>
                <label htmlFor="wants_pm_wizard" className="cursor-pointer">
                    <p className="text-base font-bold text-gray-900 mb-1">Gunakan Project Manager (Direkomendasikan)</p>
                    <p className="text-sm text-gray-600">
                        Seorang PM profesional akan memimpin seluruh proyek, mencarikan arsitek/kontraktor, dan melaporkan ringkasan eksekutif kepada Anda.
                    </p>
                </label>
            </div>
        </motion.div>
    );
}
