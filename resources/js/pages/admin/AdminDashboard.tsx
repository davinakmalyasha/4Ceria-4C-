import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '../../components/AdminLayout';
import { Pagination } from '../../components/Common/Pagination';
import { 
    Users, 
    Home, 
    Briefcase, 
    Clock, 
    Search,
    ShieldAlert,
    RefreshCw
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface Stats {
    total_users: number;
    total_houses: number;
    total_projects: number;
    pending_verifications: number;
    active_projects: number;
    role_distribution: Record<string, number>;
}

interface UserRecord {
    id: number;
    name: string;
    username: string;
    email: string;
    role_type: string;
    is_suspended: boolean;
    created_at: string;
}

const AdminDashboard: React.FC = () => {
    const [stats, setStats] = useState<Stats | null>(null);
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [loadingStats, setLoadingStats] = useState(true);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [totalUsers, setTotalUsers] = useState(0);
    const [fromUser, setFromUser] = useState(0);
    const [toUser, setToUser] = useState(0);
    const { showToast } = useToast();

    const fetchStats = () => {
        setLoadingStats(true);
        axios.get('/admin/stats')
            .then(res => setStats(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoadingStats(false));
    };

    const fetchUsers = (page = 1) => {
        setLoadingUsers(true);
        axios.get('/admin/users', {
            params: {
                page,
                search: search || undefined,
                role: roleFilter || undefined
            }
        })
            .then(res => {
                setUsers(res.data.data);
                setCurrentPage(res.data.current_page);
                setLastPage(res.data.last_page);
                setTotalUsers(res.data.total);
                setFromUser(res.data.from || 0);
                setToUser(res.data.to || 0);
            })
            .catch(err => console.error(err))
            .finally(() => setLoadingUsers(false));
    };

    useEffect(() => {
        fetchStats();
    }, []);

    useEffect(() => {
        const handler = setTimeout(() => {
            fetchUsers(1);
        }, 300);
        return () => clearTimeout(handler);
    }, [search, roleFilter]);

    const handlePageChange = (page: number) => {
        fetchUsers(page);
    };

    const handleToggleSuspend = (targetUser: UserRecord) => {
        setUpdatingUserId(targetUser.id);
        axios.patch(`/admin/users/${targetUser.id}/suspend`)
            .then(res => {
                showToast(res.data.message, 'success');
                setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, is_suspended: !u.is_suspended } : u));
                fetchStats();
            })
            .catch(err => showToast(err.response?.data?.message || 'Action failed', 'error'))
            .finally(() => setUpdatingUserId(null));
    };

    const handleRoleChange = (targetUser: UserRecord, newRole: string) => {
        setUpdatingUserId(targetUser.id);
        axios.patch(`/admin/users/${targetUser.id}/role`, { role_type: newRole })
            .then(res => {
                showToast(res.data.message, 'success');
                setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, role_type: newRole } : u));
                fetchStats();
            })
            .catch(err => showToast(err.response?.data?.message || 'Role modification failed', 'error'))
            .finally(() => setUpdatingUserId(null));
    };

    const sortedUsers = [...users].sort((a, b) => {
        if (sortOrder === 'asc') {
            return a.name.localeCompare(b.name);
        } else {
            return b.name.localeCompare(a.name);
        }
    });

    const statCards = [
        { title: 'Total Registered Users', value: stats?.total_users, icon: Users },
        { title: 'Properties Listed', value: stats?.total_houses, icon: Home },
        { title: 'Active Operations', value: stats?.active_projects, icon: Briefcase },
        { title: 'Pending Credentials Verification', value: stats?.pending_verifications, icon: Clock, alert: (stats?.pending_verifications || 0) > 0 },
    ];

    return (
        <AdminLayout>
            <div className="space-y-8">
                {/* Visual Statistics Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {statCards.map((card, idx) => (
                        <div key={idx} className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between">
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{card.title}</p>
                                <div className="flex items-center space-x-2">
                                    <h3 className="text-3xl font-black tracking-tight text-neutral-900">
                                        {loadingStats ? '...' : card.value}
                                    </h3>
                                    {card.alert && (
                                        <span className="flex h-2 w-2 relative">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neutral-950 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-neutral-950"></span>
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-neutral-50 border border-neutral-100 flex items-center justify-center text-neutral-800">
                                <card.icon size={20} />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Role Breakdown Distribution */}
                <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mb-4">Platform Role Breakdown</h4>
                    {loadingStats ? (
                        <div className="text-xs text-neutral-450 italic">Calculating...</div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
                            {Object.entries(stats?.role_distribution || {}).map(([role, count]) => (
                                <div key={role} className="p-4 bg-neutral-50 border border-neutral-100 rounded-xl text-center">
                                    <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest truncate">{role.replace('_', ' ')}</p>
                                    <p className="text-xl font-extrabold text-neutral-900 mt-1">{count}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Unified User Directory Management Console */}
                <div className="bg-white rounded-2xl border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
                    <div className="p-6 border-b border-neutral-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-900">Platform User Directory</h3>
                            <p className="text-[11px] text-neutral-400 font-semibold mt-0.5">Audit, suspend, or update permissions of any system account.</p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3">
                            {/* Search bar */}
                            <div className="relative">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={14} />
                                <input 
                                    type="text" 
                                    placeholder="Search user..."
                                    className="pl-9 pr-4 py-2 border border-neutral-200 bg-[#fafafa] rounded-xl text-xs font-semibold placeholder:text-neutral-300 focus:bg-white focus:ring-1 focus:ring-neutral-950 focus:border-neutral-950 outline-none transition-all w-full sm:w-56"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                            </div>

                            {/* Filter Role */}
                            <select
                                className="px-4 py-2 border border-neutral-200 bg-[#fafafa] rounded-xl text-xs font-semibold focus:bg-white focus:ring-1 focus:ring-neutral-950 focus:border-neutral-950 outline-none transition-all cursor-pointer"
                                value={roleFilter}
                                onChange={e => setRoleFilter(e.target.value)}
                            >
                                <option value="">All Roles</option>
                                <option value="user">Client</option>
                                <option value="arsitek">Architect</option>
                                <option value="kontraktor">Contractor</option>
                                <option value="notaris">Notary</option>
                                <option value="interior">Interior Designer</option>
                                <option value="project_manager">Project Manager</option>
                                <option value="supplier">Supplier</option>
                                <option value="logistics">Logistics Courier</option>
                            </select>

                            {/* Sort Order (A-Z / Z-A) */}
                            <select
                                className="px-4 py-2 border border-neutral-200 bg-[#fafafa] rounded-xl text-xs font-semibold focus:bg-white focus:ring-1 focus:ring-neutral-950 focus:border-neutral-950 outline-none transition-all cursor-pointer"
                                value={sortOrder}
                                onChange={e => setSortOrder(e.target.value as 'asc' | 'desc')}
                            >
                                <option value="asc">A - Z</option>
                                <option value="desc">Z - A</option>
                            </select>

                            <button onClick={() => { fetchStats(); fetchUsers(currentPage); }} className="p-2 border border-neutral-200 bg-[#fafafa] hover:bg-neutral-50 rounded-xl text-neutral-500 hover:text-neutral-900 transition-colors">
                                <RefreshCw size={14} className={loadingUsers ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-neutral-50 text-[10px] font-black uppercase tracking-wider text-neutral-400 border-b border-neutral-100">
                                    <th className="px-6 py-3.5">Account Info</th>
                                    <th className="px-6 py-3.5">Assigned Role</th>
                                    <th className="px-6 py-3.5">Status</th>
                                    <th className="px-6 py-3.5 text-right">Moderator Controls</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100 text-xs">
                                {loadingUsers ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-neutral-400 italic">
                                            Retrieving operational roster...
                                        </td>
                                    </tr>
                                ) : users.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-neutral-400 italic">
                                            No user records found matching filters.
                                        </td>
                                    </tr>
                                ) : (
                                    sortedUsers.map(u => (
                                        <tr key={u.id} className="hover:bg-neutral-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-extrabold text-neutral-900">{u.name}</div>
                                                <div className="text-[10px] text-neutral-400 font-semibold mt-0.5">@{u.username} • {u.email}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <select
                                                    disabled={u.id === updatingUserId}
                                                    value={u.role_type}
                                                    onChange={e => handleRoleChange(u, e.target.value)}
                                                    className="border border-neutral-200 bg-white px-2.5 py-1 rounded-lg text-xs font-bold text-neutral-700 outline-none focus:ring-1 focus:ring-neutral-950 transition-all disabled:opacity-50 cursor-pointer"
                                                >
                                                    <option value="user">Client</option>
                                                    <option value="arsitek">Architect</option>
                                                    <option value="kontraktor">Contractor</option>
                                                    <option value="admin">System Admin</option>
                                                    <option value="notaris">Notary</option>
                                                    <option value="interior">Interior</option>
                                                    <option value="project_manager">Project Manager</option>
                                                    <option value="supplier">Supplier</option>
                                                    <option value="logistics">Logistics</option>
                                                </select>
                                            </td>
                                            <td className="px-6 py-4">
                                                {u.is_suspended ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-950 text-white rounded-lg text-[9px] font-black uppercase tracking-wider shadow-sm">
                                                        <ShieldAlert size={10} /> Suspended
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-100 text-neutral-800 border rounded-lg text-[9px] font-black uppercase tracking-wider">
                                                        Active
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    disabled={u.id === updatingUserId}
                                                    onClick={() => handleToggleSuspend(u)}
                                                    className={`px-3 py-1.5 rounded-xl font-bold uppercase tracking-wider text-[10px] transition-all disabled:opacity-50 ${
                                                        u.is_suspended
                                                        ? 'bg-neutral-150 hover:bg-neutral-200 text-neutral-800 border border-neutral-300'
                                                        : 'bg-neutral-950 hover:bg-neutral-900 text-white shadow-sm'
                                                    }`}
                                                >
                                                    {u.is_suspended ? 'Reactivate Account' : 'Suspend Account'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    <Pagination
                        currentPage={currentPage}
                        lastPage={lastPage}
                        total={totalUsers}
                        from={fromUser}
                        to={toUser}
                        onPageChange={handlePageChange}
                    />
                </div>
            </div>
        </AdminLayout>
    );
};

export default AdminDashboard;
