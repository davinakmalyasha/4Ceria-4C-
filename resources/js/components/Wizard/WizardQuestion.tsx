import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Pencil, Hammer, Armchair, Check, CheckCircle, Plus, X } from 'lucide-react';
import { WizardAnswers } from '../../hooks/useProjectWizard';

const QUESTIONS = [
    {
        key: 'needsPM' as const,
        icon: Shield,
        color: 'blue',
        title: 'Bagaimana strategi pengelolaan proyek Anda?',
        subtitle: 'Pilih siapa yang akan mengoordinasikan tim & teknis di lapangan.',
        options: [
            { label: 'Cari PM di Papan Lelang', value: 'find', sublabel: 'Post lelang untuk PM Profesional (Sangat Disarankan).', color: 'red' },
            { label: 'Saya Sudah Ada PM Sendiri', value: 'external', sublabel: 'Saya sudah memiliki PM eksternal untuk proyek ini.', showExternalForm: true },
            { label: 'Saya Kelola Mandiri', value: 'none', sublabel: 'Saya akan mengoordinasikan Arsitek & Kontraktor sendiri.' },
        ]
    },
    {
        key: 'hasLegal' as const,
        icon: Shield,
        color: 'blue',
        title: 'Apa status legalitas lahan Anda saat ini?',
        subtitle: 'Beri tahu kami dokumen apa yang sudah Anda miliki untuk memulai.',
        options: [
            { label: 'Sudah ada Sertifikat & IMB/PBG', value: 'all', sublabel: 'Lahan siap bangun, tidak butuh pengurusan legalitas.' },
            { label: 'Saya Memiliki Dokumen Tertentu', value: 'cert_only', sublabel: 'Saya memiliki dokumen (Sertifikat/Lainnya) tapi belum lengkap.', showInput: true },
            { label: 'Belum ada dokumen / Perlu bantuan', value: 'find', sublabel: 'Butuh bantuan Notaris dari awal (Land Check & Izin).' },
        ]
    },
    {
        key: 'hasDesign' as const,
        icon: Pencil,
        color: 'purple',
        title: 'Apakah Anda sudah memiliki desain / denah?',
        subtitle: 'Gambar arsitektur, RAB, dan blueprint teknis.',
        options: [
            { label: 'Cari Arsitek di Sini', value: 'find', sublabel: 'Dapatkan desain kustom dari arsitek profesional.' },
            { label: 'Saya Sudah Ada Desain', value: 'external', sublabel: 'Gunakan desain dari arsitek eksternal saya.', showExternalForm: true },
        ]
    },
    {
        key: 'hasConstructor' as const,
        icon: Hammer,
        color: 'amber',
        title: 'Apakah Anda sudah memiliki kontraktor?',
        subtitle: 'Tim konstruksi yang akan mengeksekusi pembangunan.',
        options: [
            { label: 'Cari Kontraktor di Sini', value: 'find', sublabel: 'Lelang proyek ke kontraktor terverifikasi.' },
            { label: 'Saya Sudah Ada Kontraktor', value: 'external', sublabel: 'Gunakan tim konstruksi langganan saya.', showExternalForm: true },
        ]
    },
    {
        key: 'needsInterior' as const,
        icon: Armchair,
        color: 'emerald',
        title: 'Apakah Anda membutuhkan jasa interior?',
        subtitle: 'Finishing ruangan, kitchen set, dan furniture custom.',
        options: [
            { label: 'Ya, Cari Desainer Interior', value: 'find', sublabel: 'Percantik rumah dengan sentuhan desainer profesional.' },
            { label: 'Sudah Ada Desainer Sendiri', value: 'external', sublabel: 'Gunakan desainer interior pilihan saya.', showExternalForm: true },
            { label: 'Tidak Untuk Sekarang', value: 'none', sublabel: 'Fokus ke konstruksi bangunan terlebih dahulu.' },
        ]
    },
];

// Category-specific question text overrides
const CATEGORY_OVERRIDES: Record<string, Record<string, { title: string; subtitle: string; options?: any[] }>> = {
    renovation: {
        hasDesign: { 
            title: 'Apakah Anda sudah memiliki desain renovasi?', 
            subtitle: 'Gambar rencana renovasi dari arsitek/drafter',
            options: [
                { label: 'Cari Arsitek di Sini', value: 'find', sublabel: 'Dapatkan desain renovasi dari arsitek profesional.' },
                { label: 'Saya Sudah Ada Desain', value: 'external', sublabel: 'Gunakan desain renovasi dari arsitek eksternal saya.', showExternalForm: true },
            ]
        },
        hasConstructor: { 
            title: 'Apakah Anda sudah memiliki kontraktor renovasi?', 
            subtitle: 'Tim yang akan mengerjakan renovasi bangunan',
            options: [
                { label: 'Cari Kontraktor di Sini', value: 'find', sublabel: 'Lelang renovasi ke kontraktor terverifikasi.' },
                { label: 'Saya Sudah Ada Kontraktor', value: 'external', sublabel: 'Gunakan tim renovasi langganan saya.', showExternalForm: true },
            ]
        },
    },
    interior: {
        hasDesign: { 
            title: 'Apakah Anda sudah memiliki konsep desain interior?', 
            subtitle: 'Mood board, referensi gaya, atau layout ruangan',
            options: [
                { label: 'Cari Desainer di Sini', value: 'find', sublabel: 'Dapatkan konsep interior dari desainer profesional.' },
                { label: 'Saya Sudah Ada Konsep', value: 'external', sublabel: 'Gunakan konsep dari desainer eksternal saya.', showExternalForm: true },
            ]
        },
        hasConstructor: { 
            title: 'Apakah Anda butuh jasa instalasi/pemasangan?', 
            subtitle: 'Tim untuk pemasangan furniture custom & fixture',
            options: [
                { label: 'Ya, Cari Tim di Sini', value: 'find', sublabel: 'Lelang pemasangan ke tim interior terverifikasi.' },
                { label: 'Tidak, Sudah Ada Tukang', value: 'external', sublabel: 'Gunakan tim pemasangan pilihan saya.', showExternalForm: true },
            ]
        },
    },
};

interface WizardQuestionProps {
    questionKey: string;
    answers: WizardAnswers;
    onAnswer: (key: keyof WizardAnswers, value: any) => void;
    category?: string;
}

const COLORS: Record<string, { bg: string; icon: string; active: string }> = {
    blue: { bg: 'bg-blue-50', icon: 'text-blue-500', active: 'border-blue-500 bg-blue-50' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-500', active: 'border-purple-500 bg-purple-50' },
    amber: { bg: 'bg-amber-50', icon: 'text-amber-500', active: 'border-amber-500 bg-amber-50' },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-500', active: 'border-emerald-500 bg-emerald-50' },
};

export default function WizardQuestion({ questionKey, answers, onAnswer, category }: WizardQuestionProps) {
    const baseQ = QUESTIONS.find(x => x.key === questionKey);
    if (!baseQ) return null;
    const override = category ? CATEGORY_OVERRIDES[category]?.[baseQ.key] : undefined;
    const q = override ? { ...baseQ, ...override } : baseQ;
    const Icon = q.icon;
    const c = COLORS[q.color];
    const current = answers[baseQ.key];

    const updateExternal = (field: string, val: string) => {
        const role = q.key === 'needsPM' ? 'project_manager' : 
                     q.key === 'hasDesign' ? 'arsitek' : 
                     q.key === 'hasConstructor' ? 'kontraktor' : 
                     q.key === 'needsInterior' ? 'interior' : '';
        if (!role) return;
        const currentVendors = answers.externalVendors || {};
        const vendorData = currentVendors[role] || { contact_person: '', phone_number: '', company_name: '' };
        onAnswer('externalVendors' as any, { ...currentVendors, [role]: { ...vendorData, [field]: val } });
    };

    return (
        <AnimatePresence mode="wait">
            <motion.div key={q.key} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-5">
                {/* Compact Horizontal Info Card */}
                <div className="flex items-center gap-4 bg-gray-50 border border-gray-150/60 rounded-2xl p-4 w-full">
                    <div className={`w-11 h-11 rounded-xl ${c.bg} flex items-center justify-center shrink-0 shadow-xs`}>
                        <Icon size={20} className={c.icon} />
                    </div>
                    <div className="text-left min-w-0">
                        <h3 className="text-xs sm:text-sm font-black text-gray-900 leading-snug tracking-tight">{q.title}</h3>
                        <p className="text-[10px] sm:text-[11px] font-bold text-gray-400 mt-0.5 leading-normal">{q.subtitle}</p>
                    </div>
                </div>

                <div className={`grid gap-4 mx-auto w-full transition-all ${
                    q.options.length === 2 
                        ? 'grid-cols-1 sm:grid-cols-2 max-w-2xl' 
                        : 'grid-cols-1 sm:grid-cols-3 max-w-3xl'
                }`}>
                    {q.options.map((opt: any, idx: number) => (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => onAnswer(q.key, opt.value)}
                            className={`p-5 rounded-[2rem] border-2 text-left transition-all relative group flex flex-col justify-between min-h-[130px] ${
                                current === opt.value ? 'border-zinc-900 bg-white shadow-xl ring-4 ring-zinc-900/5' : 'border-gray-100 hover:border-gray-200 bg-white'
                            }`}
                        >
                            <div className="flex items-start justify-between w-full gap-2 mb-2">
                                <span className={`text-xs font-black uppercase tracking-tight leading-snug ${current === opt.value ? 'text-zinc-900' : 'text-gray-400'}`}>
                                    {opt.label}
                                </span>
                                <div className={`w-5.5 h-5.5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                                    current === opt.value ? 'bg-zinc-900 border-zinc-900 text-white' : 'border-gray-100'
                                }`}>
                                    {current === opt.value && <Check size={11} strokeWidth={3} />}
                                </div>
                            </div>
                            <p className="text-[10px] font-bold text-gray-400 leading-relaxed group-hover:text-gray-500 transition-colors">
                                {opt.sublabel}
                            </p>
                        </button>
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    {(() => {
                        const selectedOpt = q.options.find((opt: any) => opt.value === current);
                        if (!selectedOpt) return null;

                        if (selectedOpt.showInput) {
                            return <LegalDetailForm key="legal" answers={answers} onAnswer={onAnswer} />;
                        }

                        if (selectedOpt.showExternalForm) {
                            const role = q.key === 'needsPM' ? 'project_manager' : 
                                         q.key === 'hasDesign' ? 'arsitek' : 
                                         q.key === 'hasConstructor' ? 'kontraktor' : 
                                         q.key === 'needsInterior' ? 'interior' : '';
                            return (
                                <ExternalVendorForm 
                                    key="external"
                                    role={q.key} 
                                    data={(answers.externalVendors || {})[role] || {}} 
                                    onChange={updateExternal} 
                                />
                            );
                        }
                        return null;
                    })()}
                </AnimatePresence>
            </motion.div>
        </AnimatePresence>
    );
}

function LegalDetailForm({ answers, onAnswer }: any) {
    const [inputValue, setInputValue] = React.useState('');

    const handleAddDocument = () => {
        const docName = inputValue.trim();
        if (!docName) return;

        const currentDocs = answers.legalDocuments || [];
        if (currentDocs.includes(docName)) {
            setInputValue('');
            return;
        }

        const newDocs = [...currentDocs, docName];
        onAnswer('legalDocuments', newDocs);
        setInputValue('');
    };

    const handleRemoveDocument = (indexToRemove: number) => {
        const currentDocs = answers.legalDocuments || [];
        const newDocs = currentDocs.filter((_: any, idx: number) => idx !== indexToRemove);
        onAnswer('legalDocuments', newDocs);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddDocument();
        }
    };

    return (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-6 bg-zinc-900 rounded-[2rem] space-y-5 shadow-2xl">
            <div className="space-y-4">
                <div className="space-y-2">
                    <label className={`text-[10px] font-black uppercase tracking-widest transition-colors ${answers.discussLater ? 'text-zinc-600' : 'text-zinc-400'}`}>
                        Dokumen apa yang Anda miliki?
                    </label>
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            disabled={answers.discussLater}
                            placeholder={answers.discussLater ? 'Akan didiskusikan nanti...' : 'Contoh: AJB, Sertifikat SHM, PBB...'}
                            className={`flex-1 border-none rounded-xl px-4 py-3 text-sm transition-all focus:ring-2 focus:ring-[#FF2D20] ${
                                answers.discussLater ? 'bg-zinc-800/30 text-zinc-600 placeholder:text-zinc-700' : 'bg-zinc-800 text-white placeholder:text-zinc-600'
                            }`}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                        />
                        <button
                            type="button"
                            disabled={answers.discussLater || !inputValue.trim()}
                            onClick={handleAddDocument}
                            className="p-3 rounded-xl bg-[#FF2D20] hover:bg-[#E0241B] disabled:bg-zinc-800 disabled:text-zinc-600 text-white transition-all flex items-center justify-center shadow-lg"
                        >
                            <Plus size={18} strokeWidth={3} />
                        </button>
                    </div>

                    {/* Dynamic Tag List */}
                    {!answers.discussLater && answers.legalDocuments && answers.legalDocuments.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                            {answers.legalDocuments.map((doc: string, idx: number) => (
                                <motion.div 
                                    key={idx}
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-white text-xs font-bold rounded-xl"
                                >
                                    <span>{doc}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveDocument(idx)}
                                        className="text-zinc-400 hover:text-red-400 transition-colors p-0.5 rounded-full hover:bg-zinc-700/50"
                                    >
                                        <X size={12} strokeWidth={2.5} />
                                    </button>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="relative">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true"><div className="w-full border-t border-zinc-800"></div></div>
                    <div className="relative flex justify-center"><span className="bg-zinc-900 px-2 text-[10px] font-black text-zinc-700 uppercase tracking-widest">Atau</span></div>
                </div>
                <button type="button" onClick={() => onAnswer('discussLater' as any, !answers.discussLater)} className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${answers.discussLater ? 'bg-[#FF2D20]/10 border-[#FF2D20] text-white' : 'bg-zinc-800/30 border-transparent text-zinc-400 hover:border-zinc-700'}`}>
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${answers.discussLater ? 'bg-[#FF2D20] text-white' : 'bg-zinc-800 text-zinc-600'}`}><CheckCircle size={14} strokeWidth={3} /></div>
                    <div className="flex-1">
                        <p className="text-[11px] font-black uppercase tracking-tight leading-none mb-1">Diskusi Nanti</p>
                        <p className="text-[9px] font-bold text-zinc-500 leading-tight">Mendiskusikan detail dokumen legal Anda dengan Notaris nanti setelah proyek dimulai.</p>
                    </div>
                </button>
            </div>
        </motion.div>
    );
}

function ExternalVendorForm({ role, data, onChange }: any) {
    const roleLabel = role === 'needsPM' ? 'Project Manager' : role === 'hasDesign' ? 'Arsitek' : role === 'hasConstructor' ? 'Kontraktor' : 'Interior';
    return (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-6 bg-zinc-50 rounded-[2rem] space-y-4 border border-zinc-200">
            <div className="flex items-center gap-2 mb-1">
                <div className="w-1 h-4 bg-zinc-900 rounded-full" />
                <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Data Profesional Eksternal</h4>
            </div>
            <div className="space-y-3">
                <input 
                    type="text" placeholder={`Nama ${roleLabel} / Penanggung Jawab`}
                    className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none transition-all"
                    value={data.contact_person || ''}
                    onChange={(e) => onChange('contact_person', e.target.value)}
                />
                <input 
                    type="text" placeholder="Nomor WhatsApp (Cth: 0812...)"
                    className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none transition-all"
                    value={data.phone_number || ''}
                    onChange={(e) => onChange('phone_number', e.target.value)}
                />
                <input 
                    type="text" placeholder="Nama Perusahaan (Opsional)"
                    className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none transition-all"
                    value={data.company_name || ''}
                    onChange={(e) => onChange('company_name', e.target.value)}
                />
            </div>
            <p className="text-[9px] font-bold text-zinc-400 italic">
                *System akan mencatat {roleLabel} ini sebagai pihak yang bertanggung jawab atas progres fase ini.
            </p>
        </motion.div>
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
