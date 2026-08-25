import React, { useEffect, useState } from 'react';
import { CalendarClock, Check, X, RefreshCw, CalendarPlus } from 'lucide-react';
import axios from 'axios';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../utils/apiError';

interface Props {
    user: any;
}

const statusStyles: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700 border-amber-200',
    confirmed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    cancelled: 'bg-red-100 text-red-600 border-red-200',
    completed: 'bg-zinc-100 text-zinc-500 border-zinc-200',
};

/**
 * Notary consultation inbox — consumes GET /consultations (which previously
 * had zero FE consumers) and completes the booking lifecycle via
 * POST /consultations/{id}/respond. The client's ConsultationModal has
 * always promised a confirmation that could not mechanically happen.
 */
export default function ConsultationRequests({ user }: Props) {
    const { showToast } = useToast();
    const [items, setItems] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [rescheduleFor, setRescheduleFor] = useState<number | null>(null);
    const [newDateTime, setNewDateTime] = useState('');
    const [declineFor, setDeclineFor] = useState<number | null>(null);
    const [declineNotes, setDeclineNotes] = useState('');

    const fetchItems = async () => {
        setIsLoading(true);
        try {
            const res = await axios.get('/consultations');
            setItems(res.data.data || []);
        } catch (err) {
            showToast(getApiErrorMessage(err, 'Failed to fetch consultations'), 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchItems();
    }, []);

    const respond = async (id: number, action: string, scheduleDate?: string) => {
        setBusyId(id);
        try {
            const payload: any = { action };
            if (action === 'reschedule') payload.schedule_date = scheduleDate;
            if (action === 'reject') payload.notes = declineNotes;
            await axios.post(`/consultations/${id}/respond`, payload);
            showToast(`Consultation ${action === 'confirm' ? 'confirmed' : action + 'ed'}.`, 'success');
            setRescheduleFor(null);
            setNewDateTime('');
            setDeclineFor(null);
            setDeclineNotes('');
            fetchItems();
        } catch (err) {
            showToast(getApiErrorMessage(err, `Failed to ${action} consultation.`), 'error');
        } finally {
            setBusyId(null);
        }
    };

    const fmtWIB = (d: string) => new Date(d).toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    if (isLoading) {
        return (
            <div className="py-20 text-center">
                <RefreshCw size={28} className="mx-auto animate-spin text-gray-300" />
                <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Loading requests...</p>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-black text-gray-900 tracking-tight">Consultation Requests</h2>
                    <p className="text-xs text-gray-400 font-semibold">Confirm, reschedule or decline incoming bookings.</p>
                </div>
                <button onClick={fetchItems} className="p-2 rounded-xl border border-gray-100 hover:bg-gray-50 transition-all">
                    <RefreshCw size={14} className="text-gray-500" />
                </button>
            </div>

            {items.length === 0 ? (
                <div className="py-16 text-center bg-white rounded-[2rem] border border-dashed border-gray-200 space-y-3">
                    <CalendarClock size={32} className="mx-auto text-gray-200" />
                    <p className="text-sm font-bold text-gray-400">No consultation requests yet</p>
                    <p className="text-xs text-gray-300 max-w-sm mx-auto">Clients can book you from your public profile's consultation form.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {items.map(c => (
                        <div key={c.id} className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm p-6 space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-black text-gray-900">{c.user?.name || 'Client'}</p>
                                    <p className="text-xs text-gray-500 font-semibold flex items-center gap-1.5 mt-0.5">
                                        <CalendarClock size={12} className="text-blue-400" />
                                        {fmtWIB(c.schedule_date)} WIB
                                    </p>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${statusStyles[c.status] || 'border-gray-200 text-gray-500'}`}>
                                    {c.status}
                                </span>
                            </div>

                            {c.notes && (
                                <p className="text-xs text-gray-600 bg-gray-50/80 rounded-xl px-4 py-2.5 italic">{c.notes}</p>
                            )}

                            {['pending', 'confirmed'].includes(c.status) && (
                                declineFor === c.id ? (
                                    <div className="space-y-2 pt-1">
                                        <textarea
                                            rows={2}
                                            autoFocus
                                            placeholder="Reason for declining (optional)..."
                                            value={declineNotes}
                                            onChange={e => setDeclineNotes(e.target.value)}
                                            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs resize-none focus:ring-2 focus:ring-red-200 focus:outline-none"
                                        />
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                onClick={() => respond(c.id, 'reject')}
                                                disabled={busyId === c.id}
                                                className="px-4 py-2 bg-red-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 transition-all disabled:opacity-50"
                                            >
                                                <X size={12} className="inline mr-1" /> Confirm Decline
                                            </button>
                                            <button onClick={() => { setDeclineFor(null); setDeclineNotes(''); }} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600">
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : rescheduleFor === c.id ? (
                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                        <input
                                            type="datetime-local"
                                            value={newDateTime}
                                            onChange={e => setNewDateTime(e.target.value)}
                                            className="px-3 py-2 rounded-xl border border-gray-200 text-xs"
                                        />
                                        <button
                                            onClick={() => respond(c.id, 'reschedule', newDateTime)}
                                            disabled={!newDateTime || busyId === c.id}
                                            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                                        >
                                            <CalendarPlus size={12} className="inline mr-1" /> Save
                                        </button>
                                        <button onClick={() => setRescheduleFor(null)} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600">
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {c.status === 'pending' && (
                                            <button
                                                onClick={() => respond(c.id, 'confirm')}
                                                disabled={busyId === c.id}
                                                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50"
                                            >
                                                <Check size={12} /> Confirm
                                            </button>
                                        )}
                                        <button
                                            onClick={() => { setRescheduleFor(c.id); setNewDateTime(''); }}
                                            disabled={busyId === c.id}
                                            className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all disabled:opacity-50"
                                        >
                                            <CalendarPlus size={12} /> Reschedule
                                        </button>
                                        {c.status !== 'completed' && (
                                            <button
                                                onClick={() => { setDeclineFor(c.id); setDeclineNotes(''); }}
                                                disabled={busyId === c.id}
                                                className="flex items-center gap-1.5 px-4 py-2 border border-red-100 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-50 transition-all disabled:opacity-50"
                                            >
                                                <X size={12} /> Decline
                                            </button>
                                        )}
                                        {c.status === 'confirmed' && (
                                            <button
                                                onClick={() => respond(c.id, 'complete')}
                                                disabled={busyId === c.id}
                                                className="flex items-center gap-1.5 px-4 py-2 bg-blue-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all disabled:opacity-50"
                                            >
                                                <Check size={12} /> Mark Complete
                                            </button>
                                        )}
                                    </div>
                                )
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
