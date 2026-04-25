import React, { useState } from 'react';
import axios from 'axios';
import { ClipboardCheck, Key, ShieldAlert, Trophy, FileText, Download } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import SnagListManager from './SnagListManager';
import WarrantyDashboard from './WarrantyDashboard';

interface FinalHandoverProps {
    project: any;
    user: any;
    onRefresh: () => void;
}

export default function FinalHandover({ project, user, onRefresh }: FinalHandoverProps) {
    const { showToast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [acceptNotes, setAcceptNotes] = useState('');

    const isOwner = user?.id === project.user_id;
    const isPM = user?.role_type === 'project_manager' && project.pm_id === user?.id;
    const walkthroughStarted = !!project.final_walkthrough_at;
    const ownerAccepted = !!project.owner_accepted_at;
    const snagCounts = project.snag_counts || { open: 0, in_progress: 0, resolved: 0, accepted: 0 };
    const hasUnresolvedSnags = snagCounts.open > 0 || snagCounts.in_progress > 0;

    const handleInitiateWalkthrough = async () => {
        setIsSubmitting(true);
        try {
            await axios.post(`/api/projects/${project.id}/initiate-walkthrough`);
            showToast('Final walkthrough initiated. You can now inspect and report defects.', 'success');
            onRefresh();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to initiate walkthrough.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOwnerAccept = async () => {
        if (!window.confirm('Are you sure you want to officially accept this building? This will start the 180-day warranty period.')) return;
        setIsSubmitting(true);
        try {
            await axios.post(`/api/projects/${project.id}/owner-accept`, { notes: acceptNotes });
            showToast('Building officially accepted! Warranty period has started.', 'success');
            onRefresh();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Acceptance failed.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDownloadBAST = async () => {
        try {
            const res = await axios.get(`/api/projects/${project.id}/bast`);
            const data = res.data.data;
            // For now, we'll open a new window and print the BAST data
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(`
                    <html>
                        <head>
                            <title>BAST - ${data.document_number}</title>
                            <style>
                                body { font-family: sans-serif; padding: 40px; color: #1e293b; line-height: 1.6; }
                                .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 30px; }
                                .section { margin-bottom: 25px; }
                                .section-title { font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; margin-bottom: 10px; }
                                .grid { display: grid; grid-template-cols: 1fr 1fr; gap: 20px; }
                                .signatures { margin-top: 50px; display: grid; grid-template-cols: 1fr 1fr 1fr; text-align: center; }
                                .sig-box { height: 100px; }
                            </style>
                        </head>
                        <body>
                            <div class="header">
                                <h1>BERITA ACARA SERAH TERIMA (BAST)</h1>
                                <p>Nomor: ${data.document_number}</p>
                            </div>
                            <div class="section">
                                <p>Pada hari ini, <b>${data.date}</b>, kami yang bertanda tangan di bawah ini:</p>
                                <p>1. <b>${data.parties.owner.name}</b> sebagai <b>${data.parties.owner.role}</b></p>
                                <p>2. <b>${data.parties.contractor.name}</b> (${data.parties.contractor.company}) sebagai <b>${data.parties.contractor.role}</b></p>
                            </div>
                            <div class="section">
                                <div class="section-title">Objek Pekerjaan</div>
                                <p>Nama Proyek: ${data.project.title}<br>Lokasi: ${data.project.location}</p>
                            </div>
                            <div class="section">
                                <div class="section-title">Pernyataan</div>
                                <ul>
                                    ${data.legal_clauses.map(c => `<li>${c}</li>`).join('')}
                                </ul>
                            </div>
                            <div class="signatures">
                                <div>PIHAK PERTAMA<div class="sig-box"></div>( ${data.parties.owner.name} )</div>
                                <div>PIHAK KEDUA<div class="sig-box"></div>( ${data.parties.contractor.name} )</div>
                                <div>PIHAK KETIGA<div class="sig-box"></div>( ${data.parties.pm.name} )</div>
                            </div>
                        </body>
                    </html>
                `);
                printWindow.document.close();
                printWindow.print();
            }
        } catch (error) {
            showToast('Failed to generate BAST data', 'error');
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
                            className="flex items-center gap-2 px-8 py-4 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg"
                        >
                            <FileText size={16} /> Download BAST (PDF)
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
                    <h4 className="text-lg font-black text-gray-700 uppercase tracking-tight">Serah Terima Belum Dimulai</h4>
                    <p className="text-sm text-gray-500 max-w-md mx-auto">
                        PM harus menginisiasi inspeksi akhir (walkthrough) terlebih dahulu sebelum Owner bisa melaporkan cacat dan menerima bangunan.
                    </p>
                </div>
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
                        {isSubmitting ? 'Memproses...' : 'Terima & Mulai Garansi (180 Hari)'}
                    </button>
                </div>
            )}
        </div>
    );
}
