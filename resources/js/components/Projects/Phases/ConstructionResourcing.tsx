import React, { useState, useMemo } from 'react';
import { Users, UserPlus, ShieldCheck, CheckCircle, Clock, HardHat } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { CONSTRUCTION_SUB_ROLES, ConstructionSubRoleKey } from '../../../constants/ConstructionSubRolePresets';
import { ProjectSubProfessional } from '../../../types/sub_professional.types';

interface ConstructionResourcingProps {
    project: any;
    user: any;
    activeSubRole: ConstructionSubRoleKey;
    onRefresh: () => void;
    isContractor: boolean;
}

export default function ConstructionResourcing({
    project, user, activeSubRole, onRefresh, isContractor
}: ConstructionResourcingProps): React.ReactElement {
    const { showToast } = useToast();
    const [isProcessing, setIsProcessing] = useState(false);

    const isOwner = Number(user?.id) === Number(project.user_id);
    const isPM = (user?.role_type === 'project_manager' || user?.role_type === 'pm')
        && Number(project.pm_id) === Number(user?.id);

    const roleConfig = useMemo(() =>
        CONSTRUCTION_SUB_ROLES.find(r => r.key === activeSubRole),
    [activeSubRole]);

    const subPros = useMemo<ProjectSubProfessional[]>(() => {
        if (!project?.sub_professionals) return [];
        return project.sub_professionals.filter(
            (s: ProjectSubProfessional) =>
                s.sub_role === activeSubRole && s.parent_role === 'kontraktor' && s.status !== 'removed'
        );
    }, [project?.sub_professionals, activeSubRole]);

    const activeSub = useMemo(() =>
        subPros.find(s => s.status === 'active'),
    [subPros]);

    const handleInviteSubContractor = () => {
        window.dispatchEvent(new CustomEvent('switchDashboardTab', { detail: 'find-contractors' }));
    };

    if (!roleConfig) return <></>;

    const Icon = roleConfig.icon;

    return (
        <div className="bg-white border-2 border-slate-100 rounded-[2.5rem] p-8 shadow-sm space-y-8 relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="absolute top-0 right-0 w-48 h-48 bg-slate-50 rounded-bl-[5rem] -mr-12 -mt-12 -z-10" />

            <div className="flex items-center justify-between border-b border-slate-100 pb-6">
                <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 bg-${roleConfig.color}-100 rounded-2xl flex items-center justify-center text-${roleConfig.color}-600 shadow-lg shrink-0`}>
                        <Icon size={28} />
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">{roleConfig.label}</h3>
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mt-1">
                            {roleConfig.description}
                        </p>
                    </div>
                </div>

                {activeSub ? (
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-widest">
                        Assigned
                    </span>
                ) : (
                    <span className="px-3 py-1 bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest">
                        Standby
                    </span>
                )}
            </div>

            {activeSub ? (
                <div className="space-y-4">
                    <div className="p-5 bg-slate-50 border border-slate-100 rounded-3xl flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-lg font-black text-slate-600 shadow-sm">
                                {activeSub.user?.name?.charAt(0) || '?'}
                            </div>
                            <div>
                                <h5 className="text-sm font-black text-slate-900">{activeSub.user?.name || 'Sub-Contractor'}</h5>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{roleConfig.labelId}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <CheckCircle size={14} className="text-emerald-500" />
                            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Active</span>
                        </div>
                    </div>

                    {activeSub.scope_notes && (
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Scope Notes</p>
                            <p className="text-xs text-slate-600 font-medium leading-relaxed">{activeSub.scope_notes}</p>
                        </div>
                    )}

                    {activeSub.rate > 0 && (
                        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Agreed Rate</span>
                            <span className="text-sm font-black text-slate-900">
                                Rp {Number(activeSub.rate).toLocaleString('id-ID')}
                            </span>
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-6">
                    {subPros.length > 0 ? (
                        <div className="space-y-3">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                {subPros.length} Candidate{subPros.length > 1 ? 's' : ''} in Pipeline
                            </p>
                            {subPros.map(sub => (
                                <div key={sub.id} className="p-4 bg-white border border-slate-200 rounded-2xl flex items-center justify-between shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-xs font-black text-slate-600">
                                            {sub.user?.name?.charAt(0) || '?'}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">{sub.user?.name || 'Unknown'}</p>
                                            <p className="text-[10px] text-slate-400 font-medium">{roleConfig.labelId}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Clock size={11} className="text-amber-500" />
                                        <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest capitalize">
                                            {sub.status}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl text-center space-y-4">
                            <div className="w-14 h-14 bg-white text-slate-300 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                                <Users size={28} />
                            </div>
                            <div>
                                <h5 className="text-sm font-black text-slate-700 uppercase tracking-tight">No Sub-Contractor Assigned</h5>
                                <p className="text-[10px] text-slate-400 font-medium mt-1 max-w-sm mx-auto">
                                    The General Contractor can invite a {roleConfig.label} specialist to manage this scope of work.
                                </p>
                            </div>
                        </div>
                    )}

                    {isContractor && (
                        <button
                            onClick={handleInviteSubContractor}
                            disabled={isProcessing}
                            className="w-full py-4 rounded-2xl border-2 border-slate-200 text-slate-600 hover:border-slate-900 hover:text-slate-900 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 group"
                        >
                            <UserPlus size={14} />
                            Invite {roleConfig.label} Sub-Contractor
                        </button>
                    )}

                    {(isOwner || isPM) && !isContractor && (
                        <div className="p-3 bg-slate-100 border border-slate-200 rounded-2xl flex items-start gap-3">
                            <ShieldCheck className="text-slate-400 shrink-0 mt-0.5" size={16} />
                            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                Sub-contractor assignment is managed by the General Contractor. Contact them to coordinate {roleConfig.label.toLowerCase()} work.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
