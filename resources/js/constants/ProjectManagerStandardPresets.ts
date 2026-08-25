export const PM_FEE_TYPES = [
    { 
        id: 'percentage', 
        label: 'Percentage of Construction', 
        description: 'Professional fee calculated as a percentage (typically 3-8%) of the total project cost.',
        unit: '%'
    },
    { 
        id: 'fixed', 
        label: 'Fixed Consultation Fee', 
        description: 'A single lump sum management fee for the entire project duration.',
        unit: 'IDR'
    },
    { 
        id: 'unit', 
        label: 'Monthly Management Rate', 
        description: 'Fixed monthly fee for ongoing site supervision and project control.',
        unit: 'IDR/mo'
    }
];

export const PM_SERVICE_SCOPES = [
    {
        id: 'procurement',
        label: 'Procurement Management',
        description: 'Selecting suppliers, negotiating prices, and managing material orders / logistics.'
    },
    {
        id: 'scheduling',
        label: 'Schedule & Timeline Control',
        description: 'Ensuring all phases proceed according to the master plan and managing delays.'
    },
    {
        id: 'quality_control',
        label: 'Quality Assurance (QA/QC)',
        description: 'Regular site inspections to ensure construction meets design specifications and quality standards.'
    },
    {
        id: 'budget_oversight',
        label: 'Financial & Budget Control',
        description: 'Managing project transactions, reviewing professional addendums, and optimizing costs.'
    },
    {
        id: 'vendor_coordination',
        label: 'Professional Coordination',
        description: 'Acting as the single point of contact between Owner, Architect, and Contractor.'
    }
];

export const PM_DELIVERABLES = [
    { id: 'weekly_report', label: 'Detailed Weekly Progress Reports' },
    { id: 'cost_tracking', label: 'Updated Cost vs. Budget Tracking' },
    { id: 'site_log', label: 'Master Site Daily Log Access' },
    { id: 'qc_checklist', label: 'Quality Control Checklists & Sign-offs' }
];

export const stripPMAutomatedProposal = (proposal: string) => {
    if (!proposal) return '';
    const marker = "PROFESSIONAL PROPOSAL:";
    if (proposal.includes(marker)) {
        try {
            const parts = proposal.split(marker);
            const content = parts[1].split("------------------------------")[0];
            return content.trim();
        } catch (e) {
            return proposal;
        }
    }
    return proposal;
};

