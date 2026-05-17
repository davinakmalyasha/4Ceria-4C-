import React from 'react';
import { motion } from 'framer-motion';
import { Home, FolderKanban, Compass, MessageSquare, User as UserIcon, LogOut, Search, CheckSquare, FileText, Building, Truck, Package, Users, ShoppingBag, Heart, Paintbrush, ShieldCheck, Briefcase, Building2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    activeTab: string;
    setActiveTab: (tab: string) => void;
}

const USER_NAV = [
    { id: 'overview', label: 'Home', icon: Home },
    { id: 'projects', label: 'My Projects', icon: FolderKanban },
    { id: 'houses', label: 'Browse Houses', icon: Building },
    { id: 'architects', label: 'Hire Architect', icon: Users },
    { id: 'constructors', label: 'Hire Constructor', icon: Users },
    { id: 'interior', label: 'Hire Interior', icon: Paintbrush },
    { id: 'notaris', label: 'Legal, Notary & PPAT', icon: ShieldCheck },
    { id: 'project_manager', label: 'Hire Project Manager', icon: Briefcase },
    { id: 'hire-history', label: 'Hire History', icon: Users },
    { id: 'marketplace', label: 'Marketplace', icon: ShoppingBag },
    { id: 'material-orders', label: 'My Orders', icon: Package },
    { id: 'saved', label: 'Saved Items', icon: Heart },
    { id: 'chat', label: 'Inbox', icon: MessageSquare },
    { id: 'profile', label: 'Profile', icon: UserIcon },
];

const PRO_NAV = (role: string) => {
    const label = role === 'notaris' ? 'Legal' : 
                  role === 'interior' ? 'Interior' : 
                  role === 'arsitek' ? 'Architect' : 
                  role === 'project_manager' ? 'Project Manager' :
                  role === 'structural' ? 'Structural' :
                  role === 'mep' ? 'MEP' :
                  'Constructor';
    const nav = [
        { id: 'overview', label: 'Home', icon: Home },
        { id: 'projects', label: 'Bidding Board', icon: Search },
        { id: 'management', label: 'My Projects', icon: CheckSquare },
        { id: 'my-bids', label: 'My Proposals', icon: FileText },
        { id: 'chat', label: 'Inbox', icon: MessageSquare },
        { id: 'profile', label: `${label} Profile`, icon: UserIcon },
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
    }

    // Add Find Engineers for architects
    if (role === 'arsitek') {
        const index = nav.findIndex(item => item.id === 'management');
        if (index !== -1) {
            nav.splice(index + 1, 0, { id: 'find-engineers', label: 'Hire Specialists', icon: Users });
        }
    }

    // Add My Firm for architects and contractors
    if (role === 'arsitek' || role === 'kontraktor') {
        const chatIdx = nav.findIndex(item => item.id === 'chat');
        if (chatIdx !== -1) {
            nav.splice(chatIdx, 0, { id: 'my-firm', label: 'My Firm', icon: Building2 });
        }
    }

    return nav;
};

const SUPPLIER_NAV = [
    { id: 'overview', label: 'Home', icon: Home },
    { id: 'store', label: 'My Store', icon: Building },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'orders', label: 'Orders', icon: Truck },
    { id: 'chat', label: 'Inbox', icon: MessageSquare },
    { id: 'profile', label: 'Profile', icon: UserIcon },
];

const LOGISTICS_NAV = [
    { id: 'overview', label: 'Home', icon: Home },
    { id: 'job-radar', label: 'Job Radar', icon: Search },
    { id: 'my-deliveries', label: 'Deliveries', icon: Truck },
    { id: 'chat', label: 'Inbox', icon: MessageSquare },
    { id: 'profile', label: 'Profile', icon: UserIcon },
];

function getNavItems(role?: string) {
    if (!role || role === 'user') return USER_NAV;
    if (role === 'supplier') return SUPPLIER_NAV;
    if (role === 'logistics') return LOGISTICS_NAV;
    return PRO_NAV(role);
}

export const DashboardSidebar: React.FC<SidebarProps> = ({ sidebarOpen, setSidebarOpen, activeTab, setActiveTab }) => {
    const { user, logout } = useAuth();
    const navItems = getNavItems(user?.role_type);

    return (
        <>
            {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-[115] md:hidden" onClick={() => setSidebarOpen(false)} />}
            <motion.aside
                initial={{ x: -300 }}
                animate={{ x: sidebarOpen ? 0 : (window.innerWidth >= 768 ? 0 : -300) }}
                className="fixed md:relative inset-y-0 left-0 w-56 bg-white shadow-xl shadow-black/5 z-[120] flex flex-col"
            >
                <div className="p-5 flex items-center gap-3 border-b border-gray-100">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-red-200">
                        {user?.name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{user?.name}</p>
                        <p className="text-[11px] text-gray-400 capitalize font-medium">{user?.role_type}</p>
                    </div>
                </div>

                <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${
                                    isActive
                                        ? 'bg-red-50 text-[#FF2D20] shadow-sm'
                                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                                }`}
                            >
                                <Icon className="w-[18px] h-[18px]" />
                                {item.label}
                            </button>
                        );
                    })}
                </nav>

                <div className="p-3 border-t border-gray-100">
                    <button onClick={logout} className="flex items-center gap-3 px-3.5 py-2.5 w-full rounded-xl text-[13px] text-gray-400 hover:bg-red-50 hover:text-red-500 font-semibold transition-all">
                        <LogOut className="w-[18px] h-[18px]" />
                        Sign Out
                    </button>
                </div>
            </motion.aside>
        </>
    );
};
