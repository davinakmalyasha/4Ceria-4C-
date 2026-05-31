import { DocArticle } from './clientDocs';

export const proDocs: DocArticle[] = [
    {
        id: 'pro-profile-verification',
        title: 'Professional Profile Verification (SIUP & NPWP)',
        role: 'professional',
        summary: 'Learn how to verify your account to unlock bidding capabilities.',
        sections: [
            {
                type: 'text',
                body: 'To ensure a reliable and secure ecosystem for clients, all architects and contractors must pass profile verification.'
            },
            {
                type: 'list',
                title: 'Required Verification Documents:',
                items: [
                    'NPWP (Nomor Pokok Wajib Pajak) for identity and tax checking',
                    'SIUP (Surat Izin Usaha Perdagangan) or SKA/Sertifikasi Keahlian',
                    'A complete portfolio showing past projects with rich images',
                    'Clear, professional face photo'
                ]
            },
            {
                type: 'list',
                title: 'Verification Step-by-Step Flow:',
                items: [
                    'Step 1: Navigate to the "Edit Profile" section on your dashboard.',
                    'Step 2: In the "Verification Required" alert banner at the top of your profile settings, click the "Verify Account" button to launch the dedicated verification console.',
                    'Step 3: Select your entity type: choose "Individual Professional" to verify personal credentials, or "Company / Studio" to verify as a corporate firm or agency.',
                    'Step 4: Provide your identity numbers: Individuals enter KTP or Professional License numbers. Companies enter Registered Company Name, NIB Registration License, NPWP Tax ID, and SIUP number.',
                    'Step 5: Upload your high-resolution scan documents: Individuals upload KTP scans and Professional Licenses. Companies upload NPWP Tax Cards and SIUP/NIB Certificates.',
                    'Step 6: Click "Save & Request Verification" at the bottom of the page. Your account will automatically enter the administrative review queue. Verification manual audits take roughly 24 hours.'
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
                body: 'Payments on 4Ceria are strictly milestone-based. When a client accepts your bid, the funds are deposited into secure platform hold, released as milestones are marked completed.'
            },
            {
                type: 'widget',
                widgetName: 'milestone'
            },
            {
                type: 'list',
                title: 'Working with Milestones:',
                items: [
                    'Before work starts, align on the milestone checklists (e.g. Fondasi Selesai, Dinding Selesai).',
                    'Upload progress photos as proof of work when request release.',
                    'The client and admin verify the work and trigger immediate release of funds.'
                ]
            }
        ]
    }
];
