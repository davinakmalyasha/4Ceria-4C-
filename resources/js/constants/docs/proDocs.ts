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
                    'Step 1: Go to Edit Profile on your dashboard, or click "I Want to Verify" on active bidding pages.',
                    'Step 2: Locate the sticky "Verification Panel" on the right side of the profile page.',
                    'Step 3: Select and upload your Profile Photo, Portfolio PDF, and Certificate (SIUP / NPWP).',
                    'Step 4: Click "Save Profile" to submit. Your status will update to "Pending Verification".',
                    'Step 5: The admin team will manually review your credentials within 24 hours.',
                    'Step 6: Upon approval, you will receive a notification and gain full privileges to submit bids.'
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
