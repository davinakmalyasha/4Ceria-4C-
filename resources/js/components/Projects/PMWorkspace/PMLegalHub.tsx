import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
    FileText, Shield, Scale, Clock, CheckCircle2, 
    AlertCircle, Upload, Download, Eye, Gavel,
    CheckSquare, History, Lock, Unlock, FileCheck, X
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

interface PMLegalHubProps {
    project: any;
    user: any;
    onRefresh?: () => void;
    onSwitchToProcess?: (phase: any, requirement?: string) => void;
}

export const PMLegalHub: React.FC<PMLegalHubProps> = ({ project, user, onRefresh, onSwitchToProcess }) => {
    const { showToast } = useToast();
    const [isUploading, setIsUploading] = useState(false);
    
    const isOwner = user?.id === project.user_id;
    const isPM = user?.id === project.pm_id;
    const isNotaris = user?.notaris_profile && project.selected_notaris_id === user.notaris_profile.id;

    const requirements = project.legal_requirements || ['land_legality', 'building_permit', 'usage_certificate'];

    const getStatusLabel = (slug: string) => {
        const labels: Record<string, string> = {
            'land_legality': 'Land Certificate (SHM/HGB)',
            'building_permit': 'Persetujuan Bangunan Gedung (PBG)',
            'usage_certificate': 'Sertifikat Laik Fungsi (SLF)',
        };
        return labels[slug] || ucwords(slug.replace('_', ' '));
    };

    function ucwords(str: string) {
        return str.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    return (
        <div className="space-y-6">
            {/* Header Section */}
            <div className="bg-zinc-900 rounded-[2.5rem] p-10 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Scale size={120} />
                </div>
                <div className="relative z-10 max-w-2xl">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="px-3 py-1 bg-amber-500/20 border border-amber-500/30 rounded-full text-amber-400 text-[10px] font-black uppercase tracking-widest">
                            Legal Protection Active
                        </div>
                    </div>
                    <h2 className="text-4xl font-black mb-4 leading-tight">Legal & Compliance Hub</h2>
                    <p className="text-zinc-400 text-sm leading-relaxed font-medium">
                        This workspace is restricted to the Project Owner, PM, and assigned Notaris. 
                        It tracks all governmental permits and land legality pillars required for the construction to be officially recognized.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Requirements Checklist */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white border border-zinc-100 rounded-[2rem] p-8 shadow-sm">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-lg font-black text-gray-900">Legal Pillar Progress</h3>
                                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Mandatory Government Clearances</p>
                            </div>
                            <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-400">
                                <FileCheck size={20} />
                            </div>
                        </div>

                        <div className="space-y-4">
                            {requirements.map((req: string, idx: number) => (
                                <div key={idx} className="group p-5 bg-zinc-50 rounded-3xl border border-transparent hover:border-zinc-200 transition-all flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-zinc-900">
                                            <span className="text-xs font-black">L{idx + 1}</span>
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-gray-900">{getStatusLabel(req)}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                                                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Awaiting Final Document</span>
                                            </div>
                                        </div>
                                    </div>
                                    {(isNotaris || isPM || isOwner) && (
                                        <button 
                                            onClick={() => onSwitchToProcess?.('legal', req)}
                                            className="px-4 py-2 bg-zinc-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-600 transition-all shadow-lg shadow-zinc-200"
                                        >
                                            {isNotaris ? 'Update Status' : 'View requirement'}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Document Vault */}
                    <div className="bg-white border border-zinc-100 rounded-[2rem] p-8 shadow-sm">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-lg font-black text-gray-900">Official Document Vault</h3>
                            <button className="p-3 bg-zinc-50 text-zinc-400 rounded-xl hover:bg-zinc-900 hover:text-white transition-all">
                                <History size={18} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-6 border-2 border-dashed border-zinc-100 rounded-[1.5rem] flex flex-col items-center justify-center text-center space-y-3 hover:border-zinc-200 transition-all group cursor-pointer">
                                <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-400 group-hover:bg-zinc-900 group-hover:text-amber-400 transition-all">
                                    <Upload size={20} />
                                </div>
                                <div className="text-center">
                                    <p className="text-xs font-black text-gray-900 uppercase tracking-tighter">Upload Draft Deed</p>
                                    <p className="text-[9px] text-zinc-400 font-medium mt-1">PDF max 10MB. Restricted to Notaris.</p>
                                </div>
                            </div>
                            <div className="p-6 border-2 border-dashed border-zinc-100 rounded-[1.5rem] flex flex-col items-center justify-center text-center space-y-3 hover:border-zinc-200 transition-all group cursor-pointer">
                                <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 group-hover:bg-zinc-900 group-hover:text-emerald-400 transition-all">
                                    <Shield size={20} />
                                </div>
                                <div className="text-center">
                                    <p className="text-xs font-black text-gray-900 uppercase tracking-tighter">Proof of Tax Payment</p>
                                    <p className="text-[9px] text-zinc-400 font-medium mt-1">BPHTB / PPh Verification.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sidebar Section */}
                <div className="space-y-6">
                    <div className="bg-amber-50 border border-amber-100 rounded-[2rem] p-8">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-amber-600 shadow-sm border border-amber-100">
                                <Lock size={18} />
                            </div>
                            <h4 className="text-sm font-black text-amber-900 uppercase tracking-tight">Access Control</h4>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-amber-200/50">
                                <span className="text-[11px] font-bold text-amber-800/70">Project Owner</span>
                                <CheckCircle2 size={14} className="text-amber-500" />
                            </div>
                            <div className="flex items-center justify-between pb-3 border-b border-amber-200/50">
                                <span className="text-[11px] font-bold text-amber-800/70">Project Manager</span>
                                <CheckCircle2 size={14} className="text-amber-500" />
                            </div>
                            <div className="flex items-center justify-between pb-3 border-b border-amber-200/50">
                                <span className="text-[11px] font-bold text-amber-800/70">Selected Notaris</span>
                                <CheckCircle2 size={14} className="text-amber-500" />
                            </div>
                            <div className="flex items-center justify-between opacity-40">
                                <span className="text-[11px] font-bold text-amber-800/70">Other Professionals</span>
                                <X size={14} className="text-red-400" />
                            </div>
                        </div>
                    </div>

                    {/* Seal Legal Phase Action - Only for PM if design is locked */}
                    {isPM && project.legal_locked_at && !project.legal_completed_at && (
                        <div className="bg-zinc-900 rounded-[2rem] p-8 text-white space-y-4 border-2 border-amber-500/30">
                            <div className="flex items-center gap-3">
                                <Lock className="text-amber-400" size={20} />
                                <h4 className="text-sm font-black uppercase tracking-tight">System Ready for Sealing</h4>
                            </div>
                            <p className="text-[11px] text-zinc-400 font-medium leading-relaxed">
                                The Architect has sealed the technical package. All financial records and legal documents are now in the Vault. 
                                As PM, you must perform the final "Legal Seal" to transition this project to Procurement & Construction.
                            </p>
                            <button 
                                onClick={() => onSwitchToProcess?.('legal')}
                                className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-zinc-900 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-amber-500/20"
                            >
                                Enter Vault to Seal Phase
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
