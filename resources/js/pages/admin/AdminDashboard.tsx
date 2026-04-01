import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '../../components/AdminLayout';
import { 
    Users, 
    Home, 
    Briefcase, 
    Clock, 
    CheckCircle, 
    TrendingUp 
} from 'lucide-react';

interface Stats {
    total_users: number;
    total_houses: number;
    total_projects: number;
    pending_verifications: number;
    active_projects: number;
}

const AdminDashboard: React.FC = () => {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        axios.get('/admin/stats')
            .then(res => setStats(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, []);

    const cards = [
        { title: 'Total Users', value: stats?.total_users, icon: Users, color: 'bg-blue-500' },
        { title: 'Active Projects', value: stats?.active_projects, icon: Briefcase, color: 'bg-green-500' },
        { title: 'Total Houses', value: stats?.total_houses, icon: Home, color: 'bg-purple-500' },
        { title: 'Pending Verifications', value: stats?.pending_verifications, icon: Clock, color: 'bg-orange-500', alert: (stats?.pending_verifications || 0) > 0 },
    ];

    if (loading) return <AdminLayout><div>Loading...</div></AdminLayout>;

    return (
        <AdminLayout>
            <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {cards.map((card, index) => (
                        <div key={index} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center space-x-4">
                            <div className={`${card.color} p-3 rounded-xl text-white`}>
                                <card.icon size={24} />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 font-medium">{card.title}</p>
                                <div className="flex items-center space-x-2">
                                    <h3 className="text-2xl font-bold text-gray-900">{card.value}</h3>
                                    {card.alert && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
                    {/* Placeholder for charts or recent activity */}
                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
                            <TrendingUp className="mr-2 text-red-500" size={20} />
                            Platform Growth
                        </h3>
                        <div className="h-48 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 italic">
                            Activity tracking coming soon...
                        </div>
                    </div>

                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
                            <CheckCircle className="mr-2 text-green-500" size={20} />
                            Quick Actions
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <button className="p-4 bg-red-50 rounded-xl text-[#fd1d1d] font-bold text-sm hover:bg-red-100 transition-colors">
                                Review Verifications
                            </button>
                            <button className="p-4 bg-blue-50 rounded-xl text-blue-600 font-bold text-sm hover:bg-blue-100 transition-colors">
                                System Audit
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

export default AdminDashboard;
