import React, { useState } from 'react';
import { 
    HardHat, Zap, Upload, FileText, CheckCircle2, 
    Activity, ShieldAlert, Download, Clock,
    UserPlus, XCircle, ShieldCheck, Lock
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import axios from 'axios';

import SpecialistBiddingBoard from './Phases/SpecialistBiddingBoard';
import { ProjectBidForm } from './Details/ProjectBidForm';

interface EngineeringWorkspaceProps {
    project: any;
    user: any;
    onRefresh: () => void;
    onShortlist: (bidId: number, role: string) => void;
    onRecommend?: (bidId: number, role: 'structural' | 'mep') => void;
    onOpenChat?: (user: any) => void;
}

export default function EngineeringWorkspace({ project, user, onRefresh, onShortlist, onRecommend, onOpenChat }: EngineeringWorkspaceProps) {
    const { showToast } = useToast();
    const [isUploading, setIsUploading] = useState(false);

    if (!project || !user) {
        return (
            <div className="py-20 text-center animate-pulse">
                <HardHat size={40} className="mx-auto text-zinc-100 mb-4" />
                <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">Hydrating Engineering Hub...</p>
            </div>
        );
    }

    const isStructural = user.role_type === 'structural' && project.structural_id === user.structural_engineer?.id;
    const isMEP = user.role_type === 'mep' && project.mep_id === user.mep_engineer?.id;
    const isPM = user.role_type === 'project_manager' && project.pm_id === user.id;
    const isOwner = user.id === project.owner_id || user.id === project.user_id;
    const isLeadArchitect = user.role_type === 'arsitek' && (project.arsitek?.user_id === user.id || project.selected_arsitek_id === user.arsitek?.id);

    const structuralBids = project.bids_structural || [];
    const mepBids = project.bids_mep || [];

    const pendingRequests = project.addendums?.filter((a: any) => 
        a.status === 'pending_approval' && (a.role_type === 'structural' || a.role_type === 'mep')
    ) || [];

    const handleVerifyTechnical = async (addendumId: number, status: 'approved' | 'rejected') => {
        try {
            await axios.post(`/projects/${project.id}/verify-engineering/${addendumId}`, { status });
            showToast(`Engineering request ${status} successfully.`, 'success');
            onRefresh();
        } catch (error) {
            showToast('Failed to process engineering request.', 'error');
        }
    };

    const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('document', file);
        formData.append('type', type);
        formData.append('category', 'engineering');

        setIsUploading(true);
        try {
            await axios.post(`/projects/${project.id}/documents`, formData);
            showToast(`${type.toUpperCase()} document uploaded successfully.`, 'success');
            onRefresh();
        } catch (error) {
            showToast('Failed to upload document.', 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const canManage = isPM || isOwner || isLeadArchitect;
    
    const isStructuralPro = user.role_type === 'structural';
    const isMEPPro = user.role_type === 'mep';

    const hasSubmittedStructural = (project.bids_structural || []).some((b: any) => 
        b.user_id === user.id || b.structural_engineer?.user_id === user.id
    );
    const hasSubmittedMEP = (project.bids_mep || []).some((b: any) => 
        b.user_id === user.id || b.mep_engineer?.user_id === user.id
    );

    const isStructuralPublished = project.published_bidding_roles?.includes('structural');
    const isMEPPublished = project.published_bidding_roles?.includes('mep');

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Engineering Hub</h2>
                    <p className="text-sm text-slate-500 font-medium">Calculations, Load Analysis & Technical Schematics</p>
                </div>
            </div>

            {/* Specialist Bidding Boards (For PM/Owner/Architect) */}
            {!project.structural_id && project.requires_structural && canManage && (
                <SpecialistBiddingBoard project={project} role="structural" onShortlist={onShortlist} onRecommend={onRecommend} onOpenChat={onOpenChat} />
            )}
            {!project.mep_id && project.requires_mep && canManage && (
                <SpecialistBiddingBoard project={project} role="mep" onShortlist={onShortlist} onRecommend={onRecommend} onOpenChat={onOpenChat} />
            )}

            {/* Specialist Bid Forms (For Professionals) */}
            {isStructuralPro && !project.structural_id && isStructuralPublished && !hasSubmittedStructural && (
                <div className="bg-white border-2 border-indigo-100 rounded-[2.5rem] p-10 shadow-xl">
                    <ProjectBidForm project={project} user={user} onSuccess={onRefresh} />
                </div>
            )}
            {isMEPPro && !project.mep_id && isMEPPublished && !hasSubmittedMEP && (
                <div className="bg-white border-2 border-amber-100 rounded-[2.5rem] p-10 shadow-xl">
                    <ProjectBidForm project={project} user={user} onSuccess={onRefresh} />
                </div>
            )}

            {/* Specialist Bid Status (If already bid) */}
            {((isStructuralPro && hasSubmittedStructural) || (isMEPPro && hasSubmittedMEP)) && !isStructural && !isMEP && (
                <div className="bg-emerald-50 border-2 border-emerald-100 rounded-[2rem] p-8 text-center space-y-3">
                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
                        <CheckCircle2 size={24} />
                    </div>
                    <div>
                        <h4 className="text-sm font-black text-emerald-900 uppercase tracking-tight">Proposal Transmitted</h4>
                        <p className="text-xs text-emerald-600 font-medium">Your technical bid is being reviewed by the project leadership.</p>
                    </div>
                </div>
            )}

            {/* PM Approval Board */}
            {isPM && pendingRequests.length > 0 && (
                <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden border border-white/10">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full -mr-32 -mt-32 blur-3xl opacity-50" />
                    <div className="relative z-10 space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-amber-500/20 text-amber-400 rounded-xl flex items-center justify-center">
                                <ShieldAlert size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black tracking-tight">Pending Authorizations</h3>
                                <p className="text-[10px] text-white/40 font-black uppercase tracking-widest">Technician Hiring Requests</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {pendingRequests.map((req: any) => (
                                <div key={req.id} className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between group hover:bg-white/10 transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center">
                                            <UserPlus size={18} />
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-white">{req.title}</p>
                                            <p className="text-[10px] text-white/40 font-medium">{req.amount > 0 ? `Suggested Fee: Rp ${req.amount.toLocaleString()}` : 'No fee suggested'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => handleVerifyTechnical(req.id, 'approved')}
                                            className="h-8 px-4 bg-emerald-500 hover:bg-emerald-600 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all shadow-lg shadow-emerald-500/20"
                                        >
                                            Authorize
                                        </button>
                                        <button 
                                            onClick={() => handleVerifyTechnical(req.id, 'rejected')}
                                            className="h-8 w-8 flex items-center justify-center bg-white/10 hover:bg-red-500/20 text-white/30 hover:text-red-500 rounded-lg transition-all"
                                        >
                                            <XCircle size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Structural Section */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white border-2 border-indigo-100 rounded-[2rem] p-6 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-5">
                            <HardHat size={80} />
                        </div>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                                <HardHat size={20} />
                            </div>
                            <h3 className="font-black text-slate-900 uppercase tracking-widest text-xs">Structural Engineering</h3>
                        </div>

                        {project.structural_engineer ? (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-2xl border border-indigo-100">
                                    <div className="w-10 h-10 rounded-full bg-indigo-200 border-2 border-white flex items-center justify-center overflow-hidden">
                                        <img src={`https://ui-avatars.com/api/?name=${project.structural_engineer.name}&background=6366f1&color=fff`} alt="" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-slate-900">{project.structural_engineer.name}</p>
                                        <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">Hired Specialist</p>
                                    </div>
                                </div>

                                {isStructural && (
                                    !project.design_authorized_at ? (
                                        <div className="w-full py-3 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black text-red-600 uppercase tracking-widest">
                                            <Lock size={12} /> Awaiting PM Authorization
                                        </div>
                                    ) : (
                                        <label className="block w-full cursor-pointer group">
                                            <div className="w-full py-3 border-2 border-dashed border-indigo-200 rounded-2xl flex items-center justify-center gap-2 group-hover:border-indigo-400 group-hover:bg-indigo-50 transition-all text-[10px] font-black text-indigo-500 uppercase tracking-widest">
                                                <Upload size={14} />
                                                {isUploading ? 'Uploading...' : 'Upload Calc/Layout'}
                                            </div>
                                            <input type="file" className="hidden" onChange={(e) => handleUploadDocument(e, 'structural_calc')} disabled={isUploading} />
                                        </label>
                                    )
                                )}
                            </div>
                        ) : (
                            <div className="py-8 text-center space-y-3">
                                <ShieldAlert size={32} className="mx-auto text-slate-300" />
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">No structural specialist hired yet</p>
                            </div>
                        )}
                    </div>

                    <div className="bg-white border-2 border-amber-100 rounded-[2rem] p-6 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-5">
                            <Zap size={80} />
                        </div>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
                                <Zap size={20} />
                            </div>
                            <h3 className="font-black text-slate-900 uppercase tracking-widest text-xs">MEP Engineering</h3>
                        </div>

                        {project.mep_engineer ? (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-2xl border border-amber-100">
                                    <div className="w-10 h-10 rounded-full bg-amber-200 border-2 border-white flex items-center justify-center overflow-hidden">
                                        <img src={`https://ui-avatars.com/api/?name=${project.mep_engineer.name}&background=f59e0b&color=fff`} alt="" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-slate-900">{project.mep_engineer.name}</p>
                                        <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Hired Specialist</p>
                                    </div>
                                </div>

                                {isMEP && (
                                    !project.design_authorized_at ? (
                                        <div className="w-full py-3 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black text-red-600 uppercase tracking-widest">
                                            <Lock size={12} /> Awaiting PM Authorization
                                        </div>
                                    ) : (
                                        <label className="block w-full cursor-pointer group">
                                            <div className="w-full py-3 border-2 border-dashed border-amber-200 rounded-2xl flex items-center justify-center gap-2 group-hover:border-amber-400 group-hover:bg-amber-50 transition-all text-[10px] font-black text-amber-500 uppercase tracking-widest">
                                                <Upload size={14} />
                                                {isUploading ? 'Uploading...' : 'Upload System Layout'}
                                            </div>
                                            <input type="file" className="hidden" onChange={(e) => handleUploadDocument(e, 'mep_layout')} disabled={isUploading} />
                                        </label>
                                    )
                                )}
                            </div>
                        ) : (
                            <div className="py-8 text-center space-y-3">
                                <ShieldAlert size={32} className="mx-auto text-slate-300" />
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">No MEP specialist hired yet</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Tracking & Verification */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl" />
                        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10">
                                    <FileText size={24} className="text-emerald-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black tracking-tight">Engineering Milestone Logs</h3>
                                    <p className="text-xs text-white/50 font-bold uppercase tracking-widest">Calculations & Blueprint Archive</p>
                                </div>
                            </div>

                            {isPM && (
                                <button className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-500/20">
                                    Final Review & Signoff
                                </button>
                            )}
                        </div>

                        <div className="space-y-3">
                            {/* Placeholder for real documents - will integrate with project.documents */}
                            {(project.documents || []).filter(d => d.category === 'engineering').length > 0 ? (
                                project.documents.filter(d => d.category === 'engineering').map((doc: any) => (
                                    <div key={doc.id} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl group hover:bg-white/10 transition-all">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center">
                                                <FileText size={18} className="text-slate-400" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-white">{doc.name}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">{doc.type}</span>
                                                    <span className="w-1 h-1 rounded-full bg-white/20" />
                                                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Verified</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-all">
                                                <Download size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="py-12 text-center space-y-4">
                                    <div className="w-16 h-16 bg-white/5 border-2 border-dashed border-white/10 rounded-full flex items-center justify-center mx-auto">
                                        <Activity size={24} className="text-white/20" />
                                    </div>
                                    <p className="text-[11px] font-black text-white/30 uppercase tracking-widest">No technical assets uploaded yet</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-6 bg-white border border-slate-100 rounded-3xl space-y-3">
                            <div className="flex items-center gap-2 text-indigo-600">
                                <ShieldCheck size={18} />
                                <h4 className="text-xs font-black uppercase tracking-widest">Load Safety</h4>
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                All structural calculations are cross-verified with the physics engine parameters set by the Architect.
                            </p>
                        </div>
                        <div className="p-6 bg-white border border-slate-100 rounded-3xl space-y-3">
                            <div className="flex items-center gap-2 text-amber-600">
                                <Clock size={18} />
                                <h4 className="text-xs font-black uppercase tracking-widest">Utility Routing</h4>
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                MEP layouts must be finalized before the Bill of Materials is generated for procurement.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
