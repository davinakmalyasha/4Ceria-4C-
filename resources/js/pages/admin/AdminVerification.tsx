import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '../../components/AdminLayout';
import { 
    Check, 
    X, 
    FileText, 
    ExternalLink, 
    AlertCircle,
    User
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';


interface Professional {
    id: number;
    user_id: number;
    nama: string;
    no_telp?: string;
    no_telepon?: string;
    verification_status: string;
    user: {
        name: string;
        email: string;
    }
}

const AdminVerification: React.FC = () => {
    const [professionals, setProfessionals] = useState<{arsiteks: Professional[], kontraktors: Professional[]}>({arsiteks: [], kontraktors: []});
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'arsitek' | 'kontraktor'>('arsitek');
    const [rejectionModal, setRejectionModal] = useState<{id: number, type: string} | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const { showToast } = useToast();


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
                showToast('Status updated successfully', 'success');
            })
            .catch(err => showToast(err.response?.data?.message || 'Error updating status', 'error'));
    };


    const currentList = activeTab === 'arsitek' ? professionals.arsiteks : professionals.kontraktors;

    if (loading) return <AdminLayout><div>Loading...</div></AdminLayout>;

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-100 w-fit">
                    <button 
                        onClick={() => setActiveTab('arsitek')}
                        className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'arsitek' ? 'bg-[#fd1d1d] text-white shadow-lg shadow-red-100' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                        Architects ({professionals.arsiteks.length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('kontraktor')}
                        className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'kontraktor' ? 'bg-[#fd1d1d] text-white shadow-lg shadow-red-100' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                        Constructors ({professionals.kontraktors.length})
                    </button>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-gray-400 font-bold text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Professional</th>
                                <th className="px-6 py-4">Contact</th>
                                <th className="px-6 py-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {currentList.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-6 py-12 text-center text-gray-400 italic">
                                        No pending {activeTab}s to verify.
                                    </td>
                                </tr>
                            ) : (
                                currentList.map((pro) => (
                                    <tr key={pro.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center space-x-3">
                                                <div className="w-10 h-10 rounded-full bg-red-50 text-[#fd1d1d] flex items-center justify-center">
                                                    <User size={20} />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-gray-900">{pro.user.name}</p>
                                                    <p className="text-xs text-gray-500">{pro.user.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-medium text-gray-700">{pro.no_telp || pro.no_telepon || 'No phone'}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center space-x-2">
                                                <button 
                                                    onClick={() => handleStatusUpdate(pro.id, activeTab, 'verified')}
                                                    className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                                                    title="Approve"
                                                >
                                                    <Check size={18} />
                                                </button>
                                                <button 
                                                    onClick={() => setRejectionModal({id: pro.id, type: activeTab})}
                                                    className="p-2 bg-red-50 text-[#fd1d1d] rounded-lg hover:bg-red-100 transition-colors"
                                                    title="Reject"
                                                >
                                                    <X size={18} />
                                                </button>
                                                <button className="p-2 bg-gray-50 text-gray-400 rounded-lg hover:bg-gray-100 transition-colors" title="View Details">
                                                    <FileText size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Rejection Modal */}
                {rejectionModal && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-md p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
                            <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center">
                                <AlertCircle className="text-red-500 mr-2" />
                                Reject Application
                            </h3>
                            <p className="text-gray-500 text-sm mb-6">
                                Please provide a reason for rejecting this application. This will be sent as an email to the professional.
                            </p>
                            <textarea 
                                className="w-full border border-gray-200 rounded-xl p-4 text-sm focus:ring-2 focus:ring-red-100 focus:border-[#fd1d1d] outline-none transition-all placeholder:text-gray-300 h-32"
                                placeholder="e.g. Portfolio documents are incomplete or invalid."
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                            />
                            <div className="flex space-x-3 mt-8">
                                <button 
                                    onClick={() => setRejectionModal(null)}
                                    className="flex-1 py-3 text-gray-500 font-bold text-sm bg-gray-50 rounded-xl hover:bg-gray-100 transition-all"
                                >
                                    Cancel
                                </button>
                                <button 
                                    disabled={!rejectionReason.trim()}
                                    onClick={() => handleStatusUpdate(rejectionModal.id, rejectionModal.type, 'rejected', rejectionReason)}
                                    className="flex-1 py-3 bg-[#fd1d1d] text-white font-bold text-sm rounded-xl hover:bg-red-600 transition-all disabled:opacity-50"
                                >
                                    Confirm Rejection
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
