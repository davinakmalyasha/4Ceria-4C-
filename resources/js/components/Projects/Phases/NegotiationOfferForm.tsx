import React, { useState, useMemo } from 'react';
import { Info, Calculator, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { Bid, Project, ProposedTermin, ProposedMilestone } from '../../../types/project.types';
import { NegotiationOfferDTO } from '../../../types/negotiation.types';
import { ProposedTeamMember } from '../../../types/sub_professional.types';
import { FeeSelector } from './Negotiation/FeeSelector';
import { PaymentSchedule } from './Negotiation/PaymentSchedule';
import { MilestoneRoadmap } from './Negotiation/MilestoneRoadmap';
import { TeamCompositionSection } from './Negotiation/TeamCompositionSection';
import { ServiceCatalogPicker, ServiceItem } from '../../Projects/Details/ServiceCatalogPicker';
import { useAuth } from '../../../context/AuthContext';

interface Props {
    bid: Bid;
    project: Project;
    onSubmit: (offer: NegotiationOfferDTO) => void;
    onCancel: () => void;
}

export const NegotiationOfferForm: React.FC<Props> = ({ bid, project, onSubmit, onCancel }) => {
    const { user } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [feeType, setFeeType] = useState<NegotiationOfferDTO['fee_type']>(
        (bid.fee_type as any) || 'fixed'
    );
    const [amount, setAmount] = useState<number>(Number(bid.price || 0));
    
    const initialMilestones = useMemo(() => {
        if (Array.isArray(bid.proposed_milestones) && bid.proposed_milestones.length > 0) {
            return bid.proposed_milestones;
        }
        return [{ title: 'Initial Planning', description: '', services: [] }];
    }, [bid]);
    const [milestones, setMilestones] = useState<ProposedMilestone[]>(initialMilestones);

    const initialTermins = useMemo(() => {
        if (Array.isArray(bid.proposed_termins) && bid.proposed_termins.length > 0) {
            return bid.proposed_termins;
        }
        return [{ trigger_description: 'Total Payment', percentage: 100, milestone_index: 0 }];
    }, [bid]);
    const [termins, setTermins] = useState<ProposedTermin[]>(initialTermins);
    
    const [note, setNote] = useState<string>('');

    // Team composition (for architects/constructors)
    const hasTeamCapability = user?.role_type === 'arsitek' || user?.role_type === 'kontraktor';
    const initialTeam = useMemo((): ProposedTeamMember[] => {
        if (Array.isArray(bid.proposed_team) && bid.proposed_team.length > 0) {
            return bid.proposed_team;
        }
        return [];
    }, [bid]);
    const [proposedTeam, setProposedTeam] = useState<ProposedTeamMember[]>(initialTeam);
    const availableMembers = useMemo(() => user?.team_members || [], [user]);

    const profileServices = useMemo(() => {
        if (user?.role_type === 'notaris' && Array.isArray(user?.notaris_profile?.services)) {
            return user.notaris_profile.services;
        }
        return [];
    }, [user]);

    const getBaseOfferValue = () => {
        let total = 0;
        if (feeType === 'percentage') {
            const budget = Number(project?.budget) || 0;
            total = (amount / 100) * budget;
        } else if (feeType === 'sqm') {
            const area = Number(project?.project_dimensions?.building_area) || 
                         Number(project?.project_dimensions?.land_area) || 
                         Number(project?.design_details?.targetArea) || 0;
            total = amount * area;
        } else {
            total = amount;
        }
        return isNaN(total) ? 0 : total;
    };

    const baseOfferValue = getBaseOfferValue();
    const allServices = useMemo(() => milestones.flatMap(m => m.services || []), [milestones]);
    const servicesTotal = useMemo(() => allServices.reduce((sum, s) => sum + (Number(s.price) || 0), 0), [allServices]);
    const teamTotal = useMemo(() => proposedTeam.reduce((sum, t) => sum + (Number(t.fee) || 0), 0), [proposedTeam]);
    const grandTotal = baseOfferValue + servicesTotal + teamTotal;
    
    const totalPercentage = termins.reduce((acc, curr) => acc + Number(curr.percentage || 0), 0);

    const updateMilestone = (index: number, updates: Partial<ProposedMilestone>) => {
        setMilestones(prev => {
            const newM = [...prev];
            newM[index] = { ...newM[index], ...updates };
            return newM;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await onSubmit({
                price: amount,
                fee_type: feeType,
                proposed_termins: termins,
                proposed_milestones: milestones,
                selected_services: allServices,
                proposed_team: hasTeamCapability && proposedTeam.length > 0 ? proposedTeam : undefined,
                note
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div className="space-y-8">
                    <FeeSelector 
                        feeType={feeType}
                        onTypeChange={setFeeType}
                        amount={amount}
                        onAmountChange={setAmount}
                        estimatedTotal={baseOfferValue}
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
                </div>

                <div className="space-y-8">
                    <PaymentSchedule 
                        termins={termins}
                        milestones={milestones}
                        onChange={setTermins}
                        totalOfferValue={baseOfferValue}
                        availableServices={profileServices}
                        onMilestoneUpdate={updateMilestone}
                    />
                    
                    <MilestoneRoadmap 
                        milestones={milestones}
                        onChange={setMilestones}
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
                    <button type="button" onClick={onCancel} className="px-8 py-4 text-white text-sm font-black uppercase tracking-widest hover:text-slate-400 transition-colors">
                        Cancel
                    </button>
                    <button 
                        type="submit" 
                        disabled={isSubmitting || totalPercentage !== 100}
                        className="px-10 py-4 bg-white text-slate-900 rounded-2xl text-sm font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
                    >
                        {isSubmitting ? 'Sending...' : 'Submit Proposal'}
                    </button>
                </div>
            </div>
        </form>
    );
};
