/**
 * Master Legal Document Dictionary — Indonesian Residential Construction
 * 
 * This is the single source of truth for all legal document types.
 * Used by both the LegalBriefManager (scope selection) and LegalVault (document tracking).
 * 
 * Categories based on Indonesian notarial practice for house construction.
 */

export interface LegalDocumentPreset {
    id: string;
    label: string;
    desc: string;
    category: LegalCategory;
    milestone_code: string;
    responsibleRole: 'Notary' | 'Architect' | 'Architect & Notary' | 'Owner' | 'Any';
}

export type LegalCategory = 
    | 'land_ownership'
    | 'personal_id'
    | 'construction_agreements'
    | 'permits'
    | 'financial_tax'
    | 'post_construction';

export interface LegalCategoryMeta {
    id: LegalCategory;
    label: string;
    desc: string;
}

export const LEGAL_CATEGORIES: LegalCategoryMeta[] = [
    { id: 'land_ownership', label: 'Land Ownership & Verification', desc: 'Documents proving legal ownership of the land where the house will be built.' },
    { id: 'personal_id', label: 'Personal Identification & Authority', desc: 'Identity verification and legal capacity to build.' },
    { id: 'construction_agreements', label: 'Construction & Development Agreements', desc: 'Contracts governing the building process.' },
    { id: 'permits', label: 'Permits & Regulatory Compliance', desc: 'Government approvals ensuring the building is legal.' },
    { id: 'financial_tax', label: 'Financial & Tax Documents', desc: 'Tax and financing documentation related to the build.' },
    { id: 'post_construction', label: 'Post-Construction / Finalization', desc: 'Handover and completion documents.' },
];

export const LEGAL_REQUIREMENTS: LegalDocumentPreset[] = [
    // ── Land Ownership & Verification ──────────────────────────────
    {
        id: 'shm_shgb',
        label: 'Sertifikat Tanah (SHM/SHGB)',
        desc: 'The original Certificate of Ownership (SHM) or Building Usage Title (HGB). The foundational proof of land rights.',
        category: 'land_ownership',
        milestone_code: 'L01',
        responsibleRole: 'Notary',
    },
    {
        id: 'ajb_deed',
        label: 'Akta Jual Beli (AJB)',
        desc: 'The official deed proving how you acquired the land. Executed before a notary.',
        category: 'land_ownership',
        milestone_code: 'L02',
        responsibleRole: 'Notary',
    },
    {
        id: 'buku_tanah',
        label: 'Buku Tanah (Land Book Copy)',
        desc: 'A check against BPN records to ensure no liens, disputes, or mortgages exist on the property.',
        category: 'land_ownership',
        milestone_code: 'L03',
        responsibleRole: 'Notary',
    },
    {
        id: 'no_dispute_letter',
        label: 'Surat Pernyataan Tidak Sengketa',
        desc: 'A notarized statement from the owner declaring the land is free of legal conflict.',
        category: 'land_ownership',
        milestone_code: 'L04',
        responsibleRole: 'Notary',
    },
    {
        id: 'pbb_receipt',
        label: 'Bukti Lunas PBB',
        desc: 'Proof of payment for Land & Building Tax (PBB) for the current year and the last 5-10 years.',
        category: 'land_ownership',
        milestone_code: 'L05',
        responsibleRole: 'Owner',
    },
    {
        id: 'surat_ukur',
        label: 'Surat Ukur (Measurement Letter)',
        desc: 'Document detailing the physical dimensions and boundaries of the land from BPN.',
        category: 'land_ownership',
        milestone_code: 'L06',
        responsibleRole: 'Notary',
    },

    // ── Personal Identification & Authority ────────────────────────
    {
        id: 'ktp_owner',
        label: 'KTP (Owner Identity Card)',
        desc: 'Valid Resident Identity Cards for all land owners and their spouses.',
        category: 'personal_id',
        milestone_code: 'L07',
        responsibleRole: 'Owner',
    },
    {
        id: 'kartu_keluarga',
        label: 'Kartu Keluarga (KK)',
        desc: 'Family Card to verify family relationships and heirs.',
        category: 'personal_id',
        milestone_code: 'L08',
        responsibleRole: 'Owner',
    },
    {
        id: 'marriage_cert',
        label: 'Surat Nikah (Marriage Certificate)',
        desc: 'Required if the land is jointly owned property (harta gono-gini); spousal consent is mandatory.',
        category: 'personal_id',
        milestone_code: 'L09',
        responsibleRole: 'Owner',
    },
    {
        id: 'npwp',
        label: 'NPWP (Tax ID Number)',
        desc: 'Tax ID for both the owner and the contractor/developer.',
        category: 'personal_id',
        milestone_code: 'L10',
        responsibleRole: 'Owner',
    },
    {
        id: 'surat_kuasa',
        label: 'Surat Kuasa (Power of Attorney)',
        desc: 'If you cannot attend signing personally, a notarized letter authorizing a representative.',
        category: 'personal_id',
        milestone_code: 'L11',
        responsibleRole: 'Notary',
    },
    {
        id: 'prenuptial',
        label: 'Perjanjian Kawin (Prenuptial Agreement)',
        desc: 'If applicable — to clarify asset separation if one spouse is buying/building individually.',
        category: 'personal_id',
        milestone_code: 'L12',
        responsibleRole: 'Notary',
    },

    // ── Construction & Development Agreements ──────────────────────
    {
        id: 'construction_contract',
        label: 'Akta Perjanjian Pemborongan',
        desc: 'Construction Work Contract defining scope, timeline, material specs, payment terms, and penalties between owner and contractor.',
        category: 'construction_agreements',
        milestone_code: 'L13',
        responsibleRole: 'Notary',
    },
    {
        id: 'joint_build_agreement',
        label: 'Perjanjian Bangun Bagi Hasil',
        desc: 'If applicable — used if partnering with a developer to build on your land in exchange for a unit/profit share.',
        category: 'construction_agreements',
        milestone_code: 'L14',
        responsibleRole: 'Notary',
    },
    {
        id: 'ppjb',
        label: 'PPJB (Preliminary Sale & Purchase Agreement)',
        desc: 'If applicable — if buying a new build from a developer before the physical house is finished.',
        category: 'construction_agreements',
        milestone_code: 'L15',
        responsibleRole: 'Notary',
    },

    // ── Permits & Regulatory Compliance ────────────────────────────
    {
        id: 'pbg_permit',
        label: 'PBG (Persetujuan Bangunan Gedung)',
        desc: 'Building Approval replacing the old IMB. The Architect provides blueprints, the Notary submits to SIMBG portal.',
        category: 'permits',
        milestone_code: 'L16',
        responsibleRole: 'Architect & Notary',
    },
    {
        id: 'slf_certification',
        label: 'SLF (Sertifikat Laik Fungsi)',
        desc: 'Certificate of Functional Worthiness — required upon completion to certify the building is safe for habitation.',
        category: 'permits',
        milestone_code: 'L17',
        responsibleRole: 'Architect & Notary',
    },
    {
        id: 'environmental_permit',
        label: 'SPPL/AMDAL (Environmental Permit)',
        desc: 'If applicable — required for larger developments or specific zones to prove environmental compliance.',
        category: 'permits',
        milestone_code: 'L18',
        responsibleRole: 'Notary',
    },
    {
        id: 'krk_kkpr',
        label: 'KRK/KKPR (Zoning Advice)',
        desc: 'Confirmation from local government that the land usage matches the spatial plan (RTRW).',
        category: 'permits',
        milestone_code: 'L19',
        responsibleRole: 'Notary',
    },

    // ── Financial & Tax Documents ──────────────────────────────────
    {
        id: 'bphtb_receipt',
        label: 'Bukti Bayar BPHTB',
        desc: 'Proof of payment for Land & Building Rights Acquisition Tax (5% of value).',
        category: 'financial_tax',
        milestone_code: 'L20',
        responsibleRole: 'Owner',
    },
    {
        id: 'pph_receipt',
        label: 'Bukti Bayar PPh (Income Tax)',
        desc: 'Proof of Final Income Tax payment (2.5% of transaction value) by the seller if land was just bought.',
        category: 'financial_tax',
        milestone_code: 'L21',
        responsibleRole: 'Owner',
    },
    {
        id: 'apht_mortgage',
        label: 'APHT (Akta Pemberian Hak Tanggungan)',
        desc: 'If using a bank loan/KPR — the notary creates this to secure the bank\'s interest in the property.',
        category: 'financial_tax',
        milestone_code: 'L22',
        responsibleRole: 'Notary',
    },
    {
        id: 'credit_agreement',
        label: 'Perjanjian Kredit (Credit Agreement)',
        desc: 'If applicable — the loan contract between the bank and the borrower.',
        category: 'financial_tax',
        milestone_code: 'L23',
        responsibleRole: 'Notary',
    },

    // ── Post-Construction / Finalization ───────────────────────────
    {
        id: 'bast_handover',
        label: 'BAST (Berita Acara Serah Terima)',
        desc: 'Official handover minutes signed by owner and contractor confirming the house is finished and accepted.',
        category: 'post_construction',
        milestone_code: 'L24',
        responsibleRole: 'Any',
    },
    {
        id: 'lien_waiver',
        label: 'Lien Waivers',
        desc: 'Statements from contractors confirming they have been paid in full and will not file claims against the property.',
        category: 'post_construction',
        milestone_code: 'L25',
        responsibleRole: 'Any',
    },
    {
        id: 'as_built_drawings',
        label: 'As-Built Drawings (Record Drawings)',
        desc: 'Final blueprints perfectly reflecting actual physical construction at site. Essential for SLF processing.',
        category: 'post_construction',
        milestone_code: 'L26',
        responsibleRole: 'Architect',
    },
    {
        id: 'obra_nueva',
        label: 'Akta Pernyataan Obra Nueva',
        desc: 'A deed to update the land certificate to reflect that a building now exists on the plot.',
        category: 'post_construction',
        milestone_code: 'L27',
        responsibleRole: 'Notary',
    },
    {
        id: 'misc_legal',
        label: 'Field Reports (Misc Progress)',
        desc: 'Other legal certificates, administrative field notes, zoning letters, and auxiliary documentation.',
        category: 'post_construction',
        milestone_code: 'L99',
        responsibleRole: 'Any',
    },
];

export const getLegalRequirementById = (id: string): LegalDocumentPreset | undefined =>
    LEGAL_REQUIREMENTS.find(r => r.id === id);

export const getLegalRequirementsByCategory = (category: LegalCategory): LegalDocumentPreset[] =>
    LEGAL_REQUIREMENTS.filter(r => r.category === category);
