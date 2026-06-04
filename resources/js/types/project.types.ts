import { formatCurrency as exploreFormatCurrency } from './explore';
import { ProjectSubProfessional, ProposedTeamMember } from './sub_professional.types';
import { 
    AlertCircle, CheckCircle, Clock, FileText, 
    Zap, Link as LinkIcon, Home, Compass, LayoutDashboard,
    Hammer, Wrench, Paintbrush, ShieldCheck
} from 'lucide-react';

export interface ProjectImage {
    id: number;
    url: string;
    sort_order: number;
}

export interface FurnitureItem {
    id: string;
    name: string;
    brand?: string;
    price: number;
    status: 'pending_procurement' | 'ordered' | 'installed';
    addendum_id?: number | null;
}

export interface ProjectMilestone {
    id: number;
    project_id: number;
    arsitek_id?: number | null;
    kontraktor_id?: number | null;
    notaris_id?: number | null;
    pm_id?: number | null;
    interior_id?: number | null;
    structural_id?: number | null;
    mep_id?: number | null;
    title: string;
    description?: string | null;
    start_date?: string | null;
    due_date?: string | null;
    type?: 'generic' | 'schematic' | 'development' | 'construction' | 'legal';
    approval_status?: 'in_progress' | 'pending' | 'approved' | 'revision';
    revision_notes?: string | null;
    content?: {
        gallery?: string[];
        links?: { label: string; url: string }[];
        checklist?: { label: string; checked: boolean }[];
        [key: string]: any;
    };
    is_completed: boolean;
    pm_verified_at?: string | null;
    lead_pro_verified_at?: string | null;
    review_note?: string | null;
    review_status?: 'pending' | 'approved' | 'revision_requested';
    sort_order: number;
    created_at: string;
}

export interface ProjectDocument {
    id: number;
    project_id: number;
    uploader_id: number;
    file_name: string;
    file_path: string;
    file_url?: string;
    file_type?: string;
    category?: string;
    status?: 'pending' | 'approved' | 'revision_requested' | string;
    target_role?: string;
    version_label?: string;
    review_note?: string | null;
    reviewed_at?: string | null;
    created_at: string;
}

export interface Termin {
    id: number;
    label: string;
    percentage: number;
    amount: number;
    trigger_description: string | null;
    status: 'locked' | 'pending' | 'invoice_sent' | 'verifying' | 'paid';
    payment_proof_path?: string | null;
    milestone_id: number | null;
    role_type: string;
    recipient_id: number | null;
    paid_at: string | null;
    notes: string | null;
    milestone?: ProjectMilestone;
}

export interface MaterialOrder {
    id: number;
    project_id: number;
    supplier_id: number;
    status: 'pending' | 'awaiting_payment' | 'verifying' | 'paid' | 'shipping' | 'delivered' | 'completed' | 'cancelled' | string;
    total_price: number;
    payment_proof_path?: string | null;
    delivered_at?: string | null;
    created_at: string;
    delivery_job?: {
        id: number;
        status: string;
        pickup_time?: string | null;
        delivery_time?: string | null;
    } | null;
}

export interface ProjectComment {
    id: number;
    project_id: number;
    user_id: number;
    parent_id?: number | null;
    message: string;
    created_at: string;
    user?: { id: number; name: string };
    parent?: { id: number; message: string; user?: { id: number; name: string } };
}

export interface ProjectDocument {
    id: number;
    project_id: number;
    uploader_id: number;
    file_name: string;
    file_path: string;
    file_url?: string;
    file_type: string;
    category?: 'general' | 'blueprint' | 'render' | 'technical' | 'src' | 'technical_handoff' | 'structural_calc' | 'mep_layout' | 'others';
    status?: 'uploaded' | 'under_review' | 'awaiting_signature' | 'legally_binding' | 'revision_requested' | 'verified';
    is_signed?: boolean;
    requires_signature?: boolean;
    created_at: string;
    uploader?: { id: number; name: string; role_type: string };
}

export interface ProjectReport {
    id: number;
    project_id: number;
    user_id: number;
    role_type: string;
    phase_slug?: string | null;
    title: string;
    description: string;
    report_date: string;
    images?: string[];
    is_verified?: boolean;
    pm_feedback?: string | null;
    created_at: string;
    user?: { id: number; name: string };
}

export interface ProposedTermin {
    percentage: number;
    amount?: number;
    trigger_description?: string;
    milestone_index?: number; // Connects to a proposed milestone
    existing_milestone_id?: number; // Connects to an existing project milestone
}

export interface ProposedMilestone {
    title: string;
    description: string;
    type?: string;
    services?: any[];
}

export interface PortfolioProject {
    id: number;
    user_id: number;
    role_type: string;
    title: string;
    description: string;
    image_path?: string;
    duration?: string;
    client_review?: string;
    created_at: string;
}

export interface Bid {
    id: number;
    project_id: number;
    arsitek_id?: number | null;
    kontraktor_id?: number | null;
    notaris_id?: number | null;
    interior_id?: number | null;
    pm_id?: number | null;
    structural_id?: number | null;
    mep_id?: number | null;
    price: number;
    fee_type?: 'fixed' | 'percentage' | 'unit' | 'sqm' | 'hourly' | string;
    unit_price?: number;
    quantity?: number;
    calculated_total?: number;
    proposal: string;
    status: 'pending' | 'shortlisted' | 'invited' | 'negotiating' | 'accepted' | 'rejected' | string;
    scopes?: string[];
    deliverables?: string[];
    offered_by_id?: number | null;
    fee_agreed_at?: string | null;
    negotiation_count?: number;
    payment_status?: 'unpaid' | 'paid' | 'verifying';
    is_recommended?: boolean;
    interview_notes?: string | null;
    proposed_termins?: ProposedTermin[] | null;
    proposed_milestones?: ProposedMilestone[] | null;
    proposed_team?: ProposedTeamMember[] | null;
    created_at: string;
}

export interface ProjectExternalVendor {
    id: number;
    team_member_id: number | null;
    phase_role: string;
    company_name: string | null;
    contact_person: string;
    phone_number: string;
    email: string | null;
    agreed_fee: number;
    notes: string | null;
}

export interface ProjectRequirement {
    id: number;
    project_id: number;
    name: string;
    quantity_required: number;
    quantity_on_site: number;
    quantity_used: number;
    unit: string;
    quality_level?: 'standard' | 'premium' | 'luxury';
    notes?: string | null;
    image_url?: string | null;
    created_at: string;
}

export interface PlanningRequirementFeedback {
    id: string;
    author_id: number;
    author_name: string;
    author_role: string;
    content: string;
    created_at: string;
}

export interface PlanningRequirement {
    id: string; // Internal temporary ID for frontend or generated uniquely
    title: string;
    description: string;
    image_url?: string;
    image_file?: File; // For newly added images before upload
    is_edited?: boolean;
    tagged_role?: string;
    feedback?: PlanningRequirementFeedback[];
    sticky_note?: string;
}

export interface ProjectAddendum {
    id: number;
    project_id: number;
    user_id: number;
    role_type: string;
    type?: 'extra_fee' | 'specialist_assignment';
    specialist_type?: 'structural' | 'mep';
    team_member_id?: number | null;
    teamMember?: TeamMember;
    attachment_path?: string | null;
    title: string;
    description?: string | null;
    amount: number;
    counter_offer_amount?: number | null;
    negotiation_note?: string | null;
    status: 'pending_approval' | 'approved_unpaid' | 'rejected' | 'verifying' | 'paid' | 'negotiating' | 'accepted_by_pro';
    payment_proof_path?: string | null;
    recommended_bid_id?: number | null;
    recommended_bid_type?: string | null;
    paid_at?: string | null;
    created_at: string;
}

export interface DesignDetails {
    requirements?: PlanningRequirement[];
    style?: string;
    revisions?: number;
    scopes?: string[];
    deliverables?: string[];
    floorCount?: number;
    targetArea?: number;
    maxClearSpan?: number;
    cantileverLength?: number;
    // Feedback arrays
    style_feedback?: PlanningRequirementFeedback[];
    revisions_feedback?: PlanningRequirementFeedback[];
    scopes_feedback?: PlanningRequirementFeedback[];
    deliverables_feedback?: PlanningRequirementFeedback[];
    [key: string]: any;
}

export interface Project {
    id: number;
    title: string;
    description: string;
    budget: number;
    location?: string;
    latitude?: string | null;
    longitude?: string | null;
    province?: string | null;
    city?: string | null;
    kecamatan?: string | null;
    kelurahan?: string | null;
    postal_code?: string | null;
    street_name?: string | null;
    type?: string;
    status: 'open' | 'in_progress' | 'procurement' | 'completed' | 'cancelled' | string;
    planning_status?: 'draft' | 'proposed' | 'pm_verified' | 'approved';
    planning_iteration?: number;
    negotiated_fee?: number;
    payment_instructions?: string;
    planning_submitted_at?: string;
    planning_pm_verified_at?: string;
    planning_approved_at?: string;
    design_payment_verified_at?: string;
    deadline?: string;
    attachment?: string;
    owner_id?: number;
    wants_project_manager?: boolean;
    requires_structural?: boolean;
    requires_mep?: boolean;
    pm_id?: number | null;
    structural_id?: number | null;
    mep_id?: number | null;
    selected_arsitek_id?: number | null;
    selected_kontraktor_id?: number | null;
    selected_notaris_id?: number | null;
    selected_interior_id?: number | null;
    design_completed_at?: string | null;
    design_locked_at?: string | null;
    construction_locked_at?: string | null;
    interior_locked_at?: string | null;
    structural_approved_at?: string | null;
    mep_approved_at?: string | null;
    pbg_verified_at?: string | null;
    slf_verified_at?: string | null;
    legal_requirements?: string[];
    construction_brief_status?: string | null;
    construction_brief_revision_notes?: string | null;
    design_handover_submitted_at?: string | null;
    construction_handover_submitted_at?: string | null;
    interior_handover_submitted_at?: string | null;
    legal_handover_submitted_at?: string | null;
    design_handover_notes?: string | null;
    construction_handover_notes?: string | null;
    interior_handover_notes?: string | null;
    legal_handover_notes?: string | null;
    arsitek_kickoff_at?: string | null;
    kontraktor_kickoff_at?: string | null;
    created_at?: string;
    updated_at?: string;
    images?: ProjectImage[];
    design_details?: DesignDetails;
    bids_arsitek_count?: number;
    bids_kontraktor_count?: number;
    bids_project_manager_count?: number;
    bids_arsitek?: Bid[];
    bids_kontraktor?: Bid[];
    bids_project_manager?: Bid[];
    bids_structural?: Bid[];
    bids_mep?: Bid[];
    target_role?: string;
    sub_professionals?: ProjectSubProfessional[];
    external_vendors?: ProjectExternalVendor[];
    structural_engineer?: any;
    mep_engineer?: any;
    structural_profile?: {
        name: string;
        type: 'platform_hired' | 'internal_team';
        payment_status: 'unpaid' | 'paid';
        sub_professional_id?: number;
        user_id?: number;
        is_internal: boolean;
    };
    mep_profile?: {
        name: string;
        type: 'platform_hired' | 'internal_team';
        payment_status: 'unpaid' | 'paid';
        sub_professional_id?: number;
        user_id?: number;
        is_internal: boolean;
    };

    milestones?: ProjectMilestone[];
    payment_termins?: Termin[];
    pm_audit_notes?: string;
    pm_audit_attachments?: string[];
    architect_notes?: string;
    comments?: ProjectComment[];
    documents?: ProjectDocument[];
    addendums?: ProjectAddendum[];
    material_orders?: MaterialOrder[];
    requirements?: ProjectRequirement[];
    has_submitted_bid?: boolean;
    project_category?: 'new_build' | 'renovation' | 'interior' | 'maintenance' | string;
    accepted_arsitek_bid?: Bid | null;
    accepted_kontraktor_bid?: Bid | null;
    accepted_notaris_bid?: any | null;
    accepted_interior_bid?: Bid | null;
    owner_legal_approved_at?: string | null;
    user_id?: number;
    user?: { id: number; name: string };
    is_structural_hired_4c?: boolean;
    is_mep_hired_4c?: boolean;
    structural_profile?: {
        name: string;
        type: 'platform_hired' | 'internal_team';
        payment_status: 'unpaid' | 'paid' | 'verifying';
    };
    mep_profile?: {
        name: string;
        type: 'platform_hired' | 'internal_team';
        payment_status: 'unpaid' | 'paid' | 'verifying';
    };
}

export type ProjectStatus = Project['status'];

export interface ProjectFilter {
    search: string;
    status: string; // 'all' | 'open' | 'in_progress' | 'completed'
    sortBy: 'newest' | 'budget_desc' | 'budget_asc' | 'deadline_asc';
}

export const STATUS_CONFIG: Record<string, { label: string; icon: any; colors: string; bg: string }> = {
    open: { label: 'Open', icon: AlertCircle, colors: 'text-red-600 border-red-100', bg: 'bg-red-50' },
    accepted_arsitek: { label: 'Design Active', icon: Compass, colors: 'text-red-600 border-red-100', bg: 'bg-red-50' },
    accepted_kontraktor: { label: 'Builder Hired', icon: Hammer, colors: 'text-red-600 border-red-100', bg: 'bg-red-50' },
    completed_build: { label: 'Build Finished', icon: CheckCircle, colors: 'text-emerald-600 border-emerald-100', bg: 'bg-emerald-50' },
    in_progress: { label: 'In Progress', icon: Clock, colors: 'text-zinc-600 border-zinc-200', bg: 'bg-zinc-50' },
    completed: { label: 'Completed', icon: CheckCircle, colors: 'text-white border-zinc-900', bg: 'bg-zinc-900' },
    cancelled: { label: 'Cancelled', icon: FileText, colors: 'text-zinc-400 border-zinc-100', bg: 'bg-gray-50' },
};

export const getStatusConfig = (status: string) => {
    const s = status.toLowerCase();
    if (STATUS_CONFIG[s]) return STATUS_CONFIG[s];
    return { label: status, icon: FileText, colors: 'text-gray-700 border-gray-200', bg: 'bg-gray-50' };
};

export const PROJECT_TYPE_CONFIG: Record<string, any> = {
    umum: { icon: Home, label: 'Umum' },
    fondasi: { icon: ShieldCheck, label: 'Fondasi' },
    struktur: { icon: LayoutDashboard, label: 'Struktur' },
    dinding: { icon: Paintbrush, label: 'Dinding' },
    atap: { icon: Compass, label: 'Atap' },
    lantai: { icon: LayoutDashboard, label: 'Lantai' },
    ventilasi: { icon: Compass, label: 'Ventilasi' },
    listrik: { icon: Zap, label: 'Listrik' },
    plumbing: { icon: Wrench, label: 'Plumbing' },
};

export const getProjectTypeConfig = (type?: string) => {
    if (!type) return { icon: Hammer, label: 'Other' };
    const t = type.toLowerCase();
    if (PROJECT_TYPE_CONFIG[t]) return PROJECT_TYPE_CONFIG[t];
    return { icon: Hammer, label: type };
};

export const formatCurrency = exploreFormatCurrency;
