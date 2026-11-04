import {
    Building,
    Building2,
    Briefcase,
    CalendarCheck,
    CheckSquare,
    FileText,
    FolderKanban,
    Home,
    Package,
    Paintbrush,
    Search,
    ShieldCheck,
    ShoppingBag,
    Sparkles,
    Truck,
    Users,
    type LucideIcon,
} from 'lucide-react';

/**
 * The dashboard navigation tree.
 *
 * A native copy of the synced `navConfig.ts`: the same ids, labels, icons,
 * grouping and role rules. The header renders it, so it must live in the app
 * tree rather than behind the synced content boundary.
 */
export interface NavItem {
    id: string;
    label: string;
    icon: LucideIcon;
    children?: NavItem[];
}

const USER_NAV: NavItem[] = [
    { id: 'overview', label: 'Dashboard', icon: Home },
    { id: 'assistant', label: 'AI Assistant', icon: Sparkles },
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
        { id: 'assistant', label: 'AI Assistant', icon: Sparkles },
        { id: 'projects', label: 'Bidding Board', icon: Search },
        { id: 'management', label: 'My Projects', icon: CheckSquare },
        { id: 'my-bids', label: 'My Proposals', icon: FileText },
    ];

    if (role === 'kontraktor') {
        const index = nav.findIndex((item) => item.id === 'management');

        if (index !== -1) {
            nav.splice(
                index + 1,
                0,
                { id: 'marketplace', label: 'Marketplace', icon: ShoppingBag },
                { id: 'find-sub-contractors', label: 'Hire Sub-Contractors', icon: Users },
            );
        }

        nav.push({ id: 'my-firm', label: 'My Firm', icon: Building2 });
    }

    if (role === 'arsitek') {
        const index = nav.findIndex((item) => item.id === 'management');

        if (index !== -1) {
            nav.splice(index + 1, 0, { id: 'find-engineers', label: 'Hire Specialists', icon: Users });
        }

        nav.push({ id: 'my-firm', label: 'My Firm', icon: Building2 });
    }

    if (role === 'notaris') {
        nav.push({ id: 'consultations', label: 'Consultation Requests', icon: CalendarCheck });
    }

    if (
        [
            'structural',
            'mep',
            'interior',
            'civil',
            'mechanical',
            'electrical',
            'plumbing',
            'roofing',
            'finishing',
        ].includes(role)
    ) {
        nav.push({ id: 'my-firms', label: 'My Firms', icon: Building2 });
    }

    return nav;
};

const SUPPLIER_NAV: NavItem[] = [
    { id: 'overview', label: 'Dashboard', icon: Home },
    { id: 'assistant', label: 'AI Assistant', icon: Sparkles },
    { id: 'store', label: 'My Store', icon: Building },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'quotes', label: 'Quotes', icon: FileText },
    { id: 'orders', label: 'Orders', icon: Truck },
    { id: 'delivery-jobs', label: 'Delivery Jobs', icon: Search },
];

const LOGISTICS_NAV: NavItem[] = [
    { id: 'overview', label: 'Dashboard', icon: Home },
    { id: 'assistant', label: 'AI Assistant', icon: Sparkles },
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
    { id: 'assistant', label: 'AI Assistant', icon: Sparkles },
    { id: 'users', label: 'User Directory', icon: Users },
    { id: 'verifications', label: 'Verification Queue', icon: ShieldCheck },
    { id: 'properties_moderation', label: 'Properties Moderation', icon: Building2 },
    { id: 'projects_moderation', label: 'Projects Audit', icon: Briefcase },
];

export function getNavItems(role?: string, isAuthenticated = true): NavItem[] {
    if (!isAuthenticated) return GUEST_NAV;
    if (role === 'admin') return ADMIN_NAV;
    if (!role || role === 'user') return USER_NAV;
    if (role === 'supplier') return SUPPLIER_NAV;
    if (role === 'logistics') return LOGISTICS_NAV;

    return PRO_NAV(role);
}
