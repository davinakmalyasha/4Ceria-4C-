import React, { useMemo } from 'react';
import { Plus, X, Users, UserCheck } from 'lucide-react';
import { ProposedTeamMember, TeamMember } from '../../../../types/sub_professional.types';

interface TeamCompositionSectionProps {
    team: ProposedTeamMember[];
    onChange: (team: ProposedTeamMember[]) => void;
    availableMembers: TeamMember[];
    teamTotal: number;
}

export const TeamCompositionSection: React.FC<TeamCompositionSectionProps> = ({
    team, onChange, availableMembers, teamTotal,
}) => {

    const addFromRoster = (member: TeamMember) => {
        const already = team.some(t => t.team_member_id === member.id);
        if (already) return;
        onChange([...team, {
            team_member_id: member.id,
            name: member.name,
            role_title: member.role_title,
            role: 'other',
            fee: 0,
            fee_type: 'fixed',
            note: '',
        }]);
    };

    const removeMember = (index: number) => {
        onChange(team.filter((_, i) => i !== index));
    };

    const updateMember = (index: number, updates: Partial<ProposedTeamMember>) => {
        const updated = [...team];
        updated[index] = { ...updated[index], ...updates };
        onChange(updated);
    };

    const unusedRoster = useMemo(() =>
        availableMembers.filter(m => !team.some(t => t.team_member_id === m.id)),
    [availableMembers, team]);

    return (
        <div className="space-y-6">
            {/* Header info */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Users size={18} className="text-slate-900" />
                    <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Team Composition</span>
                </div>
                {teamTotal > 0 && (
                    <span className="text-xs font-black text-slate-600 bg-slate-50 px-3 py-1 rounded-xl">
                        Team Total: Rp {teamTotal.toLocaleString('id-ID')}
                    </span>
                )}
            </div>

            {/* Dropdown Selector to select from active Team Roster */}
            {unusedRoster.length > 0 ? (
                <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Assign Member from Roster</label>
                    <div className="relative">
                        <select
                            onChange={(e) => {
                                const id = Number(e.target.value);
                                if (id) {
                                    const member = unusedRoster.find(m => m.id === id);
                                    if (member) addFromRoster(member);
                                }
                                e.target.value = "";
                            }}
                            className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 hover:border-slate-200 focus:border-slate-900 rounded-3xl text-xs font-black text-slate-700 outline-none transition-all cursor-pointer appearance-none"
                            defaultValue=""
                        >
                            <option value="" disabled>➕ Choose team member joining this project...</option>
                            {unusedRoster.map(m => (
                                <option key={m.id} value={m.id}>
                                    {m.name} ({m.role_title || 'Team Member'})
                                </option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-6 flex items-center text-slate-400">
                            <Plus size={16} />
                        </div>
                    </div>
                </div>
            ) : (availableMembers.length === 0 && team.length === 0) ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-3xl text-center space-y-1">
                    <p className="text-xs font-black text-slate-700">No team members in your roster.</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">You can invite and manage your firm team members in your Dashboard Roster tab.</p>
                </div>
            ) : (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-800 text-[10px] font-bold uppercase tracking-wider justify-center">
                    <UserCheck size={14} className="text-emerald-500" />
                    <span>All team members assigned to this proposal</span>
                </div>
            )}

            {/* Selected Assigned Members List */}
            <div className="space-y-3">
                {team.map((member, index) => (
                    <TeamMemberEntry 
                        key={index} 
                        member={member} 
                        index={index} 
                        onUpdate={updateMember} 
                        onRemove={removeMember} 
                    />
                ))}
            </div>
        </div>
    );
};

/* ─── Entry Row (Read-Only name/role + editable fees/notes) ─── */

interface EntryProps {
    member: ProposedTeamMember;
    index: number;
    onUpdate: (i: number, u: Partial<ProposedTeamMember>) => void;
    onRemove: (i: number) => void;
}

const TeamMemberEntry: React.FC<EntryProps> = ({ member, index, onUpdate, onRemove }) => (
    <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100 space-y-4 relative group hover:border-slate-200 transition-all">
        {/* Remove Button */}
        <button 
            type="button" 
            onClick={() => onRemove(index)}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
        >
            <X size={16} />
        </button>

        {/* Member Profile Info (Read-only from Roster) */}
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="w-9 h-9 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center font-black text-slate-600 text-xs">
                {member.name ? member.name.charAt(0) : 'T'}
            </div>
            <div>
                <h4 className="text-xs font-black text-slate-800">{member.name || 'Unnamed Member'}</h4>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{member.role_title || 'Team Member'}</p>
            </div>
        </div>

        {/* Fee & Note inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                    {member.fee_type === 'percentage' ? 'Fee Percentage' : 'Fee (IDR)'}
                </label>
                <div className="relative">
                    {member.fee_type !== 'percentage' && (
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400">Rp</span>
                    )}
                    <input 
                        type="number" 
                        required
                        min="0"
                        step="any"
                        value={member.fee || ''} 
                        onChange={e => onUpdate(index, { fee: Number(e.target.value) })}
                        onWheel={e => e.currentTarget.blur()}
                        className={`w-full ${member.fee_type === 'percentage' ? 'px-4' : 'pl-10 pr-4'} py-3 bg-white border border-slate-200 focus:border-slate-900 rounded-2xl text-xs font-black text-slate-900 outline-none transition-all`}
                        placeholder="0" 
                    />
                    {member.fee_type === 'percentage' && (
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400">%</span>
                    )}
                </div>
            </div>
            <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1.5">Fee Structure</label>
                <select 
                    value={member.fee_type || 'fixed'} 
                    onChange={e => onUpdate(index, { fee_type: e.target.value as any })}
                    className="w-full px-4 py-3 bg-white border border-slate-200 focus:border-slate-900 rounded-2xl text-xs font-black text-slate-700 outline-none transition-all cursor-pointer"
                >
                    <option value="fixed">Fixed Amount</option>
                    <option value="percentage">% of Project</option>
                </select>
            </div>
            <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1.5">Role Note / Scope</label>
                <input 
                    type="text" 
                    value={member.note || ''} 
                    onChange={e => onUpdate(index, { note: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-slate-200 focus:border-slate-900 rounded-2xl text-xs font-medium text-slate-800 outline-none transition-all"
                    placeholder="Describe contributions..." 
                />
            </div>
        </div>
    </div>
);
