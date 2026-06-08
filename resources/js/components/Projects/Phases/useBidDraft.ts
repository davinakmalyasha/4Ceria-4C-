import { useState, useEffect, useRef } from 'react';
import { ProposedTermin, ProposedMilestone } from '../../../types/project.types';
import { ProposedTeamMember } from '../../../types/sub_professional.types';
import { NegotiationOfferDTO } from '../../../types/negotiation.types';

interface DraftData {
    feeType: NegotiationOfferDTO['fee_type'];
    amount: number;
    lengthInput: number;
    widthInput: number;
    note: string;
    termins: ProposedTermin[];
    milestones: ProposedMilestone[];
    proposedTeam: ProposedTeamMember[];
}

export function useBidDraft(
    bidId: number,
    defaults: {
        feeType: NegotiationOfferDTO['fee_type'];
        amount: number;
        lengthInput: number;
        widthInput: number;
        note: string;
        termins: ProposedTermin[];
        milestones: ProposedMilestone[];
        proposedTeam: ProposedTeamMember[];
    }
) {
    const storageKey = `bid_draft_${bidId}`;
    const defaultsRef = useRef(defaults);

    // Keep defaults ref updated
    useEffect(() => {
        defaultsRef.current = defaults;
    }, [defaults]);

    // Helper to get from local storage or return default
    const loadSavedValue = <T,>(key: keyof DraftData, defaultValue: T): T => {
        try {
            const savedRaw = localStorage.getItem(storageKey);
            if (savedRaw) {
                const parsed = JSON.parse(savedRaw) as Partial<DraftData>;
                if (parsed[key] !== undefined) {
                    return parsed[key] as unknown as T;
                }
            }
        } catch (e) {
            console.error(`Failed to parse draft from localStorage for key ${key}:`, e);
        }
        return defaultValue;
    };

    // States initialized lazily
    const [feeType, setFeeType] = useState<NegotiationOfferDTO['fee_type']>(() => 
        loadSavedValue('feeType', defaults.feeType)
    );
    const [amount, setAmount] = useState<number>(() => 
        loadSavedValue('amount', defaults.amount)
    );
    const [lengthInput, setLengthInput] = useState<number>(() => 
        loadSavedValue('lengthInput', defaults.lengthInput)
    );
    const [widthInput, setWidthInput] = useState<number>(() => 
        loadSavedValue('widthInput', defaults.widthInput)
    );
    const [note, setNote] = useState<string>(() => 
        loadSavedValue('note', defaults.note)
    );
    const [termins, setTermins] = useState<ProposedTermin[]>(() => 
        loadSavedValue('termins', defaults.termins)
    );
    const [milestones, setMilestones] = useState<ProposedMilestone[]>(() => 
        loadSavedValue('milestones', defaults.milestones)
    );
    const [proposedTeam, setProposedTeam] = useState<ProposedTeamMember[]>(() => 
        loadSavedValue('proposedTeam', defaults.proposedTeam)
    );

    // Reset state if bidId changes
    useEffect(() => {
        setFeeType(loadSavedValue('feeType', defaultsRef.current.feeType));
        setAmount(loadSavedValue('amount', defaultsRef.current.amount));
        setLengthInput(loadSavedValue('lengthInput', defaultsRef.current.lengthInput));
        setWidthInput(loadSavedValue('widthInput', defaultsRef.current.widthInput));
        setNote(loadSavedValue('note', defaultsRef.current.note));
        setTermins(loadSavedValue('termins', defaultsRef.current.termins));
        setMilestones(loadSavedValue('milestones', defaultsRef.current.milestones));
        setProposedTeam(loadSavedValue('proposedTeam', defaultsRef.current.proposedTeam));
    }, [bidId]);

    // Save states to localStorage whenever they change
    useEffect(() => {
        const draft: DraftData = {
            feeType,
            amount,
            lengthInput,
            widthInput,
            note,
            termins,
            milestones,
            proposedTeam,
        };
        try {
            localStorage.setItem(storageKey, JSON.stringify(draft));
        } catch (e) {
            console.error('Failed to save bid draft to localStorage:', e);
        }
    }, [storageKey, feeType, amount, lengthInput, widthInput, note, termins, milestones, proposedTeam]);

    const clearDraft = () => {
        try {
            localStorage.removeItem(storageKey);
        } catch (e) {
            console.error('Failed to remove bid draft from localStorage:', e);
        }
    };

    const resetDraft = () => {
        setFeeType(defaultsRef.current.feeType);
        setAmount(defaultsRef.current.amount);
        setLengthInput(defaultsRef.current.lengthInput);
        setWidthInput(defaultsRef.current.widthInput);
        setNote(defaultsRef.current.note);
        setTermins(defaultsRef.current.termins);
        setMilestones(defaultsRef.current.milestones);
        setProposedTeam(defaultsRef.current.proposedTeam);
        clearDraft();
    };

    // Helper to check if any inputs deviate from the initial database default values
    const isModified = (): boolean => {
        if (feeType !== defaultsRef.current.feeType) return true;
        if (amount !== defaultsRef.current.amount) return true;
        if (lengthInput !== defaultsRef.current.lengthInput) return true;
        if (widthInput !== defaultsRef.current.widthInput) return true;
        if (note !== defaultsRef.current.note) return true;
        if (JSON.stringify(termins) !== JSON.stringify(defaultsRef.current.termins)) return true;
        if (JSON.stringify(milestones) !== JSON.stringify(defaultsRef.current.milestones)) return true;
        if (JSON.stringify(proposedTeam) !== JSON.stringify(defaultsRef.current.proposedTeam)) return true;
        return false;
    };

    return {
        feeType,
        setFeeType,
        amount,
        setAmount,
        lengthInput,
        setLengthInput,
        widthInput,
        setWidthInput,
        note,
        setNote,
        termins,
        setTermins,
        milestones,
        setMilestones,
        proposedTeam,
        setProposedTeam,
        clearDraft,
        resetDraft,
        isModified: isModified(),
        hasSavedDraft: !!localStorage.getItem(storageKey)
    };
}
