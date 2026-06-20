import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useLocation, Link } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import { Pagination } from '../../components/Common/Pagination';
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
    Download,
    Ruler,
    HardHat,
    Briefcase,
    Scale,
    Paintbrush,
    Activity,
    Wrench,
    Store,
    Hammer,
    Cpu,
    Zap,
    Droplets,
    Home,
    Sparkles,
    Truck,
    Package
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
    entity_type?: 'individual' | 'company';
    company_name?: string;
    company_license?: string;
    identity_number?: string;
    npwp_number?: string;
    siup_number?: string;
    vehicle_type?: string;
    license_plate?: string;
    is_active?: boolean;
    user: {
        name: string;
        email: string;
    }
}

const AdminVerification: React.FC = () => {
    const [professionals, setProfessionals] = useState<{
        arsiteks: Professional[];
        kontraktors: Professional[];
        civil_contractors: Professional[];
        mechanical_contractors: Professional[];
        electrical_contractors: Professional[];
        plumbing_contractors: Professional[];
        roofing_contractors: Professional[];
        finishing_contractors: Professional[];
        project_managers: Professional[];
        structural_engineers: Professional[];
        mep_engineers: Professional[];
        notaries: Professional[];
        interiors: Professional[];
        suppliers: Professional[];
        logistics: Professional[];
    }>({
        arsiteks: [],
        kontraktors: [],
        civil_contractors: [],
        mechanical_contractors: [],
        electrical_contractors: [],
        plumbing_contractors: [],
        roofing_contractors: [],
        finishing_contractors: [],
        project_managers: [],
        structural_engineers: [],
        mep_engineers: [],
        notaries: [],
        interiors: [],
        suppliers: [],
        logistics: []
    });
    const [loading, setLoading] = useState(true);
    const location = useLocation();
    const [activeTab, setActiveTab] = useState<string>('arsitek');

    useEffect(() => {
        if (location.pathname === '/admin/verification/logs') {
            setActiveTab('history');
        } else {
            setActiveTab(prev => prev === 'history' ? 'arsitek' : prev);
        }
    }, [location.pathname]);

    const [rejectionModal, setRejectionModal] = useState<{id: number, type: string} | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [selectedProForDocs, setSelectedProForDocs] = useState<Professional | null>(null);
    const [approvalConfirmation, setApprovalConfirmation] = useState<{id: number, name: string, type: string} | null>(null);
    const [historyList, setHistoryList] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [lastPage, setLastPage] = useState<number>(1);
    const [totalHistory, setTotalHistory] = useState<number>(0);
    const [historyFrom, setHistoryFrom] = useState<number>(0);
    const [historyTo, setHistoryTo] = useState<number>(0);
    const [sendEmailNotify, setSendEmailNotify] = useState(true);
    const [sendWANotify, setSendWANotify] = useState(true);
    const { showToast } = useToast();

    const tabs = [
        { key: 'arsitek', label: 'Architects', dataKey: 'arsiteks', icon: Ruler },
        { key: 'kontraktor', label: 'Contractors', dataKey: 'kontraktors', icon: HardHat },
        { key: 'civil', label: 'Civil Specialty', dataKey: 'civil_contractors', icon: Hammer },
        { key: 'mechanical', label: 'Mechanical', dataKey: 'mechanical_contractors', icon: Cpu },
        { key: 'electrical', label: 'Electrical', dataKey: 'electrical_contractors', icon: Zap },
        { key: 'plumbing', label: 'Plumbing', dataKey: 'plumbing_contractors', icon: Droplets },
        { key: 'roofing', label: 'Roofing', dataKey: 'roofing_contractors', icon: Home },
        { key: 'finishing', label: 'Finishing', dataKey: 'finishing_contractors', icon: Sparkles },
        { key: 'project_manager', label: 'PMs', dataKey: 'project_managers', icon: Briefcase },
        { key: 'notaris', label: 'Notaries', dataKey: 'notaries', icon: Scale },
        { key: 'interior', label: 'Designers', dataKey: 'interiors', icon: Paintbrush },
        { key: 'structural', label: 'Structural', dataKey: 'structural_engineers', icon: Activity },
        { key: 'mep', label: 'MEP', dataKey: 'mep_engineers', icon: Wrench },
        { key: 'supplier', label: 'Suppliers', dataKey: 'suppliers', icon: Store },
        { key: 'logistics', label: 'Logistics', dataKey: 'logistics', icon: Truck },
        { key: 'history', label: 'History Logs', dataKey: 'history', icon: FileText },
    ];

    const fetchProfessionals = () => {
        setLoading(true);
        axios.get('/admin/professionals')
            .then(res => setProfessionals(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    };

    const fetchHistory = (page = 1) => {
        setLoadingHistory(true);
        axios.get('/admin/professionals/history', { params: { page } })
            .then(res => {
                setHistoryList(res.data.data);
                setCurrentPage(res.data.current_page);
                setLastPage(res.data.last_page);
                setTotalHistory(res.data.total);
                setHistoryFrom(res.data.from || 0);
                setHistoryTo(res.data.to || 0);
            })
            .catch(err => console.error(err))
            .finally(() => setLoadingHistory(false));
    };

    useEffect(() => {
        fetchProfessionals();
        fetchHistory(1);
    }, []);

    useEffect(() => {
        if (activeTab === 'history') {
            fetchHistory(1);
        }
    }, [activeTab]);

    const handleStatusUpdate = (
        id: number, 
        type: string, 
        status: 'verified' | 'rejected', 
        reason?: string,
        sendEmail: boolean = true,
        sendWA: boolean = false,
        phone: string = '',
        name: string = ''
    ) => {
        axios.patch(`/admin/professionals/${type}/${id}/status`, { 
            status, 
            reason, 
            send_email: sendEmail 
        })
            .then(() => {
                fetchProfessionals();
                fetchHistory();
                setRejectionModal(null);
                setRejectionReason('');
                setSelectedProForDocs(null); // Close docs modal if open
                showToast(`Professional successfully ${status}`, 'success');

                // Trigger WhatsApp click-to-chat if approved and sendWA is true and phone exists
                if (status === 'verified' && sendWA && phone) {
                    const cleanPhone = phone.replace(/\D/g, '');
                    const formattedPhone = cleanPhone.startsWith('0') 
                        ? '62' + cleanPhone.slice(1) 
                        : cleanPhone.startsWith('8') 
                            ? '62' + cleanPhone 
                            : cleanPhone;

                    const roleLabel = tabs.find(t => t.key === type)?.label || 'Professional';
                    const message = `Halo ${name}, berkas pengajuan verifikasi Anda sebagai ${roleLabel} di platform 4Ceria telah DISETUJUI! 🎉 Selamat bergabung! Anda sekarang dapat mulai melakukan penawaran proyek dan mengakses seluruh fitur profesional. Silakan masuk ke Dashboard Anda: ${window.location.origin}/dashboard`;
                    
                    const waUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`;
                    window.open(waUrl, '_blank');
                }
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

    const SecureDocumentLink: React.FC<{
        label: string;
        path?: string;
        profileId: number;
        type: string;
        field: string;
    }> = ({ label, path, profileId, type, field }) => {
        const [fileUrl, setFileUrl] = useState<string | null>(null);
        const [loading, setLoading] = useState<boolean>(false);
        const [error, setError] = useState<boolean>(false);

        useEffect(() => {
            if (!path) return;

            if (field === 'foto') {
                setFileUrl(`/storage/${path}`);
                return;
            }

            setLoading(true);
            axios.get(`/verifications/documents/${type}/${profileId}/${field}`)
                .then(res => {
                    setFileUrl(res.data.url);
                    setLoading(false);
                })
                .catch(err => {
                    console.error("Failed to load secure document URL", err);
                    setError(true);
                    setLoading(false);
                });
        }, [path, profileId, type, field]);

        if (!path) return null;

        const isImg = isImageFile(path);
        const ext = path.split('.').pop();
        const displayFilename = `${label.replace('Profile Photo / Logo', 'Profile_Photo').replace('Portfolio PDF Document', 'Portfolio_Document').replace('NPWP Tax Registration', 'NPWP_Tax_Document').replace('Certificate SK / License', 'License_Certificate_Document').replace('SIUP Business License', 'SIUP_Business_Document').replace('Current', 'Profile').replace('File', '').replace('Document', '').trim().replace(/\s+/g, '_')}_Document.${ext}`;

        return (
            <div className="p-4 bg-gray-50 border border-gray-150 rounded-2xl space-y-2 flex flex-col justify-between min-h-[140px]">
                <div>
                    <h5 className="text-[10px] font-black uppercase tracking-wider text-gray-500">{label}</h5>
                    <p className="text-[10px] text-gray-400 font-semibold truncate mt-0.5">{displayFilename}</p>
                </div>
                
                {loading && (
                    <div className="flex flex-col items-center justify-center my-3 py-2 text-gray-400">
                        <Clock className="animate-spin text-neutral-800" size={16} />
                        <span className="text-[9px] font-bold uppercase mt-1">Securing...</span>
                    </div>
                )}

                {error && (
                    <div className="text-center my-3 py-2 text-red-500">
                        <span className="text-[9px] font-black uppercase">Failed to load preview</span>
                    </div>
                )}

                {!loading && !error && fileUrl && (
                    <>
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
                    </>
                )}
            </div>
        );
    };

    if (loading) return <AdminLayout><div className="flex items-center justify-center min-h-[300px]"><Clock className="animate-spin text-red-500 mr-2" /> Loading queue...</div></AdminLayout>;

    return (
        <AdminLayout>
            <div className="space-y-6">
                {/* Page Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 pb-5">
                    <div>
                        <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-900">Credentials Verification</h3>
                        <p className="text-[11px] text-neutral-400 font-semibold mt-0.5">
                            {activeTab === 'history' 
                                ? 'Review historical audit records of approved or rejected professional profiles.' 
                                : 'Inspect uploaded certificates, NPWP tax IDs, and SIUP permits to verify professional accounts.'}
                        </p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <Link 
                            to={activeTab === 'history' ? '/admin/verification' : '/admin/verification/logs'}
                            className={`px-4 py-2 border rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm ${
                                activeTab === 'history' 
                                ? 'bg-neutral-950 text-white border-neutral-950 hover:bg-neutral-900' 
                                : 'bg-white text-neutral-800 border-neutral-200 hover:bg-neutral-50'
                            }`}
                        >
                            {activeTab === 'history' ? '← Back to Queue' : `View History Logs (${totalHistory})`}
                        </Link>
                    </div>
                </div>

                {/* Responsive Category Grid (only visible when not viewing history logs) */}
                {activeTab !== 'history' && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 gap-3 animate-in fade-in duration-300">
                        {tabs.filter(t => t.key !== 'history').map((tab) => {
                            const IconComponent = tab.icon;
                            const count = professionals[tab.dataKey as keyof typeof professionals]?.length || 0;
                            const isActive = activeTab === tab.key;
                            
                            return (
                                <button 
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    className={`group p-4 rounded-2xl border flex flex-col items-center justify-between min-h-[92px] transition-all relative ${
                                        isActive 
                                        ? 'bg-neutral-950 text-white border-neutral-950 shadow-md scale-[1.02]' 
                                        : 'bg-[#fafafa] text-neutral-500 border-neutral-200/60 hover:bg-neutral-100/40 hover:text-neutral-850 hover:border-neutral-300'
                                    }`}
                                >
                                    <IconComponent 
                                        size={18} 
                                        className={`transition-colors duration-200 ${
                                            isActive ? 'text-white' : 'text-neutral-400 group-hover:text-neutral-800'
                                        }`} 
                                    />
                                    
                                    <span className="text-[10px] font-black uppercase tracking-wider mt-2.5 text-center leading-none">
                                        {tab.label}
                                    </span>
                                    
                                    {count > 0 ? (
                                        <span className={`mt-2 px-2 py-0.5 rounded-full text-[9px] font-black uppercase border tracking-tighter ${
                                            isActive 
                                            ? 'bg-white text-neutral-950 border-white' 
                                            : 'bg-red-50 text-red-600 border-red-100'
                                        }`}>
                                            {count} Pending
                                        </span>
                                    ) : (
                                        <span className={`mt-2 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                            isActive 
                                            ? 'bg-neutral-800 text-neutral-400' 
                                            : 'bg-neutral-100 text-neutral-450'
                                        }`}>
                                            0
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Main Table Content */}
                {activeTab === 'history' ? (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-in fade-in duration-200">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-gray-400 font-bold text-xs uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4">Professional / Store</th>
                                    <th className="px-6 py-4">Role</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Details / Reason</th>
                                    <th className="px-6 py-4 text-right">Moderated At</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loadingHistory ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic font-medium">
                                            <div className="flex items-center justify-center gap-2">
                                                <Clock className="animate-spin text-neutral-800" size={16} />
                                                <span>Loading history logs...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : historyList.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic font-medium">
                                            No verification history recorded yet.
                                        </td>
                                    </tr>
                                ) : (
                                    historyList.map((log, index) => {
                                        const initials = log.name.split(' ').filter(Boolean).map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
                                        const formattedDate = new Date(log.audited_at).toLocaleDateString('id-ID', {
                                            day: 'numeric',
                                            month: 'short',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        });

                                        return (
                                            <tr key={`${log.type}-${log.id}-${index}`} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center space-x-3">
                                                        <div className="w-10 h-10 rounded-full bg-neutral-100 text-neutral-600 flex items-center justify-center font-bold text-xs">
                                                            {initials}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-gray-900">{log.name}</p>
                                                            <p className="text-xs text-gray-500">{log.email}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-xs font-semibold text-gray-700">{log.role_label}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {log.status === 'verified' ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-wider border border-emerald-100">
                                                            <Check size={10} strokeWidth={3} /> Verified
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-700 rounded-full text-[10px] font-black uppercase tracking-wider border border-red-100">
                                                            <X size={10} strokeWidth={3} /> Rejected
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {log.status === 'rejected' ? (
                                                        <span className="text-xs text-red-600 font-semibold italic">"{log.rejection_reason || 'No reason provided.'}"</span>
                                                    ) : (
                                                        <span className="text-xs text-gray-400 font-medium">Account verified successfully</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className="text-xs text-gray-500 font-mono font-bold">{formattedDate}</span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                        <Pagination 
                            currentPage={currentPage}
                            lastPage={lastPage}
                            total={totalHistory}
                            from={historyFrom}
                            to={historyTo}
                            onPageChange={(page) => fetchHistory(page)}
                        />
                    </div>
                ) : (
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
                                                            onClick={() => setApprovalConfirmation({
                                                                id: pro.id,
                                                                name: displayName,
                                                                type: activeTab
                                                            })}
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
                )}

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
                                    className="flex-1 py-3 bg-neutral-950 text-white font-bold text-xs rounded-xl hover:bg-neutral-900 transition-all disabled:opacity-50"
                                >
                                    Confirm Rejection
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Approval Confirmation Modal */}
                {approvalConfirmation && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
                            <h3 className="text-lg font-black text-gray-900 mb-2 flex items-center gap-2">
                                <Check className="text-emerald-500" />
                                Approve Application
                            </h3>
                            <p className="text-gray-500 text-xs mb-4 font-semibold">
                                Are you sure you want to approve and verify the account for <span className="text-gray-900 font-extrabold">{approvalConfirmation.name}</span>? This will grant them full platform privileges.
                            </p>

                            {/* Notifications Channels Toggles */}
                            <div className="bg-neutral-50 border border-neutral-200/60 p-4 rounded-2xl space-y-3 mb-6 text-left">
                                <h4 className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Notification Preferences</h4>
                                
                                <label className="flex items-start space-x-3 cursor-pointer group select-none">
                                    <input 
                                        type="checkbox" 
                                        checked={sendEmailNotify}
                                        onChange={() => setSendEmailNotify(!sendEmailNotify)}
                                        className="w-4 h-4 rounded text-neutral-900 border-neutral-300 focus:ring-neutral-950 cursor-pointer mt-0.5"
                                    />
                                    <div>
                                        <p className="text-xs font-bold text-neutral-800">Send Email Notification</p>
                                        <p className="text-[10px] text-neutral-400 font-semibold">Deliver official approval mail via SMTP channel.</p>
                                    </div>
                                </label>

                                <label className="flex items-start space-x-3 cursor-pointer group select-none">
                                    <input 
                                        type="checkbox" 
                                        checked={sendWANotify}
                                        onChange={() => setSendWANotify(!sendWANotify)}
                                        className="w-4 h-4 rounded text-neutral-900 border-neutral-300 focus:ring-neutral-950 cursor-pointer mt-0.5"
                                    />
                                    <div>
                                        <p className="text-xs font-bold text-neutral-800">Send WhatsApp Notification</p>
                                        <p className="text-[10px] text-neutral-400 font-semibold">Open click-to-chat prefilled text on verify completion.</p>
                                    </div>
                                </label>
                            </div>

                            <div className="flex space-x-3 mt-6">
                                <button 
                                    onClick={() => {
                                        setApprovalConfirmation(null);
                                        setSendEmailNotify(true);
                                        setSendWANotify(true);
                                    }}
                                    className="flex-1 py-3 text-gray-500 font-bold text-xs bg-gray-50 rounded-xl hover:bg-gray-100 transition-all"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={() => {
                                        // Retrieve professional item to extract phone
                                        const proItem = currentList.find(p => p.id === approvalConfirmation.id) || selectedProForDocs;
                                        const phone = proItem?.no_telp || proItem?.no_telepon || '';

                                        handleStatusUpdate(
                                            approvalConfirmation.id, 
                                            approvalConfirmation.type, 
                                            'verified', 
                                            undefined,
                                            sendEmailNotify,
                                            sendWANotify,
                                            phone,
                                            approvalConfirmation.name
                                        );
                                        setApprovalConfirmation(null);
                                    }}
                                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-emerald-100"
                                >
                                    Confirm Approval
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
                            </div>                            {/* Verification metadata panel */}
                            {activeTab === 'logistics' ? (
                                <div className="mb-6 p-5 bg-neutral-50 rounded-2xl border border-neutral-200/60 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Vehicle Type</span>
                                        <p className="text-xs font-black text-slate-800">{selectedProForDocs.vehicle_type || 'Not Specified'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">License Plate</span>
                                        <p className="text-xs font-bold text-slate-800 font-mono">{selectedProForDocs.license_plate || 'Not Specified'}</p>
                                    </div>
                                    <div className="space-y-1 col-span-2">
                                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Availability Status</span>
                                        <p className="text-xs font-bold text-slate-800">
                                            {selectedProForDocs.is_active ? 'Active (Ready for Orders)' : 'Inactive'}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="mb-6 p-5 bg-neutral-50 rounded-2xl border border-neutral-200/60 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Registration Entity Type</span>
                                        <p className="text-xs font-extrabold capitalize text-slate-800 flex items-center gap-1.5 mt-0.5">
                                            {selectedProForDocs.entity_type === 'company' ? (
                                                <>
                                                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                                                    Company / Studio
                                                </>
                                            ) : (
                                                <>
                                                    <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
                                                    Individual Professional
                                                </>
                                            )}
                                        </p>
                                    </div>

                                    {selectedProForDocs.entity_type === 'company' ? (
                                        <>
                                            <div className="space-y-1">
                                                <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Company Name</span>
                                                <p className="text-xs font-black text-slate-800">{selectedProForDocs.company_name || 'N/A'}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Business Registration (NIB)</span>
                                                <p className="text-xs font-bold text-slate-800 font-mono">{selectedProForDocs.company_license || 'N/A'}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">NPWP Tax ID Number</span>
                                                <p className="text-xs font-bold text-slate-800 font-mono">{selectedProForDocs.npwp_number || 'N/A'}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">SIUP Number</span>
                                                <p className="text-xs font-bold text-slate-800 font-mono">{selectedProForDocs.siup_number || 'N/A'}</p>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Identity card / License Number</span>
                                            <p className="text-xs font-bold text-slate-800 font-mono">{selectedProForDocs.identity_number || 'N/A'}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'logistics' ? (
                                <div className="py-12 border border-dashed rounded-2xl flex flex-col items-center justify-center text-gray-400 gap-2 bg-gray-50/50">
                                    <Truck size={36} className="text-neutral-700 animate-pulse" />
                                    <p className="text-xs font-extrabold text-neutral-800 uppercase tracking-wide">Vehicle Info Verification Only</p>
                                    <p className="text-[10px] font-medium text-neutral-500 max-w-sm text-center">
                                        Verify the driver's vehicle type and license plate number above. No additional business registration or tax credentials are required for this role.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        {/* Profile Photo Link */}
                                        <SecureDocumentLink label="Profile Photo / Logo" path={selectedProForDocs.foto} profileId={selectedProForDocs.id} type={activeTab} field="foto" />

                                        {/* Portfolio document / NPWP */}
                                        <SecureDocumentLink label="Portfolio PDF Document" path={selectedProForDocs.file_portofolio} profileId={selectedProForDocs.id} type={activeTab} field="file_portofolio" />
                                        <SecureDocumentLink label="NPWP Tax Registration" path={selectedProForDocs.npwp} profileId={selectedProForDocs.id} type={activeTab} field="npwp" />

                                        {/* Certificate / SIUP */}
                                        <SecureDocumentLink label="Certificate SK / License" path={selectedProForDocs.file_sertifikat} profileId={selectedProForDocs.id} type={activeTab} field="file_sertifikat" />
                                        <SecureDocumentLink label="SIUP Business License" path={selectedProForDocs.siup} profileId={selectedProForDocs.id} type={activeTab} field="siup" />
                                    </div>

                                    {/* Fallback if no files uploaded */}
                                    {!selectedProForDocs.foto && !selectedProForDocs.file_portofolio && !selectedProForDocs.file_sertifikat && !selectedProForDocs.npwp && !selectedProForDocs.siup && (
                                        <div className="py-12 border border-dashed rounded-2xl flex flex-col items-center justify-center text-gray-400 gap-2 bg-gray-50">
                                            <ShieldAlert size={36} className="text-gray-300" />
                                            <p className="text-xs font-bold">No credential documents uploaded by this user.</p>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Modal Actions */}
                            <div className="flex items-center justify-end space-x-3 mt-8 pt-6 border-t border-gray-100">
                                <button 
                                    onClick={() => setRejectionModal({id: selectedProForDocs.id, type: activeTab})}
                                    className="px-5 py-3 border border-neutral-300 text-neutral-800 hover:bg-neutral-50 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 bg-white shadow-sm"
                                >
                                    <X size={14} /> Reject Application
                                </button>
                                <button 
                                    onClick={() => setApprovalConfirmation({
                                        id: selectedProForDocs.id,
                                        name: selectedProForDocs.store_name || selectedProForDocs.nama_perusahaan || selectedProForDocs.nama || selectedProForDocs.user?.name || '',
                                        type: activeTab
                                    })}
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
