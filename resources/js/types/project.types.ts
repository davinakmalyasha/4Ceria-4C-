import { formatCurrency as exploreFormatCurrency } from './explore';
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

export interface ProjectMilestone {
    id: number;
    project_id: number;
    title: string;
    is_completed: boolean;
    created_at: string;
}

export interface ProjectComment {
    id: number;
    project_id: number;
    user_id: number;
    message: string;
    created_at: string;
    user?: { id: number; name: string };
}

export interface ProjectDocument {
    id: number;
    project_id: number;
    uploader_id: number;
    file_name: string;
    file_path: string;
    file_type: string;
    created_at: string;
    uploader?: { id: number; name: string };
}

export interface Project {
    id: number;
    title: string;
    description: string;
    budget: number;
    location?: string;
    type?: string;
    status: 'open' | 'in_progress' | 'completed' | 'cancelled' | string;
    deadline?: string;
    attachment?: string;
    owner_id?: number;
    selected_architect_id?: number | null;
    selected_contractor_id?: number | null;
    created_at?: string;
    updated_at?: string;
    images?: ProjectImage[];
    bids_arsitek_count?: number;
    bids_kontraktor_count?: number;
    target_role?: string;
    milestones?: ProjectMilestone[];
    comments?: ProjectComment[];
    documents?: ProjectDocument[];
}

export type ProjectStatus = Project['status'];

export interface ProjectFilter {
    search: string;
    status: string; // 'all' | 'open' | 'in_progress' | 'completed'
    sortBy: 'newest' | 'budget_desc' | 'budget_asc' | 'deadline_asc';
}

export const STATUS_CONFIG: Record<string, { label: string; icon: any; colors: string; bg: string }> = {
    open: { label: 'Open', icon: AlertCircle, colors: 'text-emerald-700 border-emerald-200', bg: 'bg-emerald-50' },
    in_progress: { label: 'In Progress', icon: Clock, colors: 'text-amber-700 border-amber-200', bg: 'bg-amber-50' },
    completed: { label: 'Completed', icon: CheckCircle, colors: 'text-blue-700 border-blue-200', bg: 'bg-blue-50' },
    cancelled: { label: 'Cancelled', icon: FileText, colors: 'text-gray-700 border-gray-200', bg: 'bg-gray-50' },
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
