import React, { useMemo } from 'react';
import { Plus, X, Users, UserPlus } from 'lucide-react';
import { ProposedTeamMember, TeamMember } from '../../../../types/sub_professional.types';

const ROLE_OPTIONS = [
    { value: 'structural', label: 'Structural Engineer' },
    { value: 'mep', label: 'MEP Engineer' },
    { value: 'surveyor', label: 'Surveyor' },
    { value: 'foreman', label: 'Site Foreman' },
    { value: 'electrician', label: 'Electrician' },
    { value: 'plumber', label: 'Plumber' },
    { value: 'other', label: 'Other' },
] as const;

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

    const addManual = () => {
        onChange([...team, {
            team_member_id: null,
            name: '',
            role_title: '',
            role: 'other',
            fee: 0,
            fee_type: 'fixed',
            note: '',
        }]);
    };

    const updateMember = (index: number, updates: Partial<ProposedTeamMember>) => {
        const updated = [...team];
        updated[index] = { ...updated[index], ...updates };
        onChange(updated);
    };

    const removeMember = (index: number) => {
        onChange(team.filter((_, i) => i !== index));
    };

    const unusedRoster = useMemo(() =>
        availableMembers.filter(m => !team.some(t => t.team_member_id === m.id)),
    [availableMembers, team]);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Users size={16} className="text-blue-600" />
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Team Composition</span>
                </div>
                {teamTotal > 0 && (
                    <span className="text-xs font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-lg">
                        Team Total: Rp {teamTotal.toLocaleString('id-ID')}
                    </span>
                )}
            </div>

            {/* Quick-add from roster */}
            {unusedRoster.length > 0 && (
                <div className="p-3 bg-blue-50/50 rounded-2xl border border-blue-100">
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">Quick Add from Your Team</p>
                    <div className="flex flex-wrap gap-2">
                        {unusedRoster.map(m => (
                            <button key={m.id} type="button" onClick={() => addFromRoster(m)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-blue-200 rounded-xl text-xs font-bold text-gray-700 hover:border-blue-500 hover:bg-blue-50 transition-all">
                                {m.photo_url ? (
                                    <img src={m.photo_url} className="w-5 h-5 rounded-full object-cover" alt="" />
                                ) : (
                                    <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[8px] font-black text-blue-600">
                                        {m.name.charAt(0)}
                                    </div>
                                )}
                                {m.name}
                                <Plus size={12} className="text-blue-500" />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Team member entries */}
            <div className="space-y-3">
                {team.map((member, index) => (
                    <TeamMemberEntry key={index} member={member} index={index} onUpdate={updateMember} onRemove={removeMember} />
                ))}
            </div>

            <button type="button" onClick={addManual}
                className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-bold text-gray-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/30 transition-all flex items-center justify-center gap-2">
                <UserPlus size={16} /> Add Team Member Manually
            </button>
        </div>
    );
};

/* ─── Entry Row ─── */

interface EntryProps {
    member: ProposedTeamMember;
    index: number;
    onUpdate: (i: number, u: Partial<ProposedTeamMember>) => void;
    onRemove: (i: number) => void;
}

const TeamMemberEntry: React.FC<EntryProps> = ({ member, index, onUpdate, onRemove }) => (
    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3 relative group">
        <button type="button" onClick={() => onRemove(index)}
            className="absolute top-3 right-3 p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 rounded-lg">
            <X size={14} />
        </button>

        <div className="grid grid-cols-3 gap-3">
            <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Name</label>
                <input type="text" value={member.name} onChange={e => onUpdate(index, { name: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                    placeholder="Member name" />
            </div>
            <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Role Title</label>
                <input type="text" value={member.role_title} onChange={e => onUpdate(index, { role_title: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                    placeholder="e.g. Structural Lead" />
            </div>
            <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Category</label>
                <select value={member.role} onChange={e => onUpdate(index, { role: e.target.value as ProposedTeamMember['role'] })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-blue-500">
                    {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
            </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
            <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Fee (IDR)</label>
                <input type="number" value={member.fee || ''} onChange={e => onUpdate(index, { fee: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                    placeholder="0" min={0} />
            </div>
            <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Fee Type</label>
                <select value={member.fee_type} onChange={e => onUpdate(index, { fee_type: e.target.value as 'fixed' | 'percentage' })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-blue-500">
                    <option value="fixed">Fixed Amount</option>
                    <option value="percentage">% of Project</option>
                </select>
            </div>
            <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Note</label>
                <input type="text" value={member.note} onChange={e => onUpdate(index, { note: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                    placeholder="Scope note..." />
            </div>
        </div>
    </div>
);
