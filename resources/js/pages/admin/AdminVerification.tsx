import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '../../components/AdminLayout';
import { 
    Check, 
    X, 
    FileText, 
    ExternalLink, 
    AlertCircle,
    User,
    Eye,
    ShieldAlert,
    Clock,
    Download
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface Professional {
    id: number;
    user_id: number;
    nama?: string;
    nama_perusahaan?: string;
    store_name?: string;
    no_telp?: string;
    no_telepon?: string;
    verification_status: string;
    foto?: string;
    file_portofolio?: string;
    file_sertifikat?: string;
    npwp?: string;
    siup?: string;
    user: {
        name: string;
        email: string;
    }
}

const AdminVerification: React.FC = () => {
    const [professionals, setProfessionals] = useState<{
        arsiteks: Professional[];
        kontraktors: Professional[];
        project_managers: Professional[];
        structural_engineers: Professional[];
        mep_engineers: Professional[];
        notaries: Professional[];
        interiors: Professional[];
        suppliers: Professional[];
    }>({
        arsiteks: [],
        kontraktors: [],
        project_managers: [],
        structural_engineers: [],
        mep_engineers: [],
        notaries: [],
        interiors: [],
        suppliers: []
    });
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<string>('arsitek');
    const [rejectionModal, setRejectionModal] = useState<{id: number, type: string} | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [selectedProForDocs, setSelectedProForDocs] = useState<Professional | null>(null);
    const { showToast } = useToast();

    const tabs = [
        { key: 'arsitek', label: 'Architects', dataKey: 'arsiteks' },
        { key: 'kontraktor', label: 'Contractors', dataKey: 'kontraktors' },
        { key: 'project_manager', label: 'PMs', dataKey: 'project_managers' },
        { key: 'notaris', label: 'Notaries', dataKey: 'notaries' },
        { key: 'interior', label: 'Designers', dataKey: 'interiors' },
        { key: 'structural', label: 'Structural', dataKey: 'structural_engineers' },
        { key: 'mep', label: 'MEP', dataKey: 'mep_engineers' },
        { key: 'supplier', label: 'Suppliers', dataKey: 'suppliers' },
    ];

    const fetchProfessionals = () => {
        setLoading(true);
        axios.get('/admin/professionals')
            .then(res => setProfessionals(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchProfessionals();
    }, []);

    const handleStatusUpdate = (id: number, type: string, status: 'verified' | 'rejected', reason?: string) => {
        axios.patch(`/admin/professionals/${type}/${id}/status`, { status, reason })
            .then(() => {
                fetchProfessionals();
                setRejectionModal(null);
                setRejectionReason('');
                setSelectedProForDocs(null); // Close docs modal if open
                showToast(`Professional successfully ${status}`, 'success');
            })
            .catch(err => showToast(err.response?.data?.message || 'Error updating status', 'error'));
    };

    const currentTabConfig = tabs.find(t => t.key === activeTab);
    const currentList = currentTabConfig 
        ? professionals[currentTabConfig.dataKey as keyof typeof professionals] 
        : [];

    const isImageFile = (path: string) => {
        const ext = path.toLowerCase().split('.').pop();
        return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext || '');
    };

    const renderDocumentLink = (label: string, path?: string) => {
        if (!path) return null;
        const fileUrl = `/storage/${path}`;
        const isImg = isImageFile(path);

        return (
            <div className="p-4 bg-gray-50 border border-gray-150 rounded-2xl space-y-2 flex flex-col justify-between">
                <div>
                    <h5 className="text-[10px] font-black uppercase tracking-wider text-gray-500">{label}</h5>
                    <p className="text-[10px] text-gray-400 font-semibold truncate mt-0.5">{path.split('/').pop()}</p>
                </div>
                
                {isImg && (
                    <div className="w-full h-24 rounded-lg overflow-hidden bg-white border border-gray-100 flex items-center justify-center my-2 group relative">
                        <img src={fileUrl} alt={label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Eye className="text-white" size={16} />
                        </div>
                    </div>
                )}

                <a 
                    href={fileUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="w-full mt-2 py-2 px-3 bg-white border hover:bg-gray-100 rounded-xl text-[10px] font-black text-slate-800 flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                >
                    <ExternalLink size={12} /> Open Document
                </a>
            </div>
        );
    };

    if (loading) return <AdminLayout><div className="flex items-center justify-center min-h-[300px]"><Clock className="animate-spin text-red-500 mr-2" /> Loading queue...</div></AdminLayout>;

    return (
        <AdminLayout>
            <div className="space-y-6">
                {/* Horizontal scrollable role tabs */}
                <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100 w-full overflow-x-auto gap-1">
                    {tabs.map((tab) => (
                        <button 
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap shrink-0 ${
                                activeTab === tab.key 
                                ? 'bg-red-600 text-white shadow-md shadow-red-200' 
                                : 'text-gray-500 hover:text-gray-800 hover:bg-neutral-50'
                            }`}
                        >
                            {tab.label} ({professionals[tab.dataKey as keyof typeof professionals]?.length || 0})
                        </button>
                    ))}
                </div>

                {/* Queue table */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-gray-400 font-bold text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Professional / Store</th>
                                <th className="px-6 py-4">Contact</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {currentList.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-6 py-12 text-center text-gray-400 italic font-medium">
                                        No pending {currentTabConfig?.label.toLowerCase()} to verify.
                                    </td>
                                </tr>
                            ) : (
                                currentList.map((pro) => {
                                    const displayName = pro.store_name || pro.nama_perusahaan || pro.nama || pro.user?.name;
                                    
                                    return (
                                        <tr key={pro.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center space-x-3">
                                                    <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center font-bold">
                                                        {pro.foto ? (
                                                            <img src={`/storage/${pro.foto}`} className="w-full h-full rounded-full object-cover" alt="" />
                                                        ) : (
                                                            <User size={18} />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-gray-900 flex items-center gap-1.5">
                                                            {displayName}
                                                            {pro.nama_perusahaan && <span className="text-[9px] bg-zinc-100 border px-1.5 py-0.5 rounded-md font-semibold text-zinc-500 uppercase">Perusahaan</span>}
                                                        </p>
                                                        <p className="text-xs text-gray-500">{pro.user?.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <p className="text-xs font-semibold text-gray-700">{pro.no_telp || pro.no_telepon || 'No phone'}</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center justify-end space-x-2">
                                                    <button 
                                                        onClick={() => handleStatusUpdate(pro.id, activeTab, 'verified')}
                                                        className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors"
                                                        title="Approve"
                                                    >
                                                        <Check size={16} />
                                                    </button>
                                                    <button 
                                                        onClick={() => setRejectionModal({id: pro.id, type: activeTab})}
                                                        className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
                                                        title="Reject"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                    <button 
                                                        onClick={() => setSelectedProForDocs(pro)}
                                                        className="p-2 bg-gray-50 text-gray-500 rounded-xl hover:bg-gray-100 transition-colors flex items-center gap-1 text-xs font-bold"
                                                        title="View Documents"
                                                    >
                                                        <FileText size={16} /> View Details
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Rejection Modal */}
                {rejectionModal && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
                            <h3 className="text-lg font-black text-gray-900 mb-2 flex items-center gap-2">
                                <AlertCircle className="text-red-500" />
                                Reject Application
                            </h3>
                            <p className="text-gray-500 text-xs mb-6 font-semibold">
                                Please provide a reason for rejecting this verification request. This will be sent directly to the professional.
                            </p>
                            <textarea 
                                className="w-full border border-gray-200 rounded-2xl p-4 text-xs font-semibold focus:ring-2 focus:ring-red-100 focus:border-red-500 outline-none transition-all placeholder:text-gray-300 h-28 resize-none"
                                placeholder="e.g. Portfolio documents are incomplete or invalid."
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                            />
                            <div className="flex space-x-3 mt-6">
                                <button 
                                    onClick={() => setRejectionModal(null)}
                                    className="flex-1 py-3 text-gray-500 font-bold text-xs bg-gray-50 rounded-xl hover:bg-gray-100 transition-all"
                                >
                                    Cancel
                                </button>
                                <button 
                                    disabled={!rejectionReason.trim()}
                                    onClick={() => handleStatusUpdate(rejectionModal.id, rejectionModal.type, 'rejected', rejectionReason)}
                                    className="flex-1 py-3 bg-red-600 text-white font-bold text-xs rounded-xl hover:bg-red-700 transition-all disabled:opacity-50"
                                >
                                    Confirm Rejection
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Document Details Modal */}
                {selectedProForDocs && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
                        <div className="bg-white rounded-3xl w-full max-w-3xl p-8 shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
                            <div className="flex justify-between items-start border-b border-gray-100 pb-4 mb-6">
                                <div>
                                    <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                        <FileText className="text-red-500" />
                                        Credentials Verification
                                    </h3>
                                    <p className="text-xs text-gray-400 font-semibold mt-1">
                                        Inspect documents for <span className="text-gray-700 font-extrabold">{selectedProForDocs.store_name || selectedProForDocs.nama_perusahaan || selectedProForDocs.nama || selectedProForDocs.user?.name}</span> ({tabs.find(t => t.key === activeTab)?.label})
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setSelectedProForDocs(null)}
                                    className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Profile Photo Link */}
                                {renderDocumentLink("Profile Photo / Logo", selectedProForDocs.foto)}

                                {/* Portfolio document / NPWP */}
                                {renderDocumentLink("Portfolio PDF Document", selectedProForDocs.file_portofolio)}
                                {renderDocumentLink("NPWP Tax Registration", selectedProForDocs.npwp)}

                                {/* Certificate / SIUP */}
                                {renderDocumentLink("Certificate SK / License", selectedProForDocs.file_sertifikat)}
                                {renderDocumentLink("SIUP Business License", selectedProForDocs.siup)}
                            </div>

                            {/* Fallback if no files uploaded */}
                            {!selectedProForDocs.foto && !selectedProForDocs.file_portofolio && !selectedProForDocs.file_sertifikat && !selectedProForDocs.npwp && !selectedProForDocs.siup && (
                                <div className="py-12 border border-dashed rounded-2xl flex flex-col items-center justify-center text-gray-400 gap-2 bg-gray-50">
                                    <ShieldAlert size={36} className="text-gray-300" />
                                    <p className="text-xs font-bold">No credential documents uploaded by this user.</p>
                                </div>
                            )}

                            {/* Modal Actions */}
                            <div className="flex items-center justify-end space-x-3 mt-8 pt-6 border-t border-gray-100">
                                <button 
                                    onClick={() => setRejectionModal({id: selectedProForDocs.id, type: activeTab})}
                                    className="px-5 py-3 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                                >
                                    <X size={14} /> Reject Application
                                </button>
                                <button 
                                    onClick={() => handleStatusUpdate(selectedProForDocs.id, activeTab, 'verified')}
                                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-md shadow-emerald-100"
                                >
                                    <Check size={14} /> Approve & Verify Account
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
};

export default AdminVerification;
