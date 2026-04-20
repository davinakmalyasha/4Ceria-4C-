export type PhaseKey = 'management' | 'legal' | 'design' | 'build' | 'materials' | 'interior' | 'handover';

export type PhaseStatus = 'completed' | 'active' | 'pending' | 'skipped';

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
        description: 'Sertifikat tanah & perizinan bangunan',
        icon: 'Shield',
        roleNeeded: 'notaris',
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

export const PHASE_ORDER: PhaseKey[] = ['management', 'legal', 'design', 'build', 'materials', 'interior', 'handover'];

export const PHASE_ROLE_MAP: Record<PhaseKey, { bidKey: string; selectedKey: string; profileKey: string }> = {
    management: { bidKey: 'bids_project_manager', selectedKey: 'pm_id',                 profileKey: 'project_manager' },
    legal:     { bidKey: 'bids_notaris',     selectedKey: 'selected_notaris_id',    profileKey: 'notaris' },
    design:    { bidKey: 'bids_arsitek',     selectedKey: 'selected_arsitek_id',    profileKey: 'arsitek' },
    build:     { bidKey: 'bids_kontraktor',  selectedKey: 'selected_kontraktor_id', profileKey: 'kontraktor' },
    materials: { bidKey: 'material_orders',  selectedKey: '',                       profileKey: '' },
    interior:  { bidKey: 'bids_interior',    selectedKey: 'selected_interior_id',   profileKey: 'interior' },
    handover:  { bidKey: '',                 selectedKey: '',                       profileKey: '' },
};

export function getProjectPhases(project: any | null, neededPhases?: string[] | null): Phase[] {
    const wantsPM = project?.wants_project_manager;
    let needed = (neededPhases && neededPhases.length > 0) ? [...neededPhases] : [...PHASE_ORDER];
    
    // Management is the foundational phase and should always be visible at the start
    if (!needed.includes('management')) {
        needed = ['management', ...needed];
    }

    const completedPhases: string[] = project?.completed_phases || [];

    // Parallel phases: these all unlock once 'design' is completed
    const PARALLEL_PHASES: PhaseKey[] = ['build', 'materials', 'interior'];
    const designCompleted = completedPhases.includes('design');
    const pmHired = !!project?.pm_id;

    // Filter and map to final Phase objects
    return PHASE_ORDER
        .filter(key => needed.includes(key))
        .map(key => {
            let status: PhaseStatus = 'pending';
            
            if (project) {
                const config = PHASE_ROLE_MAP[key];
                
                // 1. Strict Completion: Only if explicitly marked in project data
                if (completedPhases.includes(key)) {
                    status = 'completed';
                } 
                // 2. Active Logic: Determine if the phase is the current focus
                else if (!wantsPM || pmHired) {
                    // Handover unlocks when everything else is done
                    if (key === 'handover') {
                        const allParallelDone = PARALLEL_PHASES.every(pk => 
                            !needed.includes(pk) || completedPhases.includes(pk)
                        );
                        if (allParallelDone && designCompleted) {
                            status = 'active';
                        }
                    }
                    // Parallel phases (Build, Materials, Interior) unlock after Design is SEALED
                    else if (PARALLEL_PHASES.includes(key)) {
                        if (designCompleted) {
                            status = 'active';
                        }
                    }
                    // Sequential: Legal/Design/Management
                    else {
                        const index = needed.indexOf(key);
                        const prevKey = needed[index - 1];
                        
                        // Management is active if nothing is completed yet and PM is needed
                        if (key === 'management') {
                            if (!pmHired && wantsPM) {
                                status = 'active';
                            }
                        }
                        // Legal/Design active if professional is hired OR if previous node is done
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
