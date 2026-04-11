export type PhaseKey = 'legal' | 'design' | 'build' | 'materials' | 'interior' | 'handover';

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

export const PHASE_ORDER: PhaseKey[] = ['legal', 'design', 'build', 'materials', 'interior', 'handover'];

export function getProjectPhases(neededPhases?: string[] | null): Phase[] {
    const needed = neededPhases || PHASE_ORDER;
    return PHASE_ORDER.filter(key => needed.includes(key)).map(key => ({
        ...PHASE_CONFIG[key],
        status: 'pending' as PhaseStatus,
    }));
}
