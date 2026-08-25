export const CONSTRUCTION_METHODS = [
    { id: 'conventional', label: 'Konvensional (Cast-in-Place)', description: 'Metode tradisional, dikerjakan langsung di lokasi. Fleksibel untuk desain kustom.' },
    { id: 'precast', label: 'Pracetak (Precast)', description: 'Komponen dibuat di pabrik, dipasang di lokasi. Cepat and konsisten.' },
    { id: 'steel_frame', label: 'Rangka Baja (Steel Frame)', description: 'Struktur utama menggunakan baja. Cocok untuk bentang lebar.' },
    { id: 'hybrid', label: 'Hybrid', description: 'Kombinasi konvensional dan pracetak untuk efisiensi.' },
    { id: 'wooden', label: 'Kayu (Wooden Structure)', description: 'Struktur kayu tradisional atau modern. Ramah lingkungan.' },
];

export const SAFETY_PROTOCOLS = [
    { id: 'hardhat', label: 'Helm Proyek (Hardhat)' },
    { id: 'safety_vest', label: 'Rompi Safety' },
    { id: 'safety_net', label: 'Jaring Pengaman' },
    { id: 'fire_extinguisher', label: 'Alat Pemadam Api' },
    { id: 'first_aid', label: 'P3K / First Aid' },
    { id: 'scaffolding_check', label: 'Inspeksi Perancah' },
    { id: 'electrical_safety', label: 'Keamanan Listrik' },
    { id: 'ppe_gloves', label: 'Sarung Tangan Kerja' },
    { id: 'safety_boots', label: 'Sepatu Safety' },
    { id: 'dust_mask', label: 'Masker Debu' },
];

export const CONSTRUCTION_MILESTONE_TYPES = [
    { id: 'site_prep', label: 'Persiapan Lahan', shortLabel: 'PREP', color: 'stone',
      checklist: ['Land clearing / Pembersihan lahan', 'Soil testing / Uji tanah', 'Boundary marking / Pasang bouwplank', 'Access road setup'] },
    { id: 'foundation', label: 'Pondasi', shortLabel: 'PONDASII', color: 'amber',
      checklist: ['Excavation / Galian', 'Pile driving / Pemancangan', 'Foundation pouring / Cor pondasi', 'Curing period'] },
    { id: 'structure', label: 'Struktur', shortLabel: 'STRUKTUR', color: 'red',
      checklist: ['Column erection / Kolom', 'Beam placement / Balok', 'Slab casting / Pelat lantai', 'Staircase'] },
    { id: 'walls_roof', label: 'Dinding & Atap', shortLabel: 'D&A', color: 'orange',
      checklist: ['Brick/block work / Pasang bata', 'Roof truss / Kuda-kuda', 'Roof covering / Genteng/metal', 'Waterproofing'] },
    { id: 'mep_install', label: 'Instalasi MEP', shortLabel: 'MEP', color: 'blue',
      checklist: ['Electrical rough-in / Pipa listrik', 'Plumbing rough-in / Pipa air', 'HVAC / AC ducting', 'Fire protection system'] },
    { id: 'finishing', label: 'Finishing', shortLabel: 'FINISH', color: 'emerald',
      checklist: ['Plastering / Plesteran', 'Painting / Cat', 'Floor tiling / Lantai', 'Fixture installation / Sanitasi'] },
];

export const WEATHER_OPTIONS = [
    { id: 'sunny', label: 'Cerah', emoji: '☀️' },
    { id: 'cloudy', label: 'Berawan', emoji: '⛅' },
    { id: 'rainy', label: 'Hujan', emoji: '🌧️' },
    { id: 'stormy', label: 'Badai', emoji: '⛈️' },
];

export const DEFAULT_TERMIN_TEMPLATE = [
    { label: 'Termin 1 — Down Payment (DP)', percentage: 30, trigger: 'Contract signed' },
    { label: 'Termin 2 — Pondasi Selesai', percentage: 20, trigger: 'Foundation completed & inspected' },
    { label: 'Termin 3 — Struktur & Dinding', percentage: 25, trigger: 'Structure + Walls completed' },
    { label: 'Termin 4 — MEP & Finishing', percentage: 15, trigger: 'MEP installation + Finishing done' },
    { label: 'Termin 5 — Serah Terima (Retensi)', percentage: 10, trigger: 'Final handover + retention period' },
];

// === BID FORM PRESETS ===

export const PAYMENT_SCHEDULE_OPTIONS = [
    { id: 'standard_5', label: 'Standard 5-Stage (30/20/25/15/10)', description: 'DP → Foundation → Structure → MEP → Handover' },
    { id: 'equal_4', label: 'Equal 4-Stage (25/25/25/25)', description: 'Quarterly milestone-based' },
    { id: 'front_heavy', label: 'Front-Loaded (40/30/20/10)', description: 'Higher DP for material procurement' },
    { id: 'custom', label: 'Custom Schedule', description: 'We will negotiate terms with the client' },
];

