export interface AdminStats {
    total_users: number;
    total_houses: number;
    total_projects: number;
    pending_verifications: number;
    active_projects: number;
    role_distribution: Record<string, number>;
}

export interface AdminUserRow {
    id: number;
    name: string;
    email: string;
    username: string;
    role_type: string;
    is_suspended: boolean;
    created_at?: string | null;
}

export interface AdminHouseRow {
    id: number;
    name?: string | null;
    price?: string | number | null;
    kab_kota?: string | null;
    street_name?: string | null;
    is_suspended: boolean;
    user?: { name?: string | null } | null;
    created_at?: string | null;
}

export interface AdminProjectRow {
    id: number;
    title?: string | null;
    status?: string | null;
    budget?: string | number | null;
    user?: { name?: string | null } | null;
    arsitek?: { nama?: string | null } | null;
    kontraktor?: { nama_perusahaan?: string | null } | null;
    bid_count?: number | null;
    pending_bid_count?: number | null;
    open_dispute?: { id: number; title?: string | null } | null;
    paid_total?: string | number | null;
    refunded_total?: string | number | null;
    created_at?: string | null;
}

export interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    from?: number | null;
    to?: number | null;
    per_page?: number;
}

export interface DisputeMessageRow {
    id: number;
    body: string;
    evidence_path?: string | null;
    evidence_original_name?: string | null;
    created_at?: string | null;
    user?: { id: number; name: string } | null;
}

export interface DisputeRow {
    id: number;
    project_id: number;
    category: string;
    title: string;
    description: string;
    status: string;
    disputed_amount?: string | number | null;
    payment_type?: string | null;
    payment_id?: number | null;
    resolution?: string | null;
    resolution_notes?: string | null;
    resolved_at?: string | null;
    created_at?: string | null;
    // opened_by is the numeric user id (legacy column); the joined
    // opener carries the display name.
    opened_by?: number | null;
    opener?: { id: number; name?: string | null; pic?: string | null } | null;
    resolver?: { id: number; name: string } | null;
    project?: { id: number; title: string; status: string; budget?: string | number } | null;
    messages?: DisputeMessageRow[];
}

export interface DisputesPayload {
    data: Paginated<DisputeRow>;
    open_count: number;
}

export interface ProfessionalRow {
    id: number;
    user_id: number;
    nama?: string | null;
    nama_perusahaan?: string | null;
    store_name?: string | null;
    no_telp?: string | null;
    no_telepon?: string | null;
    verification_status?: string | null;
    foto?: string | null;
    file_portofolio?: string | null;
    file_sertifikat?: string | null;
    npwp?: string | null;
    siup?: string | null;
    entity_type?: string | null;
    company_name?: string | null;
    company_license?: string | null;
    identity_number?: string | null;
    npwp_number?: string | null;
    siup_number?: string | null;
    vehicle_type?: string | null;
    license_plate?: string | null;
    is_active?: boolean;
    user?: { name?: string | null; email?: string | null } | null;
}

export type ProfessionalsPayload = Record<string, ProfessionalRow[]>;

export interface HistoryRow {
    id: number;
    type: string;
    role_label: string;
    name: string;
    email: string;
    status: string;
    rejection_reason?: string | null;
    audited_at: string;
}
