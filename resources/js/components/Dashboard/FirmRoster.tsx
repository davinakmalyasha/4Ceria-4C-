import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Users, Plus, UserCheck, Clock, XCircle, MessageSquare, Eye, Smartphone, UserPlus } from 'lucide-react';
import { FirmMember } from '../../types/sub_professional.types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import FirmSearchModal from './FirmSearchModal';
import QuickAssignModal from './QuickAssignModal';

interface FirmRosterProps {
    onOpenChat?: (user: { id: number }) => void;
}

export default function FirmRoster({ onOpenChat }: FirmRosterProps) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [members, setMembers] = useState<FirmMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showSearch, setShowSearch] = useState(false);
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [assigningMember, setAssigningMember] = useState<FirmMember | null>(null);

    const fetchRoster = useCallback(async () => {
        try {
            const res = await axios.get<{ data: FirmMember[] }>('/firm-members/roster');
            setMembers(Array.isArray(res.data?.data) ? res.data.data : []);
        } catch { setMembers([]); }
        finally { setIsLoading(false); }
    }, []);

    useEffect(() => { fetchRoster(); }, [fetchRoster]);

    const roleLabel = (role: string) => role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    const handleViewProfile = (m: FirmMember) => {
        const tabMap: Record<string, string> = {
            structural: 'structural', mep: 'mep', interior: 'interior', kontraktor: 'constructors',
        };
        const tab = tabMap[m.member?.role_type || ''] || 'structural';
        window.dispatchEvent(new CustomEvent('switchDashboardTab', { detail: tab }));
    };

    const getPhoneNumber = (m: FirmMember['member']): string | null => {
        const phone = m?.phone || m?.no_telp;
        if (!phone || typeof phone !== 'string') return null;
        const clean = phone.trim();
        return clean.length > 0 && clean !== 'null' ? clean : null;
    };

    const handleResend = async (id: number) => {
        setActionLoading(id);
        try {
            await axios.post(`/firm-members/${id}/resend`);
            showToast('Invitation resent successfully!', 'success');
            fetchRoster();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to resend invitation', 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const handleResendBulk = async (ids: number[]) => {
        setActionLoading(-999);
        try {
            await Promise.all(ids.map(id => axios.post(`/firm-members/${id}/resend`)));
            showToast('All invitations resent successfully!', 'success');
            fetchRoster();
        } catch (err: any) {
            showToast('Failed to resend some invitations.', 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const handleCancel = async (id: number) => {
        if (!confirm('Are you sure you want to cancel this invitation?')) return;
        setActionLoading(id);
        try {
            await axios.post(`/firm-members/${id}/cancel`);
            showToast('Invitation cancelled successfully!', 'success');
            fetchRoster();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to cancel invitation', 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const handleCancelBulk = async (ids: number[]) => {
        if (!confirm('Are you sure you want to cancel all these invitations?')) return;
        setActionLoading(-999);
        try {
            await Promise.all(ids.map(id => axios.post(`/firm-members/${id}/cancel`)));
            showToast('All invitations cancelled successfully!', 'success');
            fetchRoster();
        } catch (err: any) {
            showToast('Failed to cancel some invitations.', 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const handleRemove = async (id: number) => {
        if (!confirm('Are you sure you want to offboard this member from your firm roster? This will not affect past active project records.')) return;
        setActionLoading(id);
        try {
            await axios.delete(`/firm-members/${id}`);
            showToast('Member successfully offboarded.', 'success');
            fetchRoster();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to offboard member', 'error');
        } finally {
            setActionLoading(null);
        }
    };

    // Group members by member_user_id
    const groupedMembers = React.useMemo(() => {
        const map = new Map<number, {
            member_user_id: number;
            member: FirmMember['member'];
            active_projects_count: number;
            active_projects: string[];
            roles: Array<{
                id: number;
                role_in_firm: string;
                status: FirmMember['status'];
                originalItem: FirmMember;
            }>;
        }>();

        members.forEach(m => {
            const userId = m.member_user_id;
            if (!map.has(userId)) {
                map.set(userId, {
                    member_user_id: userId,
                    member: m.member,
                    active_projects_count: m.active_projects_count || 0,
                    active_projects: m.active_projects || [],
                    roles: []
                });
            }
            const grouped = map.get(userId)!;
            grouped.roles.push({
                id: m.id,
                role_in_firm: m.role_in_firm,
                status: m.status,
                originalItem: m
            });

            // Merge active projects
            if (m.active_projects) {
                grouped.active_projects = Array.from(new Set([...grouped.active_projects, ...m.active_projects]));
                grouped.active_projects_count = grouped.active_projects.length;
            }
        });

        return Array.from(map.values());
    }, [members]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                        <Users size={20} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-slate-900 tracking-tight">Firm Roster</h3>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                            {groupedMembers.filter(m => m.roles.some(r => r.status === 'active')).length} Active Members
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setShowSearch(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-md"
                >
                    <Plus size={14} /> Add Member
                </button>
            </div>

            {isLoading ? (
                <div className="text-center py-12 text-slate-400 text-sm font-bold">Loading roster...</div>
            ) : groupedMembers.length === 0 ? (
                <div className="text-center py-16 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                    <Users size={40} className="mx-auto mb-4 text-slate-300" />
                    <p className="text-sm font-bold text-slate-500">No firm members yet.</p>
                    <p className="text-xs text-slate-400 mt-1">Search by name or unique code to invite specialists.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groupedMembers.map(gm => (
                        <MemberCard
                            key={gm.member_user_id}
                            grouped={gm}
                            onOpenChat={onOpenChat}
                            onViewProfile={handleViewProfile}
                            getPhoneNumber={getPhoneNumber}
                            roleLabel={roleLabel}
                            actionLoading={actionLoading}
                            onResend={handleResend}
                            onCancel={handleCancel}
                            onRemove={handleRemove}
                            onResendBulk={handleResendBulk}
                            onCancelBulk={handleCancelBulk}
                            onQuickAssign={(member) => setAssigningMember(member)}
                        />
                    ))}
                </div>
            )}

            {showSearch && (
                <FirmSearchModal
                    userRoleType={user?.role_type || ''}
                    onClose={() => setShowSearch(false)}
                    onInvited={() => { fetchRoster(); showToast('Invitation sent!', 'success'); }}
                />
            )}

            {assigningMember && (
                <QuickAssignModal
                    isOpen={true}
                    member={assigningMember}
                    onClose={() => setAssigningMember(null)}
                    onSuccess={() => { fetchRoster(); }}
                />
            )}
        </div>
    );
}

/* ─── Member Card with action buttons ─── */

interface MemberCardProps {
    grouped: {
        member_user_id: number;
        member: FirmMember['member'];
        active_projects_count: number;
        active_projects: string[];
        roles: Array<{
            id: number;
            role_in_firm: string;
            status: FirmMember['status'];
            originalItem: FirmMember;
        }>;
    };
    onOpenChat?: (user: { id: number }) => void;
    onViewProfile: (m: FirmMember) => void;
    getPhoneNumber: (m: FirmMember['member']) => string | null;
    roleLabel: (r: string) => string;
    actionLoading: number | null;
    onResend: (id: number) => void;
    onCancel: (id: number) => void;
    onRemove: (id: number) => void;
    onResendBulk: (ids: number[]) => void;
    onCancelBulk: (ids: number[]) => void;
    onQuickAssign: (m: FirmMember) => void;
}

const STATUS_MAP = {
    active:    { icon: UserCheck, color: 'text-emerald-600 bg-emerald-50 border border-emerald-100', label: 'Active' },
    invited:   { icon: Clock,     color: 'text-amber-600 bg-amber-50 border border-amber-100',     label: 'Invited' },
    requested: { icon: UserPlus,  color: 'text-violet-600 bg-violet-50 border border-violet-100',   label: 'Requested' },
    removed:   { icon: XCircle,   color: 'text-slate-400 bg-slate-50 border border-slate-100',     label: 'Removed' },
} as const;

function MemberCard({
    grouped,
    onOpenChat,
    onViewProfile,
    getPhoneNumber,
    roleLabel,
    actionLoading,
    onResend,
    onCancel,
    onRemove,
    onResendBulk,
    onCancelBulk,
    onQuickAssign,
}: MemberCardProps) {
    const phone = getPhoneNumber(grouped.member);

    return (
        <div className="p-5 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-indigo-200 transition-all group flex flex-col justify-between h-full">
            <div>
                {/* Profile Header */}
                <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-sm shrink-0">
                        {grouped.member?.pic ? (
                            <img src={grouped.member.pic} alt="" className="w-full h-full rounded-xl object-cover" />
                        ) : (
                            grouped.member?.name?.charAt(0)?.toUpperCase() || '?'
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h5 className="text-sm font-black text-slate-900 truncate">{grouped.member?.name}</h5>
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5">{grouped.member?.unique_code}</p>
                    </div>
                </div>

                {/* Capabilities Grid */}
                <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Capabilities & Roles</p>
                        {grouped.roles.filter(r => r.status === 'invited').length > 1 && (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => onResendBulk(grouped.roles.filter(r => r.status === 'invited').map(r => r.id))}
                                    disabled={actionLoading !== null}
                                    className="text-[8px] font-black text-amber-700 hover:text-amber-800 uppercase tracking-widest bg-amber-50 hover:bg-amber-100/70 px-1.5 py-0.5 rounded transition disabled:opacity-50"
                                >
                                    {actionLoading === -999 ? 'Resending...' : 'Resend All'}
                                </button>
                                <button
                                    onClick={() => onCancelBulk(grouped.roles.filter(r => r.status === 'invited').map(r => r.id))}
                                    disabled={actionLoading !== null}
                                    className="text-[8px] font-black text-rose-600 hover:text-rose-700 uppercase tracking-widest bg-rose-50 hover:bg-rose-100/70 px-1.5 py-0.5 rounded transition disabled:opacity-50"
                                >
                                    Cancel All
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="space-y-2">
                        {grouped.roles.map(r => {
                            const s = STATUS_MAP[r.status] || STATUS_MAP.removed;
                            const Icon = s.icon;
                            const isAlreadyAssigned = (r.originalItem.active_projects_count ?? 0) > 0 || (r.originalItem.active_projects?.length ?? 0) > 0;

                            return (
                                <div key={r.id} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100/50 rounded-xl">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-slate-800 uppercase tracking-wide">{roleLabel(r.role_in_firm)}</span>
                                        <span className={`inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${s.color}`}>
                                            <Icon size={8} /> {s.label}
                                        </span>
                                    </div>

                                    {/* Action Buttons specific to this role */}
                                    <div className="flex items-center gap-1.5">
                                        {r.status === 'active' && (
                                            <>
                                                <button
                                                    onClick={() => onQuickAssign(r.originalItem)}
                                                    className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all duration-200 ${
                                                        isAlreadyAssigned
                                                            ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                                            : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                                                    }`}
                                                    disabled={actionLoading !== null || isAlreadyAssigned}
                                                >
                                                    Assign
                                                </button>
                                                <button
                                                    onClick={() => onRemove(r.id)}
                                                    className="px-2 py-1 bg-rose-50 text-rose-600 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-rose-100 transition-colors"
                                                    disabled={actionLoading !== null}
                                                >
                                                    Remove
                                                </button>
                                            </>
                                        )}

                                        {r.status === 'invited' && (
                                            <>
                                                <button
                                                    onClick={() => onResend(r.id)}
                                                    className="px-2 py-1 bg-amber-50 text-amber-700 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-amber-100 transition-colors"
                                                    disabled={actionLoading !== null}
                                                >
                                                    {actionLoading === r.id ? 'Resending...' : 'Resend'}
                                                </button>
                                                <button
                                                    onClick={() => onCancel(r.id)}
                                                    className="px-2 py-1 bg-rose-50 text-rose-600 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-rose-100 transition-colors"
                                                    disabled={actionLoading !== null}
                                                >
                                                    Cancel
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Workload Tracker */}
                {grouped.roles.some(r => r.status === 'active') && (
                    <div className="mt-3.5 px-3 py-2 bg-indigo-50/40 rounded-xl border border-indigo-100/40 space-y-1">
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Active Workload</span>
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${
                                (grouped.active_projects_count || 0) > 2
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-indigo-100 text-indigo-700'
                            }`}>
                                {grouped.active_projects_count || 0} Project(s)
                            </span>
                        </div>
                        {grouped.active_projects && grouped.active_projects.length > 0 ? (
                            <div className="text-[10px] font-bold text-slate-600 truncate max-w-full cursor-help hover:text-indigo-600" title={grouped.active_projects.join(', ')}>
                                {grouped.active_projects.join(', ')}
                            </div>
                        ) : (
                            <div className="text-[9px] text-slate-400 font-medium italic">No active project workloads.</div>
                        )}
                    </div>
                )}
            </div>

            {/* General Professional Actions */}
            <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-slate-50">
                <button
                    onClick={() => onViewProfile(grouped.roles[0].originalItem)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                >
                    <Eye size={12} /> Profile
                </button>
                <button
                    onClick={() => onOpenChat?.({ id: grouped.member_user_id })}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 hover:text-blue-600 transition-colors"
                >
                    <MessageSquare size={12} /> Chat
                </button>
                {phone && (
                    <a
                        href={`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=Hi%20${grouped.member?.name || ''},`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 bg-[#25D366]/10 text-[#128C7E] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#25D366]/20 transition-colors"
                    >
                        <Smartphone size={12} /> WhatsApp
                    </a>
                )}
            </div>
        </div>
    );
}
