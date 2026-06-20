import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '../../components/AdminLayout';
import { Pagination } from '../../components/Common/Pagination';
import { 
    Briefcase, 
    User, 
    AlertCircle,
    CheckCircle2,
    Clock,
    DollarSign,
    ShieldAlert,
    RefreshCw,
    XCircle,
    Search
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

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
    const [searchTerm, setSearchTerm] = useState('');
    const [terminatingProjectId, setTerminatingProjectId] = useState<number | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [totalProjects, setTotalProjects] = useState(0);
    const [fromProject, setFromProject] = useState(0);
    const [toProject, setToProject] = useState(0);
    const { showToast } = useToast();

    const fetchProjects = (page = 1) => {
        setLoading(true);
        axios.get('/admin/projects', {
            params: {
                page,
                search: searchTerm || undefined
            }
        })
            .then(res => {
                setProjects(res.data.data);
                setCurrentPage(res.data.current_page);
                setLastPage(res.data.last_page);
                setTotalProjects(res.data.total);
                setFromProject(res.data.from || 0);
                setToProject(res.data.to || 0);
            })
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        const handler = setTimeout(() => {
            fetchProjects(1);
        }, 300);
        return () => clearTimeout(handler);
    }, [searchTerm]);

    const handlePageChange = (page: number) => {
        fetchProjects(page);
    };

    const handleForceTerminate = (project: Project) => {
        if (!window.confirm(`Are you absolutely sure you want to force-terminate project "${project.title}"? This cannot be undone.`)) {
            return;
        }

        setTerminatingProjectId(project.id);
        axios.post(`/admin/projects/${project.id}/force-terminate`)
            .then(res => {
                showToast(res.data.message, 'success');
                setProjects(prev => prev.map(p => p.id === project.id ? { ...p, status: 'cancelled' } : p));
            })
            .catch(err => showToast(err.response?.data?.message || 'Termination failed', 'error'))
            .finally(() => setTerminatingProjectId(null));
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircle2 className="text-neutral-900" size={14} />;
            case 'active': return <Clock className="text-neutral-500" size={14} />;
            case 'cancelled': return <XCircle className="text-neutral-400" size={14} />;
            default: return <AlertCircle className="text-neutral-300" size={14} />;
        }
    };

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-900">Projects Operations Audit</h3>
                        <p className="text-[11px] text-neutral-400 font-semibold mt-0.5">Audit live building contracts, view fee structures, and force terminate disputed items.</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={14} />
                            <input 
                                type="text" 
                                placeholder="Search projects or clients..." 
                                className="pl-9 pr-4 py-2 border border-neutral-200 bg-[#fafafa] rounded-xl text-xs font-semibold placeholder:text-neutral-300 focus:bg-white focus:ring-1 focus:ring-neutral-950 focus:border-neutral-950 outline-none transition-all w-full sm:w-64"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <button onClick={() => fetchProjects(currentPage)} className="p-2 border border-neutral-200 bg-[#fafafa] hover:bg-neutral-50 rounded-xl text-neutral-500 hover:text-neutral-900 transition-colors">
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-neutral-50 text-[10px] font-black uppercase tracking-wider text-neutral-400 border-b border-neutral-100">
                                <th className="px-6 py-3.5">Contract Operations</th>
                                <th className="px-6 py-3.5">Client</th>
                                <th className="px-6 py-3.5">Assigned Specialist</th>
                                <th className="px-6 py-3.5">Budget</th>
                                <th className="px-6 py-3.5">Lifecycle Status</th>
                                <th className="px-6 py-3.5 text-right">Moderator Controls</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 text-xs">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-neutral-400 italic">
                                        Loading platform operational logs...
                                    </td>
                                </tr>
                            ) : projects.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-neutral-400 italic">
                                        No active building projects found.
                                    </td>
                                </tr>
                            ) : (
                                projects.map((project) => (
                                    <tr key={project.id} className="hover:bg-neutral-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center space-x-3">
                                                <div className="w-9 h-9 rounded bg-neutral-50 border border-neutral-100 text-neutral-700 flex items-center justify-center shrink-0">
                                                    <Briefcase size={16} />
                                                </div>
                                                <p className="font-extrabold text-neutral-900 truncate max-w-xs">{project.title}</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center space-x-2 text-neutral-700 font-bold">
                                                <User size={13} className="text-neutral-400" />
                                                <span>{project.user?.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-semibold text-neutral-500 italic">
                                            {project.selected_arsitek?.nama || project.selected_kontraktor?.nama_perusahaan || 'No Specialist Hired'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="font-extrabold text-neutral-900 flex items-center">
                                                <DollarSign size={13} className="text-neutral-400 mr-0.5" />
                                                {Number(project.budget).toLocaleString()}
                                            </p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center space-x-2">
                                                {getStatusIcon(project.status)}
                                                <span className={`text-[10px] font-black uppercase tracking-wider ${project.status === 'cancelled' ? 'text-neutral-400' : 'text-neutral-800'}`}>
                                                    {project.status}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {project.status !== 'cancelled' && project.status !== 'completed' ? (
                                                <button
                                                    disabled={project.id === terminatingProjectId}
                                                    onClick={() => handleForceTerminate(project)}
                                                    className="px-3 py-1.5 bg-neutral-950 hover:bg-neutral-900 text-white rounded-xl font-bold uppercase tracking-wider text-[10px] shadow-sm disabled:opacity-50 inline-flex items-center gap-1"
                                                >
                                                    <ShieldAlert size={11} /> Force Terminate
                                                </button>
                                            ) : (
                                                <span className="text-[10px] text-neutral-300 font-black uppercase tracking-wider select-none">
                                                    Archived
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                    <Pagination
                        currentPage={currentPage}
                        lastPage={lastPage}
                        total={totalProjects}
                        from={fromProject}
                        to={toProject}
                        onPageChange={handlePageChange}
                    />
                </div>
            </div>
        </AdminLayout>
    );
};

export default AdminProjects;
