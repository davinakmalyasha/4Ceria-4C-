import React, { useState } from 'react';
import { FileCheck2, FileClock, CheckCircle2, RotateCcw, Send, ShieldCheck, AlertTriangle, Lock } from 'lucide-react';
import axios from 'axios';
import { useToast } from '../../../context/ToastContext';

interface Props {
    project: any;
    isContractor: boolean;
    isOwner: boolean;
    isPM: boolean;
    onRefresh: () => void;
}

type BriefStatus = 'draft' | 'pending_review' | 'approved' | 'revision_requested';

const STATUS_META: Record<string, { label: string; cls: string; icon: any; blurb: string }> = {
    draft: {
        label: 'Belum Diajukan',
        cls: 'bg-slate-100 text-slate-600 border-slate-200',
        icon: FileClock,
        blurb: 'Kontraktor harus mengajukan Brief/DED konstruksi sebelum verifikasi PBG dapat dibuka.',
    },
    pending_review: {
        label: 'Menunggu Review Owner/PM',
        cls: 'bg-amber-100 text-amber-700 border-amber-200',
        icon: FileClock,
        blurb: 'Brief konstruksi sudah diajukan dan menunggu persetujuan.',
    },
    approved: {
        label: 'Disetujui — PBG/SLF Terbuka',
        cls: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        icon: CheckCircle2,
        blurb: 'Brief disetujui. Verifikasi PBG (izin bangunan) kini dapat dilakukan di tahap serah terima.',
    },
    revision_requested: {
        label: 'Revisi Diminta',
        cls: 'bg-red-100 text-red-600 border-red-200',
        icon: RotateCcw,
        blurb: 'Owner/PM meminta revisi. Perbaiki lalu ajukan ulang.',
    },
};

/**
 * Construction Brief (DED) review gate.
 *
 * WHY THIS EXISTS: the whole regulatory chain was dead-ended in the UI.
 * `ProjectController::verifyPBG` refuses with 422 unless
 * `construction_brief_status === 'approved'`, but NOTHING in the SPA ever set
 * that value — the contractor had no "submit for review" control, and the
 * owner/PM had no approve/revise control (both endpoints were routed but
 * unreachable). So for every new-build project the final handover could never
 * pass the PBG/SLF gate.
 */
export default function ConstructionBriefGate({ project, isContractor, isOwner, isPM, onRefresh }: Props) {
    const { showToast } = useToast();
    const [busy, setBusy] = useState(false);
    const [showRevise, setShowRevise] = useState(false);
    const [notes, setNotes] = useState('');

    const status: BriefStatus = (project?.construction_brief_status as BriefStatus) || 'draft';
    const meta = STATUS_META[status] || STATUS_META.draft;
    const Icon = meta.icon;
    const canReview = isOwner || isPM;
    const revisionNotes: string | null = project?.construction_brief_revision_notes ?? null;

    const run = async (fn: () => Promise<any>, successMessage: string) => {
        setBusy(true);
        try {
            await fn();
            showToast(successMessage, 'success');
            setShowRevise(false);
            setNotes('');
            onRefresh();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Gagal memproses brief konstruksi.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const submitForReview = () =>
        run(
            () => axios.post(`/projects/${project.id}/lock-brief`, { phase: 'build' }),
            'Brief konstruksi diajukan untuk review.'
        );

    const approve = () =>
        run(
            () => axios.post(`/projects/${project.id}/approve-construction-brief`),
            'Brief konstruksi disetujui. PBG/SLF kini dapat diverifikasi.'
        );

    const requestRevision = () => {
        if (!notes.trim()) {
            showToast('Tulis catatan revisi terlebih dahulu.', 'error');
            return;
        }
        return run(
            () => axios.post(`/projects/${project.id}/revise-construction-brief`, { notes }),
            'Permintaan revisi terkirim ke kontraktor.'
        );
    };

    // Show to the parties who can act, and to anyone while it is unresolved.
    const relevant = canReview || isContractor;
    if (!relevant) return null;

    return (
        <div className="bg-white border border-gray-200 rounded-[2rem] p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <FileCheck2 size={18} className="text-slate-600" />
                    <div>
                        <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">
                            Brief Konstruksi (DED) — Gerbang PBG
                        </h4>
                        <p className="text-[11px] text-gray-400">
                            Prasyarat wajib sebelum verifikasi PBG/SLF pada serah terima proyek.
                        </p>
                    </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border flex items-center gap-1 ${meta.cls}`}>
                    <Icon size={11} /> {meta.label}
                </span>
            </div>

            <p className="text-xs text-gray-600">{meta.blurb}</p>

            {revisionNotes && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
                    <AlertTriangle size={15} className="text-red-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-red-700">Catatan revisi</p>
                        <p className="text-xs text-red-700 whitespace-pre-line">{revisionNotes}</p>
                    </div>
                </div>
            )}

            {isContractor && (status === 'draft' || status === 'revision_requested') && (
                <button
                    onClick={submitForReview}
                    disabled={busy}
                    className="w-full py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all disabled:opacity-50"
                >
                    <span className="inline-flex items-center gap-2">
                        <Send size={12} /> {status === 'revision_requested' ? 'Ajukan Ulang untuk Review' : 'Ajukan Brief untuk Review'}
                    </span>
                </button>
            )}

            {canReview && status === 'pending_review' && (
                <div className="space-y-3">
                    {showRevise ? (
                        <div className="space-y-2">
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={3}
                                maxLength={2000}
                                placeholder="Jelaskan apa yang perlu diperbaiki pada brief konstruksi..."
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={requestRevision}
                                    disabled={busy}
                                    className="flex-1 py-3 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 disabled:opacity-50"
                                >
                                    Kirim Permintaan Revisi
                                </button>
                                <button
                                    onClick={() => setShowRevise(false)}
                                    className="px-4 py-3 border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-600 hover:bg-gray-50"
                                >
                                    Batal
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <button
                                onClick={approve}
                                disabled={busy}
                                className="flex-1 inline-flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50"
                            >
                                <CheckCircle2 size={12} /> Setujui Brief
                            </button>
                            <button
                                onClick={() => setShowRevise(true)}
                                disabled={busy}
                                className="flex-1 inline-flex items-center justify-center gap-2 py-3 border border-red-200 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-50 disabled:opacity-50"
                            >
                                <RotateCcw size={12} /> Minta Revisi
                            </button>
                        </div>
                    )}
                </div>
            )}

            {status === 'approved' && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
                    <ShieldCheck size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-emerald-700 font-semibold">
                        Gerbang regulatory terbuka. Verifikasi PBG dan SLF kini tersedia di panel
                        <span className="font-black"> Final Handover</span>.
                    </p>
                </div>
            )}

            {isContractor && status === 'pending_review' && (
                <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
                    <Lock size={11} /> Menunggu keputusan Owner/PM. Brief terkunci sampai disetujui.
                </p>
            )}
        </div>
    );
}
