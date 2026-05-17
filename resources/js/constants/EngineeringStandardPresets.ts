export const STRUCTURAL_SERVICE_SCOPES = [
    { id: 'soil_test', label: 'Soil Test (Sondir/Boring)', description: 'Technical analysis of soil bearing capacity' },
    { id: 'structural_calc', label: 'Structural Calculation', description: 'Detailed mathematical analysis of loads and forces' },
    { id: 'foundation_design', label: 'Foundation Design', description: 'Technical drawings for footings, piles, or slabs' },
    { id: 'reinforcement_detail', label: 'Reinforcement Details', description: 'Steel bar schedules and concrete specifications' },
    { id: 'seismic_analysis', label: 'Seismic/Earthquake Analysis', description: 'Ensuring structural integrity against seismic activity' }
];

export const STRUCTURAL_DELIVERABLES = [
    { id: 'soil_report', label: 'Soil Investigation Report', description: 'Official document certifying soil stability' },
    { id: 'calc_book', label: 'Structural Analysis Book', description: 'Formal calculation records for permits (IMB/PBG)' },
    { id: 'for_construction_dwg', label: 'For Construction Drawings (Structural)', description: 'Final technical blueprints for the contractor' },
    { id: 'bar_bending_schedule', label: 'Bar Bending Schedule', description: 'Specific lists for steel reinforcement fabrication' }
];

export const MEP_SERVICE_SCOPES = [
    { id: 'electrical_layout', label: 'Electrical System Design', description: 'Power outlets, lighting points, and circuit distribution' },
    { id: 'plumbing_sanitary', label: 'Plumbing & Sanitary Design', description: 'Clean water, grey water, and sewage systems' },
    { id: 'hvac_design', label: 'HVAC / AC Layout', description: 'Air conditioning and ventilation systems' },
    { id: 'fire_protection', label: 'Fire Protection System', description: 'Smoke detectors, hydrants, or sprinkler layouts' },
    { id: 'lightning_protection', label: 'Lightning Protection', description: 'Earthing and lightning rod system design' }
];

export const MEP_DELIVERABLES = [
    { id: 'load_calc', label: 'Electrical Load Calculation', description: 'Determining total KVA requirements for the building' },
    { id: 'mep_blueprints', label: 'MEP Technical Blueprints', description: 'Full set of electrical and plumbing drawings' },
    { id: 'schematic_diagrams', label: 'Schematic Diagrams', description: 'Single line diagrams and riser diagrams' },
    { id: 'equipment_spec', label: 'Equipment Specifications', description: 'Technical data for pumps, panels, and AC units' }
];
