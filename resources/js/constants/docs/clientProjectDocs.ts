import { DocArticle } from './clientDocs';

export const clientProjectDocs: DocArticle[] = [
    {
        id: 'client-post-project',
        title: 'Post Construction & Renovation Projects',
        role: 'client',
        summary: 'Step-by-step wizard walkthrough to launch construction projects on the Bidding Board.',
        sections: [
            {
                type: 'text',
                body: 'The project creation flow allows you to outline your building ideas and receive bids from contractors and architects. Try out the simulated post wizard below:'
            },
            {
                type: 'widget',
                widgetName: 'postproject'
            },
            {
                type: 'list',
                title: 'Tendering Board Milestones:',
                items: [
                    'Enter Project details: pick type (structure, foundations, finishing).',
                    'Set strict budget caps: sliding scale to represent estimates.',
                    'Select required paperwork: Add multiple documents using the "+" button (e.g. AJB, SHM, IMB) to list required certificates.'
                ]
            },
            {
                type: 'alert',
                alertType: 'tip',
                body: 'Specifying your exact documents in the project wizard filters out unqualified bidders and ensures builders know key legal statuses upfront.'
            }
        ]
    },
    {
        id: 'client-hire-pro',
        title: 'Hiring Verified Professionals',
        role: 'client',
        summary: 'How to recruit architects, contractors, and notaries to your projects.',
        sections: [
            {
                type: 'text',
                body: 'You can explore our professional directory, inspect ratings, read feedback, and initiate private communications. Test the simulated profile card below:'
            },
            {
                type: 'widget',
                widgetName: 'hirepro'
            },
            {
                type: 'list',
                title: 'Professional Recruitment Flow:',
                items: [
                    'Browse profiles: View rate pricing, portfolios, and years of experience.',
                    'Chat directly: Click Chat on their card to discuss project specifics.',
                    'Offer Contracts: Send direct proposals with locked budgets for their review.'
                ]
            }
        ]
    },
    {
        id: 'client-buy-materials',
        title: 'Purchasing Construction Materials',
        role: 'client',
        summary: 'Explore the building materials marketplace and check out items securely.',
        sections: [
            {
                type: 'text',
                body: 'Purchase cement, reinforcement steel, pipes, bricks, and custom fittings from accredited supplier stores. See how cart computations and checkout works below:'
            },
            {
                type: 'widget',
                widgetName: 'buymaterial'
            },
            {
                type: 'list',
                title: 'Cart & Delivery Checkout:',
                items: [
                    'Add goods to your cart and specify quantity.',
                    'Compute shipping fees based on overall weight and destination distance.',
                    'Escrow funds are held securely until the courier completes delivery.'
                ]
            }
        ]
    },
    {
        id: 'client-shortlist-pro',
        title: 'Shortlist Feature',
        role: 'client',
        summary: 'Shortlist bids to start the private interview phase and unlock the project workspace.',
        sections: [
            {
                type: 'text',
                body: 'The shortlisting feature bridges public bidding and active negotiation. As a project owner or PM, when you see a proposal that catches your eye on your Bidding Board, you can click "Shortlist for Interview" to start a private negotiation.'
            },
            {
                type: 'alert',
                alertType: 'tip',
                body: 'Shortlisting a bid automatically unlocks the project workspace for the professional, but locks all unrelated features until you officially hire them.'
            },
            {
                type: 'widget',
                widgetName: 'shortlistinterview'
            },
            {
                type: 'list',
                title: 'Shortlisting Highlights:',
                items: [
                    'Review all submissions under the Bidding Board.',
                    'Filter out unneeded proposals by shortlisting only key candidates.',
                    'Unlocks a secure channel for private negotiation.'
                ]
            }
        ]
    },
    {
        id: 'client-interview-fee',
        title: 'Interview & Fee Proposal',
        role: 'client',
        summary: 'Negotiate project costs and set payment milestones with counter-offers.',
        sections: [
            {
                type: 'text',
                body: 'Once a professional is shortlisted, the interview phase begins. In the Tendering Hub, you can chat with the professional, review their past portfolios, and negotiate the project fee.'
            },
            {
                type: 'text',
                body: 'Professionals can submit a formal Fee & Payment Milestone Proposal. If the proposed fee is outside your budget, you can send a Counter-Offer. Once both parties agree on the terms, the client can officially hire the professional.'
            },
            {
                type: 'widget',
                widgetName: 'shortlistinterview'
            },
            {
                type: 'list',
                title: 'Interview & Fee Negotiation Guidelines:',
                items: [
                    'Awaiting Quote: The shortlisted professional must propose a fee and milestone schedule first.',
                    'Counter-Offer Console: Seamlessly pitch custom counter-rates to reach a mutual agreement.',
                    'Escrow Security: Standardizing milestone schedules protects budgets and ensures progress before payout.'
                ]
            }
        ]
    }
];
