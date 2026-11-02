import { DocArticle } from './docTypes';

export const gettingStartedDocs: DocArticle[] = [
    {
        id: 'welcome-platform',
        title: 'What is 4Ceria?',
        role: 'getting-started',
        summary: 'Platform overview, mission, and how 4Ceria connects everyone in the construction ecosystem.',
        sections: [
            {
                type: 'text',
                body: '4Ceria is an integrated construction ecosystem platform that connects property owners (clients) with verified professionals — architects, contractors, interior designers, notaries, and project managers — along with material suppliers and logistics couriers.'
            },
            {
                type: 'list',
                title: 'What 4Ceria Offers:',
                items: [
                    'Property Marketplace: Buy and sell houses with verified ownership certificates (SHM / Sertifikat Hak Milik, HGB / Hak Guna Bangunan).',
                    'Project Bidding Board: Post construction projects and receive competitive bids from verified professionals.',
                    'Secure Escrow Payments: All payments are held in escrow and released only when milestones are verified.',
                    'Materials Marketplace: Purchase construction materials from accredited suppliers with courier delivery.',
                    'Professional Verification: All professionals are verified with NPWP (Tax ID), SIUP (Business License), and portfolio reviews.',
                    'Multi-Phase Project Management: Structured workflow from Design → Engineering → Construction → Handover.'
                ]
            },
            {
                type: 'alert',
                alertType: 'info',
                body: '4Ceria acts as a neutral intermediary — ensuring fair transactions, quality work, and dispute resolution for all parties involved.'
            }
        ]
    },
    {
        id: 'registration-guide',
        title: 'Creating Your Account',
        role: 'getting-started',
        summary: 'Step-by-step guide to register as a client, professional, or supplier.',
        sections: [
            {
                type: 'text',
                body: '4Ceria offers different registration paths depending on your role. Clients (property owners) use the standard registration, while professionals and suppliers use the dedicated professional registration form.'
            },
            {
                type: 'step',
                title: 'Client Registration:',
                steps: [
                    { stepNumber: 1, title: 'Go to the Registration Page', description: 'Click "Register" on the landing page or navigate to /register directly.' },
                    { stepNumber: 2, title: 'Fill in your details', description: 'Enter your full name, email address, and create a secure password.' },
                    { stepNumber: 3, title: 'Verify your email', description: 'Check your inbox for a verification email and click the confirmation link.' },
                    { stepNumber: 4, title: 'Complete your profile', description: 'After login, set up your profile with a photo, bio, and contact information.' }
                ]
            },
            {
                type: 'step',
                title: 'Professional Registration:',
                steps: [
                    { stepNumber: 1, title: 'Go to Professional Registration', description: 'Navigate to /pro/register to access the professional registration form.' },
                    { stepNumber: 2, title: 'Select your role', description: 'Choose your professional type: Arsitek (Architect), Kontraktor (Contractor), Interior Designer, Notaris (Notary), or Supplier.' },
                    { stepNumber: 3, title: 'Enter professional details', description: 'Provide your business name, contact info, specialization, years of experience, and rate pricing.' },
                    { stepNumber: 4, title: 'Start verification', description: 'After registration, proceed to the verification process to unlock full platform features (bidding, contracts, etc.).' }
                ]
            },
            {
                type: 'alert',
                alertType: 'tip',
                body: 'Complete your profile and verification as soon as possible. Verified professionals appear higher in search results and receive more client inquiries.'
            }
        ]
    },
    {
        id: 'role-selection',
        title: 'Understanding User Roles',
        role: 'getting-started',
        summary: 'What each user role can do and how permissions differ across the platform.',
        sections: [
            {
                type: 'text',
                body: '4Ceria has several user roles, each with different capabilities and dashboard views. Understanding your role helps you make the most of the platform.'
            },
            {
                type: 'list',
                title: 'Available Roles:',
                items: [
                    'Client (User): Property owners who list houses, post projects, hire professionals, and buy materials. This is the default role for standard registration.',
                    'Arsitek (Architect): Designs buildings, creates floor plans, and leads the design phase. Can create firms and hire engineering specialists.',
                    'Kontraktor (Contractor): Builds physical structures — foundations, walls, roofing. Can hire sub-contractors and manage construction crews via firms.',
                    'Interior Designer: Plans and executes interior finishings, furniture layouts, and decor.',
                    'Notaris / PPAT (Notary): Handles legal documentation — AJB (Sale Deeds), SHM (Freehold Titles), HGB (Building Rights Titles), and IMB (Building Permits).',
                    'Project Manager: Coordinates all professionals, manages schedules, and oversees quality across all project phases.',
                    'Supplier: Material merchants who operate storefronts on the marketplace.',
                    'Logistics (Courier): Independent drivers who pick up and deliver construction materials.',
                    'Engineering Specialists: Structural, MEP, Civil, and other engineers who join projects through firms or direct invitations.',
                    'Admin: Platform administrators who manage verifications, moderate listings, and audit projects.'
                ]
            },
            {
                type: 'alert',
                alertType: 'info',
                body: 'Each role has a customized dashboard with relevant navigation tabs, tools, and features. You will only see the tools and features that apply to your role.'
            }
        ]
    },
    {
        id: 'dashboard-navigation',
        title: 'Navigating Your Dashboard',
        role: 'getting-started',
        summary: 'How to navigate the sidebar, tabs, and key areas of your personalized dashboard.',
        sections: [
            {
                type: 'text',
                body: 'After logging in, you land on your personalized dashboard. The layout adapts to your role, showing only the tools and tabs relevant to your account type.'
            },
            {
                type: 'list',
                title: 'Dashboard Layout:',
                items: [
                    'Sidebar Navigation: The left sidebar contains your main navigation tabs — Dashboard, Projects, Properties, Hire Professionals, Marketplace, etc.',
                    'Header Bar: The top header shows the current page title, search functionality, notifications bell, and your profile dropdown.',
                    'Main Content Area: The central area displays the active tab content — projects, properties, marketplace, etc.',
                    'Mobile Menu: On mobile devices, the sidebar collapses into a hamburger menu accessible from the header.'
                ]
            },
            {
                type: 'step',
                title: 'Quick Navigation Tips:',
                steps: [
                    { stepNumber: 1, title: 'Use the sidebar', description: 'Click any tab in the left sidebar to navigate to that section. Expandable groups (like Properties, Marketplace) have sub-tabs.' },
                    { stepNumber: 2, title: 'Check notifications', description: 'Click the bell icon in the header to view recent notifications — bid updates, messages, milestone approvals.' },
                    { stepNumber: 3, title: 'Use the search bar', description: 'The header search lets you quickly find projects, professionals, or materials across the platform.' },
                    { stepNumber: 4, title: 'Access profile settings', description: 'Click your avatar in the header to access profile settings, edit your information, or log out.' }
                ]
            }
        ]
    },
    {
        id: 'profile-setup',
        title: 'Setting Up Your Profile',
        role: 'getting-started',
        summary: 'Complete your profile with a photo, bio, and relevant details to build trust.',
        sections: [
            {
                type: 'text',
                body: 'A complete profile builds trust with other users on the platform. Whether you are a client or professional, your profile is visible to anyone you interact with.'
            },
            {
                type: 'step',
                title: 'Profile Setup Steps:',
                steps: [
                    { stepNumber: 1, title: 'Upload a profile photo', description: 'Click on the avatar area in your profile settings and upload a clear, professional photo of yourself.' },
                    { stepNumber: 2, title: 'Write your bio', description: 'Add a description (Deskripsi) about yourself — your experience, expertise, or what you are looking for on the platform.' },
                    { stepNumber: 3, title: 'Add contact details', description: 'Enter your phone number and any other contact information you want visible to verified connections.' },
                    { stepNumber: 4, title: 'For professionals: Complete specialization', description: 'If you are a professional, add your specialization (spesialisasi), years of experience (pengalaman), and rate pricing (rate harga).' }
                ]
            },
            {
                type: 'alert',
                alertType: 'tip',
                body: 'The Profile Completeness Card on your dashboard shows how complete your profile is. Aim for 100% completion to maximize your visibility.'
            }
        ]
    },
    {
        id: 'notifications-guide',
        title: 'Notifications & Alerts',
        role: 'getting-started',
        summary: 'Understanding the notification system and how to stay updated on platform activity.',
        sections: [
            {
                type: 'text',
                body: 'The notification system keeps you informed about all important platform activity — bid updates, messages, milestone approvals, payments, and more.'
            },
            {
                type: 'widget',
                widgetName: 'notification'
            },
            {
                type: 'list',
                title: 'Notification Types:',
                items: [
                    'Bid Received: A professional has submitted a bid on your project.',
                    'Bid Shortlisted: Your bid has been shortlisted for an interview.',
                    'Message Received: Someone sent you a direct message.',
                    'Milestone Approved: A milestone has been approved and payment released.',
                    'Payment Released: Funds have been released from escrow to your account.',
                    'Verification Status: Your professional verification has been approved or requires updates.',
                    'Project Updates: Status changes on projects you are involved in.',
                    'Delivery Updates: Courier delivery status changes for your orders.'
                ]
            },
            {
                type: 'step',
                title: 'Managing Notifications:',
                steps: [
                    { stepNumber: 1, title: 'Click the bell icon', description: 'The bell icon in the header shows a red badge with your unread notification count.' },
                    { stepNumber: 2, title: 'View notification dropdown', description: 'Click the bell to open the dropdown showing your most recent notifications with icons and timestamps.' },
                    { stepNumber: 3, title: 'Mark as read', description: 'Click "Mark all as read" or individually mark notifications to clear the unread count.' }
                ]
            }
        ]
    }
];
