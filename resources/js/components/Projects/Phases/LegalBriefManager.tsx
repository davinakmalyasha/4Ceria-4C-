import React from 'react';
import { motion } from 'framer-motion';
import { 
    Lock, ShieldCheck, Clock, Coins, 
    FileText, CheckCircle2, AlertCircle, Stamp
} from 'lucide-react';

interface LegalBriefManagerProps {
    project: any;
    onRefresh: () => void;
}

export default function LegalBriefManager({ project, onRefresh }: LegalBriefManagerProps) {
    const bid = project.accepted_notaris_bid;

    if (!bid) {
        return (
            <div className="bg-amber-50 border border-amber-100 rounded-3xl p-8 text-center">
                <AlertCircle className="mx-auto text-amber-500 mb-4" size={32} />
                <h3 className="text-amber-900 font-black uppercase tracking-widest text-sm mb-1">Brief Not Available</h3>
                <p className="text-amber-700 text-xs">The accepted proposal details could not be retrieved.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="bg-zinc-900 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-zinc-800 rounded-full blur-[100px] opacity-20 -translate-y-1/2 translate-x-1/2" />
                
                <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-zinc-800 rounded-2xl flex items-center justify-center text-emerald-400 shadow-inner">
                            <Stamp size={28} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-white tracking-tight">Legal Service Contract</h3>
                            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mt-1 flex items-center gap-2">
                                <Lock size={10} /> Binding Agreement — Legalitas Phase
                            </p>
                        </div>
                    </div>
                    <div className="px-5 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl w-fit">
                        <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                            <ShieldCheck size={14} /> Executing
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-5 bg-zinc-800/50 rounded-2xl border border-zinc-700/50">
                        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Professional Fee</p>
                        <p className="text-lg font-black text-white">Rp {Number(bid.price).toLocaleString('id-ID')}</p>
                    </div>
                    <div className="p-5 bg-zinc-800/50 rounded-2xl border border-zinc-700/50">
                        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Estimated Tax/PNBP</p>
                        <p className="text-lg font-black text-white">Rp {Number(bid.tax_estimate).toLocaleString('id-ID')}</p>
                    </div>
                    <div className="p-5 bg-zinc-800/50 rounded-2xl border border-zinc-700/50">
                        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Timeline</p>
                        <p className="text-lg font-black text-white">{bid.estimated_duration} {bid.duration_unit}(s)</p>
                    </div>
                </div>

                <div className="mt-8 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <FileText size={14} className="text-emerald-400" />
                        <h4 className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">Selected Services</h4>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {bid.selected_services?.map((service: string) => (
                            <span key={service} className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-[10px] font-black text-zinc-300 uppercase flex items-center gap-2">
                                <CheckCircle2 size={12} className="text-emerald-400" />
                                {service.replace(/_/g, ' ')}
                            </span>
                        ))}
                    </div>
                </div>

                {bid.proposal && (
                    <div className="mt-8 pt-8 border-t border-zinc-800/50">
                        <div className="flex items-center gap-2 mb-3">
                            <Clock size={14} className="text-zinc-500" />
                            <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Initial Proposal Notes</h4>
                        </div>
                        <p className="text-sm text-zinc-400 font-medium italic leading-relaxed">
                            "{bid.proposal}"
                        </p>
                    </div>
                )}
            </div>
            
            <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl flex items-start gap-4">
                <div className="p-3 bg-white rounded-2xl text-slate-400 shadow-sm">
                    <AlertCircle size={20} />
                </div>
                <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Contractual Integrity</h4>
                    <p className="text-xs text-slate-500 leading-relaxed mt-1">
                        These services were locked upon bid acceptance. If additionals are required, the Notary must request a fee addendum through the project manager.
                    </p>
                </div>
            </div>
        </div>
    );
}
