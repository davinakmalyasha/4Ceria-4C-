import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import { Users, UserPlus, ShieldCheck, CheckCircle, Clock, HardHat, MessageSquare, MessageCircle } from 'lucide-react';
import SubContractorWorkspace from './SubContractorWorkspace';
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
    
    // Manual assignment states
    const [roster, setRoster] = useState<any[]>([]);
    const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
    const [customRate, setCustomRate] = useState<string>('');
    const [customNote, setCustomNote] = useState<string>('');

    const isOwner = Number(user?.id) === Number(project.user_id);
    const isPM = (user?.role_type === 'project_manager' || user?.role_type === 'pm')
        && Number(project.pm_id) === Number(user?.id);

    const roleConfig = useMemo(() =>
        CONSTRUCTION_SUB_ROLES.find(r => r.key === activeSubRole),
    [activeSubRole]);

    // Fetch roster on mount for lead contractor
    useEffect(() => {
        if (isContractor) {
            axios.get('/firm-members/roster')
                .then(res => {
                    setRoster(res.data?.data || []);
                })
                .catch(err => console.error("Failed to fetch roster:", err));
        }
    }, [isContractor]);

    // Calculate assignable candidates from proposed team & firm roster
    const assignableCandidates = useMemo(() => {
        const list: Array<{ id: number; name: string; role_title: string; source: 'proposed' | 'roster'; defaultRate: number; defaultNote: string }> = [];
        
        // 1. Proposed Team from negotiated contractor bid
        const proposed = project.accepted_kontraktor_bid?.proposed_team || [];
        proposed.forEach((p: any) => {
            if (p.team_member_id) {
                list.push({
                    id: Number(p.team_member_id),
                    name: p.name,
                    role_title: p.role_title || 'Proposed Specialist',
                    source: 'proposed',
                    defaultRate: Number(p.fee) || 0,
                    defaultNote: p.note || ''
                });
            }
        });
        
        // 2. Firm Roster members
        roster.forEach((r: any) => {
            if (r.member_user_id && r.member) {
                if (!list.some(l => l.id === Number(r.member_user_id))) {
                    list.push({
                        id: Number(r.member_user_id),
                        name: r.member.name,
                        role_title: r.role_in_firm || r.member.role_type || 'Roster Specialist',
                        source: 'roster',
                        defaultRate: Number(r.member.rate_harga) || 0,
                        defaultNote: ''
                    });
                }
            }
        });
        
        return list;
    }, [project.accepted_kontraktor_bid?.proposed_team, roster]);

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

    const handleCandidateChange = (candidateId: string) => {
        setSelectedCandidateId(candidateId);
        const cand = assignableCandidates.find(c => String(c.id) === candidateId);
        if (cand) {
            setCustomRate(String(cand.defaultRate));
            setCustomNote(cand.defaultNote);
        } else {
            setCustomRate('');
            setCustomNote('');
        }
    };

    const handleAssignSubContractor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCandidateId) {
            showToast('Please select a team member to assign.', 'error');
            return;
        }
        setIsProcessing(true);
        try {
            await axios.post(`/projects/${project.id}/sub-professionals`, {
                user_id: Number(selectedCandidateId),
                parent_role: 'kontraktor',
                sub_role: activeSubRole,
                rate: Number(customRate) || 0,
                scope_notes: customNote
            });
            showToast('Sub-contractor assigned successfully!', 'success');
            setSelectedCandidateId('');
            setCustomRate('');
            setCustomNote('');
            onRefresh();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to assign sub-contractor.', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleHireSubContractor = async (subId: number) => {
        if (!window.confirm('Hire and activate this sub-contractor for this scope of work?')) return;
        setIsProcessing(true);
        try {
            await axios.post(`/projects/${project.id}/sub-professionals/${subId}/hire`);
            showToast('Sub-contractor hired successfully!', 'success');
            onRefresh();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to hire sub-contractor.', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    if (!roleConfig) return <></>;

    const Icon = roleConfig.icon;
    const showAssignedHeader = !!(activeSub && isContractor);

    return (
        <div className="bg-white border-2 border-slate-100 rounded-[2.5rem] p-8 shadow-sm space-y-8 relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="absolute top-0 right-0 w-48 h-48 bg-slate-50 rounded-bl-[5rem] -mr-12 -mt-12 -z-10" />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6">
                {showAssignedHeader ? (
                    <>
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-slate-100 border border-slate-200 rounded-2xl flex items-center justify-center text-slate-700 shadow-inner shrink-0 overflow-hidden">
                                {activeSub.user?.pic ? (
                                    <img src={activeSub.user.pic} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-lg font-black uppercase text-slate-500">
                                        {activeSub.user?.name?.charAt(0) || '?'}
                                    </span>
                                )}
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                                    {activeSub.user?.name || 'Assigned Specialist'}
                                </h3>
                                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-1">
                                    {roleConfig.label} Specialist
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    if (activeSub.user?.id) {
                                        window.dispatchEvent(new CustomEvent('start_chat', { detail: activeSub.user.id }));
                                    }
                                }}
                                className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                            >
                                <MessageSquare size={14} />
                                Chat
                            </button>
                            {activeSub.user?.phone_number && (
                                <a
                                    href={`https://wa.me/${activeSub.user.phone_number.replace(/[^0-9]/g, '')}?text=Hi%20${activeSub.user.name || ''},%20I%20am%20the%20lead%20contractor%20on%20project%20"${project.title}".`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-4 py-2.5 bg-[#25D366] hover:bg-[#20ba56] text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                                >
                                    <MessageCircle size={14} />
                                    WhatsApp
                                </a>
                            )}
                        </div>
                    </>
                ) : (
                    <>
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
                    </>
                )}
            </div>

            {activeSub ? (
                <SubContractorWorkspace
                    project={project}
                    currentUser={user}
                    activeSub={activeSub}
                    activeSubRole={activeSubRole}
                    roleLabel={roleConfig.labelId}
                    scopeNotes={activeSub.scope_notes}
                    rate={Number(activeSub.rate)}
                    isContractor={isContractor}
                />
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
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1.5">
                                            <Clock size={11} className="text-amber-500" />
                                            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest capitalize">
                                                {sub.status}
                                            </span>
                                        </div>
                                        {isContractor && sub.status === 'accepted' && (
                                            <button
                                                onClick={() => handleHireSubContractor(sub.id)}
                                                disabled={isProcessing}
                                                className="px-3 py-1.5 bg-slate-900 hover:bg-black text-white disabled:bg-slate-200 disabled:text-slate-400 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                                            >
                                                Hire Specialist
                                            </button>
                                        )}
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
                        <div className="border-t border-slate-100 pt-6 space-y-6">
                            {assignableCandidates.length > 0 ? (
                                <form onSubmit={handleAssignSubContractor} className="p-6 bg-slate-50 border border-slate-200 rounded-[2rem] space-y-4">
                                    <div className="flex items-center gap-2">
                                        <Users size={16} className="text-slate-950" />
                                        <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Assign from Negotiated Team / Firm Roster</span>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Select Team Member</label>
                                        <select
                                            value={selectedCandidateId}
                                            onChange={e => handleCandidateChange(e.target.value)}
                                            className="w-full px-5 py-3 bg-white border border-slate-200 focus:border-slate-900 rounded-xl text-xs font-bold text-slate-700 outline-none transition-all cursor-pointer"
                                        >
                                            <option value="">-- Choose Member --</option>
                                            {assignableCandidates.map(c => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name} ({c.role_title}) [{c.source === 'proposed' ? 'Proposed' : 'Roster'}]
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Scope Notes / Instructions</label>
                                        <input
                                            type="text"
                                            value={customNote}
                                            onChange={e => setCustomNote(e.target.value)}
                                            placeholder="Specify scope for this sub-contractor..."
                                            className="w-full px-5 py-3 bg-white border border-slate-200 focus:border-slate-900 rounded-xl text-xs font-medium text-slate-700 outline-none transition-all"
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isProcessing || !selectedCandidateId}
                                        className="w-full py-3 bg-slate-950 hover:bg-black text-white disabled:bg-slate-200 disabled:text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                    >
                                        <CheckCircle size={14} />
                                        Confirm Assignment
                                    </button>
                                </form>
                            ) : (
                                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs font-medium text-slate-500">
                                    No roster or negotiated team members found. Invite them first to assign.
                                </div>
                            )}

                        </div>
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
