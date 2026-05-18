import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Building2, Bell, Users, MessageSquare, Eye, Loader2, Send } from 'lucide-react';
import { MyFirmEntry } from '../../types/sub_professional.types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import FirmInvitations from './FirmInvitations';
import BrowseFirmsModal from './BrowseFirmsModal';

interface SpecialistFirmHubProps {
    onOpenChat: (user: { id: number }) => void;
}

type HubTabId = 'firms' | 'invitations';

export default function SpecialistFirmHub({ onOpenChat }: SpecialistFirmHubProps) {
    const [activeTab, setActiveTab] = useState<HubTabId>('firms');
    const [showBrowse, setShowBrowse] = useState(false);

    const TABS: { id: HubTabId; label: string; icon: React.FC<{ size?: number }> }[] = [
        { id: 'firms', label: 'My Firms', icon: Building2 },
        { id: 'invitations', label: 'Invitations', icon: Bell },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                                    activeTab === tab.id
                                        ? 'bg-white text-slate-900 shadow-sm'
                                        : 'text-slate-400 hover:text-slate-600'
                                }`}
                            >
                                <Icon size={14} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
                {activeTab === 'firms' && (
                    <button
                        onClick={() => setShowBrowse(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-md"
                    >
                        <Send size={14} /> Request to Join
                    </button>
                )}
            </div>

            {activeTab === 'firms' && <MyFirmsList onOpenChat={onOpenChat} />}
            {activeTab === 'invitations' && <FirmInvitations isFullPage onOpenChat={onOpenChat} />}

            {showBrowse && <BrowseFirmsModal onClose={() => setShowBrowse(false)} />}
        </div>
    );
}

/* ─── My Firms List (firms I belong to) ─── */

interface MyFirmsListProps {
    onOpenChat: (user: { id: number }) => void;
}

function MyFirmsList({ onOpenChat }: MyFirmsListProps) {
    const [firms, setFirms] = useState<MyFirmEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        axios.get<{ data: MyFirmEntry[] }>('/firm-members/my-firms')
            .then(res => setFirms(res.data?.data || []))
            .catch(() => setFirms([]))
            .finally(() => setIsLoading(false));
    }, []);

    const roleLabel = (r: string) => r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    const groupedFirms = React.useMemo(() => {
        const map = new Map<number, {
            firm_owner_id: number;
            firm_owner: MyFirmEntry['firm_owner'];
            roles: string[];
        }>();

        firms.forEach(f => {
            const ownerId = f.firm_owner_id;
            if (!map.has(ownerId)) {
                map.set(ownerId, {
                    firm_owner_id: ownerId,
                    firm_owner: f.firm_owner,
                    roles: []
                });
            }
            const grouped = map.get(ownerId)!;
            if (!grouped.roles.includes(f.role_in_firm)) {
                grouped.roles.push(f.role_in_firm);
            }
        });

        return Array.from(map.values());
    }, [firms]);

    if (isLoading) {
        return <div className="text-center py-12 text-slate-400 text-sm font-bold">Loading firms...</div>;
    }

    if (firms.length === 0) {
        return (
            <div className="text-center py-16 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                <Building2 size={40} className="mx-auto mb-4 text-slate-300" />
                <p className="text-sm font-bold text-slate-500">You haven't joined any firms yet.</p>
                <p className="text-xs text-slate-400 mt-1">
                    Accept invitations from architects or contractors, or use "Request to Join" to reach out.
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groupedFirms.map(gf => (
                <div key={gf.firm_owner_id} className="p-5 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-indigo-200 transition-all flex flex-col justify-between h-full">
                    <div>
                        <div className="flex items-start gap-3">
                            <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-sm shrink-0">
                                {gf.firm_owner.pic ? (
                                    <img src={gf.firm_owner.pic} alt="" className="w-full h-full rounded-xl object-cover" />
                                ) : (
                                    gf.firm_owner.name.charAt(0).toUpperCase()
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h5 className="text-sm font-black text-slate-900 truncate">{gf.firm_owner.name}</h5>
                                {gf.firm_owner.company_name && (
                                    <p className="text-[10px] text-slate-500 font-bold truncate">{gf.firm_owner.company_name}</p>
                                )}
                                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">
                                    {roleLabel(gf.firm_owner.role_type)} Firm
                                </p>
                            </div>
                        </div>

                        {/* Active Roles/Capabilities list */}
                        <div className="mt-4 space-y-1.5">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">My Active Roles</p>
                            <div className="flex flex-wrap gap-1">
                                {gf.roles.map((role, idx) => (
                                    <span key={idx} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[8px] font-black uppercase tracking-wider rounded border border-indigo-100/50">
                                        {roleLabel(role)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2 mt-4 pt-3 border-t border-slate-50">
                        <button
                            onClick={() => onOpenChat({ id: gf.firm_owner_id })}
                            className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        >
                            <MessageSquare size={12} /> Chat
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
