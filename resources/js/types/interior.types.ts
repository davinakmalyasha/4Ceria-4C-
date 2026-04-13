export interface InteriorDesigner {
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
    average_rating?: number | string;
}

export type InteriorSortOption = 'recommended' | 'price_asc' | 'price_desc' | 'experience_desc';

export interface InteriorFilterState {
    query: string;
    specialization: string;
    sort: InteriorSortOption;
}

export type InteriorViewMode = 'grid' | 'list';

export const INTERIOR_SPECS = [
    'All Specializations',
    'Kitchen Set',
    'Minimalist',
    'Modern',
    'Luxury',
    'Scandinavian',
    'Industrial',
    'Classic',
    'Japandi'
];
