import { useState, useCallback } from 'react';
import { PhaseKey } from '../types/phase.types';

export interface WizardAnswers {
    hasLegal: boolean | null;
    hasDesign: boolean | null;
    hasConstructor: boolean | null;
    needsInterior: boolean | null;
}

export interface WizardFormData {
    title: string;
    desc: string;
    budget: string;
    loc: string;
    type: string;
    deadline: string;
    lat: string;
    lng: string;
    province: string;
    city: string;
    kecamatan: string;
    kelurahan: string;
    postal_code: string;
    street_name: string;
}

const INITIAL_FORM: WizardFormData = {
    title: '', desc: '', budget: '', loc: '', type: 'umum', deadline: '',
    lat: '-6.200000', lng: '106.816666', province: '', city: '', kecamatan: '', kelurahan: '', postal_code: '', street_name: '',
};

export function useProjectWizard() {
    const [mode, setMode] = useState<'easy' | 'advanced'>('easy');
    const [step, setStep] = useState(0);
    const [answers, setAnswers] = useState<WizardAnswers>({ hasLegal: null, hasDesign: null, hasConstructor: null, needsInterior: null });
    const [manualPhases, setManualPhases] = useState<PhaseKey[]>(['design', 'build']);
    const [form, setForm] = useState<WizardFormData>(INITIAL_FORM);
    const [images, setImages] = useState<File[]>([]);

    const neededPhases: PhaseKey[] = mode === 'advanced' ? manualPhases : computePhases(answers);
    const totalSteps = mode === 'easy' ? 6 : 3;

    const updateForm = useCallback((key: keyof WizardFormData, value: string) => {
        setForm(prev => ({ ...prev, [key]: value }));
    }, []);

    const toggleManualPhase = useCallback((phase: PhaseKey) => {
        setManualPhases(prev => prev.includes(phase) ? prev.filter(p => p !== phase) : [...prev, phase]);
    }, []);

    const canAdvance = (): boolean => {
        if (mode === 'easy') {
            if (step <= 3) return answers[Object.keys(answers)[step] as keyof WizardAnswers] !== null;
            if (step === 4) return !!form.title.trim() && !!form.desc.trim() && !!form.loc.trim() && !!form.deadline;
            return !!form.budget.trim();
        }
        if (step === 0) return manualPhases.length > 0;
        if (step === 1) return !!form.title.trim() && !!form.desc.trim() && !!form.loc.trim() && !!form.deadline;
        return !!form.budget.trim();
    };

    return {
        mode, setMode, step, setStep, answers, setAnswers, manualPhases,
        form, setForm, images, setImages, neededPhases, totalSteps,
        updateForm, toggleManualPhase, canAdvance,
    };
}

function computePhases(a: WizardAnswers): PhaseKey[] {
    const phases: PhaseKey[] = [];
    if (a.hasLegal === false) phases.push('legal');
    if (a.hasDesign === false) phases.push('design');
    if (a.hasConstructor === false) phases.push('build');
    phases.push('materials');
    if (a.needsInterior === true) phases.push('interior');
    phases.push('handover');
    return phases;
}
