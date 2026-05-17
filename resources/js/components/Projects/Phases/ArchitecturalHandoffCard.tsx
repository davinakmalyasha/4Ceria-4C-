import React from 'react';
import { Download, FileText, Clock } from 'lucide-react';

interface ArchitecturalHandoffCardProps {
    handoffDocs: any[];
}

export default function ArchitecturalHandoffCard({ handoffDocs }: ArchitecturalHandoffCardProps) {
    return (
        <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-slate-50 text-slate-900 rounded-2xl flex items-center justify-center border border-slate-100">
                    <Download size={18} />
                </div>
                <div>
                    <h4 className="text-sm font-black text-slate-950 uppercase tracking-tight">Architectural Handoff</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Base Designs from Architect</p>
                </div>
            </div>
            
            <div className="space-y-3">
                {handoffDocs.length > 0 ? (
                    handoffDocs.map((doc: any) => (
                        <a 
                            key={doc.id}
                            href={doc.file_path}
                            target="_blank"
                            rel="noreferrer"
                            className="flex justify-between items-center px-5 py-4 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-all border border-slate-100 group"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <FileText size={18} className="text-slate-400 group-hover:text-slate-950 transition-colors shrink-0" />
                                <span className="text-xs font-bold text-slate-700 truncate">{doc.file_name}</span>
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-[#FF2D20] opacity-0 group-hover:opacity-100 transition-opacity">Download</span>
                        </a>
                    ))
                ) : (
                    <div className="p-8 bg-slate-50 text-slate-400 rounded-2xl border border-dashed border-slate-200 text-xs text-center font-bold flex flex-col items-center justify-center gap-2">
                        <Clock size={20} className="text-slate-300" />
                        <span>No architectural base designs uploaded yet.</span>
                    </div>
                )}
            </div>
        </div>
    );
}
