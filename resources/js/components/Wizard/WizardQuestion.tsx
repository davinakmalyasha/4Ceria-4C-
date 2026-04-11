import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Pencil, Hammer, Armchair, Check, X } from 'lucide-react';
import { WizardAnswers } from '../../hooks/useProjectWizard';

const QUESTIONS = [
    {
        key: 'hasLegal' as const,
        icon: Shield,
        color: 'blue',
        title: 'Apakah tanah/lahan Anda sudah memiliki sertifikat dan IMB/PBG?',
        subtitle: 'Sertifikat tanah (SHM/HGB) dan Persetujuan Bangunan Gedung',
        yes: 'Sudah lengkap ✓',
        no: 'Belum, saya butuh bantuan',
    },
    {
        key: 'hasDesign' as const,
        icon: Pencil,
        color: 'purple',
        title: 'Apakah Anda sudah memiliki desain / denah rumah?',
        subtitle: 'Blueprint, RAB, dan gambar teknis dari arsitek',
        yes: 'Sudah punya desain ✓',
        no: 'Belum, saya butuh arsitek',
    },
    {
        key: 'hasConstructor' as const,
        icon: Hammer,
        color: 'amber',
        title: 'Apakah Anda sudah memiliki kontraktor / pemborong?',
        subtitle: 'Tim konstruksi yang akan mengerjakan pembangunan',
        yes: 'Sudah ada kontraktor ✓',
        no: 'Belum, saya butuh kontraktor',
    },
    {
        key: 'needsInterior' as const,
        icon: Armchair,
        color: 'emerald',
        title: 'Apakah Anda membutuhkan desainer interior?',
        subtitle: 'Kitchen set, lemari, pencahayaan, dan finishing interior',
        yes: 'Ya, saya butuh interior',
        no: 'Tidak untuk sekarang',
    },
];

interface WizardQuestionProps {
    questionIndex: number;
    answers: WizardAnswers;
    onAnswer: (key: keyof WizardAnswers, value: boolean) => void;
}

const COLORS: Record<string, { bg: string; icon: string; active: string }> = {
    blue: { bg: 'bg-blue-50', icon: 'text-blue-500', active: 'border-blue-500 bg-blue-50' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-500', active: 'border-purple-500 bg-purple-50' },
    amber: { bg: 'bg-amber-50', icon: 'text-amber-500', active: 'border-amber-500 bg-amber-50' },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-500', active: 'border-emerald-500 bg-emerald-50' },
};

export default function WizardQuestion({ questionIndex, answers, onAnswer }: WizardQuestionProps) {
    const q = QUESTIONS[questionIndex];
    if (!q) return null;
    const Icon = q.icon;
    const c = COLORS[q.color];
    const current = answers[q.key];
    const isYesSelected = q.key === 'needsInterior' ? current === true : current === true;
    const isNoSelected = q.key === 'needsInterior' ? current === false : current === false;

    return (
        <AnimatePresence mode="wait">
            <motion.div key={q.key} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-6">
                <div className={`w-16 h-16 rounded-2xl ${c.bg} flex items-center justify-center mx-auto`}>
                    <Icon size={28} className={c.icon} />
                </div>
                <div className="text-center">
                    <h3 className="text-lg font-black text-gray-900 leading-tight">{q.title}</h3>
                    <p className="text-sm text-gray-400 mt-2">{q.subtitle}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
                    <AnswerButton label={q.yes} selected={isYesSelected} onClick={() => onAnswer(q.key, q.key === 'needsInterior' ? true : true)} icon={<Check size={16} />} />
                    <AnswerButton label={q.no} selected={isNoSelected} onClick={() => onAnswer(q.key, q.key === 'needsInterior' ? false : false)} icon={<X size={16} />} />
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

function AnswerButton({ label, selected, onClick, icon }: { label: string; selected: boolean; onClick: () => void; icon: React.ReactNode }) {
    return (
        <button
            type="button" onClick={onClick}
            className={`p-4 rounded-2xl border-2 text-left transition-all ${
                selected ? 'border-[#FF2D20] bg-red-50 shadow-md' : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
        >
            <div className={`flex items-center gap-2 text-sm font-bold ${selected ? 'text-[#FF2D20]' : 'text-gray-700'}`}>
                {icon} {label}
            </div>
        </button>
    );
}
