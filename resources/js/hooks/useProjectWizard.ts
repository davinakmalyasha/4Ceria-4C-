import { useState, useCallback } from 'react';
import { PhaseKey } from '../types/phase.types';

export type QuestionKey = 'hasLegal' | 'hasDesign' | 'hasConstructor' | 'needsInterior' | 'needsPM';

export interface WizardAnswers {
    hasLegal: boolean | string | null;
    hasDesign: boolean | string | null;
    hasConstructor: boolean | string | null;
    needsInterior: boolean | string | null;
    needsPM: boolean | string | null;
    legalDetail?: string;
    discussLater?: boolean;
    externalVendors?: Record<string, { contact_person: string; phone_number: string; company_name?: string }>;
}

export interface ProjectDimensions {
    land_size?: number;
    building_size?: number;
    floors?: number;
    renovation_area?: number;
    room_count?: number;
    area_size?: number;
    scope_tags?: string[];
}

export interface WizardFormData {
    title: string;
    desc: string;
    budget: string;
    loc: string;
    type: string;
    project_category: 'new_build' | 'renovation' | 'interior' | 'maintenance' | '';
    project_dimensions: ProjectDimensions;
    deadline: string;
    lat: string;
    lng: string;
    province: string;
    city: string;
    kecamatan: string;
    kelurahan: string;
    postal_code: string;
    street_name: string;
    wants_project_manager: boolean;
}

const INITIAL_FORM: WizardFormData = {
    title: '', desc: '', budget: '', loc: '', type: 'umum', deadline: '',
    project_category: '', project_dimensions: {},
    lat: '-6.200000', lng: '106.816666', province: '', city: '', kecamatan: '', kelurahan: '', postal_code: '', street_name: '',
    wants_project_manager: false,
};

export function useProjectWizard() {
    const [mode, setMode] = useState<'easy' | 'advanced'>('easy');
    const [step, setStep] = useState(0);
    const [answers, setAnswers] = useState<WizardAnswers>({ hasLegal: null, hasDesign: null, hasConstructor: null, needsInterior: null, needsPM: null });
    const [manualPhases, setManualPhases] = useState<PhaseKey[]>(['design', 'build']);
    const [form, setForm] = useState<WizardFormData>(INITIAL_FORM);
    const [images, setImages] = useState<File[]>([]);

    const activeQuestions = getActiveQuestions(form.project_category);
    const neededPhases: PhaseKey[] = mode === 'advanced' ? manualPhases : computePhases(answers, form.project_category);
    const totalSteps = mode === 'easy' ? 4 + activeQuestions.length : 5;

    const updateForm = useCallback((key: keyof WizardFormData, value: any) => {
        setForm(prev => ({ ...prev, [key]: value }));
    }, []);

    const toggleManualPhase = useCallback((phase: PhaseKey) => {
        setManualPhases(prev => prev.includes(phase) ? prev.filter(p => p !== phase) : [...prev, phase]);
    }, []);

    const updateDimensions = useCallback((key: keyof ProjectDimensions, value: any) => {
        setForm(prev => ({
            ...prev,
            project_dimensions: { ...prev.project_dimensions, [key]: value }
        }));
    }, []);

    const canAdvance = (): boolean => {
        if (mode === 'easy') {
            if (step === 0) return !!form.project_category; // Category Step
            if (step === 1) { // Scale Step
                if (form.project_category === 'new_build') return !!form.project_dimensions.land_size && !!form.project_dimensions.building_size;
                if (form.project_category === 'renovation') return !!form.project_dimensions.renovation_area;
                if (form.project_category === 'interior') return !!form.project_dimensions.room_count && !!form.project_dimensions.area_size;
                return true; // maintenance
            }
            if (step >= 2 && step < 2 + activeQuestions.length) { // Questions
                const questionKey = activeQuestions[step - 2];
                return answers[questionKey] !== null;
            }
            if (step === 2 + activeQuestions.length) return !!form.title.trim() && !!form.desc.trim() && !!form.loc.trim() && !!form.deadline; // Details
            return !!form.budget.trim(); // Budget
        }
        
        // Advanced mode skip logic
        if (step === 0) return !!form.project_category;
        if (step === 1) return true; // scale
        if (step === 2) return manualPhases.length > 0;
        if (step === 3) return !!form.title.trim() && !!form.desc.trim() && !!form.loc.trim() && !!form.deadline;
        return !!form.budget.trim();
    };

    return {
        mode, setMode, step, setStep, answers, setAnswers, manualPhases,
        form, setForm, images, setImages, neededPhases, totalSteps,
        activeQuestions, updateForm, toggleManualPhase, updateDimensions, canAdvance,
        category: form.project_category,
    };
}

export function getActiveQuestions(category: string): QuestionKey[] {
    if (category === 'new_build') return ['needsPM', 'hasLegal', 'hasDesign', 'hasConstructor', 'needsInterior'];
    if (category === 'renovation' || category === 'interior') return ['needsPM', 'hasDesign', 'hasConstructor'];
    return []; // maintenance skips questions
}

function computePhases(a: WizardAnswers, category: string): PhaseKey[] {
    if (category === 'maintenance') return ['build', 'materials', 'handover'];

    const phases: PhaseKey[] = [];
    
    // Legal phase is required if they don't have EVERYTHING ('all' or true)
    const isLegalComplete = a.hasLegal === true || a.hasLegal === 'all';
    if (category === 'new_build' && !isLegalComplete) {
        phases.push('legal');
    }

    if (a.hasDesign === 'find' || a.hasDesign === 'external') phases.push('design');
    if (a.hasConstructor === 'find' || a.hasConstructor === 'external') phases.push('build');
    phases.push('materials');
    
    // Explicitly add interior if they requested it in new_build, or if the category IS interior and they need constructor/design.
    if ((category === 'new_build' && a.needsInterior === true) || category === 'interior') {
        phases.push('interior');
    }
    
    phases.push('handover');
    return phases;
}
