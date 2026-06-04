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
    phone?: string | null;
    no_telp?: string | null;
}

export interface FirmMember {
    id: number;
    firm_owner_id: number;
    member_user_id: number;
    role_in_firm: string;
    status: 'invited' | 'active' | 'removed' | 'requested';
    invited_at: string | null;
    accepted_at: string | null;
    requested_at: string | null;
    member: FirmMemberUser;
    active_projects_count?: number;
    active_projects?: string[];
}

export interface FirmInvitation extends Pick<FirmMember, 'id' | 'role_in_firm' | 'status'> {
    firm_owner: {
        id: number;
        name: string;
        company_name: string | null;
        role_type: string;
        pic: string | null;
        phone?: string | null;
        no_telp?: string | null;
    };
}

export interface MyFirmEntry {
    id: number;
    firm_owner_id: number;
    role_in_firm: string;
    status: 'active' | 'removed';
    accepted_at: string | null;
    firm_owner: {
        id: number;
        name: string;
        role_type: string;
        pic: string | null;
        company_name: string | null;
        phone?: string | null;
        no_telp?: string | null;
    };
}

export interface FirmPortfolio {
    id: number;
    user_id: number;
    role_type: string;
    title: string;
    description: string;
    image_path: string | null;
    duration: string | null;
    client_review: string | null;
    created_at: string;
}

export interface JobPosting {
    id: string;
    role: string;
    title: string;
    description: string;
    budget: string;
    duration: string;
}

export interface FirmSquadProfileData {
    owner: {
        id: number;
        name: string;
        username: string;
        pic: string | null;
        role_type: string;
        unique_code: string;
    };
    firm_name: string;
    firm_slogan: string | null;
    firm_banner_url: string | null;
    firm_description: string | null;
    stats: {
        experience_years: number;
        base_rate: number;
        average_rating: number;
        review_count: number;
        active_members_count: number;
    };
    roster: FirmMember[];
    portfolios: any[];
    firm_is_hiring?: boolean;
    firm_needed_roles?: (string | JobPosting)[];
}
