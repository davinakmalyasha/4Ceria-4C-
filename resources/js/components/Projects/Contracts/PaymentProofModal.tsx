import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
    X, Check, Loader2, Upload, 
    CreditCard, Eye, AlertCircle, 
    FileText, Image as ImageIcon, ExternalLink,
    Shield, Lock, UserCheck, ShieldCheck
} from 'lucide-react';
import axios from 'axios';
import { useToast } from '../../../context/ToastContext';
import FilePreviewModal from '../../Common/FilePreviewModal';

interface PaymentProofModalProps {
    isOpen: boolean;
    onClose: () => void;
    project: any;
    termin: any;
    isProfessional?: boolean; // If true, show verification UI
    onSuccess: () => void;
}

export const PaymentProofModal: React.FC<PaymentProofModalProps> = ({ isOpen, onClose, project, termin, isProfessional, onSuccess }) => {
    const { showToast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(
        termin.payment_proof_path 
            ? (termin.payment_proof_path.startsWith('http') ? termin.payment_proof_path : `/storage/${termin.payment_proof_path}`) 
            : null
    );
    const [notes, setNotes] = useState('');
    const [previewFile, setPreviewFile] = useState<{ path: string; name: string } | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);
            setPreview(URL.createObjectURL(selectedFile));
        }
    };

    const handleUpload = async () => {
        if (!file) return;

        setIsSubmitting(true);
        const formData = new FormData();
        formData.append('proof', file);

        try {
            await axios.post(`/projects/${project.id}/payments/${termin.type}/${termin.id}/upload-proof`, formData);
            showToast('Payment proof uploaded successfully!', 'success');
            onSuccess();
            onClose();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to upload proof', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleVerify = async (action: 'accept' | 'reject') => {
        setIsSubmitting(true);
        try {
            await axios.post(`/projects/${project.id}/payments/${termin.type}/${termin.id}/verify-proof`, {
                action,
                notes
            });
            showToast(action === 'accept' ? 'Payment verified!' : 'Payment proof rejected.', 'success');
            onSuccess();
            onClose();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to verify payment', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl">
                            <ShieldCheck size={20} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                                {isProfessional ? 'Verify Payment' : 'Secure Payment Proof'}
                                <span className="bg-emerald-500/20 text-emerald-400 text-[8px] px-1.5 py-0.5 rounded border border-emerald-500/30">ENCRYPTED</span>
                            </h3>
                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                                {termin.label} &bull; Verified Transaction
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Verified Amount Card */}
                    <div className="bg-gradient-to-br from-zinc-800 to-zinc-900 rounded-2xl p-5 border border-zinc-700 shadow-inner">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <div className="flex items-center gap-2 text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-1">
                                    <Lock size={10} /> Verified Contract Amount
                                </div>
                                <p className="text-2xl font-black text-white tracking-tight">Rp {Number(termin.amount).toLocaleString()}</p>
                            </div>
                            <div className="flex flex-col items-end">
                                <div className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                                    {termin.percentage}% of Total Contract
                                </div>
                            </div>
                        </div>

                        {termin.proposal && (
                            <div className="pt-4 border-t border-zinc-700/50">
                                <div className="flex items-center gap-2 text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-2">
                                    <FileText size={10} /> Payment Breakdown & Services
                                </div>
                                <div className="text-[10px] text-zinc-400 font-medium leading-relaxed bg-zinc-950/50 p-3 rounded-xl border border-zinc-700/30 whitespace-pre-wrap italic">
                                    {termin.proposal}
                                </div>
                            </div>
                        )}
                    </div>

                    {!isProfessional && (
                        <div className="flex items-center gap-3 px-4 py-3 bg-slate-500/5 border border-slate-500/10 rounded-xl">
                            <UserCheck size={16} className="text-slate-400" />
                            <p className="text-[10px] text-slate-200/70 font-medium leading-tight">
                                This payment will be sent to <span className="text-slate-400 font-bold uppercase tracking-wide">{termin.proName || 'Professional'}</span>. 
                                Our system tracks all transactions for your safety.
                            </p>
                        </div>
                    )}

                    {!isProfessional ? (
                        /* Owner: Upload View */
                        <div className="space-y-4">
                            <div 
                                className={`relative border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center gap-3 transition-all ${preview ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-700 hover:border-zinc-500 bg-zinc-800/30'}`}
                            >
                                {preview ? (
                                    <div className="relative group flex flex-col items-center">
                                        <div className="relative">
                                            {preview.toLowerCase().endsWith('.pdf') ? (
                                                <div className="flex flex-col items-center justify-center p-4 bg-zinc-800 rounded-xl border border-zinc-700 h-32 w-48 shadow-lg">
                                                    <FileText size={40} className="text-emerald-500 mb-2" />
                                                    <span className="text-[10px] text-zinc-300 font-bold uppercase tracking-wider">PDF Document</span>
                                                </div>
                                            ) : (
                                                <img 
                                                    src={preview} 
                                                    alt="Proof preview" 
                                                    className="max-h-48 rounded-xl shadow-lg cursor-pointer hover:opacity-90 transition-opacity" 
                                                    onClick={() => document.getElementById('payment-proof-file-input')?.click()}
                                                />
                                            )}
                                            <button 
                                                type="button"
                                                onClick={(e) => { 
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setFile(null); 
                                                    setPreview(null); 
                                                }}
                                                className="absolute -top-3 -right-3 p-2 bg-rose-600 hover:bg-rose-500 text-white rounded-full shadow-xl hover:scale-110 transition-all z-30 flex items-center justify-center border-2 border-zinc-900"
                                                title="Remove Photo"
                                            >
                                                <X size={12} className="stroke-[3]" />
                                            </button>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => document.getElementById('payment-proof-file-input')?.click()}
                                            className="mt-3 px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all shadow-md"
                                        >
                                            Change Photo
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="p-4 bg-zinc-900 rounded-2xl text-zinc-500">
                                            <Upload size={32} />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-xs font-bold text-white mb-1">Click to upload proof</p>
                                            <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">PNG, JPG or PDF up to 2MB</p>
                                        </div>
                                    </>
                                )}
                                <input 
                                    id="payment-proof-file-input"
                                    type="file" 
                                    accept="image/*,application/pdf"
                                    onChange={handleFileChange}
                                    className={preview ? "hidden" : "absolute inset-0 opacity-0 cursor-pointer"}
                                />
                            </div>

                            <button 
                                onClick={handleUpload}
                                disabled={!file || isSubmitting}
                                className="w-full py-4 bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-500 disabled:opacity-50 flex items-center justify-center gap-2 transition-all shadow-xl shadow-emerald-900/20"
                            >
                                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={18} />}
                                Submit Payment Proof
                            </button>
                        </div>
                    ) : (
                        /* Professional: Verification View */
                        <div className="space-y-4">
                            {termin.payment_proof_path ? (
                                <div className="space-y-4">
                                    <div className="relative rounded-2xl overflow-hidden border border-zinc-700 bg-zinc-950">
                                        {termin.payment_proof_path?.toLowerCase().endsWith('.pdf') ? (
                                            <iframe 
                                                src={termin.payment_proof_path?.startsWith('http') ? termin.payment_proof_path : `/storage/${termin.payment_proof_path}`}
                                                className="w-full h-64 border-none"
                                                title="Payment Proof PDF"
                                            />
                                        ) : (
                                            <img 
                                                src={termin.payment_proof_path?.startsWith('http') ? termin.payment_proof_path : `/storage/${termin.payment_proof_path}`} 
                                                alt="Payment Proof" 
                                                className="w-full h-auto max-h-64 object-contain"
                                            />
                                        )}
                                        <button 
                                            type="button"
                                            onClick={() => setPreviewFile({
                                                path: termin.payment_proof_path,
                                                name: `${termin.label} Proof`
                                            })}
                                            className="absolute top-3 right-3 p-2 bg-black/60 backdrop-blur-md text-white rounded-lg hover:bg-black/80 transition-all shadow-lg flex items-center gap-2 text-[10px] font-black uppercase tracking-widest cursor-pointer border-none"
                                        >
                                            <Eye size={14} /> Open Full
                                        </button>
                                    </div>

                                    <div>
                                        <label className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Verification Notes</label>
                                        <textarea 
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            placeholder="Optional notes for the owner..."
                                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-xs font-bold text-white focus:ring-1 focus:ring-slate-500 outline-none transition-all resize-none h-24"
                                        />
                                    </div>

                                    <div className="flex gap-3">
                                        <button 
                                            onClick={() => handleVerify('reject')}
                                            disabled={isSubmitting}
                                            className="flex-1 py-4 bg-zinc-800 text-zinc-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10 hover:text-red-500 transition-all border border-zinc-700"
                                        >
                                            Reject Proof
                                        </button>
                                        <button 
                                            onClick={() => handleVerify('accept')}
                                            disabled={isSubmitting}
                                            className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 transition-all"
                                        >
                                            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                            Accept & Verify
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-8 text-center bg-zinc-800/30 rounded-3xl border border-zinc-700/30">
                                    <AlertCircle size={32} className="text-zinc-600 mx-auto mb-3" />
                                    <p className="text-xs font-bold text-zinc-500">No payment proof uploaded yet.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
            <FilePreviewModal
                isOpen={!!previewFile}
                onClose={() => setPreviewFile(null)}
                filePath={previewFile?.path || null}
                fileName={previewFile?.name || ''}
            />
        </div>,
        document.body
    );
};
