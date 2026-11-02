import { DocArticle } from './docTypes';

export const proDocs: DocArticle[] = [
    {
        id: 'pro-profile-verification',
        title: 'Professional Profile Verification (SIUP & NPWP)',
        role: 'professional',
        summary: 'Learn how to verify your account to unlock bidding capabilities.',
        sections: [
            {
                type: 'text',
                body: 'To ensure a reliable and secure ecosystem for clients, all architects and contractors must pass profile verification before they can submit bids or accept contracts.'
            },
            {
                type: 'list',
                title: 'Required Verification Documents:',
                items: [
                    'NPWP (Nomor Pokok Wajib Pajak / Tax ID Number) for identity and tax verification.',
                    'SIUP (Surat Izin Usaha Perdagangan / Business License) or SKA (Sertifikasi Keahlian / Professional Certification).',
                    'A complete portfolio showing past projects with rich images.',
                    'Clear, professional face photo for identity confirmation.'
                ]
            },
            {
                type: 'step',
                title: 'Verification Step-by-Step Flow:',
                steps: [
                    { stepNumber: 1, title: 'Navigate to Edit Profile', description: 'Go to your dashboard and click on your profile settings or the "Edit Profile" section.' },
                    { stepNumber: 2, title: 'Click "Verify Account"', description: 'In the "Verification Required" alert banner at the top of your profile, click the "Verify Account" button.' },
                    { stepNumber: 3, title: 'Select Entity Type', description: 'Choose "Individual Professional" for personal credentials, or "Company / Studio" for a corporate firm.' },
                    { stepNumber: 4, title: 'Enter Identity Numbers', description: 'Individuals: Enter KTP (ID Card) or Professional License numbers. Companies: Enter Company Name, NIB (Nomor Induk Berusaha / Business Registration), NPWP, and SIUP.' },
                    { stepNumber: 5, title: 'Upload Documents', description: 'Upload high-resolution scans — Individuals: KTP scans and Professional Licenses. Companies: NPWP Tax Cards and SIUP/NIB Certificates.' },
                    { stepNumber: 6, title: 'Submit for Review', description: 'Click "Save & Request Verification". Your account enters the admin review queue. Audits take approximately 24 hours.' }
                ]
            },
            {
                type: 'widget',
                widgetName: 'verification'
            },
            {
                type: 'alert',
                alertType: 'warning',
                body: 'Unverified professionals can explore the site but are locked from submitting bids or accepting project contracts.'
            }
        ]
    },
    {
        id: 'pro-milestones-work',
        title: 'Managing Milestones & Payment Releases',
        role: 'professional',
        summary: 'How milestone-based billing protects contractors and clients alike.',
        sections: [
            {
                type: 'text',
                body: 'Payments on 4Ceria are strictly milestone-based. When a client accepts your bid, the funds are deposited into secure platform escrow and released as milestones are marked completed.'
            },
            {
                type: 'widget',
                widgetName: 'milestone'
            },
            {
                type: 'step',
                title: 'Milestone Payment Lifecycle:',
                steps: [
                    { stepNumber: 1, title: 'Agree on Termin (Milestones)', description: 'During negotiation, define the milestone schedule — e.g., Fondasi (Foundation), Dinding (Walls), Atap (Roof), Finishing.' },
                    { stepNumber: 2, title: 'Complete the Work', description: 'Execute the construction work for the current milestone phase.' },
                    { stepNumber: 3, title: 'Upload Progress Photos', description: 'Upload photographic proof of completed work when requesting a payment release.' },
                    { stepNumber: 4, title: 'Client & Admin Approval', description: 'The client reviews your progress photos and, together with admin verification, approves the milestone.' },
                    { stepNumber: 5, title: 'Funds Released', description: 'Upon approval, the escrowed funds for that milestone are immediately released to your account.' }
                ]
            },
            {
                type: 'alert',
                alertType: 'info',
                body: 'This system prevents contractors from abandoning incomplete work and ensures clients cannot withhold payments for verified, quality-completed milestones.'
            }
        ]
    },
    {
        id: 'pro-bidding-board',
        title: 'Finding & Bidding on Projects',
        role: 'professional',
        summary: 'How to discover open projects and submit competitive bids.',
        sections: [
            {
                type: 'text',
                body: 'The Bidding Board is where all open construction and renovation projects are listed. Verified professionals can browse available projects, filter by type and budget, and submit proposals.'
            },
            {
                type: 'widget',
                widgetName: 'bidding'
            },
            {
                type: 'step',
                title: 'How to Submit a Bid:',
                steps: [
                    { stepNumber: 1, title: 'Browse the Bidding Board', description: 'Navigate to the Bidding Board tab in your sidebar. Filter projects by type (fondasi, struktur, etc.), budget range, and location.' },
                    { stepNumber: 2, title: 'Review the Project Brief', description: 'Click any project to view the full brief — scope, requirements, budget cap, deadline, and required documents.' },
                    { stepNumber: 3, title: 'Prepare Your Proposal', description: 'Set your proposed price, estimated timeline (waktu pengerjaan), and add detailed notes explaining your approach.' },
                    { stepNumber: 4, title: 'Submit Your Bid', description: 'Click "Submit Bid" to send your proposal. The project owner will see it alongside other bids.' }
                ]
            },
            {
                type: 'alert',
                alertType: 'tip',
                body: 'Include a detailed proposal document and reference past portfolio work to stand out from competing bids. Clients value transparency and thoroughness.'
            }
        ]
    },
    {
        id: 'pro-my-bids',
        title: 'Tracking Your Submitted Proposals',
        role: 'professional',
        summary: 'Monitor the status of all your submitted bids in one place.',
        sections: [
            {
                type: 'text',
                body: 'The My Proposals tab shows every bid you have submitted, organized by status. Track which bids are pending, shortlisted, accepted, or rejected.'
            },
            {
                type: 'list',
                title: 'Bid Status States:',
                items: [
                    'Pending: Your bid has been submitted and is awaiting review by the project owner.',
                    'Shortlisted: The client has selected your bid for the interview phase — negotiation begins.',
                    'Accepted: Your bid was accepted, a contract will be generated for signing.',
                    'Rejected: The client chose a different professional for this project.'
                ]
            },
            {
                type: 'alert',
                alertType: 'info',
                body: 'You will receive a notification whenever your bid status changes. Check the Notifications dropdown or the bell icon in the header.'
            }
        ]
    },
    {
        id: 'pro-negotiation',
        title: 'Fee Negotiation & Counter-Offers',
        role: 'professional',
        summary: 'How to propose fees, respond to counter-offers, and close deals.',
        sections: [
            {
                type: 'text',
                body: 'After being shortlisted, you enter the negotiation phase. You propose a formal fee with a milestone breakdown, and the client can accept or counter-offer. This process continues until mutual agreement.'
            },
            {
                type: 'step',
                title: 'Negotiation Process:',
                steps: [
                    { stepNumber: 1, title: 'Receive Shortlist Notification', description: 'You get notified that the client has shortlisted your bid for interview. Your project workspace unlocks.' },
                    { stepNumber: 2, title: 'Propose Fee & Milestones', description: 'Submit a formal fee proposal with a termin (milestone) breakdown — e.g., 30% Fondasi, 40% Struktur, 30% Finishing.' },
                    { stepNumber: 3, title: 'Respond to Counter-Offers', description: 'If the client counters, review their proposed adjustments and either accept or submit a revised proposal.' },
                    { stepNumber: 4, title: 'Deal Closed', description: 'When both parties agree, the client clicks "Hire" and a contract is generated for signing.' }
                ]
            },
            {
                type: 'alert',
                alertType: 'warning',
                body: 'All fee negotiations are logged and visible to both parties. Never discuss pricing outside the platform — it breaks escrow protections.'
            }
        ]
    },
    {
        id: 'pro-project-phases',
        title: 'Working Through Project Phases',
        role: 'professional',
        summary: 'Understanding the Design → Engineering → Construction → Handover lifecycle.',
        sections: [
            {
                type: 'text',
                body: 'Every project on 4Ceria follows a structured phase lifecycle. Each phase has its own workspace, milestones, deliverables, and assigned professionals.'
            },
            {
                type: 'widget',
                widgetName: 'phasetimeline'
            },
            {
                type: 'list',
                title: 'Project Phase Breakdown:',
                items: [
                    'Design Phase: Architect creates floor plans, 3D models, and design briefs. Client reviews and approves the design.',
                    'Engineering Phase: Structural, MEP, and civil engineers handle technical drawings and calculations.',
                    'Construction Phase: Contractor executes the build according to approved plans. Milestone payments are released per termin.',
                    'Handover Phase: Final inspection, snag list (defect list) resolution, warranty activation, and key handover.'
                ]
            },
            {
                type: 'alert',
                alertType: 'info',
                body: 'Each phase must be completed and approved before the next phase can begin. This ensures quality control at every stage.'
            }
        ]
    },
    {
        id: 'pro-deliverables',
        title: 'Uploading & Managing Deliverables',
        role: 'professional',
        summary: 'How to submit project deliverables, progress photos, and documents.',
        sections: [
            {
                type: 'text',
                body: 'The Deliverables section in your project workspace is where you upload all project outputs — from design drawings to progress photos, technical specifications, and completion reports.'
            },
            {
                type: 'step',
                title: 'Uploading Deliverables:',
                steps: [
                    { stepNumber: 1, title: 'Open your project workspace', description: 'Go to My Projects → select the active project → click the Deliverables tab.' },
                    { stepNumber: 2, title: 'Click "Upload Deliverable"', description: 'Select the deliverable type (drawing, photo, document) and upload your file.' },
                    { stepNumber: 3, title: 'Add description and tags', description: 'Describe what the deliverable shows and tag it to the relevant milestone or phase.' },
                    { stepNumber: 4, title: 'Client reviews', description: 'The client receives a notification and can approve, comment, or request revisions on the deliverable.' }
                ]
            },
            {
                type: 'alert',
                alertType: 'tip',
                body: 'Always upload high-resolution photos with clear timestamps. Quality evidence speeds up milestone approval and payment release.'
            }
        ]
    },
    {
        id: 'pro-firm-management',
        title: 'Creating & Managing Your Firm (Squad)',
        role: 'professional',
        summary: 'How to create a firm, invite team members, and showcase your squad.',
        sections: [
            {
                type: 'text',
                body: 'The Firm (Squad) feature lets architects and contractors organize their team into a professional entity. Your firm profile showcases your team members, completed projects, services, and capabilities.'
            },
            {
                type: 'widget',
                widgetName: 'firmsquad'
            },
            {
                type: 'step',
                title: 'Setting Up Your Firm:',
                steps: [
                    { stepNumber: 1, title: 'Go to My Firm', description: 'Navigate to the My Firm tab in your dashboard sidebar.' },
                    { stepNumber: 2, title: 'Create Your Firm Profile', description: 'Enter firm name, description, services offered, and upload a logo.' },
                    { stepNumber: 3, title: 'Invite Team Members', description: 'Search for other verified professionals on the platform and send them firm invitations.' },
                    { stepNumber: 4, title: 'Manage Roster & Roles', description: 'Assign roles to members — Owner, Manager, or Member. Manage permissions and responsibilities.' }
                ]
            },
            {
                type: 'list',
                title: 'Firm Features:',
                items: [
                    'Squad Profile: Public-facing page showing your team, portfolio, and services.',
                    'Member Roster: Manage who is part of your firm with role-based access.',
                    'Join Requests: Other professionals can request to join your firm.',
                    'Firm Search: Clients can browse and discover firms through the firm directory.'
                ]
            }
        ]
    },
    {
        id: 'pro-sub-professionals',
        title: 'Hiring Sub-Contractors & Specialists',
        role: 'professional',
        summary: 'How contractors can recruit sub-contractors and architects can find engineering specialists.',
        sections: [
            {
                type: 'text',
                body: 'For complex projects, you may need additional specialized professionals. Contractors can hire sub-contractors (tukang spesialis), and architects can bring in structural, MEP, or civil engineers.'
            },
            {
                type: 'step',
                title: 'Hiring Sub-Professionals:',
                steps: [
                    { stepNumber: 1, title: 'Access the hiring tab', description: 'Contractors: go to "Hire Sub-Contractors". Architects: go to "Hire Specialists".' },
                    { stepNumber: 2, title: 'Browse available specialists', description: 'Search by specialization — Structural, MEP, Civil, Interior, Mechanical, Electrical, Plumbing, Roofing, or Finishing.' },
                    { stepNumber: 3, title: 'Invite to your project', description: 'Select a specialist and invite them to collaborate on your active project workspace.' },
                    { stepNumber: 4, title: 'Assign work scope', description: 'Define their specific responsibilities and milestones within the project.' }
                ]
            },
            {
                type: 'alert',
                alertType: 'info',
                body: 'Sub-professionals work under the lead professional and have access to the project workspace relevant to their assigned scope.'
            }
        ]
    },
    {
        id: 'pro-portfolio',
        title: 'Building Your Portfolio',
        role: 'professional',
        summary: 'Showcase your past projects and work samples to attract more clients.',
        sections: [
            {
                type: 'text',
                body: 'A strong portfolio is key to winning bids on the 4Ceria platform. The Portfolio Manager lets you organize past projects with photos, descriptions, and project details that clients can browse.'
            },
            {
                type: 'step',
                title: 'Creating a Portfolio Entry:',
                steps: [
                    { stepNumber: 1, title: 'Go to your profile settings', description: 'Navigate to your dashboard and click on your profile or the "Edit Profile" section.' },
                    { stepNumber: 2, title: 'Open the Portfolio Manager', description: 'Find the Portfolio section where you can add, edit, or remove past project entries.' },
                    { stepNumber: 3, title: 'Add a new project', description: 'Enter the project title, description, location, budget range, and completion date.' },
                    { stepNumber: 4, title: 'Upload project photos', description: 'Add high-quality before/after photos, progress shots, and final result images.' },
                    { stepNumber: 5, title: 'Publish', description: 'Save and publish your portfolio entry. It becomes visible on your public professional profile.' }
                ]
            },
            {
                type: 'alert',
                alertType: 'tip',
                body: 'Profiles with 3+ portfolio entries receive significantly more client inquiries. Include diverse project types to showcase your versatility.'
            }
        ]
    }
];
