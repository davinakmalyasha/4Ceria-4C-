import { DocArticle } from './docTypes';

export const commonDocs: DocArticle[] = [
    {
        id: 'common-escrow',
        title: 'Smart Escrow & Milestone Payments',
        role: 'common',
        summary: 'How 4Ceria keeps all contractor payments 100% secure.',
        sections: [
            {
                type: 'text',
                body: '4Ceria runs a milestone escrow LEDGER. Money moves by your own bank transfer, and the platform records and gates it rather than holding it. That distinction matters, so we state it plainly: no money ever passes through a 4Ceria bank account.'
            },
            {
                type: 'text',
                body: 'What the ledger does: it records every movement against the project budget, refuses a payment the budget cannot cover, blocks all payment routes while a dispute is open, and records every release with who authorised it. What it cannot do: recover money that was transferred to the wrong account, or make a transfer itself.'
            },
            {
                type: 'step',
                title: 'How Escrow Operates:',
                steps: [
                    { stepNumber: 1, title: 'Client funds the project budget', description: 'The client transfers the agreed amount to their own escrow arrangement and records it against the project, raising the spendable ceiling.' },
                    { stepNumber: 2, title: 'Professional completes work', description: 'The contractor or architect carries out the construction work and uploads photographic proof.' },
                    { stepNumber: 3, title: 'Client approves milestone', description: 'The client reviews the submitted proof and approves the completed milestone.' },
                    { stepNumber: 4, title: 'Admin verification', description: 'Platform admins verify the submission for quality and completeness.' },
                    { stepNumber: 5, title: 'Funds released', description: 'Upon dual approval, the escrowed funds are instantly released to the professional\'s account.' }
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
                body: 'If a builder fails to complete a milestone, or a client refuses to release payments without cause, both parties can open an official dispute through the project workspace.'
            },
            {
                type: 'step',
                title: 'Dispute Resolution Process:',
                steps: [
                    { stepNumber: 1, title: 'Open a dispute', description: 'Either party can open a dispute from the project workspace. Provide a description and any supporting evidence.' },
                    { stepNumber: 2, title: 'Project halt', description: 'Work and all payments are temporarily frozen while the dispute is under investigation.' },
                    { stepNumber: 3, title: 'Admin panel review', description: 'Platform mediators inspect progress reports, uploaded deliverables, chat logs, and milestone history.' },
                    { stepNumber: 4, title: 'Binding resolution', description: 'Mediators issue a final binding payout allocation — either releasing funds, issuing refunds, or splitting the amount.' }
                ]
            },
            {
                type: 'alert',
                alertType: 'warning',
                body: 'Never coordinate payments outside the 4C platform. Direct bank transfers bypass escrow coverage and void arbitration guarantees.'
            }
        ]
    },
    {
        id: 'common-platform-fees',
        title: 'Costs You Should Budget For',
        role: 'common',
        summary: 'What actually costs money in a 4Ceria project today.',
        sections: [
            {
                type: 'text',
                body: '4Ceria does not currently charge a platform fee. That is a deliberate current state, not a hidden charge, and we would rather tell you plainly than list fees that do not exist in the product.'
            },
            {
                type: 'text',
                body: 'What you WILL pay for on a project, and what the platform has no visibility into:'
            },
            {
                type: 'list',
                title: 'Real costs, outside the platform:',
                items: [
                    'Bank transfer fees, charged by your bank between the sending and receiving account.',
                    'Material and shipping costs, which flow from the supplier and the courier, not through us.',
                    'Professional fees, which are the negotiated bid amount and are visible in the project ledger.',
                    'Taxes (PPN / PPh), which are a matter between you and your tax authority. 4Ceria does not issue invoices or withhold tax.'
                ]
            },
            {
                type: 'text',
                body: 'If a future release introduces a platform fee, it will be itemised on the project ledger next to the payment it applies to, not deducted invisibly.'
            }
        ]
    },
    {
        id: 'common-privacy-security',
        title: 'Data Privacy & Account Security',
        role: 'common',
        summary: 'How 4Ceria protects your personal data and keeps your account secure.',
        sections: [
            {
                type: 'text',
                body: '4Ceria takes data privacy and account security seriously. Your personal information, financial data, and project documents are protected with industry-standard security measures.'
            },
            {
                type: 'list',
                title: 'Security Measures:',
                items: [
                    'Encrypted data storage: All sensitive data (passwords, documents, payment info) is encrypted at rest.',
                    'Secure API communication: All data transfers use HTTPS/TLS encryption.',
                    'Token-based authentication: Sessions use secure, expiring tokens — not permanent cookies.',
                    'Role-based access control: Users can only access data and features appropriate to their role.',
                    'Document privacy: Uploaded documents (NPWP, SIUP, KTP) are only visible to admin verifiers — never publicly shared.'
                ]
            },
            {
                type: 'step',
                title: 'Keeping Your Account Safe:',
                steps: [
                    { stepNumber: 1, title: 'Use a strong password', description: 'Choose a password with at least 8 characters, including uppercase, lowercase, numbers, and symbols.' },
                    { stepNumber: 2, title: 'Don\'t share credentials', description: 'Never share your password or login details with anyone, including other team members.' },
                    { stepNumber: 3, title: 'Log out on shared devices', description: 'Always log out when using shared or public computers to prevent unauthorized access.' },
                    { stepNumber: 4, title: 'Report suspicious activity', description: 'If you notice unauthorized actions on your account, contact support immediately.' }
                ]
            }
        ]
    },
    {
        id: 'common-terms-of-service',
        title: 'Platform Rules & Acceptable Use',
        role: 'common',
        summary: 'Guidelines for acceptable behavior and platform usage policies.',
        sections: [
            {
                type: 'text',
                body: 'By using 4Ceria, all users agree to follow platform rules designed to maintain a safe, fair, and professional ecosystem for everyone.'
            },
            {
                type: 'list',
                title: 'Platform Rules:',
                items: [
                    'Honest Profiles: All information on your profile must be accurate and truthful. Fake credentials lead to permanent bans.',
                    'No Off-Platform Transactions: All payments, contracts, and agreements must go through the 4Ceria platform.',
                    'Professional Communication: Harassment, discrimination, or abusive language in chat is strictly prohibited.',
                    'Quality Work Standards: Professionals must deliver work that meets the agreed specifications and industry standards.',
                    'Timely Responses: All parties should respond to messages, approvals, and disputes within reasonable timeframes.',
                    'No Spam or Fake Reviews: Artificial review manipulation, fake bids, or spam messages result in account suspension.',
                    'Respect Intellectual Property: Do not use another professional\'s portfolio photos or designs without permission.'
                ]
            },
            {
                type: 'alert',
                alertType: 'warning',
                body: 'Violations of platform rules may result in warnings, temporary suspension, or permanent account termination depending on severity.'
            }
        ]
    }
];
