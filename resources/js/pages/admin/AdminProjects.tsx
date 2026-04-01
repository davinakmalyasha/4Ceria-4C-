import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '../../components/AdminLayout';
import { 
    Briefcase, 
    User, 
    AlertCircle,
    CheckCircle2,
    Clock,
    DollarSign
} from 'lucide-react';

interface Project {
    id: number;
    title: string;
    status: string;
    budget: number;
    user: { name: string };
    selected_arsitek?: { nama: string };
    selected_kontraktor?: { nama_perusahaan: string };
    created_at: string;
}

const AdminProjects: React.FC = () => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        axios.get('/admin/projects')
            .then(res => setProjects(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, []);

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircle2 className="text-green-500" size={16} />;
            case 'active': return <Clock className="text-blue-500" size={16} />;
            default: return <AlertCircle className="text-gray-400" size={16} />;
        }
    };

    if (loading) return <AdminLayout><div>Loading...</div></AdminLayout>;

    return (
        <AdminLayout>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-gray-400 font-bold text-xs uppercase tracking-wider">
                        <tr>
                            <th className="px-6 py-4">Project</th>
                            <th className="px-6 py-4">Client</th>
                            <th className="px-6 py-4">Professional</th>
                            <th className="px-6 py-4">Budget</th>
                            <th className="px-6 py-4">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {projects.map((project) => (
                            <tr key={project.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                                            <Briefcase size={20} />
                                        </div>
                                        <p className="font-bold text-gray-900 truncate max-w-xs">{project.title}</p>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center space-x-2 text-gray-600">
                                        <User size={14} />
                                        <span className="text-sm">{project.user.name}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-xs font-medium text-gray-500 italic">
                                        {project.selected_arsitek?.nama || project.selected_kontraktor?.nama_perusahaan || 'Unassigned'}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <p className="text-sm font-bold text-gray-900 flex items-center">
                                        <DollarSign size={14} className="text-green-500 mr-1" />
                                        {Number(project.budget).toLocaleString()}
                                    </p>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center space-x-2">
                                        {getStatusIcon(project.status)}
                                        <span className="text-xs font-bold uppercase tracking-wide text-gray-600">{project.status}</span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </AdminLayout>
    );
};

export default AdminProjects;
