import React from 'react';
import { 
    Home, Building, Users, ShoppingBag, Paintbrush, ShieldCheck, 
    Briefcase, Building2, Package, Search, CheckSquare, FileText, 
    Truck, User, MessageSquare, FolderKanban
} from 'lucide-react';

export interface NavItem {
    id: string;
    label: string;
    icon: React.ComponentType<any>;
    children?: NavItem[];
}

const USER_NAV: NavItem[] = [
    { id: 'overview', label: 'Dashboard', icon: Home },
    { id: 'projects', label: 'My Projects', icon: FolderKanban },
    {
        id: 'properties_group',
        label: 'Properties',
        icon: Building,
        children: [
            { id: 'houses', label: 'Browse Houses', icon: Building },
            { id: 'my-houses', label: 'My Properties', icon: Building2 },
        ],
    },
    {
        id: 'hire_professionals',
        label: 'Hire Professionals',
        icon: Users,
        children: [
            { id: 'architects', label: 'Hire Architect', icon: Users },
            { id: 'constructors', label: 'Hire Constructor', icon: Users },
            { id: 'interior', label: 'Hire Interior', icon: Paintbrush },
            { id: 'notaris', label: 'Legal, Notary & PPAT', icon: ShieldCheck },
            { id: 'project_manager', label: 'Hire Project Manager', icon: Briefcase },
            { id: 'hire-history', label: 'Hire History', icon: Users },
        ],
    },
    {
        id: 'marketplace_group',
        label: 'Marketplace',
        icon: ShoppingBag,
        children: [
            { id: 'marketplace-materials', label: 'Construction Materials', icon: ShoppingBag },
            { id: 'marketplace-furniture', label: 'Furniture & Decor', icon: Paintbrush },
            { id: 'material-orders', label: 'My Orders', icon: Package },
        ],
    },
];

const PRO_NAV = (role: string): NavItem[] => {
    const nav: NavItem[] = [
        { id: 'overview', label: 'Dashboard', icon: Home },
        { id: 'projects', label: 'Bidding Board', icon: Search },
        { id: 'management', label: 'My Projects', icon: CheckSquare },
        { id: 'my-bids', label: 'My Proposals', icon: FileText },
    ];

    if (role === 'kontraktor') {
        const idx = nav.findIndex(item => item.id === 'management');
        if (idx !== -1) {
            nav.splice(idx + 1, 0, 
                { id: 'marketplace', label: 'Marketplace', icon: ShoppingBag },
                { id: 'find-sub-contractors', label: 'Hire Sub-Contractors', icon: Users }
            );
        }
        nav.push({ id: 'my-firm', label: 'My Firm', icon: Building2 });
    }

    if (role === 'arsitek') {
        const idx = nav.findIndex(item => item.id === 'management');
        if (idx !== -1) {
            nav.splice(idx + 1, 0, { id: 'find-engineers', label: 'Hire Specialists', icon: Users });
        }
        nav.push({ id: 'my-firm', label: 'My Firm', icon: Building2 });
    }

    if (['structural', 'mep', 'interior', 'civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'].includes(role)) {
        nav.push({ id: 'my-firms', label: 'My Firms', icon: Building2 });
    }

    return nav;
};

const SUPPLIER_NAV: NavItem[] = [
    { id: 'overview', label: 'Dashboard', icon: Home },
    { id: 'store', label: 'My Store', icon: Building },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'orders', label: 'Orders', icon: Truck },
];

const LOGISTICS_NAV: NavItem[] = [
    { id: 'overview', label: 'Dashboard', icon: Home },
    { id: 'job-radar', label: 'Job Radar', icon: Search },
    { id: 'my-deliveries', label: 'Deliveries', icon: Truck },
];

const GUEST_NAV: NavItem[] = [
    {
        id: 'properties_group',
        label: 'Properties',
        icon: Building,
        children: [
            { id: 'houses', label: 'Browse Houses', icon: Building },
            { id: 'my-houses', label: 'My Properties', icon: Building2 },
        ],
    },
    {
        id: 'hire_professionals',
        label: 'Hire Professionals',
        icon: Users,
        children: [
            { id: 'architects', label: 'Hire Architect', icon: Users },
            { id: 'constructors', label: 'Hire Constructor', icon: Users },
            { id: 'interior', label: 'Hire Interior', icon: Paintbrush },
            { id: 'notaris', label: 'Legal, Notary & PPAT', icon: ShieldCheck },
            { id: 'project_manager', label: 'Hire Project Manager', icon: Briefcase },
            { id: 'hire-history', label: 'Hire History', icon: Users },
        ],
    },
    {
        id: 'marketplace_group',
        label: 'Marketplace',
        icon: ShoppingBag,
        children: [
            { id: 'marketplace-materials', label: 'Construction Materials', icon: ShoppingBag },
            { id: 'marketplace-furniture', label: 'Furniture & Decor', icon: Paintbrush },
            { id: 'material-orders', label: 'My Orders', icon: Package },
        ],
    },
];

const ADMIN_NAV: NavItem[] = [
    { id: 'overview', label: 'Dashboard', icon: Home },
    { id: 'users', label: 'User Directory', icon: Users },
    { id: 'verifications', label: 'Verification Queue', icon: ShieldCheck },
    { id: 'properties_moderation', label: 'Properties Moderation', icon: Building2 },
    { id: 'projects_moderation', label: 'Projects Audit', icon: Briefcase },
];

export function getNavItems(role?: string, isAuthenticated: boolean = true): NavItem[] {
    if (!isAuthenticated) return GUEST_NAV;
    if (role === 'admin') return ADMIN_NAV;
    if (!role || role === 'user') return USER_NAV;
    if (role === 'supplier') return SUPPLIER_NAV;
    if (role === 'logistics') return LOGISTICS_NAV;
    return PRO_NAV(role);
}
