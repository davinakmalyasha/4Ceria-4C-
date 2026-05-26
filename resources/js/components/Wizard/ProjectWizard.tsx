import React, { useState } from 'react';
import axios from 'axios';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, CheckCircle, Wand2, Settings2 } from 'lucide-react';
import { useProjectWizard, WizardAnswers } from '../../hooks/useProjectWizard';
import WizardQuestion from './WizardQuestion';
import WizardManualSelect from './WizardManualSelect';
import WizardDetailsStep from './WizardDetailsStep';
import WizardBudgetStep from './WizardBudgetStep';
import WizardCategoryStep from './WizardCategoryStep';
import WizardScaleStep from './WizardScaleStep';

interface ProjectWizardProps { onCancel: () => void; onSuccess: () => void; }

export default function ProjectWizard({ onCancel, onSuccess }: ProjectWizardProps) {
    const w = useProjectWizard();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const isLastStep = w.step === w.totalSteps - 1;
    const qLen = w.activeQuestions?.length || 0;
    const detailsStep = w.mode === 'easy' ? 2 + qLen : 3;
    const budgetStep = w.mode === 'easy' ? 3 + qLen : 4;

    const getStepLabel = () => {
        if (w.mode === 'easy') {
            if (w.step === 0) return 'Kategori';
            if (w.step === 1) return 'Dimensi';
            if (w.step >= 2 && w.step < 2 + qLen) {
                const qKey = w.activeQuestions[w.step - 2];
                if (qKey === 'needsPM') return 'Project Manager';
                if (qKey === 'hasLegal') return 'Legalitas';
                if (qKey === 'hasDesign') return 'Arsitek';
                if (qKey === 'hasConstructor') return 'Kontraktor';
                if (qKey === 'needsInterior') return 'Interior';
                return '';
            }
            if (w.step === detailsStep) return 'Detail Informasi';
            if (w.step === budgetStep) return 'Confirmation / Validation';
            return '';
        } else {
            if (w.step === 0) return 'Kategori';
            if (w.step === 1) return 'Dimensi';
            if (w.step === 2) return 'Konstruksi & Layanan';
            if (w.step === 3) return 'Detail Informasi';
            if (w.step === 4) return 'Confirmation / Validation';
            return '';
        }
    };

    const activeLabel = getStepLabel();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isLastStep) return w.setStep(w.step + 1);
        setIsLoading(true); setError('');
        const fd = new FormData();
        fd.append('title', w.form.title); fd.append('description', w.form.desc);
        fd.append('budget', w.form.budget); fd.append('lokasi', w.form.loc);
        fd.append('jenis_proyek', w.form.type); fd.append('deadline', w.form.deadline);
        fd.append('latitude', w.form.lat); fd.append('longitude', w.form.lng);
        fd.append('province', w.form.province); fd.append('city', w.form.city);
        fd.append('kecamatan', w.form.kecamatan); fd.append('kelurahan', w.form.kelurahan);
        fd.append('postal_code', w.form.postal_code); fd.append('street_name', w.form.street_name);
        fd.append('wants_project_manager', w.answers.needsPM === 'find' ? '1' : '0');
        fd.append('needed_phases', JSON.stringify(w.neededPhases));
        fd.append('project_category', w.form.project_category);
        fd.append('project_dimensions', JSON.stringify(w.form.project_dimensions));
        const legalDetailStr = w.answers.legalDocuments && w.answers.legalDocuments.length > 0
            ? w.answers.legalDocuments.join(', ')
            : (w.answers.legalDetail || '');
        fd.append('legal_detail', legalDetailStr);
        fd.append('wants_to_discuss_later', w.answers.discussLater ? '1' : '0');
        fd.append('external_vendors', JSON.stringify(w.answers.externalVendors || {}));
        fd.append('bidding_choices', JSON.stringify({
            project_manager: w.answers.needsPM || 'none',
            notaris: w.answers.hasLegal || 'none',
            arsitek: w.answers.hasDesign || 'none',
            kontraktor: w.answers.hasConstructor || 'none',
            interior: w.answers.needsInterior || 'none',
        }));
        fd.append('target_role', w.form.project_category === 'maintenance' ? 'kontraktor' : 'both');
        w.images.forEach((img, i) => fd.append(`images[${i}]`, img));

        try { await axios.post('/projects', fd); onSuccess(); }
        catch (err: any) { setError(err.response?.data?.message || 'Gagal memposting proyek'); setIsLoading(false); }
    };

    return (
        <div className="max-w-3xl sm:max-w-4xl mx-auto bg-white rounded-[2rem] shadow-xl border border-gray-100/60 overflow-hidden transition-all duration-300">
            <WizardHeader w={w} mode={w.mode} onToggle={() => { w.setMode(w.mode === 'easy' ? 'advanced' : 'easy'); w.setStep(0); }} step={w.step} totalSteps={w.totalSteps} activeLabel={activeLabel} />
            <form onSubmit={handleSubmit} className="p-5 sm:p-6">
                {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm font-semibold border border-red-200">{error}</div>}
                <div className="min-h-[280px]">
                    <AnimatePresence mode="wait">
                        {w.step === 0 && (
                            <WizardCategoryStep form={w.form} updateForm={w.updateForm} />
                        )}
                        {w.step === 1 && (
                            <WizardScaleStep form={w.form} updateDimensions={w.updateDimensions} />
                        )}
                        {w.mode === 'easy' && w.step >= 2 && w.step < 2 + (w.activeQuestions?.length || 0) && (
                            <WizardQuestion questionKey={w.activeQuestions[w.step - 2]} answers={w.answers} onAnswer={(key, val) => w.setAnswers({ ...w.answers, [key]: val })} category={w.category} />
                        )}
                        {w.mode === 'advanced' && w.step === 2 && (
                            <WizardManualSelect selectedPhases={w.manualPhases} onToggle={w.toggleManualPhase} />
                        )}
                        {w.step === detailsStep && (
                            <WizardDetailsStep form={w.form} updateForm={w.updateForm} images={w.images} setImages={w.setImages} />
                        )}
                        {w.step === budgetStep && (
                            <WizardBudgetStep 
                                budget={w.form.budget} 
                                onBudgetChange={v => w.updateForm('budget', v)} 
                                updateDimensions={w.updateDimensions}
                                neededPhases={w.neededPhases} 
                                form={w.form}
                            />
                        )}
                    </AnimatePresence>
                </div>
                <WizardFooter step={w.step} canAdvance={w.canAdvance()} isLast={isLastStep} isLoading={isLoading} onBack={() => w.step > 0 ? w.setStep(w.step - 1) : onCancel()} />
            </form>
        </div>
    );
}

function WizardHeader({ 
    w, mode, onToggle, step, totalSteps, activeLabel 
}: { 
    w: any; mode: string; onToggle: () => void; step: number; totalSteps: number; activeLabel: string 
}) {
    const isStepValid = (stepIndex: number): boolean => {
        const form = w.form;
        const answers = w.answers;
        const activeQuestions = w.activeQuestions || [];
        const manualPhases = w.manualPhases || [];
        
        if (mode === 'easy') {
            if (stepIndex === 0) return !!form.project_category; // Category Step
            if (stepIndex === 1) { // Scale Step
                if (form.project_category === 'new_build') return !!form.project_dimensions.land_size && !!form.project_dimensions.building_size;
                if (form.project_category === 'renovation') return !!form.project_dimensions.renovation_area;
                if (form.project_category === 'interior') return !!form.project_dimensions.room_count && !!form.project_dimensions.area_size;
                return true; // maintenance
            }
            if (stepIndex >= 2 && stepIndex < 2 + activeQuestions.length) { // Questions
                const questionKey = activeQuestions[stepIndex - 2];
                return answers[questionKey] !== null;
            }
            if (stepIndex === 2 + activeQuestions.length) return !!form.title.trim() && !!form.desc.trim() && !!form.loc.trim() && !!form.deadline; // Details
            return !!form.budget.trim(); // Budget
        } else {
            if (stepIndex === 0) return !!form.project_category;
            if (stepIndex === 1) return true; // scale
            if (stepIndex === 2) return manualPhases.length > 0;
            if (stepIndex === 3) return !!form.title.trim() && !!form.desc.trim() && !!form.loc.trim() && !!form.deadline;
            return !!form.budget.trim();
        }
    };

    const canGoToStep = (targetStep: number): boolean => {
        if (targetStep === 0) return true;
        for (let i = 0; i < targetStep; i++) {
            if (!isStepValid(i)) return false;
        }
        return true;
    };

    return (
        <div className="bg-gray-900 px-6 sm:px-8 py-5 flex flex-col sm:flex-row gap-4 sm:items-center justify-between min-h-[96px] pb-7 sm:pb-6 border-b border-gray-800">
            <div>
                <h2 className="text-xl font-black text-white">Mulai Proyek Baru</h2>
                <p className="text-gray-400 text-xs mt-1 font-bold">Step {step + 1} / {totalSteps}</p>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-5 sm:gap-7 w-full sm:w-auto">
                <button type="button" onClick={onToggle} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white text-[11px] font-bold hover:bg-white/20 transition-colors shrink-0">
                    {mode === 'easy' ? <><Settings2 size={12} /> Lanjutan</> : <><Wand2 size={12} /> Panduan</>}
                </button>
                <div className="flex gap-2 sm:gap-3 items-center relative w-[220px] sm:w-[420px] md:w-[480px] h-8 shrink-0">
                    {/* Connecting background track line */}
                    <div className="absolute left-1 right-1 h-[2.5px] bg-gray-800 rounded-full top-[12px] z-0" />
                    
                    {/* Connecting active track line */}
                    <div 
                        className="absolute left-1 h-[2.5px] bg-[#FF2D20] rounded-full top-[12px] z-0 transition-all duration-300" 
                        style={{ width: `${(step / (totalSteps - 1)) * 100}%` }}
                    />
                    
                    {Array.from({ length: totalSteps }).map((_, i) => {
                        const isActive = step === i;
                        const isCompleted = step > i;
                        const clickable = canGoToStep(i);
                        return (
                            <div key={i} className="flex flex-col items-center flex-1 z-10 relative">
                                <button 
                                    type="button"
                                    disabled={!clickable}
                                    onClick={() => clickable && w.setStep(i)}
                                    className={`w-2.5 h-2.5 rounded-full flex items-center justify-center transition-all duration-300 outline-none ${
                                        isActive 
                                            ? 'bg-[#FF2D20] ring-4 ring-red-500/30 scale-110 z-20' 
                                            : isCompleted 
                                                ? 'bg-[#FF2D20] hover:scale-125 cursor-pointer z-20' 
                                                : clickable 
                                                    ? 'bg-gray-400 hover:scale-125 hover:bg-[#FF2D20]/50 cursor-pointer z-20'
                                                    : 'bg-gray-700 opacity-50 cursor-not-allowed'
                                    }`}
                                />
                                <AnimatePresence>
                                    {isActive && activeLabel && (
                                        <motion.span 
                                            initial={{ opacity: 0, y: 3, scale: 0.9 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0 }}
                                            className={`absolute top-5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-[#FF2D20] whitespace-nowrap bg-gray-900/95 px-2.5 py-0.75 rounded-md border border-gray-800 shadow-md ${
                                                i <= 1 
                                                    ? 'left-[10%] origin-left translate-x-[-15%]' 
                                                    : i >= totalSteps - 2 
                                                        ? 'right-[10%] origin-right translate-x-[15%]' 
                                                        : 'left-1/2 -translate-x-1/2'
                                            }`}
                                        >
                                            {activeLabel}
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function WizardFooter({ step, canAdvance, isLast, isLoading, onBack }: any) {
    return (
        <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
            <button type="button" onClick={onBack} className="px-4 py-2 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors flex items-center gap-1.5 text-sm">
                <ChevronLeft size={16} /> {step === 0 ? 'Batal' : 'Kembali'}
            </button>
            <button type="submit" disabled={!canAdvance || isLoading} className="px-6 py-2 rounded-xl font-bold text-white bg-gray-900 hover:bg-[#FF2D20] disabled:bg-gray-200 disabled:text-gray-400 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center gap-2 text-sm">
                {isLoading ? 'Memproses...' : isLast ? <><CheckCircle size={16} /> Publikasikan</> : <>Lanjut <ChevronRight size={16} /></>}
            </button>
        </div>
    );
}
