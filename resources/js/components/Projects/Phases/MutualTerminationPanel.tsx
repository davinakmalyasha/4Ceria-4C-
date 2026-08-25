import React, { useEffect, useState } from 'react';
import { Handshake, Check, X, TriangleAlert } from 'lucide-react';
import axios from 'axios';
import { useToast } from '../../../context/ToastContext';

interface Props {
    project: any;
    user: any;
    onRefresh: () => void;
}

const statusMap: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Menunggu Respons', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    accepted: { label: 'Disetujui', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    rejected: { label: 'Ditolak', cls: 'bg-red-100 text-red-600 border-red-200' },
    escalated: { label: 'Dieskalasi ke Admin', cls: 'bg-violet-100 text-violet-700 border-violet-200' },
};

/**
 * Amicable exit (mutual termination) panel. The backend flow + freeze
 * middleware always existed but had zero UI — owners and pros had no
 * amicable way out of a broken collaboration.
 */
export default function MutualTerminationPanel({ project, user, onRefresh }: Props) {
    const { showToast } = useToast();
    const [requests, setRequests] = useState<any[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [reason, setReason] = useState('');
    const [terms, setTerms] = useState('');
    const [busy, setBusy] = useState(false);

    const fetchRequests = async () => {
        try {
            const res = await axios.get(`/projects/${project.id}/mutual-termination`);
            setRequests(res.data.data || []);
        } catch { /* non-fatal */ }
    };

    useEffect(() => {
        fetchRequests();
    }, [project?.id]);

    const initiate = async () => {
        if (!reason.trim()) {
            showToast('Mohon isi alasan pembatalan.', 'error');
            return;
        }
        setBusy(true);
        try {
            await axios.post(`/projects/${project.id}/mutual-termination/initiate`, {
                reason,
                settlement_terms: terms || undefined,
            });
            showToast('Pengajuan terkirim. Workspace dibekukan sementara.', 'success');
            setShowForm(false);
            setReason('');
            setTerms('');
            fetchRequests();
            onRefresh();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Gagal mengajukan pembatalan.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const respond = async (id: number, action: 'accept' | 'reject') => {
        const confirmMsg = action === 'accept'
            ? 'Setujui pembatalan? Proyek akan dibatalkan secara resmi.'
            : 'Tolak pengajuan ini? Proyek akan kembali aktif.';
        if (!window.confirm(confirmMsg)) return;
        setBusy(true);
        try {
            await axios.post(`/projects/${project.id}/mutual-termination/${id}/respond`, { action });
            showToast(action === 'accept' ? 'Proyek dibatalkan secara bersama.' : 'Pengajuan ditolak — proyek kembali aktif.', 'success');
            fetchRequests();
            onRefresh();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Gagal memproses respons.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const escalate = async (id: number) => {
        if (!window.confirm('Escalate this dispute to platform admins for arbitration?')) return;
        setBusy(true);
        try {
            await axios.post(`/projects/${project.id}/mutual-termination/${id}/escalate`);
            showToast('Dispute escalated to admins.', 'success');
            fetchRequests();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to escalate.', 'error');
        } finally {
            setBusy(false);
        }
    };

    // Hide entirely once the project is closed
    if (['cancelled', 'completed'].includes(project?.status)) return null;

    const pendingRequest = requests.find(r => r.status === 'pending');
    const isInitiatorOfPending = pendingRequest && pendingRequest.initiator_id === user?.id;

    return (
        <div className="bg-white border border-gray-200 rounded-[2rem] p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Handshake size={18} className="text-slate-600" />
                    <div>
                        <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Amicable Exit (Batal Bersama)</h4>
                        <p className="text-[11px] text-gray-400">Penyelesaian damai tanpa sanksi untuk kedua pihak.</p>
                    </div>
                </div>
                {!pendingRequest && project.status !== 'termination_pending' && (
                    <button
                        onClick={() => setShowForm(s => !s)}
                        className="px-4 py-2 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-600 hover:bg-gray-50 transition-all shrink-0"
                    >
                        {showForm ? 'Tutup' : 'Ajukan'}
                    </button>
                )}
            </div>

            {project.status === 'termination_pending' && !pendingRequest && !isInitiatorOfPending && (
                <p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                    Terdapat pengajuan pembatalan yang menunggu persetujuan.
                </p>
            )}

            {showForm && (
                <div className="space-y-3">
                    <textarea
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        rows={2}
                        maxLength={1000}
                        placeholder="Alasan pembatalan bersama (wajib)..."
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                    />
                    <textarea
                        value={terms}
                        onChange={e => setTerms(e.target.value)}
                        rows={2}
                        maxLength={1000}
                        placeholder="Kesepakatan penyelesaian / pembayaran akhir (opsional)..."
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                    />
                    <button
                        onClick={initiate}
                        disabled={busy}
                        className="w-full py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all disabled:opacity-50"
                    >
                        {busy ? 'Mengirim...' : 'Kirim Pengajuan Pembatalan'}
                    </button>
                </div>
            )}

            {requests.slice(0, 3).map(r => {
                const st = statusMap[r.status] || { label: r.status, cls: 'border-gray-200 text-gray-500' };
                const mine = r.initiator_id === user?.id;
                return (
                    <div key={r.id} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${st.cls}`}>{st.label}</span>
                            <span className="text-[10px] font-bold text-gray-400">{mine ? 'Diajukan oleh Anda' : 'Diajukan oleh mitra'}</span>
                        </div>
                        <p className="text-xs text-gray-700 font-medium">{r.reason}</p>
                        {r.settlement_terms && <p className="text-[11px] text-gray-500 italic">Terms: {r.settlement_terms}</p>}
                        {r.status === 'pending' && !mine && (
                            <div className="flex gap-2 pt-1">
                                <button onClick={() => respond(r.id, 'accept')} disabled={busy} className="flex items-center gap-1 px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50 transition-all">
                                    <Check size={12} /> Setujui
                                </button>
                                <button onClick={() => respond(r.id, 'reject')} disabled={busy} className="flex items-center gap-1 px-4 py-2 border border-red-200 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-50 disabled:opacity-50 transition-all">
                                    <X size={12} /> Tolak
                                </button>
                            </div>
                        )}
                        {r.status === 'rejected' && (
                            <button onClick={() => escalate(r.id)} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-violet-700 disabled:opacity-50 transition-all">
                                <TriangleAlert size={12} /> Eskalasi ke Admin
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
