import React from 'react';
import { motion } from 'framer-motion';
import { 
    Home, FolderKanban, MessageSquare, User as UserIcon, LogOut, Search, CheckSquare, 
    FileText, Building, Truck, Package, Users, ShoppingBag, Heart, Paintbrush, 
    ShieldCheck, Briefcase, Building2, ChevronDown 
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import NotificationsDropdown from '../NotificationsDropdown';

interface SidebarProps {
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    activeTab: string;
    setActiveTab: (tab: string) => void;
    counts?: Record<string, number>;
}

interface NavItem {
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
    const label = role === 'notaris' ? 'Legal' : 
                  role === 'interior' ? 'Interior' : 
                  role === 'arsitek' ? 'Architect' : 
                  role === 'project_manager' ? 'Project Manager' :
                  role === 'structural' ? 'Structural' :
                  role === 'mep' ? 'MEP' :
                  role === 'civil' ? 'Civil & Structural' :
                  role === 'mechanical' ? 'Mechanical' :
                  role === 'electrical' ? 'Electrical' :
                  role === 'plumbing' ? 'Plumbing' :
                  role === 'roofing' ? 'Roofing' :
                  role === 'finishing' ? 'Finishing' :
                  'Constructor';
    const nav: NavItem[] = [
        { id: 'overview', label: 'Dashboard', icon: Home },
        { id: 'projects', label: 'Bidding Board', icon: Search },
        { id: 'management', label: 'My Projects', icon: CheckSquare },
        { id: 'my-bids', label: 'My Proposals', icon: FileText },
    ];

    // Add marketplace for contractors
    if (role === 'kontraktor') {
        const marketplaceIndex = nav.findIndex(item => item.id === 'management');
        if (marketplaceIndex !== -1) {
            nav.splice(marketplaceIndex + 1, 0, 
                { id: 'marketplace', label: 'Marketplace', icon: ShoppingBag },
                { id: 'find-sub-contractors', label: 'Hire Sub-Contractors', icon: Users },
            );
        }
        nav.push({ id: 'my-firm', label: 'My Firm', icon: Building2 });
    }

    // Add Find Engineers for architects
    if (role === 'arsitek') {
        const index = nav.findIndex(item => item.id === 'management');
        if (index !== -1) {
            nav.splice(index + 1, 0, { id: 'find-engineers', label: 'Hire Specialists', icon: Users });
        }
        nav.push({ id: 'my-firm', label: 'My Firm', icon: Building2 });
    }

    // Add My Firms for specialists (structural, mep, interior, civil, mechanical, electrical, plumbing, roofing, finishing)
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

function getNavItems(role?: string): NavItem[] {
    if (!role || role === 'user') return USER_NAV;
    if (role === 'supplier') return SUPPLIER_NAV;
    if (role === 'logistics') return LOGISTICS_NAV;
    return PRO_NAV(role);
}

export const DashboardSidebar: React.FC<SidebarProps> = ({ sidebarOpen, setSidebarOpen, activeTab, setActiveTab, counts }) => {
    const { user, logout } = useAuth();
    const navItems = getNavItems(user?.role_type, !!user);
    const [openMenus, setOpenMenus] = React.useState<Record<string, boolean>>({});

    const toggleMenu = (menuId: string) => {
        setOpenMenus(prev => ({
            ...prev,
            [menuId]: !prev[menuId]
        }));
    };

    // Smart-expand dropdown menu if one of its children is the active tab
    React.useEffect(() => {
        navItems.forEach((item) => {
            if (item.children?.some(child => child.id === activeTab)) {
                setOpenMenus(prev => ({ ...prev, [item.id]: true }));
            }
        });
    }, [activeTab, navItems]);

    return (
        <>
            {sidebarOpen && (
                <div 
                    className="fixed inset-0 bg-black/35 backdrop-blur-sm z-[115] transition-opacity duration-300" 
                    onClick={() => setSidebarOpen(false)} 
                />
            )}
            <motion.aside
                initial={{ x: -300 }}
                animate={{ x: sidebarOpen ? 0 : -300 }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                className="fixed inset-y-0 left-0 w-64 bg-white shadow-2xl shadow-black/10 z-[120] flex flex-col h-full"
            >
                <div className="p-5 flex items-center justify-between border-b border-gray-100 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-red-200 shrink-0">
                            {user ? user.name?.charAt(0).toUpperCase() : 'G'}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{user ? user.name : 'Guest'}</p>
                            <p className="text-[11px] text-gray-400 capitalize font-medium">{user ? user.role_type : 'Visitor'}</p>
                        </div>
                    </div>
                    {user && (
                        <div className="shrink-0 ml-2">
                            <NotificationsDropdown />
                        </div>
                    )}
                </div>

                <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        if (item.children) {
                            const isExpanded = !!openMenus[item.id];
                            const hasActiveChild = item.children.some(child => child.id === activeTab);
                            const childrenCountsSum = item.children.reduce((acc, child) => acc + (counts?.[child.id] || 0), 0);
                            return (
                                <div key={item.id} className="space-y-1">
                                    <button
                                        onClick={() => toggleMenu(item.id)}
                                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${
                                            hasActiveChild
                                                ? 'bg-red-50/50 text-[#FF2D20]'
                                                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Icon className="w-[18px] h-[18px] shrink-0" />
                                            {item.label}
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {childrenCountsSum > 0 && (
                                                <span className={`px-1.5 py-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[9px] font-black tracking-tight ${
                                                    hasActiveChild ? 'bg-[#FF2D20] text-white shadow-sm' : 'bg-red-50 text-[#FF2D20]'
                                                }`}>
                                                    {childrenCountsSum}
                                                </span>
                                            )}
                                            <ChevronDown
                                                className={`w-4 h-4 transition-transform duration-200 shrink-0 ${
                                                    isExpanded ? 'rotate-180 text-[#FF2D20]' : 'text-gray-400'
                                                }`}
                                            />
                                        </div>
                                    </button>
                                    
                                    {isExpanded && (
                                        <div className="pl-6 space-y-1 mt-1 border-l-2 border-red-100/50 ml-5">
                                            {item.children.map((child) => {
                                                const ChildIcon = child.icon;
                                                const isChildActive = activeTab === child.id;
                                                const count = counts?.[child.id];
                                                return (
                                                    <button
                                                        key={child.id}
                                                        onClick={() => {
                                                            setActiveTab(child.id);
                                                            setSidebarOpen(false);
                                                        }}
                                                        className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-[12px] font-semibold transition-all ${
                                                            isChildActive
                                                                ? 'bg-red-50 text-[#FF2D20] shadow-sm'
                                                                : 'text-gray-500 hover:bg-gray-50/70 hover:text-gray-800'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <ChildIcon className="w-[15px] h-[15px] shrink-0" />
                                                            {child.label}
                                                        </div>
                                                        {count !== undefined && count > 0 && (
                                                            <span className={`px-1.5 py-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[9px] font-black tracking-tight shrink-0 ${
                                                                isChildActive ? 'bg-[#FF2D20] text-white shadow-sm' : 'bg-red-50 text-[#FF2D20]'
                                                            }`}>
                                                                {count}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        const isPro = user && user.role_type !== 'user';
                        const isActive = activeTab === item.id || 
                            (activeTab === 'project-detail' && (
                                (isPro && item.id === 'management') ||
                                (!isPro && item.id === 'projects')
                            )) ||
                            (activeTab === 'bidding-brief' && (
                                item.id === 'projects'
                            ));
                        const count = counts?.[item.id];
                        return (
                            <button
                                key={item.id}
                                onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${
                                    isActive
                                        ? 'bg-red-50 text-[#FF2D20] shadow-sm'
                                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <Icon className="w-[18px] h-[18px] shrink-0" />
                                    {item.label}
                                </div>
                                {count !== undefined && count > 0 && (
                                    <span className={`px-1.5 py-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[9px] font-black tracking-tight shrink-0 ${
                                        isActive ? 'bg-[#FF2D20] text-white shadow-sm' : 'bg-red-50 text-[#FF2D20]'
                                    }`}>
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </nav>

                <div className="p-3 border-t border-gray-100 shrink-0">
                    {user ? (
                        <button onClick={logout} className="flex items-center gap-3 px-3.5 py-2.5 w-full rounded-xl text-[13px] text-gray-400 hover:bg-red-50 hover:text-red-500 font-semibold transition-all">
                            <LogOut className="w-[18px] h-[18px] shrink-0" />
                            Sign Out
                        </button>
                    ) : (
                        <button onClick={() => window.location.href = '/login'} className="flex items-center gap-3 px-3.5 py-2.5 w-full rounded-xl text-[13px] text-gray-400 hover:bg-red-50 hover:text-red-500 font-semibold transition-all">
                            <LogOut className="w-[18px] h-[18px] shrink-0" />
                            Sign In/Up
                        </button>
                    )}
                </div>
            </motion.aside>
        </>
    );
};
