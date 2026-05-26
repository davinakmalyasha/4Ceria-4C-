import React from 'react';
import { ShieldCheck, Clock, Shield, AlertCircle, FileText, UploadCloud, ExternalLink } from 'lucide-react';

interface VerificationPanelProps {
    verificationStatus: string;
    rejectionReason?: string;
    fileFoto: File | null;
    filePorto: File | null;
    fileSertif: File | null;
    onFile: (e: React.ChangeEvent<HTMLInputElement>, field: string) => void;
    hasExistingPhoto: boolean;
    hasExistingPortfolio: boolean;
    hasExistingCert: boolean;
    isLoading?: boolean;
}

export const VerificationPanel: React.FC<VerificationPanelProps> = ({
    verificationStatus,
    rejectionReason,
    fileFoto,
    filePorto,
    fileSertif,
    onFile,
    hasExistingPhoto,
    hasExistingPortfolio,
    hasExistingCert,
    isLoading = false,
}) => {
    const isUploaded = hasExistingPortfolio || hasExistingCert;
    const activeStatus = (verificationStatus === 'pending' && !isUploaded) ? 'unverified' : verificationStatus;

    const renderStatusBadge = () => {
        switch (activeStatus) {
            case 'verified':
            case 'approved':
                return (
                    <div className="bg-gradient-to-br from-emerald-950 to-zinc-900 border border-emerald-500/20 rounded-3xl p-6 text-white space-y-3 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 blur-[30px] rounded-full translate-x-4 -translate-y-4 pointer-events-none" />
                        <div className="flex items-center gap-2 text-emerald-400">
                            <ShieldCheck size={20} className="animate-pulse" />
                            <h4 className="text-xs font-black uppercase tracking-widest">Officially Verified</h4>
                        </div>
                        <p className="text-[11px] text-zinc-300 leading-relaxed font-semibold">
                            Your credentials have been successfully authenticated. You have full privileges to bid and participate in tenders.
                        </p>
                    </div>
                );
            case 'pending':
                return (
                    <div className="bg-gradient-to-br from-amber-950/70 to-zinc-900 border border-amber-500/20 rounded-3xl p-6 text-white space-y-3 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 blur-[30px] rounded-full translate-x-4 -translate-y-4 pointer-events-none" />
                        <div className="flex items-center gap-2 text-amber-400">
                            <Clock size={20} className="animate-pulse" />
                            <h4 className="text-xs font-black uppercase tracking-widest">Verification Pending</h4>
                        </div>
                        <p className="text-[11px] text-zinc-300 leading-relaxed font-semibold">
                            Your uploaded documents are currently in review. Admins will verify your qualifications shortly. This process usually takes 24 hours.
                        </p>
                    </div>
                );
            case 'rejected':
                return (
                    <div className="bg-gradient-to-br from-red-950/70 to-zinc-900 border border-red-500/20 rounded-3xl p-6 text-white space-y-3 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 blur-[30px] rounded-full translate-x-4 -translate-y-4 pointer-events-none" />
                        <div className="flex items-center gap-2 text-red-400">
                            <AlertCircle size={20} />
                            <h4 className="text-xs font-black uppercase tracking-widest">Verification Declined</h4>
                        </div>
                        <p className="text-[11px] text-zinc-300 leading-relaxed font-semibold">
                            Reason: {rejectionReason || 'Uploaded documents are invalid or blurred. Please re-upload verified certificates.'}
                        </p>
                    </div>
                );
            default:
                return (
                    <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-3xl p-6 text-white space-y-3 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 blur-[30px] rounded-full translate-x-4 -translate-y-4 pointer-events-none" />
                        <div className="flex items-center gap-2 text-zinc-400">
                            <Shield size={20} />
                            <h4 className="text-xs font-black uppercase tracking-widest">Verification Required</h4>
                        </div>
                        <p className="text-[11px] text-zinc-400 leading-relaxed font-semibold">
                            To unlock proposals and bid submissions, please upload valid documents (Headshot, Portfolio, and Certificates).
                        </p>
                    </div>
                );
        }
    };

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                {renderStatusBadge()}
                <div className="px-1 flex justify-end">
                    <a 
                        href="/help?article=pro-profile-verification" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-[11px] font-bold text-zinc-500 hover:text-zinc-950 transition-colors flex items-center gap-1 group"
                    >
                        See how the verification flow works
                        <ExternalLink size={12} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-200" />
                    </a>
                </div>
            </div>

            <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 space-y-5">
                <div>
                    <h4 className="text-sm font-black text-gray-800 uppercase tracking-wider">Verification Documents</h4>
                    <p className="text-[10px] text-gray-500 font-semibold mt-1">Upload authentic evidence to speed up administrative review.</p>
                </div>

                <div className="space-y-4">
                    {/* Profile Photo */}
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-gray-600 uppercase">Profile Photo / Logo</label>
                        <div className="relative border-2 border-dashed border-gray-200 rounded-2xl p-4 hover:border-slate-400 transition-colors bg-white flex flex-col items-center justify-center cursor-pointer min-h-[90px]">
                            <input type="file" accept="image/*" onChange={(e) => onFile(e, 'foto')} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                            <UploadCloud size={24} className="text-gray-400 mb-1" />
                            <span className="text-[11px] font-bold text-gray-600 text-center">
                                {fileFoto ? fileFoto.name : 'Choose image file'}
                            </span>
                            {hasExistingPhoto && !fileFoto && (
                                <span className="text-[9px] text-emerald-600 font-black uppercase mt-1">✓ Saved Photo</span>
                            )}
                        </div>
                    </div>

                    {/* Portfolio PDF */}
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-gray-600 uppercase">Portfolio PDF Details</label>
                        <div className="relative border-2 border-dashed border-gray-200 rounded-2xl p-4 hover:border-slate-400 transition-colors bg-white flex flex-col items-center justify-center cursor-pointer min-h-[90px]">
                            <input type="file" accept=".pdf,.zip,.jpg,.png" onChange={(e) => onFile(e, 'file_portofolio')} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                            <FileText size={24} className="text-gray-400 mb-1" />
                            <span className="text-[11px] font-bold text-gray-600 text-center">
                                {filePorto ? filePorto.name : 'Choose PDF/ZIP file'}
                            </span>
                            {hasExistingPortfolio && !filePorto && (
                                <span className="text-[9px] text-emerald-600 font-black uppercase mt-1">✓ Saved Portfolio</span>
                            )}
                        </div>
                    </div>

                    {/* Certificate */}
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-gray-600 uppercase">Certificate (SK / License)</label>
                        <div className="relative border-2 border-dashed border-gray-200 rounded-2xl p-4 hover:border-slate-400 transition-colors bg-white flex flex-col items-center justify-center cursor-pointer min-h-[90px]">
                            <input type="file" accept=".pdf,.jpg,.png" onChange={(e) => onFile(e, 'file_sertifikat')} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                            <Shield size={24} className="text-gray-400 mb-1" />
                            <span className="text-[11px] font-bold text-gray-600 text-center">
                                {fileSertif ? fileSertif.name : 'Choose Certificate file'}
                            </span>
                            {hasExistingCert && !fileSertif && (
                                <span className="text-[9px] text-emerald-600 font-black uppercase mt-1">✓ Saved Certificate</span>
                            )}
                        </div>
                    </div>
                </div>

                {activeStatus !== 'verified' && activeStatus !== 'approved' && (
                    <div className="pt-4 border-t border-neutral-200/60">
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-[#FF2D20] hover:bg-red-700 text-white py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300 hover:scale-[1.02] shadow-lg shadow-red-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isLoading ? 'Submitting...' : 'Save & Request Verification'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
