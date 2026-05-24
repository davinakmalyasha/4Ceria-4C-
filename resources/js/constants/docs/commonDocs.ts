import { DocArticle } from './clientDocs';

export const commonDocs: DocArticle[] = [
    {
        id: 'common-escrow',
        title: 'Smart Escrow & Milestone Payments',
        role: 'common',
        summary: 'How 4Ceria keeps all contractor payments 100% secure.',
        sections: [
            {
                type: 'text',
                body: 'To protect clients and builders, we enforce a secured milestone escrow model.'
            },
            {
                type: 'list',
                title: 'How It Operates:',
                items: [
                    'Clients deposit funds for the active milestone phase.',
                    'Contractors carry out construction and upload photographic proof.',
                    'Client and admin approve work, instantly releasing funds to the builder.'
                ]
            },
            {
                type: 'alert',
                alertType: 'info',
                body: 'This prevents contractors from abandoning incomplete works and ensures clients do not withhold payments for fully completed, quality jobs.'
            }
        ]
    },
    {
        id: 'common-disputes',
        title: 'Dispute Resolution & Arbitrations',
        role: 'common',
        summary: 'What happens in case of conflicts or delays during construction.',
        sections: [
            {
                type: 'text',
                body: 'If a builder fails to complete a milestone, or a client refuses to release payments without cause, both parties can open an official dispute.'
            },
            {
                type: 'list',
                title: 'Mediation Checklist:',
                items: [
                    'Project halt: Work and payments are temporarily frozen.',
                    'Admin panel review: Platform mediators inspect progress reports and logs.',
                    'Refund/Release determination: Mediators issue a final binding payout allocation.'
                ]
            },
            {
                type: 'alert',
                alertType: 'warning',
                body: 'Never coordinate payments outside the 4C platform. Direct bank transfers bypass escrow coverage and void arbitration guarantees.'
            }
        ]
    }
];
