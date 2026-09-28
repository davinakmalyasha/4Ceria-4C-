import React, { useEffect, useRef, useState } from 'react';
import { Gavel, Send, Upload, X, ShieldAlert, Paperclip } from 'lucide-react';
import axios from 'axios';
import { useToast } from '../../../context/ToastContext';

interface Props {
    project: any;
    user: any;
    onRefresh: () => void;
}

const statusMap: Record<string, { label: string; cls: string }> = {
    open: { label: 'Open — Payments Frozen', cls: 'bg-red-100 text-red-600 border-red-200' },
    resolved: { label: 'Resolved', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    dismissed: { label: 'Dismissed', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
    withdrawn: { label: 'Withdrawn', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
};

const categories = [
    { value: 'payment', label: 'Payment dispute' },
    { value: 'quality', label: 'Quality of work' },
    { value: 'termination', label: 'Termination' },
    { value: 'delay', label: 'Delay / schedule' },
    { value: 'other', label: 'Other' },
];

/**
 * Dispute / arbitration center panel. Shows the project's dispute(s) with a
 * full thread, lets participants open a dispute (freezes payments until an
 * admin resolves it), reply with evidence, and withdraw an open dispute.
 * Self-hides on 403 (mounted unconditionally — only real participants see it).
 */
export default function DisputePanel({ project, user, onRefresh }: Props) {
    const { showToast } = useToast();
    const [hidden, setHidden] = useState(false);
    const [disputes, setDisputes] = useState<any[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [category, setCategory] = useState('payment');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [paymentId, setPaymentId] = useState('');
    const [busy, setBusy] = useState(false);
    const [replyBody, setReplyBody] = useState('');
    const [replyFile, setReplyFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchDisputes = async () => {
        try {
            const res = await axios.get(`/projects/${project.id}/disputes`);
            setDisputes(res.data.data || []);
        } catch (err: any) {
            if (err.response?.status === 403) setHidden(true);
            /* other errors are non-fatal */
        } finally {
            setLoaded(true);
        }
    };

    useEffect(() => {
        setHidden(false);
        setLoaded(false);
        fetchDisputes();
    }, [project?.id]);

    const submitDispute = async () => {
        if (!title.trim() || !description.trim()) {
            showToast('Judul dan deskripsi wajib diisi.', 'error');
            return;
        }
        setBusy(true);
        try {
            const payload: any = { category, title, description };
            if (amount) payload.disputed_amount = Number(amount);
            if (paymentId) {
                payload.payment_type = 'termin';
                payload.payment_id = Number(paymentId);
            }
            await axios.post(`/projects/${project.id}/disputes`, payload);
            showToast('Sengketa dibuka. Semua pembayaran dibekukan sampai admin menyelesaikannya.', 'success');
            setShowForm(false);
            setTitle('');
            setDescription('');
            setAmount('');
            setPaymentId('');
            fetchDisputes();
            onRefresh();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Gagal membuka sengketa.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const reply = async (disputeId: number) => {
        if (!replyBody.trim()) {
            showToast('Pesan tidak boleh kosong.', 'error');
            return;
        }
        setBusy(true);
        try {
            const form = new FormData();
            form.append('body', replyBody);
            if (replyFile) form.append('evidence', replyFile);
            await axios.post(`/projects/${project.id}/disputes/${disputeId}/reply`, form, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setReplyBody('');
            setReplyFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            fetchDisputes();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Gagal mengirim balasan.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const withdraw = async (disputeId: number) => {
        if (!window.confirm('Tarik sengketa ini? Pembayaran akan dicabut pembekuannya.')) return;
        setBusy(true);
        try {
            await axios.post(`/projects/${project.id}/disputes/${disputeId}/withdraw`);
            showToast('Sengketa ditarik. Pembayaran dicabut pembekuannya.', 'success');
            fetchDisputes();
            onRefresh();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Gagal menarik sengketa.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const openEvidence = async (disputeId: number, messageId: number) => {
        try {
            const res = await axios.get(`/projects/${project.id}/disputes/${disputeId}/messages/${messageId}/evidence`);
            window.open(res.data.url, '_blank', 'noopener');
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Bukti tidak ditemukan.', 'error');
        }
    };

    if (hidden || !loaded) return null;

    const activeDispute = disputes.find((d) => d.status === 'open');
    const closedDisputes = disputes.filter((d) => d.status !== 'open');
    const termins: { id: number; label: string }[] = (project?.payment_termins || []).map((t: any) => ({
        id: t.id,
        label: t.label || `Termin #${t.id}`,
    }));

    return (
        <div className="bg-white border border-gray-200 rounded-[2rem] p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Gavel size={18} className="text-slate-600" />
                    <div>
                        <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Dispute Center</h4>
                        <p className="text-[11px] text-gray-400">Escalasi perselisihan ke arbitrasi admin platform.</p>
                    </div>
                </div>
                {!activeDispute && (
                    <button
                        onClick={() => setShowForm((s) => !s)}
                        className="px-4 py-2 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-600 hover:bg-gray-50 transition-all shrink-0"
                    >
                        {showForm ? 'Tutup' : 'Buka Sengketa'}
                    </button>
                )}
            </div>

            {activeDispute && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
                    <ShieldAlert size={15} className="text-red-600 shrink-0 mt-0.5" />
                    <p className="text-xs font-bold text-red-700">
                        Sengketa aktif — semua pembayaran proyek dibekukan sampai admin platform menyelesaikannya.
                    </p>
                </div>
            )}

            {showForm && !activeDispute && (
                <div className="space-y-3 border border-gray-100 rounded-2xl p-4 bg-gray-50/60">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="space-y-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Kategori</span>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                            >
                                {categories.map((c) => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                            </select>
                        </label>
                        <label className="space-y-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Judul</span>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                maxLength={255}
                                placeholder="Ringkasan sengketa..."
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                            />
                        </label>
                    </div>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        maxLength={5000}
                        placeholder="Jelaskan kronologi dan tuntutan Anda..."
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="space-y-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Nilai Sengketa (Rp, opsional)</span>
                            <input
                                type="number"
                                min="0"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0"
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                            />
                        </label>
                        {termins.length > 0 && (
                            <label className="space-y-1">
                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Pembayaran Terkait (opsional)</span>
                                <select
                                    value={paymentId}
                                    onChange={(e) => setPaymentId(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                                >
                                    <option value="">— Tidak terkait pembayaran —</option>
                                    {termins.map((t) => (
                                        <option key={t.id} value={String(t.id)}>{t.label}</option>
                                    ))}
                                </select>
                            </label>
                        )}
                    </div>
                    <button
                        onClick={submitDispute}
                        disabled={busy}
                        className="w-full py-3 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all disabled:opacity-50"
                    >
                        {busy ? 'Mengirim...' : 'Buka Sengketa & Bekukan Pembayaran'}
                    </button>
                </div>
            )}

            {disputes.length === 0 && !showForm && (
                <p className="text-xs text-gray-400 italic">Belum ada sengketa pada proyek ini.</p>
            )}

            {disputes.map((d) => {
                const st = statusMap[d.status] || { label: d.status, cls: 'border-gray-200 text-gray-500' };
                const canWithdraw = d.status === 'open' && d.opened_by === user?.id;
                return (
                    <div key={d.id} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${st.cls}`}>
                                    {st.label}
                                </span>
                                <span className="text-[10px] font-bold text-gray-500">#{d.id} · {d.category}</span>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400">
                                Dibuka oleh {d.opener?.name || '—'}
                                {d.disputed_amount ? ` · Rp ${Number(d.disputed_amount).toLocaleString('id-ID')}` : ''}
                            </span>
                        </div>
                        <p className="text-sm font-extrabold text-gray-900">{d.title}</p>
                        <p className="text-xs text-gray-700 whitespace-pre-line">{d.description}</p>
                        {d.resolution && (
                            <p className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                                Resolusi admin ({d.resolution}): {d.resolution_notes || '—'}
                            </p>
                        )}

                        <div className="space-y-2">
                            {(d.messages || []).map((m: any) => (
                                <div key={m.id} className="bg-white rounded-xl border border-gray-100 p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-black text-gray-800">{m.user?.name || 'User'}</span>
                                        <span className="text-[10px] text-gray-400">
                                            {m.created_at ? new Date(m.created_at).toLocaleString('id-ID') : ''}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-700 mt-1 whitespace-pre-line">{m.body}</p>
                                    {m.evidence_path && (
                                        <button
                                            onClick={() => openEvidence(d.id, m.id)}
                                            className="mt-2 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-900"
                                        >
                                            <Paperclip size={11} /> {m.evidence_original_name || 'Lampiran bukti'}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {d.status === 'open' && (
                            <div className="space-y-2 pt-1">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={replyBody}
                                        onChange={(e) => setReplyBody(e.target.value)}
                                        maxLength={5000}
                                        placeholder="Tulis balasan..."
                                        className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-slate-300"
                                    />
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        className="hidden"
                                        accept="image/*,.pdf"
                                        onChange={(e) => setReplyFile(e.target.files?.[0] || null)}
                                    />
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className={`p-2.5 rounded-xl border transition-all ${replyFile ? 'border-slate-400 bg-slate-50 text-slate-700' : 'border-gray-200 text-gray-400 hover:text-gray-600'}`}
                                        title={replyFile ? replyFile.name : 'Lampirkan bukti (maks 10MB)'}
                                    >
                                        <Upload size={14} />
                                    </button>
                                    <button
                                        onClick={() => reply(d.id)}
                                        disabled={busy}
                                        className="p-2.5 rounded-xl bg-slate-900 text-white hover:bg-black disabled:opacity-50 transition-all"
                                    >
                                        <Send size={14} />
                                    </button>
                                </div>
                                {replyFile && (
                                    <p className="text-[10px] text-gray-500 flex items-center gap-1">
                                        <X size={11} className="cursor-pointer" onClick={() => { setReplyFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} />
                                        {replyFile.name}
                                    </p>
                                )}
                                {canWithdraw && (
                                    <button
                                        onClick={() => withdraw(d.id)}
                                        disabled={busy}
                                        className="px-4 py-2 border border-amber-200 text-amber-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-50 disabled:opacity-50 transition-all"
                                    >
                                        Tarik Sengketa
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}

            {closedDisputes.length > 0 && (
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                    {closedDisputes.length} sengketa tertutup di proyek ini
                </p>
            )}
        </div>
    );
}
