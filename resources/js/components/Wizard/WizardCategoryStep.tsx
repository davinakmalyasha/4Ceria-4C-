import React from 'react';
import { motion } from 'framer-motion';
import { Home, Hammer, Armchair, Wrench } from 'lucide-react';
import { WizardFormData } from '../../hooks/useProjectWizard';

interface WizardCategoryStepProps {
    form: WizardFormData;
    updateForm: (key: keyof WizardFormData, value: any) => void;
}

const CATEGORIES = [
    {
        id: 'new_build',
        title: 'Bangun Baru',
        desc: 'Membangun rumah/gedung dari nol di lahan kosong.',
        icon: Home,
        color: 'text-blue-500',
        bg: 'bg-blue-50',
        border: 'border-blue-500'
    },
    {
        id: 'renovation',
        title: 'Renovasi',
        desc: 'Merombak ruangan, tambah lantai, atap, dll.',
        icon: Hammer,
        color: 'text-amber-500',
        bg: 'bg-amber-50',
        border: 'border-amber-500'
    },
    {
        id: 'interior',
        title: 'Interior & Furniture',
        desc: 'Desain ruangan, kitchen set, custom furniture.',
        icon: Armchair,
        color: 'text-purple-500',
        bg: 'bg-purple-50',
        border: 'border-purple-500'
    },
    {
        id: 'maintenance',
        title: 'Perbaikan / Maintenance',
        desc: 'Perbaikan atap bocor, kelistrikan, saluran air, dll.',
        icon: Wrench,
        color: 'text-slate-500',
        bg: 'bg-slate-50',
        border: 'border-slate-500'
    }
];

export default function WizardCategoryStep({ form, updateForm }: WizardCategoryStepProps) {
    return (
        <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-6">
            <div className="text-center mb-8">
                <h3 className="text-xl font-black text-gray-900 leading-tight">Apa jenis proyek Anda?</h3>
                <p className="text-sm text-gray-400 mt-2">Pilih kategori utama agar kami bisa menyesuaikan formulir ini untuk Anda.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {CATEGORIES.map(c => {
                    const isSelected = form.project_category === c.id;
                    const Icon = c.icon;
                    return (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => updateForm('project_category', c.id)}
                            className={`p-5 rounded-2xl border-2 text-left transition-all ${
                                isSelected ? `${c.border} ${c.bg} shadow-md` : 'border-gray-200 hover:border-gray-300 bg-white'
                            }`}
                        >
                            <div className="flex items-start gap-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? 'bg-white' : c.bg}`}>
                                    <Icon size={24} className={c.color} />
                                </div>
                                <div>
                                    <h4 className={`text-sm font-black mb-1 ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>{c.title}</h4>
                                    <p className="text-xs text-gray-500">{c.desc}</p>
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </motion.div>
    );
}
