import { ProposedTermin, ProposedMilestone } from './project.types';
import { ProposedTeamMember } from './sub_professional.types';

export interface NegotiationOfferDTO {
    price: number;
    fee_type: 'fixed' | 'percentage' | 'unit' | 'sqm';
    proposed_termins: ProposedTermin[];
    proposed_milestones?: ProposedMilestone[];
    selected_services?: any[];
    proposed_team?: ProposedTeamMember[];
    note: string;
}

export interface NegotiationState {
    feeType: NegotiationOfferDTO['fee_type'];
    amount: number;
    milestones: ProposedTermin[];
    totalPercentage: number;
}
