import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Shield, CheckSquare, FileText, AlertTriangle } from 'lucide-react';

interface ContractProps {
    projectTitle: string;
    bidderName: string;
    bidPrice: number;
    bidType: 'arsitek' | 'kontraktor';
    formatCurrency: (val: number) => string;
    onAccept: () => void;
    onCancel: () => void;
}

export default function ContractReviewModal({ projectTitle, bidderName, bidPrice, bidType, formatCurrency, onAccept, onCancel }: ContractProps) {
    const [agreed, setAgreed] = useState({ terms: false, payment: false, milestone: false });
    const allAgreed = agreed.terms && agreed.payment && agreed.milestone;
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleAccept = () => {
        if (!allAgreed) return;
        setIsSubmitting(true);
        setTimeout(() => { onAccept(); }, 1200);
    };

    const roleName = bidType === 'arsitek' ? 'Arsitek' : 'Kontraktor';

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onCancel}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6 relative overflow-hidden">
                    <div className="absolute -right-6 -top-6 w-32 h-32 bg-amber-500 rounded-full blur-[60px] opacity-20" />
                    <div className="absolute -left-6 -bottom-6 w-24 h-24 bg-[#FF2D20] rounded-full blur-[50px] opacity-20" />
                    <button onClick={onCancel} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors">
                        <X size={16} />
                    </button>
                    <div className="flex items-center gap-3 relative z-10">
                        <div className="w-12 h-12 bg-amber-500/20 border border-amber-500/30 rounded-xl flex items-center justify-center">
                            <Shield size={24} className="text-amber-400" />
                        </div>
                        <div className="text-white">
                            <h3 className="font-extrabold text-xl">Kontrak Digital</h3>
                            <p className="text-gray-400 text-sm">Tinjau dan setujui untuk melanjutkan</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 md:p-8 overflow-y-auto space-y-6">
                    {/* Summary */}
                    <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 space-y-3">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500 font-medium">Proyek</span>
                            <span className="font-bold text-gray-900">{projectTitle}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500 font-medium">{roleName}</span>
                            <span className="font-bold text-gray-900">{bidderName}</span>
                        </div>
                        <div className="flex justify-between text-sm border-t border-gray-200 pt-3">
                            <span className="text-gray-500 font-medium">Nilai Kontrak</span>
                            <span className="font-black text-lg text-[#FF2D20]">{formatCurrency(bidPrice)}</span>
                        </div>
                    </div>

                    {/* Verification Status */}
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                        <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-bold text-amber-900">Menunggu Verifikasi Admin</p>
                            <p className="text-xs text-amber-700 mt-1">Kontrak ini akan dikirimkan ke Admin 4C untuk diverifikasi. Proyek akan berstatus <strong>"Menunggu Verifikasi"</strong> hingga Admin menyetujui kontrak.</p>
                        </div>
                    </div>

                    {/* Checkboxes */}
                    <div className="space-y-3">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Syarat & Ketentuan</p>

                        {[
                            { key: 'terms' as const, label: 'Saya telah membaca dan menyetujui syarat penggunaan platform 4Ceria sebagai perantara proyek.' },
                            { key: 'payment' as const, label: 'Saya memahami bahwa pembayaran dilakukan secara offline melalui Admin 4C dan bukan melalui platform ini.' },
                            { key: 'milestone' as const, label: 'Saya setuju untuk mengikuti timeline milestone yang telah disepakati bersama profesional terpilih.' },
                        ].map(item => (
                            <label key={item.key} className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${agreed[item.key] ? 'border-green-400 bg-green-50/50' : 'border-gray-100 hover:border-gray-200 bg-white'}`}>
                                <input type="checkbox" checked={agreed[item.key]} onChange={() => setAgreed(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                                    className="mt-0.5 w-5 h-5 rounded-md border-gray-300 text-green-600 focus:ring-green-500 accent-green-600 shrink-0" />
                                <span className="text-sm text-gray-700 leading-snug">{item.label}</span>
                            </label>
                        ))}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-2">
                        <button onClick={onCancel} className="flex-1 py-3.5 px-4 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition-colors border border-gray-200">
                            Batal
                        </button>
                        <button onClick={handleAccept} disabled={!allAgreed || isSubmitting}
                            className="flex-1 py-3.5 px-4 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 transition-all shadow-lg shadow-green-500/20 flex items-center justify-center gap-2">
                            {isSubmitting ? <span className="animate-pulse">Memproses...</span> : <><CheckSquare size={18} /> Setuju & Terima Bid</>}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
