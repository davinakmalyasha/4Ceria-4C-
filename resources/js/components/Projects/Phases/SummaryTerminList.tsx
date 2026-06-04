import React from 'react';
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react';

interface SummaryTerminListProps {
    termins: any[];
}

export default function SummaryTerminList({ termins }: SummaryTerminListProps) {
    if (!termins || termins.length === 0) return null;

    return (
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Milestones & Payments</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase">{termins.length} Total</span>
            </div>

            <div className="divide-y divide-slate-100">
                {termins.map((termin, index) => {
                    const price = Number(termin.amount || 0);
                    const isPaid = termin.status === 'paid';
                    const isVerifying = termin.status === 'verifying';

                    return (
                        <div key={termin.id || index} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="text-xs font-black text-slate-900 leading-tight">
                                    {termin.label}
                                    <span className="ml-2 px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[8px] font-bold rounded-md">
                                        {termin.percentage}%
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 shrink-0">
                                <span className="text-xs font-bold text-slate-800">
                                    Rp {price.toLocaleString('id-ID')}
                                </span>

                                {isPaid ? (
                                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[8px] font-black rounded-md uppercase tracking-wider flex items-center gap-1.5 border border-emerald-100">
                                        <CheckCircle2 size={10} /> Paid
                                    </span>
                                ) : isVerifying ? (
                                    <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-[8px] font-black rounded-md uppercase tracking-wider flex items-center gap-1.5 border border-blue-100 animate-pulse">
                                        <Clock size={10} /> Verifying
                                    </span>
                                ) : (
                                    <span className="px-2.5 py-1 bg-slate-50 text-slate-500 text-[8px] font-black rounded-md uppercase tracking-wider flex items-center gap-1.5 border border-slate-100">
                                        <AlertCircle size={10} /> Unpaid
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
