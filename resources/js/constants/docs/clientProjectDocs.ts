import { DocArticle } from './docTypes';

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
                type: 'step',
                title: 'Project Posting Flow:',
                steps: [
                    { stepNumber: 1, title: 'Select Project Category', description: 'Choose the type of project: Umum (General), Fondasi (Foundation), Struktur (Structure), Dinding (Walls), Atap (Roof), Lantai (Floor), Ventilasi (Ventilation), or Listrik (Electrical).' },
                    { stepNumber: 2, title: 'Set Budget & Timeline', description: 'Use the budget slider to set your estimated budget cap. Set a deadline for bid submissions.' },
                    { stepNumber: 3, title: 'Add Project Details', description: 'Enter title, description, location, and upload any reference documents or architectural drawings.' },
                    { stepNumber: 4, title: 'Specify Required Documents', description: 'Add required certificates using the "+" button — e.g., AJB (Akta Jual Beli / Sale Deed), SHM (Freehold Title), IMB (Izin Mendirikan Bangunan / Building Permit).' },
                    { stepNumber: 5, title: 'Publish to the Bidding Board', description: 'Review your project brief and click "Post Project" to make it visible to verified professionals.' }
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
        summary: 'How to recruit architects, contractors, interior designers, notaries, and project managers.',
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
                title: 'Available Professional Types:',
                items: [
                    'Arsitek (Architect): Designs building plans, floor layouts, and architectural drawings.',
                    'Kontraktor (Contractor): Builds the physical structure — foundations, walls, roofing.',
                    'Interior Designer: Plans and executes interior finishings, furniture layouts, and decor.',
                    'Notaris / PPAT (Notary): Handles legal documents, land transfers, AJB, and certificate processing.',
                    'Project Manager: Coordinates all professionals, manages schedules, and oversees quality.'
                ]
            },
            {
                type: 'step',
                title: 'Professional Recruitment Flow:',
                steps: [
                    { stepNumber: 1, title: 'Browse Professional Directory', description: 'Go to Hire Professionals in the sidebar and select the type you need (Architect, Constructor, etc.).' },
                    { stepNumber: 2, title: 'Review Profiles & Ratings', description: 'View rate pricing, portfolios, years of experience, specializations, and client reviews.' },
                    { stepNumber: 3, title: 'Chat Directly', description: 'Click "Chat" on their profile card to discuss project specifics in a private conversation.' },
                    { stepNumber: 4, title: 'Send a Hire Proposal', description: 'Click "Hire" to send a direct proposal with locked budget terms for their review and acceptance.' }
                ]
            }
        ]
    },
    {
        id: 'client-buy-materials',
        title: 'Purchasing Construction Materials',
        role: 'client',
        summary: 'Explore the building materials marketplace and securely checkout items.',
        sections: [
            {
                type: 'text',
                body: 'Purchase cement, reinforcement steel, pipes, bricks, and custom fittings from accredited supplier stores. See how cart computations and checkout work below:'
            },
            {
                type: 'widget',
                widgetName: 'buymaterial'
            },
            {
                type: 'step',
                title: 'Cart & Delivery Checkout Flow:',
                steps: [
                    { stepNumber: 1, title: 'Browse the Marketplace', description: 'Navigate to Marketplace → Construction Materials or Furniture & Decor to explore available products.' },
                    { stepNumber: 2, title: 'Add to Cart', description: 'Click any material card to view details, then specify quantity and add to your cart.' },
                    { stepNumber: 3, title: 'Review Cart & Shipping', description: 'Shipping fees are computed based on overall weight and destination distance from the supplier.' },
                    { stepNumber: 4, title: 'Secure Checkout with Escrow', description: 'Funds are held securely in escrow until the courier confirms delivery at your project site.' }
                ]
            },
            {
                type: 'alert',
                alertType: 'info',
                body: 'Materials can also be ordered directly from within your project workspace — your contractor can request specific materials that you approve and order.'
            }
        ]
    },
    {
        id: 'client-shortlist-pro',
        title: 'Shortlisting Bids for Interview',
        role: 'client',
        summary: 'Shortlist bids to start the private interview phase and unlock the project workspace.',
        sections: [
            {
                type: 'text',
                body: 'The shortlisting feature bridges public bidding and active negotiation. As a project owner or PM, when you see a proposal that catches your eye on your Bidding Board, you can click "Shortlist for Interview" to start a private negotiation.'
            },
            {
                type: 'widget',
                widgetName: 'shortlistinterview'
            },
            {
                type: 'step',
                title: 'Shortlisting Process:',
                steps: [
                    { stepNumber: 1, title: 'Review Bids on the Bidding Board', description: 'All submitted bids appear on your project\'s Bidding Board with proposed price, timeline, and notes.' },
                    { stepNumber: 2, title: 'Click "Shortlist for Interview"', description: 'Select the most promising proposals to move them into the private negotiation phase.' },
                    { stepNumber: 3, title: 'Workspace Unlocked', description: 'Shortlisting automatically unlocks the project workspace for the selected professional.' },
                    { stepNumber: 4, title: 'Begin Negotiation', description: 'Start private discussions, request portfolio samples, and negotiate fee terms.' }
                ]
            },
            {
                type: 'alert',
                alertType: 'tip',
                body: 'Shortlisting a bid locks all unrelated features for the professional until you officially hire them or release them.'
            }
        ]
    },
    {
        id: 'client-interview-fee',
        title: 'Interview & Fee Negotiation',
        role: 'client',
        summary: 'Negotiate project costs and set payment milestones with counter-offers.',
        sections: [
            {
                type: 'text',
                body: 'Once a professional is shortlisted, the interview phase begins. In the Tendering Hub, you can chat with the professional, review their past portfolios, and negotiate the project fee.'
            },
            {
                type: 'step',
                title: 'Fee Negotiation Flow:',
                steps: [
                    { stepNumber: 1, title: 'Awaiting Quote', description: 'The shortlisted professional must first propose a fee and milestone schedule (termin pembayaran).' },
                    { stepNumber: 2, title: 'Review Fee Proposal', description: 'Review the proposed total fee, milestone breakdown, and payment schedule.' },
                    { stepNumber: 3, title: 'Counter-Offer (Optional)', description: 'If the fee exceeds your budget, use the Counter-Offer console to propose alternative terms.' },
                    { stepNumber: 4, title: 'Mutual Agreement', description: 'Once both parties agree on the terms, click "Hire" to officially onboard the professional.' }
                ]
            },
            {
                type: 'list',
                title: 'Key Negotiation Concepts:',
                items: [
                    'Termin (Payment Milestone): Payments split into phases — e.g., 30% Foundation, 40% Structure, 30% Finishing.',
                    'Counter-Offer: You can propose a different total fee or adjust the milestone split percentages.',
                    'Escrow Security: All agreed milestone payments are held in platform escrow until work is verified.'
                ]
            },
            {
                type: 'alert',
                alertType: 'warning',
                body: 'Never agree to payment terms outside the platform. All fee negotiations must go through the official counter-offer system to maintain escrow protection.'
            }
        ]
    },
    {
        id: 'client-project-board',
        title: 'Using the Project Board',
        role: 'client',
        summary: 'Track all your projects at a glance with the visual project board.',
        sections: [
            {
                type: 'text',
                body: 'The Project Board gives you a bird\'s-eye view of all your active, pending, and completed projects. Each project card shows its status, assigned professionals, budget usage, and current phase.'
            },
            {
                type: 'widget',
                widgetName: 'projectboard'
            },
            {
                type: 'list',
                title: 'Project Status States:',
                items: [
                    'Open: Project is posted on the Bidding Board, accepting bids from professionals.',
                    'Accepted (Arsitek): An architect has been hired and the design phase is in progress.',
                    'Accepted (Kontraktor): A contractor has been hired and construction is underway.',
                    'Completed: All milestones are finished, payments released, and the project is archived.'
                ]
            }
        ]
    },
    {
        id: 'client-project-detail',
        title: 'The Project Workspace',
        role: 'client',
        summary: 'Deep dive into the project detail view with all management tools.',
        sections: [
            {
                type: 'text',
                body: 'Each project has a dedicated workspace with multiple tabs for managing every aspect of the build — from design briefs to milestone payments, deliverables, and QA.'
            },
            {
                type: 'list',
                title: 'Workspace Tabs:',
                items: [
                    'Brief: The full project brief with requirements, budget, and specifications.',
                    'Phase Timeline: Visual timeline showing all project phases (Design → Engineering → Construction → Handover).',
                    'Milestones: Track progress milestones and trigger payment releases.',
                    'Deliverables: View uploaded documents, drawings, and progress photos.',
                    'Budget: Detailed financial breakdown with projected vs actual costs.',
                    'QA Board: Quality assurance questions and answers between client and professionals.',
                    'Activity: Real-time activity feed showing all project events and updates.',
                    'Comments: Discussion thread for project-specific conversations.'
                ]
            },
            {
                type: 'alert',
                alertType: 'tip',
                body: 'The Project Workspace is your central command center. All communication, file sharing, and payments for a project should happen within this workspace.'
            }
        ]
    },
    {
        id: 'client-contract-signing',
        title: 'Reviewing & Signing Contracts',
        role: 'client',
        summary: 'How to review contract terms and digitally sign agreements with professionals.',
        sections: [
            {
                type: 'text',
                body: 'When you hire a professional, a formal contract is generated based on the agreed fee, milestones, and project scope. Both parties must review and digitally sign the contract before work can begin.'
            },
            {
                type: 'widget',
                widgetName: 'contract'
            },
            {
                type: 'step',
                title: 'Contract Signing Process:',
                steps: [
                    { stepNumber: 1, title: 'Contract Generated', description: 'After hiring, the platform auto-generates a contract with all agreed terms, parties, and milestone schedules.' },
                    { stepNumber: 2, title: 'Review All Terms', description: 'Both client and professional review the contract details — scope, timeline, fees, and cancellation terms.' },
                    { stepNumber: 3, title: 'Digital Signature', description: 'Click "Sign Contract" and confirm with your account credentials to apply your digital signature.' },
                    { stepNumber: 4, title: 'Both Parties Signed', description: 'Once both parties have signed, the contract is locked and the project workspace fully activates.' }
                ]
            },
            {
                type: 'alert',
                alertType: 'warning',
                body: 'Contracts are legally binding digital agreements. Read all terms carefully before signing. Once both parties sign, the contract cannot be unilaterally modified — changes require a formal addendum.'
            }
        ]
    }
];
