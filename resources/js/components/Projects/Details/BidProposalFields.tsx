import React from 'react';
import { FileText, Upload, X, CheckCircle2 } from 'lucide-react';

interface Props {
    proposal: string;
    setProposal: (v: string) => void;
    attachments: File[];
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onRemoveAttachment: (i: number) => void;
    isLoading: boolean;
    buttonText?: string;
}

export const BidProposalFields: React.FC<Props> = ({ 
    proposal, setProposal, attachments, onFileChange, onRemoveAttachment, isLoading,
    buttonText = "Submit Official Proposal"
}) => (
    <>
        {/* Proposal Text & Files */}
        <div className="space-y-10">
            <div className="space-y-4">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-lg shadow-slate-900/20">
                        <FileText size={16} />
                    </div>
                    <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest">Executive Summary</h4>
                </div>
                <textarea 
                    required value={proposal} onChange={(e) => setProposal(e.target.value)} rows={6}
                    placeholder="Detail your professional approach, unique methodology, and why you are the best fit for this project..."
                    className="w-full px-8 py-6 bg-zinc-50 border-2 border-zinc-100 focus:border-slate-900 rounded-[2rem] font-medium text-[13.5px] text-gray-600 focus:bg-white outline-none transition-all resize-none shadow-inner"
                />
            </div>

            <div className="space-y-4">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <Upload size={14} className="text-zinc-400" /> Supporting Attachments (Max 3)
                </label>
                <div className="flex flex-wrap gap-4">
                    {attachments.map((file, i) => (
                        <div key={i} className="flex items-center gap-3 pl-5 pr-3 py-3 bg-white rounded-2xl border border-zinc-200 shadow-sm group">
                            <FileText size={14} className="text-slate-400" />
                            <span className="text-[10px] font-black text-zinc-900 truncate max-w-[150px]">{file.name}</span>
                            <button type="button" onClick={() => onRemoveAttachment(i)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-red-500 transition-colors">
                                <X size={16} />
                            </button>
                        </div>
                    ))}
                    {attachments.length < 3 && (
                        <label className="flex flex-col items-center justify-center w-32 h-32 bg-white border-2 border-dashed border-zinc-200 rounded-[2rem] cursor-pointer hover:border-slate-900 hover:bg-zinc-50 transition-all text-zinc-400 hover:text-slate-900 group">
                            <Upload size={24} className="mb-2 group-hover:-translate-y-1 transition-transform" />
                            <span className="text-[8px] font-black uppercase tracking-widest">Add File</span>
                            <input type="file" className="hidden" onChange={onFileChange} accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx" />
                        </label>
                    )}
                </div>
            </div>
        </div>

        <div className="pt-10 border-t border-zinc-100">
            <button 
                type="submit" disabled={isLoading}
                className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-[13px] uppercase tracking-[0.4em] shadow-[0_20px_50px_rgba(15,23,42,0.3)] hover:-translate-y-1.5 active:scale-95 transition-all disabled:opacity-50 disabled:translate-y-0 flex items-center justify-center gap-4"
            >
                {isLoading ? (
                    <div className="flex items-center gap-3">
                        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        Transmitting Proposal...
                    </div>
                ) : (
                    <>
                        <CheckCircle2 size={20} className="text-white/80" />
                        {buttonText}
                    </>
                )}
            </button>
            <p className="text-center text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mt-6 max-w-md mx-auto leading-relaxed">
                By submitting, you formally enter the 4Ceria professional network tender protocol.
            </p>
        </div>
    </>
);
