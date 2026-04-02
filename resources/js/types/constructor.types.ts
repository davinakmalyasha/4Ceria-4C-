export interface ConstructorData {
    id: number;
    user_id: number;
    nama: string;
    nama_perusahaan?: string;
    no_telepon?: string;
    alamat?: string;
    jenis: string | null;
    npwp?: string;
    siup?: string;
    pengalaman: number;
    spesialisasi?: string | null;
    user?: {
        pic?: string | null;
    };
    average_rating?: number | string;
}

export type ConstructorSortOption = 'recommended' | 'experience_desc' | 'experience_asc';

export interface ConstructorFilterState {
    query: string;
    jenis: string;
    sort: ConstructorSortOption;
}

export type ConstructorViewMode = 'grid' | 'list';

export const CONSTRUCTOR_TYPES = [
    'All Types',
    'Umum',
    'Struktur',
    'Finishing',
    'Renovasi',
    'MEP (Mechanical, Electrical, Plumbing)'
];
