import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Users, Plus, UserCheck, Clock, XCircle } from 'lucide-react';
import { FirmMember } from '../../types/sub_professional.types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import FirmSearchModal from './FirmSearchModal';

export default function FirmRoster() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [members, setMembers] = useState<FirmMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showSearch, setShowSearch] = useState(false);

    const fetchRoster = useCallback(async () => {
        try {
            const res = await axios.get<{ data: FirmMember[] }>('/firm-members/roster');
            setMembers(Array.isArray(res.data?.data) ? res.data.data : []);
        } catch { setMembers([]); }
        finally { setIsLoading(false); }
    }, []);

    useEffect(() => { fetchRoster(); }, [fetchRoster]);

    const statusBadge = (status: FirmMember['status']) => {
        const map = {
            active:  { icon: UserCheck, color: 'bg-emerald-100 text-emerald-700', label: 'Active' },
            invited: { icon: Clock,     color: 'bg-amber-100 text-amber-700',     label: 'Invited' },
            removed: { icon: XCircle,   color: 'bg-slate-100 text-slate-400',     label: 'Removed' },
        };
        const s = map[status];
        const Icon = s.icon;
        return (
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${s.color}`}>
                <Icon size={10} /> {s.label}
            </span>
        );
    };

    const roleLabel = (role: string) => role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                        <Users size={20} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-slate-900 tracking-tight">My Firm</h3>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                            {members.filter(m => m.status === 'active').length} Active Members
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
            ) : members.length === 0 ? (
                <div className="text-center py-16 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                    <Users size={40} className="mx-auto mb-4 text-slate-300" />
                    <p className="text-sm font-bold text-slate-500">No firm members yet.</p>
                    <p className="text-xs text-slate-400 mt-1">Search by name or unique code to invite specialists.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {members.map(m => (
                        <div key={m.id} className="p-5 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-indigo-200 transition-all group">
                            <div className="flex items-start gap-3">
                                <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-sm shrink-0">
                                    {m.member?.pic ? (
                                        <img src={m.member.pic} alt="" className="w-full h-full rounded-xl object-cover" />
                                    ) : (
                                        m.member?.name?.charAt(0)?.toUpperCase() || '?'
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h5 className="text-sm font-black text-slate-900 truncate">{m.member?.name}</h5>
                                    <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">{roleLabel(m.role_in_firm)}</p>
                                    <p className="text-[9px] text-slate-400 font-mono mt-0.5">{m.member?.unique_code}</p>
                                </div>
                                {statusBadge(m.status)}
                            </div>
                        </div>
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
        </div>
    );
}
