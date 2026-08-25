import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Printer, ZoomIn, ZoomOut, FileText, ShieldCheck, Download } from 'lucide-react';
import axios from 'axios';

interface ProjectContractViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    project: any;
    bid: any;
    roleType: string;
}

export default function ProjectContractViewerModal({
    isOpen,
    onClose,
    project,
    bid,
    roleType
}: ProjectContractViewerModalProps) {
    const [zoom, setZoom] = useState<number>(100);
    const [snapshot, setSnapshot] = useState<any>(null);
    const [loadingSnapshot, setLoadingSnapshot] = useState<boolean>(false);

    const handleZoomIn = () => setZoom(z => Math.min(z + 10, 150));
    const handleZoomOut = () => setZoom(z => Math.max(z - 10, 70));

    const spkDocument = useMemo(() => {
        const matchRole = (role: string) => {
            return role === 'arsitek' ? 'architect' :
                   role === 'kontraktor' ? 'contractor' :
                   role === 'notaris' ? 'notary' :
                   role === 'project_manager' ? 'pm' : role;
        };
        const targetRole = matchRole(roleType);
        return (project?.documents || []).find((d: any) => d.category === 'spk' && d.target_role === targetRole);
    }, [project?.documents, roleType]);

    useEffect(() => {
        if (isOpen && spkDocument?.file_url) {
            setLoadingSnapshot(true);
            axios.get(spkDocument.file_url)
                .then(res => {
                    setSnapshot(res.data);
                })
                .catch(err => {
                    console.error("Failed to load immutable contract snapshot:", err);
                })
                .finally(() => {
                    setLoadingSnapshot(false);
                });
        } else {
            setSnapshot(null);
        }
    }, [isOpen, spkDocument?.file_url]);

    const handlePrint = () => {
        const printContent = document.getElementById('spk-print-area')?.innerHTML;
        if (!printContent) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        // SECURITY: escape interpolated values — an attacker-controlled
        // project title would otherwise execute script in this window's
        // origin (same-origin as the SPA). printContent itself is React-
        // rendered markup, not raw user input.
        const esc = (s: any) => String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        printWindow.document.write(`
            <html>
                <head>
                    <title>Surat Perintah Kerja (SPK) - ${esc(project.title)}</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            color: #333;
                            line-height: 1.6;
                            padding: 40px;
                            max-width: 800px;
                            margin: 0 auto;
                        }
                        .text-center { text-align: center; }
                        .space-y-1 > * + * { margin-top: 4px; }
                        .font-bold { font-weight: bold; }
                        .text-sm { font-size: 14px; }
                        .text-xs { font-size: 12px; }
                        .mt-6 { margin-top: 24px; }
                        .mt-8 { margin-top: 32px; }
                        .mt-12 { margin-top: 48px; }
                        .pt-8 { padding-top: 32px; }
                        .grid { display: grid; }
                        .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                        .gap-6 { gap: 24px; }
                        .gap-8 { gap: 32px; }
                        .pl-3.5 { padding-left: 14px; }
                        .border-l-2 { border-left-width: 2px; }
                        .border-stone-300 { border-color: #d6d3d1; }
                        .border-t { border-top: 1px solid #e5e7eb; }
                        .border-stone-200 { border-color: #e7e5e4; }
                        .text-stone-800 { color: #292524; }
                        .text-stone-900 { color: #1c1917; }
                        .text-stone-600 { color: #57534e; }
                        .text-stone-500 { color: #78716c; }
                        .text-justify { text-align: justify; }
                        .uppercase { text-transform: uppercase; }
                        .tracking-wide { tracking: 0.05em; }
                        .italic { font-style: italic; }
                        .h-16 { height: 64px; }
                        .flex { display: flex; }
                        .items-center { align-items: center; }
                        .justify-center { justify-content: center; }
                        .mx-8 { margin-left: 32px; margin-right: 32px; }
                        .relative { position: relative; }
                        .absolute { position: absolute; }
                        .inset-0 { top: 0; right: 0; bottom: 0; left: 0; }
                        .opacity-5 { opacity: 0.05; }
                        img { max-height: 56px; max-width: 100%; object-fit: contain; }
                        @media print {
                            body { padding: 0; }
                            .no-print { display: none; }
                        }
                    </style>
                </head>
                <body>
                    <div style="position: relative;">
                        ${printContent}
                    </div>
                    <script>
                        window.onload = function() {
                            window.print();
                            window.close();
                        }
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    const clientName = snapshot 
        ? snapshot.client?.name 
        : (project?.owner?.name || project?.user?.name || 'Pemilik Proyek');

    const professionalName = snapshot
        ? snapshot.professional?.name
        : (
            bid?.arsitek?.user?.name || 
            bid?.kontraktor?.user?.name || 
            bid?.notaris?.user?.name || 
            bid?.interior?.user?.name || 
            bid?.pm?.user?.name || 
            bid?.structural?.user?.name || 
            bid?.mep?.user?.name || 
            bid?.bidder?.user?.name || 
            bid?.user?.name || 
            'Professional Specialist'
        );

    const agreedFee = snapshot
        ? snapshot.financials?.agreed_fee
        : (bid?.calculated_total ?? bid?.price ?? 0);

    // Load termins from either DB project.payment_termins or bid's proposed termins
    const termins = useMemo(() => {
        if (snapshot) {
            return (snapshot.financials?.termins || []).map((t: any) => ({
                label: t.label,
                percentage: Number(t.percentage) || 0,
                amount: Number(t.amount) || 0
            }));
        }

        const dbTermins = (project?.payment_termins || []).filter((t: any) => {
            if (roleType === 'engineering') {
                return t.role_type === 'structural' || t.role_type === 'mep';
            }
            return t.role_type === roleType || (t.role_type === 'other' && t.recipient_id === bid?.bidder?.user?.id);
        });

        if (dbTermins.length > 0) {
            return dbTermins.map((t: any) => ({
                label: t.label,
                percentage: Number(t.percentage) || 0,
                amount: Number(t.amount) || 0
            }));
        }

        return (bid?.proposed_termins || []).map((t: any) => ({
            label: t.trigger_description || t.label || 'Payment Phase',
            percentage: Number(t.percentage) || 0,
            amount: Number(t.amount) || Math.round((Number(t.percentage) / 100) * agreedFee)
        }));
    }, [project?.payment_termins, bid?.proposed_termins, roleType, agreedFee, snapshot]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[99999] bg-zinc-950/90 backdrop-blur-xl flex flex-col overflow-hidden animate-in fade-in duration-200">
            {/* Close Button */}
            <button 
                type="button"
                onClick={onClose}
                className="fixed top-5 left-5 p-3.5 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-full transition-all border border-zinc-700/60 shadow-2xl flex items-center justify-center hover:scale-110 z-[100000] backdrop-blur-md animate-in slide-in-from-left duration-300"
                title="Close Contract"
            >
                <X size={20} className="stroke-[2.5]" />
            </button>

            {/* Header Control Toolbar */}
            <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between shrink-0 pl-24 animate-in slide-in-from-top duration-300">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-xl shadow-inner border border-amber-500/20">
                        <FileText size={20} />
                    </div>
                    <div>
                        <h3 className="text-xs font-black text-white uppercase tracking-widest leading-none">Surat Perjanjian Kerja (SPK)</h3>
                        <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mt-1">Official Legal Record</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Zoom Controls */}
                    <div className="flex items-center bg-zinc-800 border border-zinc-700/60 rounded-xl overflow-hidden px-1 py-0.5">
                        <button 
                            type="button"
                            onClick={handleZoomOut}
                            className="p-2 text-zinc-400 hover:text-white transition-colors"
                            title="Zoom Out"
                        >
                            <ZoomOut size={14} />
                        </button>
                        <span className="text-[9px] font-mono font-bold text-zinc-300 min-w-[32px] text-center">{zoom}%</span>
                        <button 
                            type="button"
                            onClick={handleZoomIn}
                            className="p-2 text-zinc-400 hover:text-white transition-colors"
                            title="Zoom In"
                        >
                            <ZoomIn size={14} />
                        </button>
                    </div>

                    {/* Actions */}
                    <button 
                        type="button"
                        onClick={handlePrint}
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-zinc-700/60 transition-all flex items-center gap-2"
                    >
                        <Printer size={12} />
                        <span>Print</span>
                    </button>
                </div>
            </div>

            {/* Main Scroller */}
            <div className="flex-1 overflow-y-auto p-8 flex justify-center bg-zinc-950/20">
                <div 
                    style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', transition: 'transform 0.15s ease-out' }}
                    className="w-full max-w-[800px] shrink-0"
                >
                    <div 
                        id="spk-print-area"
                        className="bg-white rounded-[2.5rem] p-12 sm:p-16 shadow-2xl relative border border-stone-200/80 text-stone-850 font-sans min-h-[1050px]"
                    >
                        {/* Watermark */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] select-none">
                            <ShieldCheck size={260} className="text-stone-900" />
                        </div>

                        <div className="text-center space-y-1.5 relative z-10">
                            <h3 className="font-extrabold text-base tracking-wide text-stone-900 uppercase">SURAT PERJANJIAN KERJA (SPK)</h3>
                            <p className="text-[9px] font-mono text-stone-400 tracking-wider">
                                Nomor: {snapshot?.contract_number || `SPK/${project.id}/${bid.id}`}
                            </p>
                        </div>

                        <p className="text-justify text-stone-600 text-xs mt-8 relative z-10 leading-relaxed">
                            Pada hari ini, <strong>{new Date(snapshot?.signatures?.signed_at || bid.updated_at || project.updated_at).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>, kami yang bertanda tangan di bawah ini sepakat untuk mengikatkan diri dalam Perjanjian Kerja konstruksi / perencanaan:
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 text-stone-600 text-xs mt-8 relative z-10">
                            <div className="space-y-2">
                                <h5 className="font-black text-stone-800 uppercase tracking-wide text-[9px]">Pihak Pertama (Pemilik Proyek)</h5>
                                <div className="pl-4 border-l-2 border-stone-300">
                                    <p className="font-semibold text-stone-900">{clientName}</p>
                                    <p className="text-[10px] text-stone-400 font-medium">Pemilik Proyek</p>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h5 className="font-black text-stone-800 uppercase tracking-wide text-[9px]">Pihak Kedua (Penyedia Jasa)</h5>
                                <div className="pl-4 border-l-2 border-stone-300">
                                    <p className="font-semibold text-stone-900">{professionalName}</p>
                                    <p className="text-[10px] text-stone-400 font-medium uppercase">
                                        {roleType === 'arsitek' ? 'Lead Architect' : 
                                         roleType === 'kontraktor' ? 'Lead Contractor' : 
                                         roleType === 'notaris' ? 'Notary Partner' : 
                                         roleType === 'interior' ? 'Interior Designer' : 
                                         roleType === 'project_manager' ? 'Lead Project Manager' : 'Professional Specialist'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6 text-stone-650 text-xs mt-10 relative z-10 leading-relaxed">
                            <div className="space-y-2">
                                <h5 className="font-extrabold text-stone-850 text-[10px] uppercase tracking-wide">PASAL 1: LINGKUP PEKERJAAN</h5>
                                <p className="text-justify pl-4 border-l border-stone-200">
                                    Pihak Pertama memberikan tugas kepada Pihak Kedua, dan Pihak Kedua menerima tugas tersebut untuk melaksanakan pekerjaan <strong>{snapshot?.project?.title || project.title}</strong> yang berlokasi di <strong>{snapshot?.project?.location || project.lokasi || project.location_address || 'Lokasi Proyek'}</strong> dengan rincian lingkup tugas sesuai kesepakatan dan standar pengerjaan platform 4Ceria.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <h5 className="font-extrabold text-stone-850 text-[10px] uppercase tracking-wide">PASAL 2: NILAI PEKERJAAN & JASA</h5>
                                <p className="text-justify pl-4 border-l border-stone-200">
                                    Total nilai pekerjaan disepakati sebesar <strong>Rp {Number(agreedFee).toLocaleString('id-ID')}</strong>. Jumlah ini sudah termasuk seluruh paket dasar jasa profesional serta dokumen-dokumen hukum pendukung yang telah dipilih dan disepakati di platform.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <h5 className="font-extrabold text-stone-850 text-[10px] uppercase tracking-wide">PASAL 3: SKEMA PEMBAYARAN ESCROW</h5>
                                <p className="text-justify pl-4 border-l border-stone-200">
                                    Pembayaran dilakukan secara termin menggunakan sistem Rekening Bersama (Escrow) 4Ceria. Setiap pencairan dana hanya dilakukan setelah deliverables/scope pada termin bersangkutan diunggah di dalam <strong>Document Vault</strong> dan disetujui oleh Pihak Pertama atau Project Manager yang ditunjuk.
                                </p>
                                <div className="pl-6 space-y-1.5 mt-2 text-[11px] text-stone-500">
                                    {termins.map((t, idx) => (
                                        <p key={idx}>• {t.label}: {t.percentage}% (Rp {Number(t.amount).toLocaleString('id-ID')})</p>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h5 className="font-extrabold text-stone-850 text-[10px] uppercase tracking-wide">PASAL 4: PENYELESAIAN PERSELISIHAN</h5>
                                <p className="text-justify pl-4 border-l border-stone-200">
                                    Apabila terjadi perselisihan or perbedaan pendapat dalam pelaksanaan perjanjian ini, para pihak sepakat untuk menyelesaikan secara musyawarah mufakat, atau menggunakan layanan mediasi yang disediakan oleh platform 4Ceria sebelum menempuh jalur hukum formal.
                                </p>
                            </div>

                            {/* Digital Signature block */}
                            <div className="grid grid-cols-2 gap-8 text-center text-[10px] mt-16 pt-8 border-t border-stone-200 relative z-10 text-stone-600">
                                <div className="space-y-1">
                                    <p className="uppercase font-extrabold text-[9px] text-stone-400 tracking-wider">PIHAK PERTAMA (Pemilik)</p>
                                    <div className="h-16 flex items-center justify-center relative">
                                        {bid.client_signature_url ? (
                                            <img 
                                                src={bid.client_signature_url} 
                                                alt="Client Signature" 
                                                className="max-h-14 max-w-full object-contain mix-blend-multiply transition-all duration-300 transform scale-110"
                                            />
                                        ) : (
                                            <div className="text-rose-500 font-bold uppercase tracking-wider text-[9px]">
                                                Unsigned
                                            </div>
                                        )}
                                    </div>
                                    <p className="font-bold text-stone-900 border-t border-stone-300 pt-1.5 mx-8">{clientName}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="uppercase font-extrabold text-[9px] text-stone-400 tracking-wider">PIHAK KEDUA (Penyedia Jasa)</p>
                                    <div className="h-16 flex items-center justify-center relative">
                                        {bid.pro_signature_url ? (
                                            <img 
                                                src={bid.pro_signature_url} 
                                                alt="Professional Signature" 
                                                className="max-h-14 max-w-full object-contain mix-blend-multiply transition-all duration-300 transform scale-110"
                                            />
                                        ) : (
                                            <div className="text-rose-500 font-bold uppercase tracking-wider text-[9px]">
                                                Unsigned
                                            </div>
                                        )}
                                    </div>
                                    <p className="font-bold text-stone-900 border-t border-stone-300 pt-1.5 mx-8">{professionalName}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
