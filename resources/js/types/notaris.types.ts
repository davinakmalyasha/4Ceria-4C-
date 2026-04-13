import { User } from './explore';

export interface NotarisService {
    id: number;
    notaris_id: number;
    title: string;
    price: number;
    description: string | null;
}

export interface NotarisConsultation {
    id: number;
    notaris_id: number;
    user_id: number;
    schedule_date: string;
    status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
    notes: string | null;
    user?: User;
    notaris?: NotarisProfile;
}

export interface NotarisProfile {
    id: number;
    user_id: number;
    user?: User;
    no_sk: string;
    wilayah_kerja: string;
    specialization: string;
    certificate_path?: string;
    verification_status: 'pending' | 'verified' | 'rejected';
    is_verified: boolean;
    services?: NotarisService[];
}
