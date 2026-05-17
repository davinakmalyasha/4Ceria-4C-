export type EntityType = 'individual' | 'company';

export type ParentRole = 'arsitek' | 'kontraktor';

export type SubProfessionalStatus = 'invited' | 'interviewing' | 'accepted' | 'recommended' | 'active' | 'completed' | 'removed';

export type SubspecialtyCategory = 'construction' | 'mechanical' | 'finishing';

export interface ContractorSubspecialty {
    id: number;
    slug: string;
    label: string;
    label_id: string;
    category: SubspecialtyCategory;
    icon: string | null;
}

export interface ProjectSubProfessional {
    id: number;
    project_id: number;
    user_id: number;
    parent_role: ParentRole;
    sub_role: string;
    assigned_by: number;
    status: SubProfessionalStatus;
    rate: number;
    scope_notes: string | null;
    lead_pro_notes: string | null;
    suggested_fee: number | null;
    accepted_at: string | null;
    recommended_at: string | null;
    hired_at: string | null;
    completed_at: string | null;
    created_at: string;
    user?: {
        id: number;
        name: string;
        pic?: string;
        role_type?: string;
    };
    assigned_by_user?: {
        id: number;
        name: string;
    };
}

export interface AssignSubPayload {
    user_id: number;
    parent_role: ParentRole;
    sub_role: string;
    rate?: number;
    scope_notes?: string;
}

export interface TeamMember {
    id: number;
    owner_user_id: number;
    owner_role: 'arsitek' | 'kontraktor';
    name: string;
    photo_path: string | null;
    photo_url: string | null;
    role_title: string;
    bio: string | null;
    skills: string[];
    phone: string | null;
    email: string | null;
    status: 'active' | 'inactive';
    created_at: string;
}

export interface ProposedTeamMember {
    team_member_id: number | null;
    name: string;
    role_title: string;
    role: 'structural' | 'mep' | 'surveyor' | 'foreman' | 'electrician' | 'plumber' | 'other';
    fee: number;
    fee_type: 'fixed' | 'percentage';
    note: string;
}

export interface FirmMemberUser {
    id: number;
    name: string;
    unique_code: string;
    role_type: string;
    pic: string | null;
}

export interface FirmMember {
    id: number;
    firm_owner_id: number;
    member_user_id: number;
    role_in_firm: string;
    status: 'invited' | 'active' | 'removed';
    invited_at: string | null;
    accepted_at: string | null;
    member: FirmMemberUser;
}

export interface FirmInvitation extends Pick<FirmMember, 'id' | 'role_in_firm' | 'status'> {
    firm_owner: {
        id: number;
        name: string;
        company_name: string | null;
        role_type: string;
    };
}

