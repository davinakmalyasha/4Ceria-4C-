import React from 'react';
import { Shield, Pencil, Hammer, Package, Armchair, KeyRound } from 'lucide-react';
import { PhaseKey, PHASE_CONFIG, PHASE_ORDER } from '../../types/phase.types';

const ICON_MAP: Record<string, React.ElementType> = {
    Shield, Pencil, Hammer, Package, Sofa: Armchair, Key: KeyRound,
};

interface WizardManualSelectProps {
    selectedPhases: PhaseKey[];
    onToggle: (phase: PhaseKey) => void;
}

const SELECTABLE: PhaseKey[] = ['legal', 'design', 'build', 'interior'];

export default function WizardManualSelect({ selectedPhases, onToggle }: WizardManualSelectProps) {
    return (
        <div className="space-y-4">
            <div className="text-center mb-6">
                <h3 className="text-lg font-black text-gray-900">Pilih layanan yang Anda butuhkan</h3>
                <p className="text-sm text-gray-400 mt-1">Centang semua yang diperlukan untuk proyek Anda.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
                {SELECTABLE.map(key => {
                    const cfg = PHASE_CONFIG[key];
                    const Icon = ICON_MAP[cfg.icon] || Shield;
                    const isSelected = selectedPhases.includes(key);
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => onToggle(key)}
                            className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
                                isSelected
                                    ? 'border-[#FF2D20] bg-red-50 shadow-md'
                                    : 'border-gray-200 bg-white hover:border-gray-300'
                            }`}
                        >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                isSelected ? 'bg-[#FF2D20] text-white' : 'bg-gray-100 text-gray-400'
                            }`}>
                                <Icon size={18} />
                            </div>
                            <div>
                                <p className={`text-sm font-bold ${isSelected ? 'text-[#FF2D20]' : 'text-gray-700'}`}>{cfg.label}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">{cfg.description}</p>
                            </div>
                        </button>
                    );
                })}
            </div>
            <p className="text-center text-[10px] text-gray-300 mt-4">
                Material & Serah Terima otomatis disertakan.
            </p>
        </div>
    );
}
