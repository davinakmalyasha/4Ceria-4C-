import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Bell, CheckCircle, XCircle, Loader2, Inbox, Eye, MessageSquare, Smartphone } from 'lucide-react';
import { FirmInvitation } from '../../types/sub_professional.types';
import { useToast } from '../../context/ToastContext';

interface FirmInvitationsProps {
    isFullPage?: boolean;
    onOpenChat?: (user: { id: number }) => void;
}

export default function FirmInvitations({ isFullPage = false, onOpenChat }: FirmInvitationsProps) {
    const { showToast } = useToast();
    const [invitations, setInvitations] = useState<FirmInvitation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [respondingId, setRespondingId] = useState<number | null>(null);
    const [isBulkResponding, setIsBulkResponding] = useState(false);

    useEffect(() => {
        axios.get<{ data: FirmInvitation[] }>('/firm-members/invitations')
            .then(res => setInvitations(res.data?.data || []))
            .catch(() => {})
            .finally(() => setIsLoading(false));
    }, []);

    const handleRespond = async (id: number, action: 'accept' | 'decline') => {
        setRespondingId(id);
        try {
            await axios.post(`/firm-members/${id}/respond`, { action });
            setInvitations(prev => prev.filter(i => i.id !== id));
            showToast(action === 'accept' ? 'You have joined the firm!' : 'Invitation declined.', 'success');
        } catch { showToast('Failed to respond.', 'error'); }
        finally { setRespondingId(null); }
    };

    const handleRespondBulk = async (ids: number[], action: 'accept' | 'decline') => {
        setIsBulkResponding(true);
        try {
            await Promise.all(ids.map(id => axios.post(`/firm-members/${id}/respond`, { action })));
            setInvitations(prev => prev.filter(i => !ids.includes(i.id)));
            showToast(action === 'accept' ? 'Joined the firm for all offered roles!' : 'Declined all offered roles.', 'success');
        } catch {
            showToast('Failed to respond to some invitations.', 'error');
        } finally {
            setIsBulkResponding(false);
        }
    };

    const handleViewProfile = (owner: FirmInvitation['firm_owner']) => {
        window.dispatchEvent(new CustomEvent('viewProfessionalProfile', {
            detail: {
                type: owner.role_type,
                data: owner
            }
        }));
    };

    const getPhoneNumber = (inv: FirmInvitation) => {
        return inv.firm_owner?.phone || inv.firm_owner?.no_telp || null;
    };
    const groupedInvitations = React.useMemo(() => {
        const groups: Record<number, { firm_owner: FirmInvitation['firm_owner']; invitations: FirmInvitation[] }> = {};
        invitations.forEach(inv => {
            if (!inv.firm_owner) return;
            const ownerId = inv.firm_owner.id;
            if (!groups[ownerId]) {
                groups[ownerId] = {
                    firm_owner: inv.firm_owner,
                    invitations: []
                };
            }
            groups[ownerId].invitations.push(inv);
        });
        return Object.values(groups);
    }, [invitations]);

    const roleLabel = (r: string) => r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    if (isLoading) {
        return <div className="text-center py-8 text-slate-400 text-sm font-bold">Loading invitations...</div>;
    }

    // For banner mode: hide entirely when empty and not loading
    if (!isFullPage && invitations.length === 0) {
        return null;
    }

    // Full-page empty state
    if (isFullPage && invitations.length === 0) {
        return (
            <div className="text-center py-16 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                <Inbox size={40} className="mx-auto mb-4 text-slate-300" />
                <p className="text-sm font-bold text-slate-500">No pending invitations.</p>
                <p className="text-xs text-slate-400 mt-1">
                    When an architect or contractor invites you to their firm, it will appear here.
                </p>
            </div>
        );
    }

    return (
        <div className={isFullPage ? 'space-y-4' : 'space-y-4 mb-6'}>
            {groupedInvitations.map(group => {
                const { firm_owner, invitations: groupInvs } = group;
                const phone = firm_owner?.phone || firm_owner?.no_telp || null;

                return (
                    <div key={firm_owner.id} className="p-6 bg-indigo-50 border border-indigo-100 rounded-[2rem] shadow-sm hover:shadow-md transition-all space-y-4">
                        {/* Top Info Header */}
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 shrink-0">
                                {firm_owner?.pic ? (
                                    <img src={firm_owner.pic} alt="" className="w-full h-full rounded-2xl object-cover" />
                                ) : (
                                    <Bell size={22} />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-black text-slate-900 leading-snug">
                                    <span className="text-indigo-600 font-extrabold">{firm_owner?.name}</span> has invited you to join their firm
                                </p>
                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mt-0.5">{firm_owner?.role_type} Firm</p>
                            </div>
                        </div>

                        {/* List of Roles */}
                        <div className="bg-white/95 border border-indigo-100/60 rounded-2xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Offered Capabilities & Roles</p>
                                {groupInvs.length > 1 && (
                                    <div className="flex gap-2 shrink-0">
                                        <button
                                            onClick={() => handleRespondBulk(groupInvs.map(i => i.id), 'accept')}
                                            disabled={respondingId !== null || isBulkResponding}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-100 transition disabled:opacity-50"
                                        >
                                            {isBulkResponding ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={10} />} Accept All
                                        </button>
                                        <button
                                            onClick={() => handleRespondBulk(groupInvs.map(i => i.id), 'decline')}
                                            disabled={respondingId !== null || isBulkResponding}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-rose-100 transition disabled:opacity-50"
                                        >
                                            <XCircle size={10} /> Decline All
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-2">
                                {groupInvs.map(inv => (
                                    <div key={inv.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100/50 rounded-xl hover:border-indigo-100 hover:bg-indigo-50/10 transition-all">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-slate-800 uppercase tracking-wide">
                                                {roleLabel(inv.role_in_firm)}
                                            </span>
                                            <span className="inline-flex items-center gap-1 mt-0.5 text-[8px] font-black text-indigo-600 uppercase tracking-widest">
                                                Offered Role
                                            </span>
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                            <button
                                                onClick={() => handleRespond(inv.id, 'accept')}
                                                disabled={respondingId !== null || isBulkResponding}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-700 transition disabled:opacity-50 shadow-md shadow-emerald-100"
                                            >
                                                {respondingId === inv.id ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={10} />} Accept
                                            </button>
                                            <button
                                                onClick={() => handleRespond(inv.id, 'decline')}
                                                disabled={respondingId !== null || isBulkResponding}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-500 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-red-50 hover:text-red-600 transition disabled:opacity-50"
                                            >
                                                <XCircle size={10} /> Decline
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Bottom Actions Row: Left side is chat/profile/whatsapp */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-indigo-100/60">
                            {/* Connect Actions */}
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => handleViewProfile(firm_owner)}
                                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-indigo-100 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100/30 transition-colors shadow-sm"
                                >
                                    <Eye size={12} /> Profile
                                </button>
                                <button
                                    onClick={() => onOpenChat?.({ id: firm_owner.id })}
                                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-indigo-100 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100/30 transition-colors shadow-sm"
                                >
                                    <MessageSquare size={12} /> Chat
                                </button>
                                {phone && (
                                    <a
                                        href={`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=Hi%20${firm_owner?.name || ''},%20I%20received%20your%20firm%20invitation%20on%204C.`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 px-3 py-2 bg-[#25D366]/10 text-[#128C7E] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#25D366]/20 transition-colors"
                                    >
                                        <Smartphone size={12} /> WhatsApp
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
