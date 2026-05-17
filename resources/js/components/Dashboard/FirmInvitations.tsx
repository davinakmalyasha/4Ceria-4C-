import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Bell, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { FirmInvitation } from '../../types/sub_professional.types';
import { useToast } from '../../context/ToastContext';

export default function FirmInvitations() {
    const { showToast } = useToast();
    const [invitations, setInvitations] = useState<FirmInvitation[]>([]);
    const [respondingId, setRespondingId] = useState<number | null>(null);

    useEffect(() => {
        axios.get<{ data: FirmInvitation[] }>('/firm-members/invitations')
            .then(res => setInvitations(res.data?.data || []))
            .catch(() => {});
    }, []);

    if (invitations.length === 0) return null;

    const handleRespond = async (id: number, action: 'accept' | 'decline') => {
        setRespondingId(id);
        try {
            await axios.post(`/firm-members/${id}/respond`, { action });
            setInvitations(prev => prev.filter(i => i.id !== id));
            showToast(action === 'accept' ? 'You have joined the firm!' : 'Invitation declined.', 'success');
        } catch { showToast('Failed to respond.', 'error'); }
        finally { setRespondingId(null); }
    };

    const roleLabel = (r: string) => r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    return (
        <div className="space-y-3 mb-6">
            {invitations.map(inv => (
                <div key={inv.id} className="flex items-center gap-4 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                        <Bell size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-900">
                            <span className="text-indigo-600">{inv.firm_owner?.name}</span> invited you as{' '}
                            <span className="uppercase text-[10px] font-black tracking-widest text-slate-600">{roleLabel(inv.role_in_firm)}</span>
                        </p>
                        <p className="text-[10px] text-slate-500 capitalize">{inv.firm_owner?.role_type} Firm</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <button
                            onClick={() => handleRespond(inv.id, 'accept')}
                            disabled={respondingId === inv.id}
                            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition disabled:opacity-50"
                        >
                            {respondingId === inv.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />} Accept
                        </button>
                        <button
                            onClick={() => handleRespond(inv.id, 'decline')}
                            disabled={respondingId === inv.id}
                            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-50 hover:text-red-600 transition disabled:opacity-50"
                        >
                            <XCircle size={12} /> Decline
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
