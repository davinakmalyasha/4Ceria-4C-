import React from 'react';
import { Clock, User, ChevronRight, AlertCircle } from 'lucide-react';

interface NegotiationLog {
    user_name: string;
    round_number: number;
    note: string;
    changes: any[];
    created_at: string;
}

interface Props {
    logs: NegotiationLog[];
}

export const NegotiationHistory: React.FC<Props> = ({ logs }) => {
    if (!logs || logs.length === 0) return null;

    return (
        <div className="space-y-6 mt-8">
            <div className="flex items-center gap-3 px-1">
                <div className="p-2 bg-slate-900 rounded-xl">
                    <Clock size={14} className="text-white" />
                </div>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Negotiation History</h4>
            </div>

            <div className="space-y-4 relative before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-[1px] before:bg-gray-100">
                {logs.map((log, idx) => (idx === 0 || log.round_number !== logs[idx-1]?.round_number) && (
                    <div key={`${log.round_number}-${idx}`} className="relative pl-12 group">
                        {/* Timeline Dot */}
                        <div className="absolute left-0 top-1 w-10 h-10 flex items-center justify-center">
                            <div className="w-2.5 h-2.5 rounded-full bg-white border-2 border-slate-900 z-10 group-hover:scale-125 transition-transform" />
                        </div>

                        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all">
                            <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
                                <div className="space-y-1">
                                    <span className="inline-block px-3 py-1 bg-slate-900 text-[8px] font-black text-white uppercase tracking-tighter rounded-full mb-2">
                                        Round {log.round_number}/5
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center">
                                            <User size={12} className="text-gray-400" />
                                        </div>
                                        <span className="text-xs font-black text-slate-900">{log.user_name}</span>
                                        <span className="text-[10px] text-gray-400 font-medium">
                                            • {new Date(log.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {log.note && (
                                <div className="bg-gray-50/50 border border-gray-100 rounded-2xl p-4 mb-4 italic text-sm text-slate-600 leading-relaxed">
                                    "{log.note}"
                                </div>
                            )}

                            {log.changes && log.changes.length > 0 && (
                                <div className="space-y-2 pt-2 border-t border-gray-50">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Changes in this round:</p>
                                    <div className="grid gap-2">
                                        {log.changes.map((change: any, cIdx: number) => (
                                            <div key={cIdx} className="flex items-center gap-2 text-xs text-slate-700">
                                                <ChevronRight size={10} className="text-slate-300" />
                                                <span>{change.message}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            {!log.changes || log.changes.length === 0 && (
                                <div className="flex items-center gap-2 text-[10px] text-slate-400 italic">
                                    <AlertCircle size={10} />
                                    Initial proposal submission
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
