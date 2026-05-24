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
    }
];
