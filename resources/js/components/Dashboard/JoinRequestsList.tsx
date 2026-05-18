import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { UserPlus, CheckCircle, XCircle, Loader2, Inbox } from 'lucide-react';
import { FirmMember } from '../../types/sub_professional.types';
import { useToast } from '../../context/ToastContext';

export default function JoinRequestsList() {
    const { showToast } = useToast();
    const [requests, setRequests] = useState<FirmMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [respondingId, setRespondingId] = useState<number | null>(null);

    const fetchRequests = useCallback(async () => {
        try {
            const res = await axios.get<{ data: FirmMember[] }>('/firm-members/join-requests');
            setRequests(Array.isArray(res.data?.data) ? res.data.data : []);
        } catch {
            setRequests([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchRequests(); }, [fetchRequests]);

    const handleRespond = async (id: number, action: 'accept' | 'decline') => {
        setRespondingId(id);
        try {
            await axios.post(`/firm-members/${id}/respond`, { action });
            setRequests(prev => prev.filter(r => r.id !== id));
            showToast(
                action === 'accept' ? 'Request accepted — member added to firm.' : 'Request declined.',
                'success'
            );
        } catch {
            showToast('Failed to respond to request.', 'error');
        } finally {
            setRespondingId(null);
        }
    };

    const roleLabel = (r: string) => r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    if (isLoading) {
        return <div className="text-center py-12 text-slate-400 text-sm font-bold">Loading requests...</div>;
    }

    if (requests.length === 0) {
        return (
            <div className="text-center py-16 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                <Inbox size={40} className="mx-auto mb-4 text-slate-300" />
                <p className="text-sm font-bold text-slate-500">No pending join requests.</p>
                <p className="text-xs text-slate-400 mt-1">
                    Specialists can request to join your firm from their dashboard.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <h4 className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <UserPlus size={14} />
                Pending Requests · {requests.length}
            </h4>
            {requests.map(req => (
                <div key={req.id} className="flex items-center gap-4 p-5 bg-white border border-slate-100 rounded-2xl shadow-sm">
                    <div className="w-11 h-11 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 font-black text-sm shrink-0">
                        {req.member?.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h5 className="text-sm font-black text-slate-900 truncate">{req.member?.name}</h5>
                        <p className="text-[10px] font-bold text-violet-500 uppercase tracking-widest">
                            Wants to join as {roleLabel(req.role_in_firm)}
                        </p>
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5">{req.member?.unique_code}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <button
                            onClick={() => handleRespond(req.id, 'accept')}
                            disabled={respondingId === req.id}
                            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition disabled:opacity-50"
                        >
                            {respondingId === req.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                            Accept
                        </button>
                        <button
                            onClick={() => handleRespond(req.id, 'decline')}
                            disabled={respondingId === req.id}
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
