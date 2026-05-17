export const INTERIOR_STYLES = [
    'Modern',
    'Minimalist',
    'Scandinavian',
    'Industrial',
    'Contemporary',
    'Japandi',
    'Bohemian',
    'Classic / Luxury',
    'Mid-Century Modern',
    'Art Deco',
    'Biophilic',
    'Rustic',
    'Coastal'
];

export const INTERIOR_SERVICE_SCOPES = [
    { 
        id: 'space_planning', 
        label: 'Space Planning', 
        description: 'Optimizing room layouts, furniture placement, and traffic flow.' 
    },
    { 
        id: 'moodboard_concept', 
        label: 'Concept & Moodboarding', 
        description: 'Visual direction, color palettes, and material selection.' 
    },
    { 
        id: '3d_visualization', 
        label: '3D Visualization', 
        description: 'Photorealistic 3D renders to see the final result before execution.' 
    },
    { 
        id: 'technical_drawings', 
        label: 'Technical Drawings', 
        description: 'Furniture details, lighting plans, and carpentry specs for builders.' 
    },
    { 
        id: 'material_sourcing', 
        label: 'Material & FF&E Sourcing', 
        description: 'Helping select and source furniture, fixtures, and equipment.' 
    },
    { 
        id: 'styling_curation', 
        label: 'Final Styling & Curation', 
        description: 'Final touches, decor selection, and on-site styling.' 
    }
];

export const INTERIOR_DELIVERABLES = [
    { id: '3d_render', label: '3D Photorealistic Renders', icon: 'Box' },
    { id: 'furniture_layout', label: 'Furniture Layout Plan', icon: 'Layout' },
    { id: 'material_board', label: 'Material Sample Board', icon: 'Layers' },
    { id: 'carpentry_detail', label: 'Custom Carpentry Drawings', icon: 'Hammer' },
    { id: 'lighting_plan', label: 'Reflected Ceiling & Lighting Plan', icon: 'Zap' },
    { id: 'shopping_list', label: 'FF&E Shopping List', icon: 'ShoppingBag' }
];

export const INTERIOR_FEE_TYPES = [
    { id: 'fixed', label: 'Fixed Project Fee', description: 'Total design fee for the entire agreed scope.' },
    { id: 'percentage', label: 'Percentage of Fit-out', description: 'Calculated as a percentage (typically 10-20%) of interior budget.' },
    { id: 'sqm', label: 'Rate per Square Meter', description: 'Design fee based on the total floor area.' },
    { id: 'consultation', label: 'Design Consultation Only', description: 'Flat fee for concept and advice without technical drawings.' }
];

export function formatInteriorProposal(data: {
    style: string,
    scopes: string[],
    deliverables: string[],
    feeType?: string,
    userProposal: string
}) {
    const scopeLabels = INTERIOR_SERVICE_SCOPES
        .filter(s => data.scopes.includes(s.id))
        .map(s => `- ${s.label}: ${s.description}`)
        .join('\n');

    const deliverableLabels = INTERIOR_DELIVERABLES
        .filter(d => data.deliverables.includes(d.id))
        .map(d => `✓ ${d.label}`)
        .join(', ');

    const feeLabel = INTERIOR_FEE_TYPES.find(f => f.id === data.feeType)?.label || 'Contractual';

    return `
=== INTERIOR DESIGN PROPOSAL ===
• STYLE DIRECTION: ${data.style || 'Custom'}
• FEE STRUCTURE: ${feeLabel}
• KEY DELIVERABLES: ${deliverableLabels}

--- SCOPE OF SERVICES ---
${scopeLabels}

--- PROFESSIONAL MESSAGE ---
${data.userProposal}

---
Professional commitment to aesthetic excellence and functional design.
    `.trim();
}
