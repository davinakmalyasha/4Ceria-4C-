import { DocArticle } from './docTypes';

export const adminDocs: DocArticle[] = [
    {
        id: 'admin-overview',
        title: 'Admin Dashboard Overview',
        role: 'admin',
        summary: 'Understanding the admin dashboard, statistics, and platform management tools.',
        sections: [
            {
                type: 'text',
                body: 'The Admin Dashboard provides a centralized view of platform health, user statistics, and management tools. Admins are responsible for verifying professionals, moderating property listings, and auditing projects.'
            },
            {
                type: 'list',
                title: 'Admin Dashboard Sections:',
                items: [
                    'Dashboard Overview: Platform-wide statistics — total users, active projects, pending verifications, and revenue metrics.',
                    'User Directory: Browse and manage all registered users across all roles.',
                    'Verification Queue: Review and process professional verification submissions.',
                    'Properties Moderation: Review and approve/reject property listings for the marketplace.',
                    'Projects Audit: Monitor active projects, intervene in disputes, and audit milestone progress.'
                ]
            },
            {
                type: 'alert',
                alertType: 'warning',
                body: 'Admin actions are logged and auditable. All moderation decisions should follow platform guidelines to maintain fairness and trust.'
            }
        ]
    },
    {
        id: 'admin-verification-queue',
        title: 'Processing Verification Requests',
        role: 'admin',
        summary: 'How to review, approve, or reject professional verification submissions.',
        sections: [
            {
                type: 'text',
                body: 'When professionals submit their verification documents (NPWP / Tax ID, SIUP / Business License, KTP / ID Card, etc.), their request enters the admin verification queue. Admins must review each submission carefully.'
            },
            {
                type: 'step',
                title: 'Verification Review Process:',
                steps: [
                    { stepNumber: 1, title: 'Open the Verification Queue', description: 'Navigate to the Verification Queue in the admin sidebar. Pending submissions are sorted by date.' },
                    { stepNumber: 2, title: 'Select a submission', description: 'Click on a pending verification to view the submitted documents and professional details.' },
                    { stepNumber: 3, title: 'Review documents', description: 'Verify NPWP numbers, SIUP validity, KTP photos, and portfolio quality. Cross-check information for consistency.' },
                    { stepNumber: 4, title: 'Approve or Reject', description: 'Click "Approve" to verify the professional, or "Reject" with a reason so they can resubmit corrected documents.' }
                ]
            },
            {
                type: 'list',
                title: 'Verification Checklist:',
                items: [
                    'NPWP (Nomor Pokok Wajib Pajak / Tax ID): Verify the number format and check that the name matches the profile.',
                    'SIUP (Surat Izin Usaha Perdagangan / Business License): Confirm the license is current and matches the claimed business type.',
                    'KTP (Kartu Tanda Penduduk / National ID Card): Verify the photo matches the profile photo and the name is consistent.',
                    'NIB (Nomor Induk Berusaha / Business Registration Number): For company registrations, verify the NIB is valid.',
                    'Portfolio: Ensure the portfolio contains genuine past projects with realistic photos and descriptions.'
                ]
            },
            {
                type: 'alert',
                alertType: 'info',
                body: 'Verification reviews should be completed within 24 hours. The professional receives a notification when their status is updated.'
            }
        ]
    },
    {
        id: 'admin-house-moderation',
        title: 'Moderating Property Listings',
        role: 'admin',
        summary: 'How to review, approve, or flag property listings on the marketplace.',
        sections: [
            {
                type: 'text',
                body: 'Property listings require moderation to ensure quality, accuracy, and compliance. Admins review new listings for correct information, appropriate photos, and valid certificate claims.'
            },
            {
                type: 'step',
                title: 'Listing Moderation Process:',
                steps: [
                    { stepNumber: 1, title: 'Open Properties Moderation', description: 'Navigate to the Properties Moderation section in the admin sidebar.' },
                    { stepNumber: 2, title: 'Review listing details', description: 'Check the property dimensions, price, location data, room configurations, and uploaded photos.' },
                    { stepNumber: 3, title: 'Verify certificate claims', description: 'Ensure the claimed certificate type (SHM / Freehold or HGB / Building Rights) is plausible based on the provided information.' },
                    { stepNumber: 4, title: 'Approve or Flag', description: 'Approve valid listings for the public marketplace, or flag listings that need corrections with specific feedback.' }
                ]
            },
            {
                type: 'list',
                title: 'Red Flags to Watch For:',
                items: [
                    'Inconsistent dimensions between claimed land area and building area.',
                    'Missing or low-quality property photos.',
                    'Unrealistic pricing that is significantly above or below market rates.',
                    'Incomplete address information (missing kelurahan, kecamatan, or kab/kota).',
                    'Duplicate listings for the same property.'
                ]
            }
        ]
    },
    {
        id: 'admin-project-audit',
        title: 'Auditing Active Projects & Disputes',
        role: 'admin',
        summary: 'How to monitor project progress, intervene in disputes, and ensure quality.',
        sections: [
            {
                type: 'text',
                body: 'The Projects Audit section gives admins oversight of all active projects on the platform. Admins can monitor progress, review milestone submissions, and intervene when disputes arise between clients and professionals.'
            },
            {
                type: 'step',
                title: 'Project Audit Workflow:',
                steps: [
                    { stepNumber: 1, title: 'Browse active projects', description: 'The Projects Audit tab shows all projects with their current status, assigned professionals, and budget usage.' },
                    { stepNumber: 2, title: 'Review milestone submissions', description: 'When a professional requests milestone payment release, admins can verify the submitted proof of work.' },
                    { stepNumber: 3, title: 'Handle disputes', description: 'If a client or professional opens a dispute, review both parties\' evidence and make a binding resolution.' },
                    { stepNumber: 4, title: 'Issue payouts or refunds', description: 'Based on the dispute resolution, release escrowed funds to the appropriate party.' }
                ]
            },
            {
                type: 'list',
                title: 'Dispute Resolution Guidelines:',
                items: [
                    'Always review both parties\' submitted evidence (photos, documents, chat logs) before making a decision.',
                    'Freeze all project payments during active dispute investigation.',
                    'Document the resolution rationale for audit trail purposes.',
                    'Notify both parties of the final decision with clear reasoning.',
                    'Escalate complex disputes to senior management if necessary.'
                ]
            },
            {
                type: 'alert',
                alertType: 'warning',
                body: 'Admin dispute resolutions are binding. Ensure all decisions are well-documented and follow platform dispute resolution policies.'
            }
        ]
    }
];
