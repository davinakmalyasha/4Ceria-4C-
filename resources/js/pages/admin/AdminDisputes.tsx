import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '../../components/AdminLayout';
import { Pagination } from '../../components/Common/Pagination';
import {
    Gavel,
    ArrowLeft,
    Send,
    CheckCircle2,
    RotateCcw,
    Banknote,
    Ban,
    MessageSquare,
    Paperclip,
    RefreshCw,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface DisputeMessage {
    id: number;
    body: string;
    evidence_path?: string | null;
    evidence_original_name?: string | null;
    created_at?: string;
    user?: { id: number; name: string };
}

interface Dispute {
    id: number;
    project_id: number;
    category: string;
    title: string;
    description: string;
    status: string;
    disputed_amount?: number | null;
    payment_type?: string | null;
    payment_id?: number | null;
    resolution?: string | null;
    resolution_notes?: string | null;
    resolved_at?: string | null;
    created_at?: string;
    opened_by?: { id: number; name: string };
    resolver?: { id: number; name: string } | null;
    project?: { id: number; title: string; status: string; budget?: number };
    messages?: DisputeMessage[];
}

const statusTabs = [
    { key: '', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'dismissed', label: 'Dismissed' },
    { key: 'withdrawn', label: 'Withdrawn' },
];

const statusCls: Record<string, string> = {
    open: 'bg-red-100 text-red-600 border-red-200',
    resolved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dismissed: 'bg-slate-100 text-slate-600 border-slate-200',
    withdrawn: 'bg-amber-100 text-amber-700 border-amber-200',
};

type ActionKey = 'dismiss' | 'release_payment' | 'record_refund' | 'terminate_project' | 'custom';

const AdminDisputes: React.FC = () => {
    const { showToast } = useToast();
    const [disputes, setDisputes] = useState<Dispute[]>([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('');
    const [openCount, setOpenCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [fromRow, setFromRow] = useState(0);
    const [toRow, setToRow] = useState(0);
    const [selected, setSelected] = useState<Dispute | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [replyBody, setReplyBody] = useState('');
    const [busy, setBusy] = useState(false);
    const [refundAmount, setRefundAmount] = useState('');
    const [customNotes, setCustomNotes] = useState('');
    const [dismissNotes, setDismissNotes] = useState('');
    const [actionNotes, setActionNotes] = useState('');

    const fetchDisputes = (page = 1, st = status) => {
        setLoading(true);
        axios
            .get('/admin/disputes', { params: { page, status: st || undefined } })
            .then((res) => {
                const p = res.data.data;
                setDisputes(p.data || []);
                setCurrentPage(p.current_page);
                setLastPage(p.last_page);
                setTotal(p.total);
                setFromRow(p.from || 0);
                setToRow(p.to || 0);
                setOpenCount(res.data.open_count || 0);
            })
            .catch((err) => console.error(err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchDisputes(1, status);
    }, [status]);

    const openDetail = (id: number) => {
        setDetailLoading(true);
        setSelected(null);
        axios
            .get(`/admin/disputes/${id}`)
            .then((res) => setSelected(res.data.data))
            .catch((err) => showToast(err.response?.data?.message || 'Failed to load dispute', 'error'))
            .finally(() => setDetailLoading(false));
    };

    const postReply = async () => {
        if (!selected || !replyBody.trim()) return;
        setBusy(true);
        try {
            await axios.post(`/admin/disputes/${selected.id}/reply`, { body: replyBody });
            setReplyBody('');
            openDetail(selected.id);
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to post reply', 'error');
        } finally {
            setBusy(false);
        }
    };

    const openEvidence = async (messageId: number) => {
        if (!selected) return;
        try {
            const res = await axios.get(`/admin/disputes/${selected.id}/messages/${messageId}/evidence`);
            window.open(res.data.url, '_blank', 'noopener');
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Evidence not found', 'error');
        }
    };

    const runAction = async (action: ActionKey) => {
        if (!selected) return;
        const confirmMsgs: Record<ActionKey, string> = {
            dismiss: 'Dismiss this dispute? Payments will be unfrozen and nothing moves.',
            release_payment: 'Release the linked payment (full accept path: budget check, ledger, activation)?',
            record_refund: 'Record this refund in the budget ledger? This reverses the payment amount.',
            terminate_project: 'Force-terminate this project? This cannot be undone.',
            custom: 'Close this dispute with the custom resolution notes?',
        };
        if (!window.confirm(confirmMsgs[action])) return;

        const payload: any = { action };
        if (action === 'custom') {
            if (!customNotes.trim()) {
                showToast('Resolution notes are required for a custom resolution.', 'error');
                return;
            }
            payload.notes = customNotes.trim();
        } else if (action === 'record_refund') {
            if (!refundAmount || Number(refundAmount) <= 0) {
                showToast('A positive refund amount is required.', 'error');
                return;
            }
            payload.amount = Number(refundAmount);
            if (actionNotes.trim()) payload.notes = actionNotes.trim();
        } else {
            if (action === 'release_payment' && (!selected.payment_type || !selected.payment_id)) {
                showToast('This dispute has no linked payment. Use dismiss, refund, terminate, or custom.', 'error');
                return;
            }
            if (action === 'dismiss' && dismissNotes.trim()) payload.notes = dismissNotes.trim();
            else if (actionNotes.trim()) payload.notes = actionNotes.trim();
        }

        setBusy(true);
        try {
            const res = await axios.post(`/admin/disputes/${selected.id}/act`, payload);
            showToast(res.data.message || 'Action completed.', 'success');
            setRefundAmount('');
            setCustomNotes('');
            setDismissNotes('');
            setActionNotes('');
            openDetail(selected.id);
            fetchDisputes(currentPage);
            onRefreshCount();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Action failed.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const onRefreshCount = () => {
        axios
            .get('/admin/disputes', { params: { status: 'open', page: 1 } })
            .then((res) => setOpenCount(res.data.open_count || 0))
            .catch(() => {});
    };

    if (detailLoading || (selected && detailLoading)) {
        return (
            <AdminLayout>
                <div className="py-16 text-center text-neutral-400 italic text-sm">Loading dispute...</div>
            </AdminLayout>
        );
    }

    if (selected) {
        const isOpen = selected.status === 'open';
        return (
            <AdminLayout>
                <div className="space-y-6">
                    <div className="flex items-center justify-between gap-4">
                        <button
                            onClick={() => { setSelected(null); fetchDisputes(currentPage); }}
                            className="flex items-center gap-2 px-3 py-2 border border-neutral-200 bg-[#fafafa] hover:bg-neutral-50 rounded-xl text-[11px] font-bold text-neutral-500 hover:text-neutral-900 transition-colors"
                        >
                            <ArrowLeft size={14} /> Back to queue
                        </button>
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${statusCls[selected.status] || 'border-gray-200 text-gray-500'}`}>
                            {selected.status}
                        </span>
                    </div>

                    <div className="bg-white rounded-2xl border border-neutral-200 p-6 space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <Gavel size={18} className="text-neutral-700" />
                            <h3 className="text-sm font-black uppercase tracking-widest text-neutral-900">
                                Dispute #{selected.id} · {selected.category}
                            </h3>
                            <span className="text-[11px] font-bold text-neutral-400">
                                Project: {selected.project?.title || `#${selected.project_id}`} (status: {selected.project?.status})
                            </span>
                        </div>
                        <p className="text-base font-extrabold text-neutral-900">{selected.title}</p>
                        <p className="text-sm text-neutral-700 whitespace-pre-line">{selected.description}</p>
                        <div className="flex flex-wrap gap-4 text-[11px] font-bold text-neutral-500">
                            <span>Opened by {selected.opened_by?.name || '—'} · {selected.created_at ? new Date(selected.created_at).toLocaleString() : ''}</span>
                            {selected.disputed_amount != null && <span>Amount: Rp {Number(selected.disputed_amount).toLocaleString()}</span>}
                            {selected.payment_type && <span>Linked payment: {selected.payment_type} #{selected.payment_id}</span>}
                            {selected.resolution && <span>Resolution: {selected.resolution} by {selected.resolver?.name || '—'}</span>}
                        </div>
                        {selected.resolution_notes && (
                            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 font-bold">
                                {selected.resolution_notes}
                            </p>
                        )}
                    </div>

                    <div className="bg-white rounded-2xl border border-neutral-200 p-6 space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Thread</h4>
                        <div className="space-y-3">
                            {(selected.messages || []).length === 0 && (
                                <p className="text-xs text-neutral-400 italic">No messages yet.</p>
                            )}
                            {(selected.messages || []).map((m) => (
                                <div key={m.id} className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-black text-neutral-900">{m.user?.name || 'User'}</span>
                                        <span className="text-[10px] text-neutral-400">{m.created_at ? new Date(m.created_at).toLocaleString() : ''}</span>
                                    </div>
                                    <p className="text-sm text-neutral-700 mt-1 whitespace-pre-line">{m.body}</p>
                                    {m.evidence_path && (
                                        <button
                                            onClick={() => openEvidence(m.id)}
                                            className="mt-2 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-900"
                                        >
                                            <Paperclip size={11} /> {m.evidence_original_name || 'Evidence'}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        {isOpen && (
                            <div className="flex items-center gap-2 pt-2 border-t border-neutral-100">
                                <input
                                    type="text"
                                    value={replyBody}
                                    onChange={(e) => setReplyBody(e.target.value)}
                                    maxLength={5000}
                                    placeholder="Write an arbitration reply..."
                                    className="flex-1 px-4 py-2.5 rounded-xl border border-neutral-200 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-950"
                                />
                                <button
                                    onClick={postReply}
                                    disabled={busy}
                                    className="p-2.5 rounded-xl bg-neutral-950 text-white hover:bg-neutral-900 disabled:opacity-50"
                                >
                                    <Send size={14} />
                                </button>
                            </div>
                        )}
                    </div>

                    {isOpen && (
                        <div className="bg-white rounded-2xl border border-neutral-200 p-6 space-y-4">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Arbitration Actions</h4>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2 rounded-xl border border-neutral-100 p-4">
                                    <p className="text-xs font-black text-neutral-800 flex items-center gap-1.5"><CheckCircle2 size={13} /> Dismiss</p>
                                    <input
                                        type="text"
                                        value={dismissNotes}
                                        onChange={(e) => setDismissNotes(e.target.value)}
                                        placeholder="Notes (optional)..."
                                        className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-950"
                                    />
                                    <button
                                        onClick={() => runAction('dismiss')}
                                        disabled={busy}
                                        className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                                    >
                                        Dismiss & Unfreeze
                                    </button>
                                </div>

                                <div className="space-y-2 rounded-xl border border-neutral-100 p-4">
                                    <p className="text-xs font-black text-neutral-800 flex items-center gap-1.5"><Banknote size={13} /> Release payment</p>
                                    {!selected.payment_type && (
                                        <p className="text-[11px] text-amber-600 font-bold">No linked payment on this dispute.</p>
                                    )}
                                    <input
                                        type="text"
                                        value={actionNotes}
                                        onChange={(e) => setActionNotes(e.target.value)}
                                        placeholder="Notes (optional)..."
                                        className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-950"
                                    />
                                    <button
                                        onClick={() => runAction('release_payment')}
                                        disabled={busy || !selected.payment_type}
                                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                                    >
                                        Release & Mark Paid
                                    </button>
                                </div>

                                <div className="space-y-2 rounded-xl border border-neutral-100 p-4">
                                    <p className="text-xs font-black text-neutral-800 flex items-center gap-1.5"><RotateCcw size={13} /> Record refund</p>
                                    <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={refundAmount}
                                        onChange={(e) => setRefundAmount(e.target.value)}
                                        placeholder="Refund amount (Rp)"
                                        className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-950"
                                    />
                                    <input
                                        type="text"
                                        value={actionNotes}
                                        onChange={(e) => setActionNotes(e.target.value)}
                                        placeholder="Notes (optional)..."
                                        className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-950"
                                    />
                                    <button
                                        onClick={() => runAction('record_refund')}
                                        disabled={busy}
                                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                                    >
                                        Record Refund
                                    </button>
                                </div>

                                <div className="space-y-2 rounded-xl border border-red-100 p-4 bg-red-50/40">
                                    <p className="text-xs font-black text-red-700 flex items-center gap-1.5"><Ban size={13} /> Terminate project</p>
                                    <input
                                        type="text"
                                        value={actionNotes}
                                        onChange={(e) => setActionNotes(e.target.value)}
                                        placeholder="Notes (optional)..."
                                        className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-950"
                                    />
                                    <button
                                        onClick={() => runAction('terminate_project')}
                                        disabled={busy}
                                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                                    >
                                        Force Terminate
                                    </button>
                                </div>

                                <div className="space-y-2 rounded-xl border border-neutral-100 p-4 md:col-span-2">
                                    <p className="text-xs font-black text-neutral-800 flex items-center gap-1.5"><MessageSquare size={13} /> Custom resolution</p>
                                    <textarea
                                        value={customNotes}
                                        onChange={(e) => setCustomNotes(e.target.value)}
                                        rows={2}
                                        maxLength={5000}
                                        placeholder="Resolution notes (required)..."
                                        className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-950"
                                    />
                                    <button
                                        onClick={() => runAction('custom')}
                                        disabled={busy}
                                        className="px-4 py-2 bg-neutral-950 hover:bg-neutral-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                                    >
                                        Close with Custom Resolution
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-900">
                            Dispute Center
                            {openCount > 0 && (
                                <span className="ml-2 inline-flex items-center justify-center bg-red-500 text-white text-[9px] font-black w-5 h-5 rounded-full align-middle">
                                    {openCount}
                                </span>
                            )}
                        </h3>
                        <p className="text-[11px] text-neutral-400 font-semibold mt-0.5">
                            Arbitration queue. Open disputes freeze all project payments until resolved.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex rounded-xl border border-neutral-200 overflow-hidden">
                            {statusTabs.map((t) => (
                                <button
                                    key={t.key}
                                    onClick={() => setStatus(t.key)}
                                    className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${
                                        status === t.key ? 'bg-neutral-950 text-white' : 'bg-[#fafafa] text-neutral-500 hover:bg-neutral-100'
                                    }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => fetchDisputes(currentPage)} className="p-2 border border-neutral-200 bg-[#fafafa] hover:bg-neutral-50 rounded-xl text-neutral-500 hover:text-neutral-900 transition-colors">
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-neutral-50 text-[10px] font-black uppercase tracking-wider text-neutral-400 border-b border-neutral-100">
                                <th className="px-6 py-3.5">#</th>
                                <th className="px-6 py-3.5">Project</th>
                                <th className="px-6 py-3.5">Dispute</th>
                                <th className="px-6 py-3.5">Category</th>
                                <th className="px-6 py-3.5">Amount</th>
                                <th className="px-6 py-3.5">Status</th>
                                <th className="px-6 py-3.5">Opened</th>
                                <th className="px-6 py-3.5 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 text-xs">
                            {loading ? (
                                <tr><td colSpan={8} className="px-6 py-12 text-center text-neutral-400 italic">Loading disputes...</td></tr>
                            ) : disputes.length === 0 ? (
                                <tr><td colSpan={8} className="px-6 py-12 text-center text-neutral-400 italic">No disputes found.</td></tr>
                            ) : (
                                disputes.map((d) => (
                                    <tr key={d.id} className="hover:bg-neutral-50/50 transition-colors">
                                        <td className="px-6 py-4 font-extrabold text-neutral-900">#{d.id}</td>
                                        <td className="px-6 py-4 font-bold text-neutral-700">{d.project?.title || `#${d.project_id}`}</td>
                                        <td className="px-6 py-4 font-extrabold text-neutral-900 truncate max-w-xs">{d.title}</td>
                                        <td className="px-6 py-4 font-semibold text-neutral-500 capitalize">{d.category}</td>
                                        <td className="px-6 py-4 font-bold text-neutral-700">
                                            {d.disputed_amount != null ? `Rp ${Number(d.disputed_amount).toLocaleString()}` : '—'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${statusCls[d.status] || 'border-gray-200 text-gray-500'}`}>
                                                {d.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-neutral-500 font-semibold">
                                            {d.created_at ? new Date(d.created_at).toLocaleDateString() : ''}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => openDetail(d.id)}
                                                className="px-3 py-1.5 bg-neutral-950 hover:bg-neutral-900 text-white rounded-xl font-bold uppercase tracking-wider text-[10px] shadow-sm inline-flex items-center gap-1"
                                            >
                                                <Gavel size={11} /> Review
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                    <Pagination
                        currentPage={currentPage}
                        lastPage={lastPage}
                        total={total}
                        from={fromRow}
                        to={toRow}
                        onPageChange={(page) => fetchDisputes(page)}
                    />
                </div>
            </div>
        </AdminLayout>
    );
};

export default AdminDisputes;
