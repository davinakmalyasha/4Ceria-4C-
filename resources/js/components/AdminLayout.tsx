import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
    LayoutDashboard, 
    UserCheck, 
    Home, 
    Briefcase, 
    LogOut, 
    Users,
    Menu,
    X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, logout } = useAuth();
    const location = useLocation();
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);

    const navItems = [
        { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
        { name: 'Verification', path: '/admin/verification', icon: UserCheck },
        { name: 'Houses', path: '/admin/houses', icon: Home },
        { name: 'Projects', path: '/admin/projects', icon: Briefcase },
    ];

    const isActive = (path: string) => location.pathname === path;

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Sidebar */}
            <aside className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-white border-r border-gray-200 transition-all duration-300 flex flex-col fixed h-full z-50`}>
                <div className="p-6 flex items-center justify-between">
                    {isSidebarOpen ? (
                        <h1 className="text-xl font-bold text-[#fd1d1d]">Admin Panel</h1>
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-[#fd1d1d] flex-shrink-0" />
                    )}
                    <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1 hover:bg-gray-100 rounded">
                        {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>

                <nav className="flex-1 px-4 space-y-2 mt-4">
                    {navItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`flex items-center space-x-3 p-3 rounded-xl transition-all duration-200 ${
                                isActive(item.path) 
                                ? 'bg-[#fd1d1d] text-white shadow-lg shadow-red-200' 
                                : 'text-gray-600 hover:bg-red-50 hover:text-[#fd1d1d]'
                            }`}
                        >
                            <item.icon size={20} className="flex-shrink-0" />
                            {isSidebarOpen && <span className="font-medium">{item.name}</span>}
                        </Link>
                    ))}
                </nav>

                <div className="p-4 border-t border-gray-100">
                    <button 
                        onClick={logout}
                        className="flex items-center space-x-3 p-3 w-full text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                    >
                        <LogOut size={20} className="flex-shrink-0" />
                        {isSidebarOpen && <span className="font-medium">Logout</span>}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-20'} min-h-screen`}>
                <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 sticky top-0 z-40">
                    <div className="flex items-center text-sm text-gray-500">
                        <span>Admin</span>
                        <span className="mx-2">/</span>
                        <span className="text-gray-900 font-medium capitalize">
                            {location.pathname.split('/').pop() || 'Dashboard'}
                        </span>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                        <div className="text-right">
                            <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                            <p className="text-xs text-gray-500 capitalize">{user?.role_type}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-red-500 to-pink-500 flex items-center justify-center text-white font-bold">
                            {user?.name?.charAt(0)}
                        </div>
                    </div>
                </header>

                <div className="p-8">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default AdminLayout;
