import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, HardHat, Zap, Sofa, Check, Loader2, AlertCircle, Users } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

interface RequestSpecialistModalProps {
    projectId: number;
    project: any;
    isOpen: boolean;
    roleType: 'structural' | 'mep' | 'interior' | null;
    onClose: () => void;
    onRefresh: () => void;
}

export default function RequestSpecialistModal({
    projectId,
    project,
    isOpen,
    roleType,
    onClose,
    onRefresh
}: RequestSpecialistModalProps) {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    
    // Form States
    const [sourcingMethod, setSourcingMethod] = useState<'bidding' | 'roster'>('bidding');
    const [suggestedFee, setSuggestedFee] = useState('');
    const [description, setDescription] = useState('');

    // Roster / Team States
    const [teamMembers, setTeamMembers] = useState<any[]>([]);
    const [firmMembers, setFirmMembers] = useState<any[]>([]);
    const [selectedTeamMemberId, setSelectedTeamMemberId] = useState('');

    const fetchTeamMembers = async () => {
        try {
            const [teamRes, firmRes] = await Promise.all([
                axios.get('/team-members'),
                axios.get('/firm-members/roster'),
            ]);
            setTeamMembers(teamRes.data.data || []);
            setFirmMembers(
                (firmRes.data.data || []).filter((fm: any) => fm.status === 'active')
            );
        } catch (error) {
            console.error('Failed to fetch members', error);
        }
    };

    useEffect(() => {
        if (isOpen && roleType) {
            // Set default reasons based on role
            if (roleType === 'interior') {
                setDescription('An interior designer is needed to detail spatial aesthetics, layout planning, and materials selection for interior styling.');
            } else if (roleType === 'structural') {
                setDescription('Based on current architectural layouts, a specialized structural engineering review is required to guarantee structural safety and permit compliance.');
            } else {
                setDescription('Utility routing, high-capacity load planning, and HVAC/Plumbing engineering are required to prevent design clashes.');
            }
            setSuggestedFee('');
            setSourcingMethod('bidding');
            setSelectedTeamMemberId('');
            fetchTeamMembers();
        }
    }, [isOpen, roleType]);

    if (!isOpen || !roleType) return null;

    const roleConfig = {
        structural: {
            title: 'Structural Engineer',
            subtitle: 'Forces & Structural Calculations',
            icon: HardHat,
            color: 'bg-slate-100 text-slate-600 border-slate-200',
            btnColor: 'bg-zinc-900 hover:bg-zinc-800 shadow-slate-600/10'
        },
        mep: {
            title: 'MEP Engineer',
            subtitle: 'Mechanical, Electrical, Plumbing',
            icon: Zap,
            color: 'bg-amber-100 text-amber-600 border-amber-200',
            btnColor: 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/10'
        },
        interior: {
            title: 'Interior Designer',
            subtitle: 'Space Planning & Styling Curation',
            icon: Sofa,
            color: 'bg-rose-100 text-rose-600 border-rose-200',
            btnColor: 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/10'
        }
    }[roleType];

    const Icon = roleConfig.icon;

    // Resolve details for selected team member/roster profile preview
    const selectedProfile = (() => {
        if (!selectedTeamMemberId) return null;
        if (selectedTeamMemberId.startsWith('firm:')) {
            const userId = selectedTeamMemberId.replace('firm:', '');
            const fm = firmMembers.find(f => String(f.member_user_id) === String(userId));
            if (!fm) return null;
            
            const rawPic = fm.member?.profile_picture || fm.member?.pic;
            const avatarUrl = rawPic 
                ? (rawPic.startsWith('http') ? rawPic : (rawPic.startsWith('/storage') ? rawPic : `/storage/${rawPic}`))
                : null;
                
            return {
                name: fm.member?.name,
                role: fm.role_in_firm ? fm.role_in_firm.replace(/_/g, ' ') : 'Firm Member',
                type: 'Firm Roster',
                avatar: avatarUrl,
                skills: fm.member?.technical_skills,
                email: fm.member?.email,
                phone: fm.member?.phone_number
            };
        } else {
            const tm = teamMembers.find(t => String(t.id) === String(selectedTeamMemberId));
            if (!tm) return null;
            
            const rawPic = tm.photo_url || tm.photo_path;
            const avatarUrl = rawPic
                ? (rawPic.startsWith('http') ? rawPic : (rawPic.startsWith('/storage') ? rawPic : `/storage/${rawPic}`))
                : null;
                
            return {
                name: tm.name,
                role: tm.role_title || 'Expert Specialist',
                type: 'Legacy Team',
                avatar: avatarUrl,
                skills: tm.skills_summary,
                email: tm.email,
                phone: tm.phone
            };
        }
    })();

    const isSelectedAlreadyAssigned = (() => {
        if (!selectedTeamMemberId) return false;
        if (selectedTeamMemberId.startsWith('firm:')) {
            const userId = selectedTeamMemberId.replace('firm:', '');
            const inSub = (project?.sub_professionals || []).some(
                (sp: any) => String(sp.user_id) === String(userId) && !['declined', 'removed'].includes(sp.status)
            );
            const isStructural = String(project?.structural_profile?.user_id) === String(userId);
            const isMep = String(project?.mep_profile?.user_id) === String(userId);
            const isArsitek = String(project?.selected_arsitek_id) === String(userId);
            const isKontraktor = String(project?.selected_kontraktor_id) === String(userId);
            const isPM = String(project?.pm_id) === String(userId);
            const isOwner = String(project?.user_id) === String(userId);
            
            return inSub || isStructural || isMep || isArsitek || isKontraktor || isPM || isOwner;
        } else {
            return (project?.sub_professionals || []).some(
                (sp: any) => String(sp.team_member_id) === String(selectedTeamMemberId) && !['declined', 'removed'].includes(sp.status)
            );
        }
    })();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const payload: any = {
                role_type: roleType,
                description: `[Sourcing Plan: ${sourcingMethod === 'roster' ? 'Bring Own Team / Roster' : 'Open Platform Bidding'}] \n\n${description}`,
                suggested_fee: suggestedFee ? Number(suggestedFee) : 0
            };

            if (sourcingMethod === 'roster' && selectedTeamMemberId) {
                if (selectedTeamMemberId.startsWith('firm:')) {
                    const cleanUserId = selectedTeamMemberId.replace('firm:', '');
                    payload.assigned_user_id = Number(cleanUserId);
                } else {
                    payload.team_member_id = Number(selectedTeamMemberId);
                }
            }

            await axios.post(`/projects/${projectId}/request-engineering`, payload);

            showToast(`${roleConfig.title} integration request submitted to PM!`, 'success');
            onRefresh();
            onClose();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to submit request.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <div className="bg-white rounded-[2.5rem] w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                {/* Header */}
                <div className="relative p-8 pb-4">
                    <button 
                        onClick={onClose}
                        className="absolute top-8 right-8 p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all"
                    >
                        <X size={20} />
                    </button>
                    
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${roleConfig.color}`}>
                            <Icon size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 tracking-tight">Request {roleConfig.title}</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{roleConfig.subtitle}</p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-5">
                    <div className="grid grid-cols-1 gap-5">
                        {/* Sourcing Option Selection */}
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5 ml-1 font-black">Sourcing Strategy</label>
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    type="button"
                                    onClick={() => setSourcingMethod('bidding')}
                                    className={`p-4 border-2 rounded-2xl flex flex-col items-center gap-2 transition-all ${
                                        sourcingMethod === 'bidding'
                                            ? 'border-slate-900 bg-slate-900/5 text-slate-950 font-black'
                                            : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                                    }`}
                                >
                                    <Users size={20} className={sourcingMethod === 'bidding' ? 'text-slate-950' : 'text-slate-400'} />
                                    <div className="text-center">
                                        <p className="text-xs font-black">Open Bidding</p>
                                        <p className="text-[8px] font-medium text-slate-400 mt-0.5">Let specialists bid freely</p>
                                    </div>
                                </button>
                                
                                <button
                                    type="button"
                                    onClick={() => setSourcingMethod('roster')}
                                    className={`p-4 border-2 rounded-2xl flex flex-col items-center gap-2 transition-all ${
                                        sourcingMethod === 'roster'
                                            ? 'border-slate-900 bg-slate-900/5 text-slate-950 font-black'
                                            : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                                    }`}
                                >
                                    <Icon size={20} className={sourcingMethod === 'roster' ? roleConfig.color.split(' ')[1] : 'text-slate-400'} />
                                    <div className="text-center">
                                        <p className="text-xs font-black">Bring Own Team</p>
                                        <p className="text-[8px] font-medium text-slate-400 mt-0.5">Assign internal colleague</p>
                                    </div>
                                </button>
                            </div>
                        </div>

                        {/* Roster Colleague Selection & Premium Profile Card */}
                        {sourcingMethod === 'roster' && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Select Colleague</label>
                                    <select 
                                        value={selectedTeamMemberId} 
                                        onChange={e => setSelectedTeamMemberId(e.target.value)}
                                        required={sourcingMethod === 'roster'}
                                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:bg-white focus:border-slate-300 outline-none transition-all cursor-pointer"
                                    >
                                        <option value="">Choose Member...</option>
                                        {firmMembers.length > 0 && (
                                            <optgroup label="Firm Roster (Account-linked)">
                                                {firmMembers.map(fm => {
                                                    const targetUserId = String(fm.member_user_id);
                                                    const inSub = (project?.sub_professionals || []).some(
                                                        (sp: any) => String(sp.user_id) === targetUserId && !['declined', 'removed'].includes(sp.status)
                                                    );
                                                    const isStructural = String(project?.structural_profile?.user_id) === targetUserId;
                                                    const isMep = String(project?.mep_profile?.user_id) === targetUserId;
                                                    const isArsitek = String(project?.selected_arsitek_id) === targetUserId;
                                                    const isKontraktor = String(project?.selected_kontraktor_id) === targetUserId;
                                                    const isPM = String(project?.pm_id) === targetUserId;
                                                    const isOwner = String(project?.user_id) === targetUserId;
                                                    
                                                    const isAlreadySub = inSub || isStructural || isMep || isArsitek || isKontraktor || isPM || isOwner;
                                                    
                                                    return (
                                                        <option key={`firm-${fm.id}`} value={`firm:${fm.member_user_id}`}>
                                                            {fm.member?.name} — {fm.role_in_firm?.replace(/_/g, ' ')} {isAlreadySub ? '⚠️ (Already Assigned to Project)' : '✓'}
                                                        </option>
                                                    );
                                                })}
                                            </optgroup>
                                        )}
                                        {teamMembers.length > 0 && (
                                            <optgroup label="Legacy Team Members">
                                                {teamMembers.map(m => {
                                                    const isAlreadyTeam = (project?.sub_professionals || []).some(
                                                        (sp: any) => String(sp.team_member_id) === String(m.id) && !['declined', 'removed'].includes(sp.status)
                                                    );
                                                    return (
                                                        <option key={`team-${m.id}`} value={m.id}>
                                                            {m.name} — {m.role_title} {isAlreadyTeam ? '⚠️ (Already Assigned to Project)' : ''}
                                                        </option>
                                                    );
                                                })}
                                            </optgroup>
                                        )}
                                    </select>
                                </div>

                                {selectedProfile && (
                                    <div className="p-5 bg-slate-50 border border-slate-100 rounded-3xl flex items-start gap-4 animate-in fade-in duration-300">
                                        <div className="w-16 h-16 bg-white border border-slate-200 rounded-[1.25rem] overflow-hidden shrink-0 flex items-center justify-center">
                                            {selectedProfile.avatar ? (
                                                <img src={selectedProfile.avatar} alt={selectedProfile.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <Users className="text-slate-400" size={28} />
                                            )}
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-sm font-black text-slate-900">{selectedProfile.name}</h4>
                                                <span className="px-2 py-0.5 bg-slate-50 border border-slate-100 text-slate-700 text-[8px] font-black uppercase tracking-widest rounded">
                                                    {selectedProfile.type}
                                                </span>
                                            </div>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{selectedProfile.role}</p>
                                            {selectedProfile.skills && (
                                                <p className="text-[10px] text-slate-400 font-medium italic mt-1 leading-relaxed">
                                                    Skills: {selectedProfile.skills}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {isSelectedAlreadyAssigned && (
                                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 animate-in fade-in duration-300">
                                        <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={16} />
                                        <div>
                                            <p className="text-[11px] font-black text-amber-800">Specialist Already Assigned</p>
                                            <p className="text-[9px] text-amber-600 mt-0.5 leading-relaxed font-bold">
                                                This specialist is already assigned to an active role or phase within this project. Re-requesting will duplicate their assignment.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Suggested Fee / Fixed Fee */}
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                                {sourcingMethod === 'roster' ? 'Proposed Fixed Fee Allocation (Rp)' : 'Target Budget Estimate (Rp)'}
                            </label>
                            <div className="relative">
                                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">IDR</span>
                                <input 
                                    type="number" 
                                    value={suggestedFee} 
                                    onChange={e => setSuggestedFee(e.target.value)} 
                                    required={sourcingMethod === 'roster'}
                                    min={sourcingMethod === 'roster' ? '1' : '0'}
                                    placeholder={sourcingMethod === 'roster' ? 'e.g. 15000000' : 'e.g. 15000000 (Optional)'}
                                    className="w-full pl-14 pr-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-black focus:bg-white focus:border-slate-300 outline-none transition-all"
                                />
                            </div>
                            <span className="text-[9px] text-slate-400 font-medium ml-1">
                                {sourcingMethod === 'roster' 
                                    ? 'This fixed fee is strictly required for internal roster assignment approval.' 
                                    : 'Optional. Sets a cost benchmark for platform specialists when placing bids.'}
                            </span>
                        </div>

                        {/* Justification Textarea */}
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Reason & Integration Scope</label>
                            <textarea 
                                value={description} 
                                onChange={e => setDescription(e.target.value)} 
                                required 
                                rows={4} 
                                placeholder="State clearly why the design requires this specialist addition..." 
                                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:bg-white focus:border-slate-300 outline-none resize-none transition-all leading-relaxed"
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-4 pt-4">
                        <button 
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-4 bg-slate-50 text-slate-500 rounded-[1.5rem] text-xs font-black uppercase tracking-widest hover:bg-slate-100 transition-all"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            disabled={loading}
                            className={`flex-1 flex items-center justify-center gap-3 py-4 text-white rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 disabled:opacity-50 ${roleConfig.btnColor}`}
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                            Submit Request
                        </button>
                    </div>

                    {/* Alert banner */}
                    <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                        <AlertCircle size={16} className="text-amber-500 shrink-0" />
                        <p className="text-[9px] font-bold text-amber-700 leading-normal uppercase tracking-wider">
                            PM Authorization Required. Once authorized, the hiring pipeline will be activated.
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
}
