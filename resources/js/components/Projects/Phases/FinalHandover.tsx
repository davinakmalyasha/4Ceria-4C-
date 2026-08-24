import React, { useState } from 'react';
import axios from 'axios';
import { ClipboardCheck, Key, ShieldAlert, Trophy, FileText, Download } from 'lucide-react';
import { getWarrantyDays } from '../../../types/phase.types';
import { useToast } from '../../../context/ToastContext';
import SnagListManager from './SnagListManager';
import WarrantyDashboard from './WarrantyDashboard';

const esc = (s: any) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

interface FinalHandoverProps {
    project: any;
    user: any;
    onRefresh: () => void;
}

export default function FinalHandover({ project, user, onRefresh }: FinalHandoverProps) {
    const { showToast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isGeneratingBast, setIsGeneratingBast] = useState(false);
    const [acceptNotes, setAcceptNotes] = useState('');
    const warrantyDays = getWarrantyDays(project?.project_category || 'new_build');
    const isMaintenance = project?.project_category === 'maintenance';
    const isInterior = project?.project_category === 'interior';
    const workLabel = isMaintenance ? 'perbaikan' : isInterior ? 'hasil interior' : 'bangunan';

    const isOwner = user?.id === project.user_id;
    const isPM = user?.role_type === 'project_manager' && project.pm_id === user?.id;
    const walkthroughStarted = !!project.final_walkthrough_at;
    const ownerAccepted = !!project.owner_accepted_at;
    const snagCounts = project.snag_counts || { open: 0, in_progress: 0, resolved: 0, accepted: 0 };
    const hasUnresolvedSnags = snagCounts.open > 0 || snagCounts.in_progress > 0;

    const handleInitiateWalkthrough = async () => {
        setIsSubmitting(true);
        try {
            await axios.post(`/projects/${project.id}/initiate-walkthrough`);
            showToast('Final walkthrough initiated. You can now inspect and report defects.', 'success');
            onRefresh();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to initiate walkthrough.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOwnerAccept = async () => {
        if (!window.confirm(`Are you sure you want to officially accept this ${workLabel}? This will start the ${warrantyDays}-day warranty period.`)) return;
        setIsSubmitting(true);
        try {
            await axios.post(`/projects/${project.id}/owner-accept`, { notes: acceptNotes });
            showToast('Building officially accepted! Warranty period has started.', 'success');
            onRefresh();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Acceptance failed.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDownloadBAST = async () => {
        setIsGeneratingBast(true);
        let host: HTMLDivElement | null = null;
        try {
            const res = await axios.get(`/projects/${project.id}/bast`);
            const d = res.data.data;

            // Render the BAST off-screen, then capture to a real PDF download
            host = document.createElement('div');
            host.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#ffffff;';
            host.innerHTML = `
                <div style="font-family: Arial, Helvetica, sans-serif; padding: 40px; color: #1e293b; line-height: 1.6;">
                    <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 30px;">
                        <h1 style="margin:0;font-size:20px;">BERITA ACARA SERAH TERIMA (BAST)</h1>
                        <p style="margin:6px 0 0;">Nomor: ${esc(d.document_number)}</p>
                    </div>
                    <div style="margin-bottom:25px;">
                        <p>Pada hari ini, <b>${esc(d.date)}</b>, kami yang bertanda tangan di bawah ini:</p>
                        <p>1. <b>${esc(d.parties.owner.name)}</b> sebagai <b>${esc(d.parties.owner.role)}</b></p>
                        <p>2. <b>${esc(d.parties.contractor.name)}</b> (${esc(d.parties.contractor.company)}) sebagai <b>${esc(d.parties.contractor.role)}</b></p>
                    </div>
                    <div style="margin-bottom:25px;">
                        <div style="font-weight:bold;text-transform:uppercase;border-bottom:1px solid #e2e8f0;margin-bottom:10px;">Objek Pekerjaan</div>
                        <p>Nama Proyek: ${esc(d.project.title)}<br>Lokasi: ${esc(d.project.location)}</p>
                    </div>
                    <div style="margin-bottom:25px;">
                        <div style="font-weight:bold;text-transform:uppercase;border-bottom:1px solid #e2e8f0;margin-bottom:10px;">Pernyataan</div>
                        <ul>${(d.legal_clauses || []).map((c: string) => `<li>${esc(c)}</li>`).join('')}</ul>
                    </div>
                    <div style="margin-top:50px;display:grid;grid-template-columns:1fr 1fr 1fr;text-align:center;">
                        <div>PIHAK PERTAMA<div style="height:100px;"></div>( ${esc(d.parties.owner.name)} )</div>
                        <div>PIHAK KEDUA<div style="height:100px;"></div>( ${esc(d.parties.contractor.name)} )</div>
                        <div>PIHAK KETIGA<div style="height:100px;"></div>( ${esc(d.parties.pm.name)} )</div>
                    </div>
                </div>`;
            document.body.appendChild(host);

            const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
                import('html2canvas'),
                import('jspdf')
            ]);

            const canvas = await html2canvas(host, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageW = pdf.internal.pageSize.getWidth();
            const pageH = pdf.internal.pageSize.getHeight();
            const fullH = (canvas.height * pageW) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pageW, fullH);
            let remaining = fullH - pageH;
            let offset = 0;
            while (remaining > 0) {
                offset -= pageH;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, offset, pageW, fullH);
                remaining -= pageH;
            }

            pdf.save(`BAST_${d.document_number || project.id}.pdf`);
            showToast('BAST berhasil diunduh sebagai PDF.', 'success');
        } catch (error) {
            console.error('Failed to generate BAST PDF', error);
            showToast('Failed to generate BAST PDF', 'error');
        } finally {
            if (host && host.parentNode) host.parentNode.removeChild(host);
            setIsGeneratingBast(false);
        }
    };

    // State 3: Project completed
    if (ownerAccepted) {
        const isContractor = user?.role_type === 'kontraktor' && project.selected_kontraktor_id === user?.kontraktor?.id;

        return (
            <div className="space-y-8">
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-[3rem] p-10 text-center space-y-6 shadow-xl shadow-emerald-900/5">
                    <div className="w-24 h-24 bg-emerald-500 text-white rounded-[2rem] flex items-center justify-center mx-auto shadow-lg rotate-3">
                        <Trophy size={48} />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-3xl font-black text-emerald-900 uppercase tracking-tighter">Proyek Selesai & Diterima</h3>
                        <p className="text-sm text-emerald-700 font-medium max-w-md mx-auto">
                            Seluruh tahapan pembangunan telah selesai secara legal dan teknis. Masa pemeliharaan sedang berjalan.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-4">
                        <div className="bg-white/80 backdrop-blur-sm border border-emerald-100 rounded-2xl px-6 py-4 text-left">
                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Tanggal Serah Terima</p>
                            <p className="text-sm font-bold text-emerald-900">
                                {new Date(project.owner_accepted_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                        </div>
                        <div className="bg-white/80 backdrop-blur-sm border border-emerald-100 rounded-2xl px-6 py-4 text-left">
                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Berakhir Garansi</p>
                            <p className="text-sm font-bold text-emerald-900">
                                {new Date(project.warranty_end_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                        </div>
                    </div>

                    <div className="pt-4 flex items-center justify-center gap-3">
                        <button
                            onClick={handleDownloadBAST}
                            disabled={isGeneratingBast}
                            className="flex items-center gap-2 px-8 py-4 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg disabled:opacity-50"
                        >
                            {isGeneratingBast ? <Download size={16} className="animate-bounce" /> : <FileText size={16} />}
                            {isGeneratingBast ? 'Membuat PDF...' : 'Download BAST (PDF)'}
                        </button>
                    </div>
                </div>

                {/* Warranty Claims Dashboard */}
                <WarrantyDashboard 
                    project={project} 
                    currentUser={user} 
                    isOwner={isOwner} 
                    isContractor={isContractor} 
                />
            </div>
        );
    }

    // State 1: Pre-walkthrough
    if (!walkthroughStarted) {
        return (
            <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-[2rem] p-10 text-center space-y-6">
                <div className="w-16 h-16 bg-gray-200 text-gray-500 rounded-2xl flex items-center justify-center mx-auto">
                    <ClipboardCheck size={32} />
                </div>
                <div className="space-y-2">
                    <h4 className="text-lg font-black text-gray-700 uppercase tracking-tight">
                        {isMaintenance ? 'Verifikasi Belum Dimulai' : 'Serah Terima Belum Dimulai'}
                    </h4>
                    <p className="text-sm text-gray-500 max-w-md mx-auto">
                        {isMaintenance 
                            ? `Owner dapat langsung memverifikasi hasil ${workLabel} setelah pekerjaan selesai.`
                            : `PM harus menginisiasi inspeksi akhir (walkthrough) terlebih dahulu sebelum Owner bisa melaporkan cacat dan menerima ${workLabel}.`
                        }
                    </p>
                </div>
                {/* Maintenance: Owner can accept directly without PM walkthrough */}
                {isMaintenance && isOwner && (
                    <div className="space-y-3 max-w-md mx-auto">
                        <textarea
                            value={acceptNotes}
                            onChange={e => setAcceptNotes(e.target.value)}
                            placeholder="Catatan penerimaan (opsional)..."
                            rows={2}
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                        />
                        <button
                            onClick={handleOwnerAccept}
                            disabled={isSubmitting}
                            className="w-full py-3.5 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg disabled:opacity-50"
                        >
                            {isSubmitting ? 'Memproses...' : `Verifikasi Selesai & Mulai Garansi (${warrantyDays} Hari)`}
                        </button>
                    </div>
                )}
                {isPM && (
                    <button
                        onClick={handleInitiateWalkthrough}
                        disabled={isSubmitting}
                        className="px-8 py-3.5 bg-gray-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-800 transition-all shadow-lg disabled:opacity-50"
                    >
                        {isSubmitting ? 'Memulai...' : 'Mulai Inspeksi Akhir'}
                    </button>
                )}
            </div>
        );
    }

    // State 2: During walkthrough — Snag list active
    return (
        <div className="space-y-6">
            <div className="bg-amber-50 border border-amber-200 rounded-[2rem] p-6 flex items-center gap-4">
                <ShieldAlert size={24} className="text-amber-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-amber-900">Inspeksi Aktif</p>
                    <p className="text-xs text-amber-700">Laporkan semua cacat/kekurangan sebelum menerima bangunan.</p>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold">
                    <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-full">{snagCounts.open} Open</span>
                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full">{snagCounts.accepted} Fixed</span>
                </div>
            </div>

            <SnagListManager project={project} user={user} onRefresh={onRefresh} />

            {isOwner && !hasUnresolvedSnags && (
                <div className="bg-emerald-50 border-2 border-emerald-200 rounded-[2rem] p-8 space-y-4">
                    <div className="flex items-center gap-3">
                        <Key size={20} className="text-emerald-600" />
                        <h4 className="text-sm font-black text-emerald-900 uppercase tracking-widest">Terima Bangunan</h4>
                    </div>
                    <p className="text-xs text-emerald-700">Semua cacat telah diperbaiki. Anda bisa resmi menerima bangunan ini.</p>
                    <textarea
                        value={acceptNotes}
                        onChange={e => setAcceptNotes(e.target.value)}
                        placeholder="Catatan penerimaan (opsional)..."
                        rows={2}
                        className="w-full px-4 py-3 rounded-xl border border-emerald-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    />
                    <button
                        onClick={handleOwnerAccept}
                        disabled={isSubmitting}
                        className="w-full py-3.5 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg disabled:opacity-50"
                    >
                        {isSubmitting ? 'Memproses...' : `Terima & Mulai Garansi (${warrantyDays} Hari)`}
                    </button>
                </div>
            )}
        </div>
    );
}
