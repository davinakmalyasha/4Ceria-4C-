export type PhaseKey = 'management' | 'legal' | 'technical' | 'design' | 'build' | 'materials' | 'interior' | 'handover';

type PhaseStatus = 'completed' | 'active' | 'pending' | 'skipped';

export interface Phase {
    key: PhaseKey;
    label: string;
    description: string;
    icon: string;
    roleNeeded: string;
    status: PhaseStatus;
}

export const PHASE_CONFIG: Record<PhaseKey, Omit<Phase, 'status'>> = {
    management: {
        key: 'management',
        label: 'Manajemen',
        description: 'Pencarian & penunjukan Project Manager',
        icon: 'Users',
        roleNeeded: 'project_manager',
    },
    legal: {
        key: 'legal',
        label: 'Legalitas',
        description: 'Sertifikat tanah, IMB/PBG, & notaris',
        icon: 'Shield',
        roleNeeded: 'notaris',
    },
    technical: {
        key: 'technical',
        label: 'Teknis',
        description: 'Struktur, MEP (Listrik & Air), & Sondir Tanah',
        icon: 'Ruler',
        roleNeeded: 'structural',
    },
    design: {
        key: 'design',
        label: 'Desain',
        description: 'RAB, denah, dan render 3D',
        icon: 'Pencil',
        roleNeeded: 'arsitek',
    },
    build: {
        key: 'build',
        label: 'Konstruksi',
        description: 'Fondasi, struktur, dinding, atap',
        icon: 'Hammer',
        roleNeeded: 'kontraktor',
    },
    materials: {
        key: 'materials',
        label: 'Material',
        description: 'Pembelian bahan bangunan',
        icon: 'Package',
        roleNeeded: 'supplier',
    },
    interior: {
        key: 'interior',
        label: 'Interior',
        description: 'Kitchen set, lemari, finishing',
        icon: 'Sofa',
        roleNeeded: 'interior',
    },
    handover: {
        key: 'handover',
        label: 'Serah Terima',
        description: 'Inspeksi akhir & pindah',
        icon: 'Key',
        roleNeeded: 'user',
    },
};

export const PHASE_ORDER: PhaseKey[] = ['management', 'legal', 'technical', 'design', 'materials', 'build', 'interior', 'handover'];

export const PHASE_ROLE_MAP: Record<PhaseKey, { bidKey: string; selectedKey: string; profileKey: string }> = {
    management: { bidKey: 'bids_project_manager', selectedKey: 'pm_id',                 profileKey: 'project_manager' },
    legal:     { bidKey: 'bids_notaris',     selectedKey: 'selected_notaris_id',    profileKey: 'notaris' },
    technical: { bidKey: 'bids_structural',   selectedKey: 'structural_id',          profileKey: 'structural' },
    design:    { bidKey: 'bids_arsitek',     selectedKey: 'selected_arsitek_id',    profileKey: 'arsitek' },
    build:     { bidKey: 'bids_kontraktor',  selectedKey: 'selected_kontraktor_id', profileKey: 'kontraktor' },
    materials: { bidKey: 'material_orders',  selectedKey: '',                       profileKey: '' },
    interior:  { bidKey: 'bids_interior',    selectedKey: 'selected_interior_id',   profileKey: 'interior' },
    handover:  { bidKey: '',                 selectedKey: '',                       profileKey: '' },
};

type ProjectCategory = 'new_build' | 'renovation' | 'interior' | 'maintenance';

const CATEGORY_LABELS: Record<ProjectCategory, Partial<Record<PhaseKey, { label: string; description: string }>>> = {
    new_build: {},
    renovation: {
        build: { label: 'Renovasi', description: 'Pembongkaran, perbaikan, & pembangunan ulang' },
        materials: { label: 'Material', description: 'Bahan renovasi & material pengganti' },
        handover: { label: 'Inspeksi Renovasi', description: 'Verifikasi hasil renovasi' },
    },
    interior: {
        design: { label: 'Konsep Interior', description: 'Mood board, palet warna, & layout ruangan' },
        build: { label: 'Fabrikasi & Pasang', description: 'Produksi furniture & instalasi di lokasi' },
        materials: { label: 'Material Interior', description: 'Kain, kayu, laminate, & fixture' },
        handover: { label: 'Styling Check', description: 'Pengecekan akhir hasil desain interior' },
    },
    maintenance: {
        build: { label: 'Perbaikan', description: 'Diagnosa kerusakan & pekerjaan perbaikan' },
        materials: { label: 'Material Perbaikan', description: 'Suku cadang & material pengganti' },
        handover: { label: 'Verifikasi Hasil', description: 'Konfirmasi perbaikan selesai' },
    },
};

export function getCategoryPhaseLabel(key: PhaseKey, category: string): { label: string; description: string } {
    const cat = category as ProjectCategory;
    const override = CATEGORY_LABELS[cat]?.[key];
    if (override) return override;
    const base = PHASE_CONFIG[key];
    return { label: base.label, description: base.description };
}

const WARRANTY_DAYS: Record<ProjectCategory, number> = {
    new_build: 180,
    renovation: 90,
    interior: 60,
    maintenance: 30,
};

export function getWarrantyDays(category: string): number {
    return WARRANTY_DAYS[category as ProjectCategory] ?? 180;
}

export function getProjectPhases(project: any | null, neededPhases?: string[] | null): Phase[] {
    const wantsPM = project?.wants_project_manager;
    let needed = (neededPhases && neededPhases.length > 0) ? [...neededPhases] : [...PHASE_ORDER];
    
    // Management is the foundational phase and should always be visible at the start
    if (!needed.includes('management')) {
        needed = ['management', ...needed];
    }

    const completedPhases: string[] = project?.completed_phases || [];

    const PARALLEL_PHASES: PhaseKey[] = ['technical', 'design', 'build', 'materials', 'interior'];
    const legalCompleted = completedPhases.includes('legal');
    const legalGateSatisfied = legalCompleted;
    const pmHired = !!project?.pm_id;
    const designGateSatisfied = completedPhases.includes('design');


    // Filter and map to final Phase objects
    return PHASE_ORDER
        .filter(key => needed.includes(key))
        .map(key => {
            let status: PhaseStatus = 'pending';
            
            if (project) {
                const config = PHASE_ROLE_MAP[key];
                const hasHiredPro = 
                    (config?.selectedKey && !!project[config.selectedKey]) ||
                    (key === 'technical' && (!!project.structural_id || !!project.mep_id));
                
                // 1. Strict Completion: Only if explicitly marked in project data
                if (completedPhases.includes(key)) {
                    status = 'completed';
                } 
                // 1.5 Professional hired, PM phase authorization, or manual override implies phase is active/going
                else if (
                    hasHiredPro || 
                    (key === 'materials' && (completedPhases.includes('design') || !!project.selected_kontraktor_id || !!project.materials_authorized_at)) ||
                    (key === 'design' && !!project.design_authorized_at) ||
                    (key === 'technical' && !!project.design_authorized_at) ||
                    (key === 'build' && !!project.construction_authorized_at)
                ) {
                    status = 'active';
                }
                // 2. Active Logic: Determine if the phase is the current focus
                else if (!wantsPM || pmHired) {
                    // Handover unlocks when everything else is done
                    if (key === 'handover') {
                        const allParallelDone = PARALLEL_PHASES.every(pk => 
                            !needed.includes(pk) || completedPhases.includes(pk)
                        );
                        if (allParallelDone && designGateSatisfied) {
                            status = 'active';
                        }
                    }
                    // Parallel phases (Technical, Design, Build, Materials, Interior) unlock after Legal is done
                    // For projects without legal phase: unlock immediately
                    else if (PARALLEL_PHASES.includes(key)) {
                        if (legalGateSatisfied || !needed.includes('legal')) {
                            status = 'active';
                        }
                    }
                    // Sequential: Legal/Design/Management
                    else {
                        const index = needed.indexOf(key);
                        const prevKey = needed[index - 1];
                        
                        // Management is active if nothing is completed yet and PM is needed
                        if (key === 'management') {
                            if (wantsPM) {
                                status = 'active';
                            }
                        }
                        // Design active if PM is hired or if previous node is done
                        else if (!prevKey || prevKey === 'management' || completedPhases.includes(prevKey)) {
                            status = 'active';
                        }
                    }
                }
            }

            return {
                ...PHASE_CONFIG[key],
                status,
            };
        });
}

export interface WarrantyClaim {
    id: number;
    title: string;
    description: string;
    status: 'open' | 'fixing' | 'resolved' | 'closed';
    cost_impact: number;
    resolved_at?: string;
    created_at: string;
    reporter?: {
        id: number;
        name: string;
    };
}

export interface ChangeOrder {
    id: number | string;
    type?: 'change_order' | 'addendum';
    milestone_id?: number | null;
    title: string;
    description: string;
    cost_impact: number;
    time_impact_days?: number;
    status: 'proposed' | 'pm_reviewed' | 'owner_approved' | 'rejected' | 'implemented';
    pm_notes?: string;
    owner_notes?: string;
    requester?: { id: number; name: string; role_type: string };
    created_at: string;
}

export interface ProjectRequirement {
    id: number;
    name: string;
    quantity_required: number;
    unit: string;
    category: 'structural' | 'architecture' | 'mep' | 'interior' | 'general';
    quality_level: 'standard' | 'premium' | 'luxury';
    notes?: string;
    quantity_on_site: number;
    quantity_used: number;
    quantity_procured_externally: number;
    external_cost: number;
    image_path?: string;
    image_url?: string;
}
