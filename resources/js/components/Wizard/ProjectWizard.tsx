import React, { useState } from 'react';
import axios from 'axios';
import { AnimatePresence } from 'framer-motion';
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
        fd.append('legal_detail', (w.answers as any).legalDetail || '');
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
        <div className="max-w-2xl mx-auto bg-white rounded-[2rem] shadow-xl border border-gray-100/60 overflow-hidden">
            <WizardHeader mode={w.mode} onToggle={() => { w.setMode(w.mode === 'easy' ? 'advanced' : 'easy'); w.setStep(0); }} step={w.step} totalSteps={w.totalSteps} />
            <form onSubmit={handleSubmit} className="p-6 sm:p-8">
                {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm font-semibold border border-red-200">{error}</div>}
                <div className="min-h-[360px]">
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

function WizardHeader({ mode, onToggle, step, totalSteps }: { mode: string; onToggle: () => void; step: number; totalSteps: number }) {
    return (
        <div className="bg-gray-900 px-6 sm:px-8 py-5 flex items-center justify-between">
            <div>
                <h2 className="text-xl font-black text-white">Mulai Proyek Baru</h2>
                <p className="text-gray-400 text-xs mt-1">Step {step + 1} / {totalSteps}</p>
            </div>
            <div className="flex items-center gap-3">
                <button type="button" onClick={onToggle} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white text-[11px] font-bold hover:bg-white/20 transition-colors">
                    {mode === 'easy' ? <><Settings2 size={12} /> Lanjutan</> : <><Wand2 size={12} /> Panduan</>}
                </button>
                <div className="flex gap-1.5">
                    {Array.from({ length: totalSteps }).map((_, i) => (
                        <div key={i} className={`w-2.5 h-2.5 rounded-full transition-colors ${step >= i ? 'bg-[#FF2D20]' : 'bg-gray-700'}`} />
                    ))}
                </div>
            </div>
        </div>
    );
}

function WizardFooter({ step, canAdvance, isLast, isLoading, onBack }: any) {
    return (
        <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-5">
            <button type="button" onClick={onBack} className="px-4 py-2.5 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors flex items-center gap-1.5 text-sm">
                <ChevronLeft size={16} /> {step === 0 ? 'Batal' : 'Kembali'}
            </button>
            <button type="submit" disabled={!canAdvance || isLoading} className="px-6 py-2.5 rounded-xl font-bold text-white bg-gray-900 hover:bg-[#FF2D20] disabled:bg-gray-200 disabled:text-gray-400 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center gap-2 text-sm">
                {isLoading ? 'Memproses...' : isLast ? <><CheckCircle size={16} /> Publikasikan</> : <>Lanjut <ChevronRight size={16} /></>}
            </button>
        </div>
    );
}
