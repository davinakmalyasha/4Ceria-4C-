import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { 
    ShieldCheck, Clock, Shield, AlertTriangle, FileText, UploadCloud, 
    Download, ExternalLink, ArrowRight, Eye, Building2, UserCircle 
} from 'lucide-react';

interface VerificationPageProps {
    onBack?: () => void;
}

const RELATION_MAP: Record<string, string> = {
    arsitek: 'arsitek',
    kontraktor: 'kontraktor',
    project_manager: 'project_manager',
    structural: 'structural_engineer',
    mep: 'mep_engineer',
    notaris: 'notaris_profile',
    interior: 'interior_profile',
    civil: 'kontraktor',
    mechanical: 'kontraktor',
    electrical: 'kontraktor',
    plumbing: 'kontraktor',
    roofing: 'kontraktor',
    finishing: 'kontraktor',
};

export default function VerificationPage({ onBack }: VerificationPageProps) {
    const { user, refreshUser } = useAuth();
    const { showToast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    
    // Map user role to relation key to extract profile details
    const relationKey = RELATION_MAP[user?.role_type ?? ''];
    const profile = relationKey ? (user as Record<string, any>)?.[relationKey] : null;
    const isLocked = profile?.verification_status === 'pending' || profile?.verification_status === 'verified';

    const [entityType, setEntityType] = useState<'individual' | 'company'>(
        profile?.entity_type === 'company' ? 'company' : 'individual'
    );
    const [companyName, setCompanyName] = useState(profile?.company_name ?? '');
    const [companyLicense, setCompanyLicense] = useState(profile?.company_license ?? '');
    const [identityNumber, setIdentityNumber] = useState(profile?.identity_number ?? '');
    const [npwpNumber, setNpwpNumber] = useState(profile?.npwp_number ?? '');
    const [siupNumber, setSiupNumber] = useState(profile?.siup_number ?? '');
    
    // Selected files
    const [fileFoto, setFileFoto] = useState<File | null>(null);
    const [filePorto, setFilePorto] = useState<File | null>(null);
    const [fileSertif, setFileSertif] = useState<File | null>(null);

    // Dynamic states for feedback
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<File | null>>) => {
        if (e.target.files && e.target.files[0]) {
            setter(e.target.files[0]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setSuccess(false);

        try {
            const data = new FormData();
            data.append('name', user?.name ?? '');
            data.append('email', user?.email ?? '');
            data.append('username', user?.username ?? '');
            data.append('entity_type', entityType);
            data.append('company_name', entityType === 'company' ? companyName : '');
            data.append('company_license', entityType === 'company' ? companyLicense : '');
            data.append('identity_number', entityType === 'individual' ? identityNumber : '');
            data.append('npwp_number', entityType === 'company' ? npwpNumber : '');
            data.append('siup_number', entityType === 'company' ? siupNumber : '');

            if (fileFoto) data.append('foto', fileFoto);
            
            // Map files depending on entity type
            if (entityType === 'individual') {
                if (filePorto) data.append('file_portofolio', filePorto); // KTP scan
                if (fileSertif) data.append('file_sertifikat', fileSertif); // Professional Certificate
            } else {
                if (filePorto) data.append('npwp', filePorto); // NPWP Tax Document
                if (fileSertif) data.append('siup', fileSertif); // SIUP Business Permit
            }

            await axios.post('/me/professional', data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setSuccess(true);
            showToast('Verification request submitted successfully!', 'success');
            await refreshUser();
            
            // Clear draft files
            setFileFoto(null);
            setFilePorto(null);
            setFileSertif(null);
        } catch (err: any) {
            console.error(err);
            const errorData = err.response?.data;
            if (errorData?.errors) {
                const firstError = Object.values(errorData.errors)[0] as string[];
                setError(`Validation error: ${firstError[0]}`);
                showToast(`Error: ${firstError[0]}`, 'error');
            } else {
                setError(errorData?.message ?? 'Failed to submit verification.');
                showToast(errorData?.message ?? 'Failed to submit verification.', 'error');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const getBackendType = (roleType: string): string => {
        const contractorSubtypes = ['civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'];
        if (contractorSubtypes.includes(roleType)) {
            return 'kontraktor';
        }
        return roleType;
    };

    const SecureSavedFile: React.FC<{
        label: string;
        path?: string;
        profileId: number;
        type: string;
        field: string;
    }> = ({ label, path, profileId, type, field }) => {
        const [loading, setLoading] = useState<boolean>(false);

        const handleOpen = (e: React.MouseEvent) => {
            if (!path) return;

            if (field === 'foto') {
                window.open(`/storage/${path}`, '_blank');
                return;
            }

            e.preventDefault();
            setLoading(true);
            axios.get(`/verifications/documents/${type}/${profileId}/${field}`)
                .then(res => {
                    setLoading(false);
                    window.open(res.data.url, '_blank');
                })
                .catch(err => {
                    console.error("Failed to load secure document URL", err);
                    setLoading(false);
                    alert("Failed to secure safe download connection. Please try again.");
                });
        };

        if (!path) return null;
        const ext = path.split('.').pop();
        const displayFilename = `${label.replace('Current', 'Profile').replace('File', '').replace('Document', '').trim().replace(/\s+/g, '_')}_Document.${ext}`;

        return (
            <div className="flex items-center justify-between p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl mt-2">
                <div className="flex items-center gap-2 min-w-0">
                    <FileText size={16} className="text-emerald-600 shrink-0" />
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase text-emerald-800 tracking-wider">{label}</p>
                        <p className="text-[10px] text-emerald-600 truncate font-semibold">{displayFilename}</p>
                    </div>
                </div>
                <button 
                    onClick={handleOpen}
                    disabled={loading}
                    className="p-1.5 hover:bg-emerald-100/50 rounded-lg text-emerald-700 hover:text-emerald-900 transition-colors shrink-0 outline-none disabled:opacity-50"
                    title="Open uploaded file securely"
                >
                    {loading ? (
                        <Clock size={14} className="animate-spin text-emerald-600" />
                    ) : (
                        <ExternalLink size={14} />
                    )}
                </button>
            </div>
        );
    };

    const renderStatusBadge = () => {
        const isUploaded = !!(profile?.file_portofolio || profile?.npwp || profile?.file_sertifikat || profile?.siup || profile?.foto);
        let activeStatus = profile?.verification_status ?? 'unverified';
        if (activeStatus === 'pending' && !isUploaded) {
            activeStatus = 'unverified';
        }

        switch (activeStatus) {
            case 'verified':
            case 'approved':
                return (
                    <div className="bg-gradient-to-br from-emerald-950 to-zinc-900 border border-emerald-500/20 rounded-3xl p-6 text-white space-y-3 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-[40px] rounded-full translate-x-6 -translate-y-6 pointer-events-none" />
                        <div className="flex items-center gap-2 text-emerald-400">
                            <ShieldCheck size={24} className="animate-pulse" />
                            <h4 className="text-sm font-black uppercase tracking-widest">Officially Verified Account</h4>
                        </div>
                        <p className="text-xs text-zinc-300 leading-relaxed font-semibold">
                            Congratulations! Your professional identity and credentials have been successfully authenticated. 
                            You have full privileges to submit bids, participate in tenders, and sign project contracts.
                        </p>
                    </div>
                );
            case 'pending':
                return (
                    <div className="bg-gradient-to-br from-amber-950/70 to-zinc-900 border border-amber-500/20 rounded-3xl p-6 text-white space-y-3 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-[40px] rounded-full translate-x-6 -translate-y-6 pointer-events-none" />
                        <div className="flex items-center gap-2 text-amber-400">
                            <Clock size={24} className="animate-pulse" />
                            <h4 className="text-sm font-black uppercase tracking-widest">Verification Pending Review</h4>
                        </div>
                        <p className="text-xs text-zinc-300 leading-relaxed font-semibold">
                            Your verification credentials have been uploaded successfully and are in queue. 
                            The administrative team is manually verifying your licenses. This process usually takes up to 24 hours. 
                            You will receive a notification immediately once approved.
                        </p>
                    </div>
                );
            case 'rejected':
                return (
                    <div className="bg-gradient-to-br from-red-950/70 to-zinc-900 border border-red-500/20 rounded-3xl p-6 text-white space-y-3 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 blur-[40px] rounded-full translate-x-6 -translate-y-6 pointer-events-none" />
                        <div className="flex items-center gap-2 text-red-400">
                            <AlertTriangle size={24} />
                            <h4 className="text-sm font-black uppercase tracking-widest">Verification Declined</h4>
                        </div>
                        <p className="text-xs text-zinc-300 leading-relaxed font-semibold">
                            Your verification application was rejected for the following reason:
                        </p>
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-xs font-bold leading-relaxed">
                            "{profile?.rejection_reason || 'Uploaded documents are invalid, blurry, or expired. Please upload valid certificates.'}"
                        </div>
                        <p className="text-[11px] text-zinc-400 font-semibold mt-1">
                            Please update your details below and re-submit for review.
                        </p>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-12">
            {/* Header */}
            {onBack && (
                <div className="flex justify-start border-b border-neutral-200/60 pb-4">
                    <button 
                        onClick={onBack} 
                        className="py-2 px-4 border border-neutral-200 bg-white hover:bg-neutral-50 rounded-xl text-xs font-black text-neutral-600 transition-colors shadow-sm flex items-center gap-1.5 active:scale-95"
                    >
                        ← Back to Dashboard
                    </button>
                </div>
            )}

            {/* Verification Status Card */}
            {renderStatusBadge()}

            {/* Application Submission Form */}
            {profile?.verification_status !== 'verified' && profile?.verification_status !== 'approved' && (
                <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-gray-200/80 p-6 sm:p-8 shadow-sm space-y-8">
                    {error && (
                        <div className="p-4 bg-red-50 text-red-700 rounded-2xl text-xs font-bold border border-red-100 flex items-center gap-2 animate-in fade-in duration-200">
                            <AlertTriangle size={16} className="shrink-0" />
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="p-4 bg-green-50 text-green-700 rounded-2xl text-xs font-bold border border-green-100 flex items-center gap-2 animate-in fade-in duration-200">
                            <ShieldCheck size={16} className="shrink-0" />
                            Application submitted successfully! Admins will review your details soon.
                        </div>
                    )}

                    {/* Entity Type Selector */}
                    <div className="space-y-3">
                        <label className="block text-xs font-black text-gray-700 uppercase tracking-wider">Are you verifying as an Individual or a Company?</label>
                        <div className={`grid grid-cols-2 bg-gray-50 p-1.5 rounded-2xl border border-gray-100 gap-2 max-w-md ${isLocked ? 'opacity-70' : ''}`}>
                            <button
                                type="button"
                                disabled={isLocked}
                                onClick={() => setEntityType('individual')}
                                className={`py-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                                    entityType === 'individual'
                                        ? 'bg-neutral-900 text-white shadow-md'
                                        : 'text-gray-500 hover:text-gray-800'
                                } ${isLocked ? 'cursor-not-allowed' : ''}`}
                            >
                                <UserCircle size={16} />
                                Individual Professional
                            </button>
                            <button
                                type="button"
                                disabled={isLocked}
                                onClick={() => setEntityType('company')}
                                className={`py-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                                    entityType === 'company'
                                        ? 'bg-neutral-900 text-white shadow-md'
                                        : 'text-gray-500 hover:text-gray-800'
                                } ${isLocked ? 'cursor-not-allowed' : ''}`}
                            >
                                <Building2 size={16} />
                                Company / Studio
                            </button>
                        </div>
                    </div>

                    {/* Dynamic Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                        {/* Company specific text fields */}
                        {entityType === 'company' && (
                            <>
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-gray-600 uppercase">Registered Company Name</label>
                                    <input 
                                        type="text" 
                                        required
                                        disabled={isLocked}
                                        className="w-full px-4 py-3 bg-gray-50/70 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-semibold text-xs transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                        placeholder="e.g., PT. Pembangunan Ceria"
                                        value={companyName}
                                        onChange={(e) => setCompanyName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-gray-600 uppercase">Company Registration / NIB License</label>
                                    <input 
                                        type="text" 
                                        required
                                        disabled={isLocked}
                                        className="w-full px-4 py-3 bg-gray-50/70 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-semibold text-xs transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                        placeholder="e.g., 9120002148202"
                                        value={companyLicense}
                                        onChange={(e) => setCompanyLicense(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-gray-600 uppercase">NPWP (Tax ID) Number</label>
                                    <input 
                                        type="text" 
                                        required
                                        disabled={isLocked}
                                        className="w-full px-4 py-3 bg-gray-50/70 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-semibold text-xs transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                        placeholder="e.g., 01.234.567.8-901.000"
                                        value={npwpNumber}
                                        onChange={(e) => setNpwpNumber(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-gray-600 uppercase">SIUP Number</label>
                                    <input 
                                        type="text" 
                                        required
                                        disabled={isLocked}
                                        className="w-full px-4 py-3 bg-gray-50/70 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-semibold text-xs transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                        placeholder="e.g., 503/123-SIUP/DPMPTSP/2026"
                                        value={siupNumber}
                                        onChange={(e) => setSiupNumber(e.target.value)}
                                    />
                                </div>
                            </>
                        )}

                        {/* Individual specific fields */}
                        {entityType === 'individual' && (
                            <div className="space-y-2 md:col-span-2">
                                <label className="block text-xs font-bold text-gray-600 uppercase">National ID (KTP) or Professional License Number</label>
                                <input 
                                    type="text" 
                                    required
                                    disabled={isLocked}
                                    className="w-full px-4 py-3 bg-gray-50/70 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-semibold text-xs transition-all max-w-md disabled:opacity-60 disabled:cursor-not-allowed"
                                    placeholder="e.g., 3271021405900004 or SKA No: 1.2.302.2..."
                                    value={identityNumber}
                                    onChange={(e) => setIdentityNumber(e.target.value)}
                                />
                            </div>
                        )}
                    </div>

                    {/* Files Section */}
                    <div className="space-y-5 pt-6 border-t border-gray-100">
                        <div>
                            <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider">Required Document Uploads</h4>
                            <p className="text-[10px] text-gray-400 font-semibold mt-0.5">Please provide high-resolution, readable files (PDF or JPEG, max 5MB).</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                            {/* Profile Photo Upload */}
                            <div className="space-y-2">
                                <label className="block text-[11px] font-extrabold text-gray-600 uppercase">Profile Photo / Logo</label>
                                <div className={`relative border-2 border-dashed border-gray-200 rounded-2xl p-4 hover:border-neutral-400 transition-colors bg-white flex flex-col items-center justify-center min-h-[110px] ${isLocked ? 'opacity-65 cursor-not-allowed' : 'cursor-pointer'}`}>
                                    <input 
                                        type="file" 
                                        disabled={isLocked}
                                        accept="image/*" 
                                        onChange={(e) => handleFileChange(e, setFileFoto)} 
                                        className={`absolute inset-0 opacity-0 w-full h-full ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`} 
                                    />
                                    <UploadCloud size={24} className="text-gray-400 mb-1" />
                                    <span className="text-[10px] font-bold text-gray-600 text-center">
                                        {fileFoto ? fileFoto.name : 'Upload face shot'}
                                    </span>
                                    {profile?.foto && !fileFoto && (
                                        <span className="text-[9px] text-emerald-600 font-black uppercase mt-1">✓ Saved Profile Photo</span>
                                    )}
                                </div>
                                <SecureSavedFile label="Current Photo" path={profile?.foto} profileId={profile?.id} type={getBackendType(user?.role_type ?? '')} field="foto" />
                            </div>

                            {/* Portfolio PDF (Individual) or NPWP (Company) */}
                            <div className="space-y-2">
                                <label className="block text-[11px] font-extrabold text-gray-600 uppercase">
                                    {entityType === 'individual' ? 'KTP / ID Card Scan' : 'NPWP Card Scan'}
                                </label>
                                <div className={`relative border-2 border-dashed border-gray-200 rounded-2xl p-4 hover:border-neutral-400 transition-colors bg-white flex flex-col items-center justify-center min-h-[110px] ${isLocked ? 'opacity-65 cursor-not-allowed' : 'cursor-pointer'}`}>
                                    <input 
                                        type="file" 
                                        disabled={isLocked}
                                        accept=".pdf,.jpg,.png" 
                                        onChange={(e) => handleFileChange(e, setFilePorto)} 
                                        className={`absolute inset-0 opacity-0 w-full h-full ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`} 
                                    />
                                    <FileText size={24} className="text-gray-400 mb-1" />
                                    <span className="text-[10px] font-bold text-gray-600 text-center">
                                        {filePorto ? filePorto.name : (entityType === 'individual' ? 'Upload KTP file' : 'Upload NPWP file')}
                                    </span>
                                    {(profile?.file_portofolio || profile?.npwp) && !filePorto && (
                                        <span className="text-[9px] text-emerald-600 font-black uppercase mt-1">✓ Saved Document</span>
                                    )}
                                </div>
                                {entityType === 'individual' 
                                    ? <SecureSavedFile label="ID Document" path={profile?.file_portofolio} profileId={profile?.id} type={getBackendType(user?.role_type ?? '')} field="file_portofolio" />
                                    : <SecureSavedFile label="NPWP Tax File" path={profile?.npwp ?? profile?.file_portofolio} profileId={profile?.id} type={getBackendType(user?.role_type ?? '')} field="npwp" />
                                }
                            </div>

                            {/* Professional License (Individual) or SIUP (Company) */}
                            <div className="space-y-2">
                                <label className="block text-[11px] font-extrabold text-gray-600 uppercase">
                                    {entityType === 'individual' ? 'Professional License' : 'SIUP/NIB Document'}
                                </label>
                                <div className={`relative border-2 border-dashed border-gray-200 rounded-2xl p-4 hover:border-neutral-400 transition-colors bg-white flex flex-col items-center justify-center min-h-[110px] ${isLocked ? 'opacity-65 cursor-not-allowed' : 'cursor-pointer'}`}>
                                    <input 
                                        type="file" 
                                        disabled={isLocked}
                                        accept=".pdf,.jpg,.png" 
                                        onChange={(e) => handleFileChange(e, setFileSertif)} 
                                        className={`absolute inset-0 opacity-0 w-full h-full ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`} 
                                    />
                                    <Shield size={24} className="text-gray-400 mb-1" />
                                    <span className="text-[10px] font-bold text-gray-600 text-center">
                                        {fileSertif ? fileSertif.name : (entityType === 'individual' ? 'Upload License file' : 'Upload SIUP file')}
                                    </span>
                                    {(profile?.file_sertifikat || profile?.siup) && !fileSertif && (
                                        <span className="text-[9px] text-emerald-600 font-black uppercase mt-1">✓ Saved Document</span>
                                    )}
                                </div>
                                {entityType === 'individual' 
                                    ? <SecureSavedFile label="License Certificate" path={profile?.file_sertifikat} profileId={profile?.id} type={getBackendType(user?.role_type ?? '')} field="file_sertifikat" />
                                    : <SecureSavedFile label="SIUP Permit File" path={profile?.siup ?? profile?.file_sertifikat} profileId={profile?.id} type={getBackendType(user?.role_type ?? '')} field="siup" />
                                }
                            </div>
                        </div>
                    </div>

                    {/* Submit Button / Status Banner */}
                    <div className="pt-6 border-t border-gray-150 flex items-center justify-end">
                        {profile?.verification_status === 'pending' ? (
                            <div className="flex items-center gap-2 py-3.5 px-8 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl text-xs font-black uppercase tracking-widest shadow-sm select-none">
                                <Clock className="animate-pulse" size={14} />
                                Under Investigation by Admin
                            </div>
                        ) : profile?.verification_status === 'verified' ? (
                            <div className="flex items-center gap-2 py-3.5 px-8 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-black uppercase tracking-widest shadow-sm select-none">
                                <ShieldCheck className="animate-pulse" size={14} />
                                Officially Verified
                            </div>
                        ) : (
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="bg-[#FF2D20] hover:bg-red-700 text-white py-3.5 px-8 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300 hover:scale-[1.02] shadow-lg shadow-red-500/20 disabled:opacity-50 flex items-center justify-center gap-2 shrink-0 active:scale-95"
                            >
                                {isLoading ? 'Submitting Application...' : 'Save & Request Verification'}
                            </button>
                        )}
                    </div>
                </form>
            )}

            {/* Static Verification Information/Tips */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 border border-gray-200/70 p-6 rounded-3xl space-y-2 shadow-sm">
                    <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider">Why verify your profile?</h4>
                    <ul className="text-xs text-gray-500 font-semibold space-y-2 pt-2">
                        <li className="flex items-start gap-2">
                            <ArrowRight size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                            <span>**Bidding Access:** Standard bidding capability is completely locked for unverified profiles.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <ArrowRight size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                            <span>**Badging:** A beautiful blue verified badge will appear beside your firm or profile name across the client feed.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <ArrowRight size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                            <span>**Trust Scores:** Verified accounts automatically receive positive baseline reliability scores.</span>
                        </li>
                    </ul>
                </div>
                
                <div className="bg-gray-50 border border-gray-200/70 p-6 rounded-3xl space-y-2 shadow-sm">
                    <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider">Verification Checklist</h4>
                    <ul className="text-xs text-gray-500 font-semibold space-y-2 pt-2">
                        <li className="flex items-start gap-2">
                            <ArrowRight size={14} className="text-[#FF2D20] mt-0.5 shrink-0" />
                            <span>Ensure KTP or NPWP digits match the text input perfectly.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <ArrowRight size={14} className="text-[#FF2D20] mt-0.5 shrink-0" />
                            <span>Ensure scans are clear, unblurred, and completely readable.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <ArrowRight size={14} className="text-[#FF2D20] mt-0.5 shrink-0" />
                            <span>Upload active certifications or registrations only.</span>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
