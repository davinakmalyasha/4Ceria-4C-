import { DocArticle } from './docTypes';

export const proSpecialistDocs: DocArticle[] = [
    {
        id: 'specialist-engineer-roles',
        title: 'Engineering Specialist Roles',
        role: 'professional',
        summary: 'Understanding Structural, MEP, Civil, and other engineering specializations on 4Ceria.',
        sections: [
            {
                type: 'text',
                body: 'Engineers on 4Ceria are specialists who handle technical aspects of construction projects. Each type has a dedicated workspace with tools tailored to their discipline.'
            },
            {
                type: 'list',
                title: 'Available Engineering Specializations:',
                items: [
                    'Structural Engineer: Designs and reviews load-bearing structures — columns, beams, slabs, and foundations.',
                    'MEP Engineer (Mechanical, Electrical, Plumbing): Handles HVAC systems, electrical wiring plans, and plumbing layouts.',
                    'Civil Engineer: Manages earthworks, drainage, road access, and site preparation.',
                    'Mechanical Engineer: Specializes in mechanical systems, escalators, lifts, and heavy machinery.',
                    'Electrical Engineer: Focuses on power distribution, lighting plans, and electrical safety.',
                    'Plumbing Specialist: Designs water supply, waste disposal, and sewage systems.',
                    'Roofing Specialist: Handles roof truss design, waterproofing, and roofing material selection.',
                    'Finishing Specialist: Manages plastering, painting, tiling, and final surface treatments.'
                ]
            },
            {
                type: 'alert',
                alertType: 'info',
                body: 'Engineers are typically invited by an architect or contractor already working on a project. They receive an invitation notification and can accept or decline.'
            }
        ]
    },
    {
        id: 'specialist-interior-design',
        title: 'Interior Design Workspace',
        role: 'professional',
        summary: 'How interior designers manage design briefs, milestones, and material selections.',
        sections: [
            {
                type: 'text',
                body: 'Interior designers on 4Ceria have a dedicated workspace with tools for managing design briefs, material swatch boards, milestone tracking, and client approvals.'
            },
            {
                type: 'list',
                title: 'Interior Design Workspace Tools:',
                items: [
                    'Interior Brief Manager: Create and manage room-by-room design briefs with style preferences and requirements.',
                    'Material Swatch Board: Curate material palettes with swatches for flooring, wall finishes, fabrics, and fixtures.',
                    'Design Milestones: Track progress through design phases — Concept, Detailed Design, Procurement, Installation.',
                    'Client Approvals: Submit mood boards and designs for client review and sign-off.'
                ]
            },
            {
                type: 'step',
                title: 'Interior Design Workflow:',
                steps: [
                    { stepNumber: 1, title: 'Review the Design Brief', description: 'Study the client\'s interior requirements, style preferences, budget, and room specifications.' },
                    { stepNumber: 2, title: 'Create Concept Proposals', description: 'Develop mood boards, color palettes, and initial design concepts for client review.' },
                    { stepNumber: 3, title: 'Material Selection', description: 'Use the Swatch Board to curate materials and get client approval on selections.' },
                    { stepNumber: 4, title: 'Detailed Design & Execution', description: 'Create detailed drawings and work with contractors on installation.' }
                ]
            }
        ]
    },
    {
        id: 'specialist-notary-legal',
        title: 'Notary / PPAT Legal Services',
        role: 'professional',
        summary: 'How notaries and PPAT officials handle legal documents and land transfers on 4Ceria.',
        sections: [
            {
                type: 'text',
                body: 'Notaries and PPAT (Pejabat Pembuat Akta Tanah / Land Deed Official) on 4Ceria handle critical legal documentation for property transactions and construction projects.'
            },
            {
                type: 'list',
                title: 'Legal Services Offered:',
                items: [
                    'AJB (Akta Jual Beli / Sale Deed): Official deed for property sale and purchase transactions.',
                    'SHM Processing (Sertifikat Hak Milik / Freehold Title): Freehold title certificate processing.',
                    'HGB Processing (Hak Guna Bangunan / Building Rights Title): Building rights certificate processing.',
                    'IMB Verification (Izin Mendirikan Bangunan / Building Permit): Building permit verification and processing.',
                    'Balik Nama (Title Transfer): Certificate name transfer from seller to buyer.',
                    'Legal Consultation: General legal advice on property and construction matters.'
                ]
            },
            {
                type: 'step',
                title: 'Notary Workflow on 4Ceria:',
                steps: [
                    { stepNumber: 1, title: 'Receive client request', description: 'Clients hire you through the Legal, Notary & PPAT section. You receive a notification with the service type.' },
                    { stepNumber: 2, title: 'Review documents', description: 'Access the project\'s Legal Vault to review all uploaded certificates and property documents.' },
                    { stepNumber: 3, title: 'Process legal documents', description: 'Prepare the required legal documents (AJB, certificates, etc.) and upload them to the Legal Vault.' },
                    { stepNumber: 4, title: 'Client sign-off', description: 'The client reviews and signs off on the completed legal work. Payment is released upon completion.' }
                ]
            },
            {
                type: 'alert',
                alertType: 'warning',
                body: 'All legal document processing must comply with Indonesian government regulations. 4Ceria provides the platform but does not replace official government processes.'
            }
        ]
    },
    {
        id: 'specialist-pm-workspace',
        title: 'Project Manager Workspace',
        role: 'professional',
        summary: 'How Project Managers coordinate teams, manage schedules, and oversee quality.',
        sections: [
            {
                type: 'text',
                body: 'The Project Manager (PM) is the central coordinator for complex projects. The PM Workspace provides tools for scheduling, reporting, legal oversight, and cross-team coordination.'
            },
            {
                type: 'widget',
                widgetName: 'pmschedule'
            },
            {
                type: 'list',
                title: 'PM Workspace Tools:',
                items: [
                    'PM Schedule: Visual calendar to plan site visits, meetings, inspections, and milestones.',
                    'Progress Reports: Create and submit periodic progress reports with photos and status updates.',
                    'Legal Hub: Coordinate with notaries on legal document progress and compliance.',
                    'Approval Queue: Review and approve/reject milestone completions, deliverables, and change orders.',
                    'Budget Oversight: Monitor project spending against the approved budget.',
                    'QA Board: Manage quality assurance questions and issue resolution across all professionals.'
                ]
            },
            {
                type: 'step',
                title: 'PM Daily Workflow:',
                steps: [
                    { stepNumber: 1, title: 'Check Schedule', description: 'Review today\'s planned activities — site inspections, meetings, and milestone deadlines.' },
                    { stepNumber: 2, title: 'Process Approvals', description: 'Review pending milestone submissions, deliverable uploads, and change order requests.' },
                    { stepNumber: 3, title: 'Submit Progress Report', description: 'Create a daily or weekly progress report documenting site conditions and work completed.' },
                    { stepNumber: 4, title: 'Coordinate Teams', description: 'Use the project chat to align architects, contractors, and engineers on upcoming tasks.' }
                ]
            }
        ]
    },
    {
        id: 'specialist-join-firms',
        title: 'Joining Firms as a Specialist',
        role: 'professional',
        summary: 'How engineering specialists can join existing firms and collaborate on projects.',
        sections: [
            {
                type: 'text',
                body: 'As a specialist (Structural, MEP, Civil, etc.), you can join existing firms led by architects or contractors. This gives you access to their project pipeline and collaborative workspace.'
            },
            {
                type: 'step',
                title: 'How to Join a Firm:',
                steps: [
                    { stepNumber: 1, title: 'Browse available firms', description: 'Go to My Firms in your sidebar to see firms you can join or have been invited to.' },
                    { stepNumber: 2, title: 'Review firm profiles', description: 'Check the firm\'s portfolio, team size, active projects, and member list.' },
                    { stepNumber: 3, title: 'Send a join request', description: 'Click "Request to Join" on a firm that matches your specialization and interests.' },
                    { stepNumber: 4, title: 'Wait for approval', description: 'The firm owner reviews your profile and accepts or declines your request.' }
                ]
            },
            {
                type: 'list',
                title: 'Benefits of Joining a Firm:',
                items: [
                    'Get invited to projects by the firm owner without bidding.',
                    'Build your reputation through the firm\'s completed projects.',
                    'Collaborate with experienced architects and contractors.',
                    'Access shared firm resources and client connections.'
                ]
            }
        ]
    }
];
