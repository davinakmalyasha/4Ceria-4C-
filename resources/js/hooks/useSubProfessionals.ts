import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ProjectSubProfessional, ContractorSubspecialty, AssignSubPayload } from '../types/sub_professional.types';

interface UseSubProfessionalsReturn {
    subs: ProjectSubProfessional[];
    subspecialties: ContractorSubspecialty[];
    isLoading: boolean;
    error: string | null;
    assignSub: (payload: AssignSubPayload) => Promise<boolean>;
    acceptSub: (subId: number) => Promise<boolean>;
    declineSub: (subId: number) => Promise<boolean>;
    removeSub: (subId: number) => Promise<boolean>;
    hireSub: (subId: number) => Promise<boolean>;
    interviewSub: (subId: number) => Promise<boolean>;
    recommendSub: (subId: number, suggestedFee: number, notes: string) => Promise<boolean>;
    shortlistSubBid: (role: string, bidId: number) => Promise<boolean>;
    refresh: () => void;
}

export function useSubProfessionals(projectId: number | null): UseSubProfessionalsReturn {
    const [subs, setSubs] = useState<ProjectSubProfessional[]>([]);
    const [subspecialties, setSubspecialties] = useState<ContractorSubspecialty[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchSubs = useCallback(async () => {
        if (!projectId) return;
        setIsLoading(true);
        setError(null);
        try {
            const res = await axios.get(`/projects/${projectId}/sub-professionals`);
            setSubs(res.data.data || []);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to load sub-professionals';
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    const fetchSubspecialties = useCallback(async () => {
        try {
            const res = await axios.get('/contractor-subspecialties');
            setSubspecialties(res.data.data || []);
        } catch {
            // Non-critical — silent fallback
        }
    }, []);

    useEffect(() => {
        fetchSubs();
    }, [fetchSubs]);

    useEffect(() => {
        fetchSubspecialties();
    }, [fetchSubspecialties]);

    const assignSub = useCallback(async (payload: AssignSubPayload): Promise<boolean> => {
        if (!projectId) return false;
        try {
            const res = await axios.post(`/projects/${projectId}/sub-professionals`, payload);
            setSubs(prev => [...prev, res.data.data]);
            return true;
        } catch (err: unknown) {
            const axErr = err as { response?: { data?: { message?: string } } };
            setError(axErr.response?.data?.message || 'Failed to assign sub-professional');
            return false;
        }
    }, [projectId]);

    const acceptSub = useCallback(async (subId: number): Promise<boolean> => {
        if (!projectId) return false;
        try {
            await axios.post(`/projects/${projectId}/sub-professionals/${subId}/accept`);
            setSubs(prev => prev.map(s => s.id === subId ? { ...s, status: 'accepted' } : s));
            return true;
        } catch (err: unknown) {
            const axErr = err as { response?: { data?: { message?: string } } };
            setError(axErr.response?.data?.message || 'Failed to accept invitation');
            return false;
        }
    }, [projectId]);

    const declineSub = useCallback(async (subId: number): Promise<boolean> => {
        if (!projectId) return false;
        try {
            await axios.post(`/projects/${projectId}/sub-professionals/${subId}/decline`);
            setSubs(prev => prev.map(s => s.id === subId ? { ...s, status: 'declined' } : s));
            return true;
        } catch (err: unknown) {
            const axErr = err as { response?: { data?: { message?: string } } };
            setError(axErr.response?.data?.message || 'Failed to decline invitation');
            return false;
        }
    }, [projectId]);

    const removeSub = useCallback(async (subId: number): Promise<boolean> => {
        if (!projectId) return false;
        try {
            await axios.delete(`/projects/${projectId}/sub-professionals/${subId}`);
            setSubs(prev => prev.filter(s => s.id !== subId));
            return true;
        } catch (err: unknown) {
            const axErr = err as { response?: { data?: { message?: string } } };
            setError(axErr.response?.data?.message || 'Failed to remove sub-professional');
            return false;
        }
    }, [projectId]);

    const hireSub = useCallback(async (subId: number): Promise<boolean> => {
        if (!projectId) return false;
        try {
            await axios.post(`/projects/${projectId}/sub-professionals/${subId}/hire`);
            setSubs(prev => prev.map(s => s.id === subId ? { ...s, status: 'active' } : s));
            return true;
        } catch (err: unknown) {
            const axErr = err as { response?: { data?: { message?: string } } };
            setError(axErr.response?.data?.message || 'Failed to hire professional');
            return false;
        }
    }, [projectId]);

    const interviewSub = useCallback(async (subId: number): Promise<boolean> => {
        if (!projectId) return false;
        try {
            await axios.post(`/projects/${projectId}/sub-professionals/${subId}/interview`);
            setSubs(prev => prev.map(s => s.id === subId ? { ...s, status: 'interviewing' } : s));
            return true;
        } catch (err: unknown) {
            const axErr = err as { response?: { data?: { message?: string } } };
            setError(axErr.response?.data?.message || 'Failed to start interview');
            return false;
        }
    }, [projectId]);

    const recommendSub = useCallback(async (subId: number, suggestedFee: number, notes: string): Promise<boolean> => {
        if (!projectId) return false;
        try {
            await axios.post(`/projects/${projectId}/sub-professionals/${subId}/recommend`, {
                suggested_fee: suggestedFee,
                lead_pro_notes: notes
            });
            setSubs(prev => prev.map(s => s.id === subId ? { ...s, status: 'recommended', suggested_fee: suggestedFee, lead_pro_notes: notes } : s));
            return true;
        } catch (err: unknown) {
            const axErr = err as { response?: { data?: { message?: string } } };
            setError(axErr.response?.data?.message || 'Failed to recommend professional');
            return false;
        }
    }, [projectId]);

    const shortlistSubBid = useCallback(async (role: string, bidId: number): Promise<boolean> => {
        if (!projectId) return false;
        try {
            await axios.post(`/projects/${projectId}/sub-professionals/shortlist-bid/${role}/${bidId}`);
            fetchSubs();
            return true;
        } catch (err: unknown) {
            const axErr = err as { response?: { data?: { message?: string } } };
            setError(axErr.response?.data?.message || 'Failed to shortlist bid');
            return false;
        }
    }, [projectId, fetchSubs]);

    return {
        subs,
        subspecialties,
        isLoading,
        error,
        assignSub,
        acceptSub,
        declineSub,
        removeSub,
        hireSub,
        interviewSub,
        recommendSub,
        shortlistSubBid,
        refresh: fetchSubs,
    };
}
