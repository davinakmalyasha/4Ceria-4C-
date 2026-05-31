import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
    LayoutDashboard, 
    UserCheck, 
    Home, 
    Briefcase, 
    LogOut, 
    Menu,
    X,
    Shield,
    FileText
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, logout } = useAuth();
    const location = useLocation();
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
    const [pendingCount, setPendingCount] = React.useState(0);

    React.useEffect(() => {
        axios.get('/admin/stats')
            .then(res => setPendingCount(res.data.pending_verifications || 0))
            .catch(err => console.error('Failed to fetch pending verifications', err));
    }, []);

    const navItems = [
        { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
        { name: 'Verification Queue', path: '/admin/verification', icon: UserCheck },
        { name: 'Houses Moderation', path: '/admin/houses', icon: Home },
        { name: 'Projects Audit', path: '/admin/projects', icon: Briefcase },
    ];

    const isActive = (path: string) => location.pathname === path;

    return (
        <div className="min-h-screen bg-[#fafafa] flex font-sans text-neutral-900 antialiased selection:bg-neutral-900 selection:text-white">
            {/* Sidebar */}
            <aside className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-white border-r border-neutral-200 transition-all duration-300 flex flex-col fixed h-full z-50 shadow-[1px_0_0_rgba(0,0,0,0.05)]`}>
                <div className="p-6 flex items-center justify-between border-b border-neutral-100">
                    {isSidebarOpen ? (
                        <div className="flex items-center space-x-2 font-black tracking-tight text-neutral-900">
                            <Shield size={20} className="text-neutral-900" />
                            <span className="text-sm uppercase tracking-[0.15em]">Admin Portal</span>
                        </div>
                    ) : (
                        <div className="w-8 h-8 rounded bg-neutral-950 flex items-center justify-center text-white font-bold text-xs">
                            A
                        </div>
                    )}
                    <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1.5 hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800 rounded transition-colors duration-200">
                        {isSidebarOpen ? <X size={16} /> : <Menu size={16} />}
                    </button>
                </div>

                <nav className="flex-1 px-4 space-y-1.5 mt-6">
                    {navItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`flex items-center space-x-3 p-3 rounded-xl transition-all duration-200 relative ${
                                isActive(item.path) 
                                ? 'bg-neutral-900 text-white shadow-sm font-semibold' 
                                : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
                            }`}
                        >
                            <item.icon size={18} className="flex-shrink-0" />
                            {isSidebarOpen && <span className="text-xs uppercase tracking-wider">{item.name}</span>}
                            {item.name === 'Verification Queue' && pendingCount > 0 && (
                                <span className={`absolute right-3 ${isSidebarOpen ? '' : 'top-1 right-1'} bg-red-500 text-white text-[9px] font-black w-5 h-5 flex items-center justify-center rounded-full`}>
                                    {pendingCount > 99 ? '99+' : pendingCount}
                                </span>
                            )}
                        </Link>
                    ))}
                </nav>

                <div className="p-4 border-t border-neutral-100">
                    <button 
                        onClick={logout}
                        className="flex items-center space-x-3 p-3 w-full text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900 rounded-xl transition-all duration-200"
                    >
                        <LogOut size={18} className="flex-shrink-0" />
                        {isSidebarOpen && <span className="text-xs uppercase tracking-wider font-semibold">Logout</span>}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-20'} min-h-screen flex flex-col`}>
                <header className="h-16 bg-white/80 backdrop-blur-md border-b border-neutral-200 flex items-center justify-between px-8 sticky top-0 z-40">
                    <div className="flex items-center text-[10px] font-black uppercase tracking-widest text-neutral-400">
                        <span>System</span>
                        <span className="mx-2">/</span>
                        <span className="text-neutral-900">
                            {location.pathname.split('/').pop() || 'Dashboard'}
                        </span>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                        <div className="text-right">
                            <p className="text-xs font-bold text-neutral-900">{user?.name}</p>
                            <p className="text-[10px] text-neutral-400 capitalize font-medium">{user?.role_type}</p>
                        </div>
                        <div className="w-9 h-9 rounded bg-neutral-950 flex items-center justify-center text-white font-extrabold text-xs shadow-sm">
                            {user?.name?.charAt(0).toUpperCase()}
                        </div>
                    </div>
                </header>

                <div className="p-8 flex-1">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default AdminLayout;
