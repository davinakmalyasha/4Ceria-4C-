export interface Architect {
    id: number;
    user_id: number;
    nama: string;
    no_telp?: string;
    rate_harga: number;
    spesialisasi: string | null;
    deskripsi?: string;
    lokasi?: string;
    pengalaman_tahun: number;
    user?: {
        pic?: string | null;
    };
}

export type ArchitectSortOption = 'recommended' | 'price_asc' | 'price_desc' | 'experience_desc';

export interface ArchitectFilterState {
    query: string;
    specialization: string;
    sort: ArchitectSortOption;
}

export type ArchitectViewMode = 'grid' | 'list';

export const ARCHITECT_SPECS = [
    'All Specializations',
    'Arsitek Umum',
    'Desain Interior',
    'Desain Eksterior',
    'Landscape',
    'Minimalist',
    'Industrial',
    'Classic',
    'Modern'
];
