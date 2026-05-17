export const ARCHITECT_STYLES = [
    'Modern',
    'Minimalist',
    'Scandinavian',
    'Industrial',
    'Contemporary',
    'Tropical Modern',
    'Mediterranean',
    'Mid-Century Modern',
    'Brutalist',
    'Biophilic Design',
    'Japandi',
    'Neoclassical',
    'Art Deco',
    'Rustic / Farmhouse',
    'Victorian'
];

export const ARCHITECT_SERVICE_SCOPES = [
    { 
        id: 'schematic', 
        label: 'Concept & Sketches', 
        description: 'Initial ideas, moodboards, and rough floor plan sketches.' 
    },
    { 
        id: 'design_dev', 
        label: 'Refined Floor Plans', 
        description: 'Detailed room layouts, dimensions, and material choices.' 
    },
    { 
        id: 'construction_docs', 
        label: 'Technical Blueprints', 
        description: 'Official files for the builder (Electrical, Plumbing, & Structure).' 
    },
    { 
        id: 'rab_boq', 
        label: 'Budget & Material List', 
        description: 'Detailed list of materials needed and their estimated costs.' 
    },
    { 
        id: 'site_supervision', 
        label: 'Site Monitoring', 
        description: 'Regular site visits to ensure the builder follows the design correctly.' 
    },
    {
        id: 'pbg_processing',
        label: 'PBG Administrative Support',
        description: 'Preparation of government-compliant blueprints and SKA/IPL signature for PBG/IMB.'
    }
];

export const ARCHITECT_DELIVERABLES = [
    { id: '3d_render', label: '3D Photorealistic Renders', icon: 'Box' },
    { id: 'floor_plan', label: 'Detailed Floor Plans', icon: 'Layout' },
    { id: 'mep_plan', label: 'MEP (Technicals) Plans', icon: 'Zap' },
    { id: 'structural', label: 'Structural Blueprints', icon: 'Grid' },
    { id: 'vr_walkthrough', label: 'VR / 360 Walkthrough', icon: 'Eye' },
    { id: 'interior_concept', label: 'Interior Design Concept', icon: 'Sofa' },
    { id: 'pbg_docs', label: 'PBG Blueprint Package', icon: 'FileText' }
];

export const ARCHITECT_FEE_TYPES = [
    { id: 'fixed', label: 'Fixed Fee (Full Service)', description: 'A single lump sum for the entire agreed scope.' },
    { id: 'percentage', label: 'Percentage of Construction', description: 'Calculated as 8-15% of the total builder budget.' },
    { id: 'hourly', label: 'Hourly Consultation', description: 'Billed based on actual meetings and drafting hours.' },
    { id: 'sqm', label: 'Rate per Square Meter', description: 'Fixed rate based on the floor area of the project.' }
];

export function formatArchitectProposal(data: {
    style: string,
    revisions: string,
    scopes: string[],
    deliverables: string[],
    feeType?: string,
    userProposal: string
}) {
    const scopeLabels = ARCHITECT_SERVICE_SCOPES
        .filter(s => data.scopes.includes(s.id))
        .map(s => `- ${s.label}: ${s.description}`)
        .join('\n');

    const deliverableLabels = ARCHITECT_DELIVERABLES
        .filter(d => data.deliverables.includes(d.id))
        .map(d => `✓ ${d.label}`)
        .join(', ');

    const feeLabel = ARCHITECT_FEE_TYPES.find(f => f.id === data.feeType)?.label || 'Contractual';

    return `
=== ARCHITECTURAL PROPOSAL SUMMARY ===
• STYLE/THEME: ${data.style || 'Custom'}
• REVISION LIMIT: ${data.revisions || 'As per agreement'}
• FEE STRUCTURE: ${feeLabel}
• DELIVERABLES: ${deliverableLabels}

--- SCOPE OF SERVICES ---
${scopeLabels}

--- PROFESSIONAL MESSAGE ---
${data.userProposal}

---
By hiring this professional, you agree to the scope and deliverables outlined above.
    `.trim();
}
