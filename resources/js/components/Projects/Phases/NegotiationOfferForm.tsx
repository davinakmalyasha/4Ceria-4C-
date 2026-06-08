import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import { Info, Calculator, FileText, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react';
import { Bid, Project, ProposedTermin, ProposedMilestone } from '../../../types/project.types';
import { NegotiationOfferDTO } from '../../../types/negotiation.types';
import { ProposedTeamMember } from '../../../types/sub_professional.types';
import { FeeSelector } from './Negotiation/FeeSelector';
import { PaymentSchedule } from './Negotiation/PaymentSchedule';
import { TeamCompositionSection } from './Negotiation/TeamCompositionSection';
import { useAuth } from '../../../context/AuthContext';
import { useBidDraft } from './useBidDraft';

import ConfirmModal from '../ConfirmModal';

interface Props {
    bid: Bid;
    project: Project;
    proType?: string;
    onSubmit: (offer: NegotiationOfferDTO) => void;
    onCancel: () => void;
}

const getProjectArea = (proj: any) => {
    const dims = proj?.project_dimensions;
    if (!dims) return 0;
    return Number(dims.building_area) || 
           Number(dims.building_size) || 
           Number(dims.renovation_area) || 
           Number(dims.area_size) || 
           Number(dims.land_area) || 
           Number(dims.land_size) || 
           Number(proj?.design_details?.targetArea) || 0;
};

const getProjectLength = (proj: any) => {
    const dims = proj?.project_dimensions;
    if (!dims) return 0;
    return Number(dims.building_length) || 
           Number(dims.renovation_length) || 
           Number(dims.area_length) || 
           Number(dims.land_length) || 0;
};

const getProjectWidth = (proj: any) => {
    const dims = proj?.project_dimensions;
    if (!dims) return 0;
    return Number(dims.building_width) || 
           Number(dims.renovation_width) || 
           Number(dims.area_width) || 
           Number(dims.land_width) || 0;
};

export const NegotiationOfferForm: React.FC<Props> = ({ bid, project, proType, onSubmit, onCancel }) => {
    const { user } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    
    const defaultLengthInput = useMemo(() => {
        const len = getProjectLength(project);
        if (len > 0) return len;
        const area = getProjectArea(project);
        if (area > 0) {
            return Math.round(Math.sqrt(area));
        }
        return 0;
    }, [project]);

    const defaultWidthInput = useMemo(() => {
        const wid = getProjectWidth(project);
        if (wid > 0) return wid;
        const area = getProjectArea(project);
        if (area > 0) {
            const root = Math.round(Math.sqrt(area));
            return Math.round(area / root);
        }
        return 0;
    }, [project]);

    const parsedSelectedServices = useMemo(() => {
        if (Array.isArray(bid.selected_services)) return bid.selected_services;
        if (typeof bid.selected_services === 'string') {
            try { return JSON.parse(bid.selected_services); } catch (e) {}
        }
        return [];
    }, [bid.selected_services]);

    const defaultMilestones = useMemo(() => {
        if (Array.isArray(bid.proposed_milestones) && bid.proposed_milestones.length > 0) {
            return bid.proposed_milestones.map((m, idx) => {
                const services = parsedSelectedServices.filter((s: any) => {
                    const sIndex = s.milestone_index !== undefined && s.milestone_index !== null ? Number(s.milestone_index) : 0;
                    return sIndex === idx;
                });
                return { ...m, services };
            });
        }
        return [{ 
            title: 'Initial Planning', 
            description: '', 
            services: parsedSelectedServices.map((s: any) => ({ ...s, milestone_index: 0 })) 
        }];
    }, [bid, parsedSelectedServices]);

    const defaultTermins = useMemo(() => {
        if (Array.isArray(bid.proposed_termins) && bid.proposed_termins.length > 0) {
            return bid.proposed_termins;
        }
        return [{ trigger_description: 'Initial Planning', percentage: 100, milestone_index: 0 }];
    }, [bid]);

    const hasTeamCapability = proType === 'arsitek' || proType === 'kontraktor' || !!bid.arsitek_id || !!bid.kontraktor_id;
    
    const defaultProposedTeam = useMemo((): ProposedTeamMember[] => {
        if (Array.isArray(bid.proposed_team) && bid.proposed_team.length > 0) {
            return bid.proposed_team.map(m => ({ ...m, fee_type: m.fee_type || 'fixed' }));
        }
        return [];
    }, [bid]);

    const defaults = useMemo(() => ({
        feeType: ((bid.fee_type as any) || 'fixed') as NegotiationOfferDTO['fee_type'],
        amount: Number(bid.price || 0),
        lengthInput: defaultLengthInput,
        widthInput: defaultWidthInput,
        note: '',
        termins: defaultTermins,
        milestones: defaultMilestones,
        proposedTeam: defaultProposedTeam
    }), [bid.fee_type, bid.price, defaultLengthInput, defaultWidthInput, defaultTermins, defaultMilestones, defaultProposedTeam]);

    const {
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
        isModified
    } = useBidDraft(bid.id, defaults);

    const dynamicArea = useMemo(() => {
        if (lengthInput > 0 && widthInput > 0) {
            return lengthInput * widthInput;
        }
        return getProjectArea(project) || 0;
    }, [lengthInput, widthInput, project]);

    const isClient = user?.role_type === 'user';
    
    const handleFeeTypeChange = (newType: NegotiationOfferDTO['fee_type']) => {
        const budget = Number(project?.budget) || 0;
        const area = dynamicArea;

        // Current calculated absolute base value
        let currentAbsoluteValue = 0;
        if (feeType === 'percentage') {
            currentAbsoluteValue = (amount / 100) * budget;
        } else if (feeType === 'sqm') {
            currentAbsoluteValue = amount * area;
        } else {
            currentAbsoluteValue = amount;
        }

        // Convert the absolute base value to the new structure's unit/rate
        let newAmount = 0;
        if (newType === 'percentage') {
            if (budget > 0) {
                newAmount = Number(((currentAbsoluteValue / budget) * 100).toFixed(2));
            }
        } else if (newType === 'sqm') {
            if (area > 0) {
                newAmount = Math.round(currentAbsoluteValue / area);
            }
        } else {
            newAmount = Math.round(currentAbsoluteValue);
        }

        setAmount(newAmount);
        setFeeType(newType);
    };

    // Fetch active members from the professional firm roster
    const [firmMembers, setFirmMembers] = useState<any[]>([]);
    useEffect(() => {
        let isMounted = true;
        if (hasTeamCapability) {
            axios.get('/firm-members/roster')
                .then(res => {
                    if (isMounted) {
                        setFirmMembers(Array.isArray(res.data?.data) ? res.data.data : []);
                    }
                })
                .catch(err => {
                    console.error('Failed to fetch firm members:', err);
                });
        }
        return () => {
            isMounted = false;
        };
    }, [hasTeamCapability]);

    const availableMembers = useMemo(() => {
        const manual = Array.isArray(user?.team_members) ? user.team_members : [];
        
        // Map active firm roster members to the TeamMember structure
        const mappedFirm: any[] = firmMembers
            .filter((fm: any) => fm.status === 'active' && fm.member)
            .map((fm: any) => ({
                id: fm.member_user_id, // Map database user ID to id for team membership assignment
                owner_user_id: fm.firm_owner_id,
                owner_role: user?.role_type,
                name: fm.member.name,
                photo_path: fm.member.pic || null,
                photo_url: fm.member.pic || null,
                role_title: fm.role_in_firm.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
                bio: null,
                skills: [],
                phone: fm.member.phone || fm.member.no_telp || null,
                email: null,
                status: 'active',
                created_at: fm.accepted_at || '',
            }));

        // Combine both lists, avoiding duplicate IDs
        const combined = [...manual];
        for (const fm of mappedFirm) {
            if (!combined.some(m => m.id === fm.id)) {
                combined.push(fm);
            }
        }
        return combined;
    }, [user, firmMembers]);

    // Resilient Services: Falls back to bid's own selected services when accessed by non-notary users (e.g. Clients/PMs)
    const profileServices = useMemo(() => {
        let pServices: any[] = [];
        if (user?.role_type === 'notaris') {
            if (Array.isArray(user?.notaris_profile?.services)) {
                pServices = user.notaris_profile.services;
            } else if (typeof user?.notaris_profile?.services === 'string') {
                try { pServices = JSON.parse(user.notaris_profile.services); } catch (e) {}
            }
        }
        if (pServices.length > 0) return pServices;

        if (parsedSelectedServices.length > 0) {
            return parsedSelectedServices;
        }

        if (bid.bidder && Array.isArray((bid.bidder as any).services)) {
            return (bid.bidder as any).services;
        }
        return [];
    }, [user, bid, parsedSelectedServices]);

    const hasChanges = isModified;

    const getBaseOfferValue = () => {
        let total = 0;
        if (feeType === 'percentage') {
            const budget = Number(project?.budget) || 0;
            total = (amount / 100) * budget;
        } else if (feeType === 'sqm') {
            const area = dynamicArea;
            total = amount * area;
        } else {
            total = amount;
        }
        return isNaN(total) ? 0 : total;
    };

    const baseOfferValue = getBaseOfferValue();
    const allServices = useMemo(() => milestones.flatMap(m => m.services || []), [milestones]);
    const servicesTotal = useMemo(() => allServices.reduce((sum, s) => sum + (Number(s.price) || 0), 0), [allServices]);
    
    const teamTotal = useMemo(() => {
        return proposedTeam.reduce((sum, t) => {
            const feeVal = Number(t.fee) || 0;
            let actualFee = feeVal;

            if (t.fee_type === 'percentage') {
                actualFee = (feeVal / 100) * baseOfferValue;
            }

            return sum + Math.round(actualFee);
        }, 0);
    }, [proposedTeam, baseOfferValue]);

    const grandTotal = baseOfferValue + servicesTotal + teamTotal;
    const isNotary = user?.role_type === 'notaris' || proType === 'notaris' || bid.type === 'notaris';
    const isInvalidFee = isNotary ? grandTotal <= 0 : amount <= 0;
    
    const totalPercentage = termins.reduce((acc, curr) => acc + Number(curr.percentage || 0), 0);

    const updateMilestone = (index: number, updates: Partial<ProposedMilestone>) => {
        setMilestones(prev => {
            const newM = [...prev];
            if (!newM[index]) {
                newM[index] = { title: '', description: '', services: [] };
            }
            newM[index] = { ...newM[index], ...updates };
            return newM;
        });
    };

    const handleMilestoneDelete = (index: number) => {
        setMilestones(prev => prev.filter((_, i) => i !== index));
    };

    const executeSubmit = async () => {
        setIsConfirmOpen(false);
        setIsSubmitting(true);
        try {
            await onSubmit({
                price: amount,
                fee_type: feeType,
                proposed_termins: termins,
                proposed_milestones: milestones,
                selected_services: allServices,
                proposed_team: hasTeamCapability && proposedTeam.length > 0 ? proposedTeam : undefined,
                note,
                project_length: lengthInput,
                project_width: widthInput
            } as any);
            clearDraft();
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsConfirmOpen(true);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div className="space-y-8">
                    <FeeSelector 
                        feeType={feeType}
                        onTypeChange={handleFeeTypeChange}
                        amount={amount}
                        onAmountChange={setAmount}
                        estimatedTotal={baseOfferValue}
                        roleType={proType}
                        area={dynamicArea}
                        length={lengthInput}
                        width={widthInput}
                        onLengthChange={setLengthInput}
                        onWidthChange={setWidthInput}
                    />

                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Negotiation Note</label>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-3xl text-sm font-medium placeholder:text-slate-300 outline-none focus:border-slate-900 transition-all resize-none"
                            placeholder="Add a note about your terms or price justification..."
                            rows={4}
                        />
                    </div>

                    {/* Negotiation Note History Feed */}
                    {Array.isArray(bid.negotiation_logs) && bid.negotiation_logs.length > 0 && (
                        <div className="space-y-4 pt-6 border-t border-slate-100">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Negotiation History</label>
                            <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                                {bid.negotiation_logs.map((log: any, i: number) => (
                                    <div key={i} className="p-4 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] space-y-1 hover:border-slate-200 transition-all">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] font-black text-slate-800 uppercase tracking-wide">{log.user_name}</span>
                                            <span className="text-[8px] font-black text-slate-400">
                                                {new Date(log.created_at).toLocaleDateString('id-ID', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    year: 'numeric'
                                                })}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 font-semibold italic">"{log.note || 'No comment provided'}"</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-8">
                    <PaymentSchedule 
                        termins={termins}
                        milestones={milestones}
                        onChange={setTermins}
                        totalOfferValue={baseOfferValue}
                        availableServices={(user?.role_type === 'notaris' || proType === 'notaris') ? profileServices : []}
                        onMilestoneUpdate={updateMilestone}
                        onMilestoneDelete={handleMilestoneDelete}
                        readOnly={isClient}
                    />
                    
                    {hasTeamCapability && (
                        <TeamCompositionSection
                            team={proposedTeam}
                            onChange={setProposedTeam}
                            availableMembers={availableMembers}
                            teamTotal={teamTotal}
                        />
                    )}
                </div>
            </div>

            <div className="flex items-center justify-between p-8 bg-slate-900 rounded-[2.5rem] shadow-xl">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-2xl ${totalPercentage === 100 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                            {totalPercentage === 100 ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Offer Value</p>
                            <div className="flex items-baseline gap-2">
                                <p className="text-white text-2xl font-black">
                                    Rp {grandTotal.toLocaleString('id-ID')}
                                </p>
                                {(servicesTotal > 0 || teamTotal > 0) && (
                                    <p className="text-slate-500 text-[10px] font-bold">
                                        (Rp {baseOfferValue.toLocaleString('id-ID')} Base
                                        {servicesTotal > 0 && ` + Rp ${servicesTotal.toLocaleString('id-ID')} Services`}
                                        {teamTotal > 0 && ` + Rp ${teamTotal.toLocaleString('id-ID')} Team`})
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {hasChanges && (
                        <button 
                            type="button" 
                            onClick={resetDraft} 
                            className="flex items-center gap-2 px-6 py-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-black uppercase tracking-widest rounded-2xl transition-all hover:scale-105 active:scale-95 border border-red-500/20"
                            title="Reset all inputs back to original bid values"
                        >
                            <RotateCcw size={16} />
                            Reset Draft
                        </button>
                    )}
                    <button type="button" onClick={onCancel} className="px-8 py-4 text-white text-sm font-black uppercase tracking-widest hover:text-slate-400 transition-colors">
                        Cancel
                    </button>
                    <button 
                        type="submit" 
                        disabled={isSubmitting || totalPercentage !== 100 || !hasChanges || isInvalidFee}
                        className="px-10 py-4 bg-white text-slate-900 rounded-2xl text-sm font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:hover:scale-100 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Sending...' : 'Submit Proposal'}
                    </button>
                </div>
            </div>

            <ConfirmModal 
                isOpen={isConfirmOpen}
                title="Submit Proposal"
                description="Submit this proposal? Please make sure all the data is correct."
                confirmText="Submit"
                variant="info"
                onConfirm={executeSubmit}
                onCancel={() => setIsConfirmOpen(false)}
                isLoading={isSubmitting}
            />
        </form>
    );
};
