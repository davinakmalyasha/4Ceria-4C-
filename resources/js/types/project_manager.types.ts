export interface ProjectManager {
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
        name?: string;
        email?: string;
    };
    average_rating?: number | string;
    projects?: any[];
}

export interface PMBid {
    id: number;
    project_id: number;
    pm_id: number;
    price: number;
    calculated_total: number;
    proposal: string;
    status: 'pending' | 'shortlisted' | 'negotiating' | 'accepted' | 'declined';
    fee_type: 'fixed' | 'percentage' | 'unit';
    estimated_duration: number;
    duration_unit: string;
    payment_status: 'unpaid' | 'paid';
    offered_by_id?: number;
    fee_agreed_at?: string;
    scopes?: string[] | null;
    deliverables?: string[] | null;
    created_at: string;
    updated_at: string;
    pm?: ProjectManager;
}

export type PMSortOption = 'recommended' | 'price_asc' | 'price_desc' | 'experience_desc';

export interface PMFilterState {
    query: string;
    specialization: string;
    sort: PMSortOption;
}

export type PMViewMode = 'grid' | 'list';

export const PM_SPECS = [
    'All Specializations',
    'General Construction',
    'Luxury Residential',
    'Commercial Office',
    'Renovation Specialist',
    'Green Building',
    'Infrastructure',
    'Interior Management'
];

