import { DocArticle } from './docTypes';

export const faqDocs: DocArticle[] = [
    {
        id: 'faq-account',
        title: 'Account & Login FAQ',
        role: 'faq',
        summary: 'Frequently asked questions about account access, passwords, and login issues.',
        sections: [
            {
                type: 'text',
                body: 'Common questions about creating, accessing, and managing your 4Ceria account.'
            },
            {
                type: 'list',
                title: 'Q: I forgot my password. How do I reset it?',
                items: [
                    'Go to the Login page and click "Forgot Password?".',
                    'Enter the email address associated with your account.',
                    'Check your inbox for a password reset link.',
                    'Click the link and set a new password. The link expires after 60 minutes.'
                ]
            },
            {
                type: 'list',
                title: 'Q: Can I change my email address?',
                items: [
                    'Currently, email changes require contacting platform support.',
                    'For security reasons, email changes are verified through both the old and new email addresses.'
                ]
            },
            {
                type: 'list',
                title: 'Q: Can I switch my role (e.g., from Client to Professional)?',
                items: [
                    'User roles are set during registration and determine your dashboard layout and available features.',
                    'To use a different role, you would need to register a separate account with the appropriate role type.',
                    'Contact support if you believe your role was set incorrectly during registration.'
                ]
            },
            {
                type: 'list',
                title: 'Q: Why am I seeing "Unauthorized" errors?',
                items: [
                    'Your session may have expired. Try logging out and logging back in.',
                    'Certain pages require specific roles — e.g., admin pages are only for admin accounts.',
                    'If the issue persists, clear your browser cache and cookies, then try again.'
                ]
            }
        ]
    },
    {
        id: 'faq-payments',
        title: 'Payments & Escrow FAQ',
        role: 'faq',
        summary: 'Frequently asked questions about payments, escrow holds, refunds, and billing.',
        sections: [
            {
                type: 'text',
                body: 'Common questions about how payments work on the 4Ceria platform.'
            },
            {
                type: 'list',
                title: 'Q: How does the escrow system work?',
                items: [
                    'When a client hires a professional, the agreed project fee is deposited into a secure platform escrow account.',
                    'Funds are NOT sent directly to the professional upfront.',
                    'Payments are released in installments (termin / milestones) as work is completed and verified.',
                    'Both client approval and admin verification are required before funds are released.'
                ]
            },
            {
                type: 'list',
                title: 'Q: When do professionals get paid?',
                items: [
                    'Professionals receive payment after each milestone is completed, verified, and approved.',
                    'The typical flow: Professional submits proof → Client reviews → Admin verifies → Funds released.',
                    'Processing time after approval is typically instant on the platform.'
                ]
            },
            {
                type: 'list',
                title: 'Q: What happens if I want a refund?',
                items: [
                    'If a milestone has not been started, the escrowed funds can be released back to the client.',
                    'If work has partially started, a dispute process determines the fair allocation.',
                    'Completed and approved milestones cannot be refunded — only future milestones.',
                    'Open a dispute through the project workspace to initiate the refund process.'
                ]
            },
            {
                type: 'alert',
                alertType: 'warning',
                body: 'Never send payments directly to professionals outside the platform. Direct bank transfers bypass escrow protection and void all platform guarantees.'
            }
        ]
    },
    {
        id: 'faq-verification',
        title: 'Verification FAQ',
        role: 'faq',
        summary: 'Common questions about the professional verification process and resubmission.',
        sections: [
            {
                type: 'text',
                body: 'Answers to common questions about getting verified as a professional on 4Ceria.'
            },
            {
                type: 'list',
                title: 'Q: Why was my verification rejected?',
                items: [
                    'Document quality too low: Scans must be high-resolution and clearly readable.',
                    'Information mismatch: The name on your NPWP/SIUP does not match your profile name.',
                    'Expired documents: Your SIUP or professional license may have expired.',
                    'Incomplete submission: Missing required documents (e.g., submitted NPWP but not SIUP).',
                    'Invalid portfolio: Portfolio entries must show genuine past projects with real photos.'
                ]
            },
            {
                type: 'list',
                title: 'Q: How do I resubmit after rejection?',
                items: [
                    'Go back to your profile settings and click "Verify Account" again.',
                    'The rejection reason will be displayed — address each issue mentioned.',
                    'Re-upload corrected documents and submit for review.',
                    'Resubmissions are reviewed with the same 24-hour turnaround.'
                ]
            },
            {
                type: 'list',
                title: 'Q: How long does verification take?',
                items: [
                    'Initial reviews are typically completed within 24 hours.',
                    'If additional information is needed, the admin will note it in the rejection reason.',
                    'Peak periods (holidays, high registration volume) may extend review times slightly.'
                ]
            },
            {
                type: 'alert',
                alertType: 'tip',
                body: 'Before submitting, double-check that all document scans are clear, names match across documents, and your portfolio has at least 3 genuine project entries.'
            }
        ]
    },
    {
        id: 'faq-projects',
        title: 'Projects & Bidding FAQ',
        role: 'faq',
        summary: 'Common questions about posting projects, receiving bids, and managing workflows.',
        sections: [
            {
                type: 'text',
                body: 'Answers to frequent questions about the project lifecycle on 4Ceria.'
            },
            {
                type: 'list',
                title: 'Q: How many bids can I receive on a project?',
                items: [
                    'There is no limit on the number of bids a project can receive.',
                    'All bids are visible on your project\'s Bidding Board.',
                    'You can compare bids using the Bid Comparison Tool to evaluate proposals side-by-side.'
                ]
            },
            {
                type: 'list',
                title: 'Q: Can I edit a project after posting it?',
                items: [
                    'Yes, you can edit project details (title, description, budget, requirements) after posting.',
                    'Go to your Project Board, select the project, and click "Edit Project".',
                    'Note: If bids have already been submitted, significant changes may require notifying existing bidders.'
                ]
            },
            {
                type: 'list',
                title: 'Q: What is the difference between Shortlisting and Hiring?',
                items: [
                    'Shortlisting: Moves a bidder to the private interview phase. They can negotiate fees but are not yet hired.',
                    'Hiring: Officially onboards the professional. A contract is generated and the project workspace fully activates.',
                    'You can shortlist multiple professionals but can only hire one per role per phase.'
                ]
            },
            {
                type: 'list',
                title: 'Q: Can I cancel a project?',
                items: [
                    'Projects with status "Open" (no bids accepted) can be cancelled freely.',
                    'Projects with active contracts require mutual agreement or a formal dispute process.',
                    'Escrowed funds for uncompleted milestones can be returned through the cancellation process.'
                ]
            }
        ]
    },
    {
        id: 'faq-marketplace',
        title: 'Marketplace & Delivery FAQ',
        role: 'faq',
        summary: 'Common questions about ordering materials, shipping, and delivery issues.',
        sections: [
            {
                type: 'text',
                body: 'Answers to frequent questions about the construction materials marketplace.'
            },
            {
                type: 'list',
                title: 'Q: How are shipping fees calculated?',
                items: [
                    'Shipping fees are based on: total weight of materials (kg), distance between supplier and delivery site (km), and required vehicle type.',
                    'The calculation is automatic — you see the final shipping cost before checkout.',
                    'Fees are paid by the buyer and held in escrow until delivery is confirmed.'
                ]
            },
            {
                type: 'list',
                title: 'Q: What if my order arrives damaged?',
                items: [
                    'Take photos of the damage immediately upon delivery.',
                    'Do NOT confirm delivery receipt if items are damaged.',
                    'Open a dispute through your order details page.',
                    'The platform will mediate between you, the supplier, and the courier to determine responsibility.',
                    'Refunds or replacements are issued based on the dispute resolution.'
                ]
            },
            {
                type: 'list',
                title: 'Q: Can I cancel an order after placing it?',
                items: [
                    'Orders can be cancelled before the supplier confirms stock availability.',
                    'Once confirmed, cancellation may incur a restocking fee.',
                    'Orders already picked up by a courier cannot be cancelled — only returned after delivery.'
                ]
            },
            {
                type: 'list',
                title: 'Q: How do I track my delivery?',
                items: [
                    'Go to Marketplace → My Orders and find your active order.',
                    'The delivery status shows real-time updates: Confirmed → Picked Up → En Route → Delivered.',
                    'You receive notifications at each status change.'
                ]
            }
        ]
    }
];
