/**
 * Notary Bidding Presets — High-Level Service Categories
 * 
 * These are used ONLY in the bidding form as a pitch description.
 * The actual document-level scope selection happens in LegalBriefManager
 * after bid acceptance (the "Negotiated Scope" approach).
 */

export const NOTARY_SERVICE_SCOPES = [
    { id: 'ajb_verification', label: 'Land Deed Verification (AJB)', description: 'Official verification of land ownership documents and transfer deeds.' },
    { id: 'pbg_application', label: 'PBG Permit Application', description: 'Handling the full Building & Planning Permit submission process.' },
    { id: 'slf_processing', label: 'SLF Certification', description: 'Assisting in obtaining the Certificate of Occupancy after build completion.' },
    { id: 'certificate_checking', label: 'Certificate Authenticity Check', description: 'Verifying certificate validity at the National Land Agency (BPN).' },
    { id: 'ppjb_drafting', label: 'PPJB Drafting & Notarization', description: 'Drafting the binding Sale & Purchase Agreement.' },
    { id: 'apht_registration', label: 'Mortgage Deed (APHT)', description: 'Registering mortgage deeds for project financing.' },
    { id: 'tax_compliance', label: 'Tax & BPHTB Processing', description: 'Handling BPHTB, PPh, and other government tax filings.' },
    { id: 'general_legal', label: 'General Legal Advisory', description: 'Comprehensive legal counsel on construction-related matters.' },
];

export const NOTARY_FEE_TYPES = [
    { id: 'fixed', label: 'Fixed Professional Fee', description: 'A single flat rate for all listed professional services.' },
    { id: 'percentage', label: 'Percentage of Transaction', description: 'Calculated as a percentage of the total property/transaction value (e.g. 1% cap).' },
];
