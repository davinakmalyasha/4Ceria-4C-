import React from 'react';
import { Shield, CheckCircle2 } from 'lucide-react';

interface Props {
    project: {
        legal_detail?: string;
        wants_to_discuss_later?: boolean;
    };
}

export const NotarisLegalBrief: React.FC<Props> = ({ project }) => (
    <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/10 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-600/5 rounded-full blur-3xl -ml-24 -mb-24" />
        
        <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/10">
                    <Shield size={20} className="text-red-400" />
                </div>
                <div>
                    <h4 className="text-xs font-black uppercase tracking-[0.2em] text-white/50">Owner's Legal Brief</h4>
                    <p className="text-sm font-bold text-white mt-0.5">Konteks Legalitas dari Pemilik Proyek</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-white/30">Status Dokumen</label>
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <p className="text-[13px] font-black uppercase tracking-tight">
                            {project.legal_detail || project.wants_to_discuss_later ? 'Dokumen Parsial / Belum Lengkap' : 'Belum Ada Dokumen'}
                        </p>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-white/30">Catatan Khusus Pemilik</label>
                    {project.wants_to_discuss_later ? (
                        <div className="flex items-start gap-2 text-red-300">
                            <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
                            <p className="text-[12px] font-bold leading-relaxed italic">
                                "Pemilih memilih untuk mendiskusikan detail dokumen secara langsung nanti."
                            </p>
                        </div>
                    ) : (
                        <p className="text-[14px] font-black text-white italic">
                            "{project.legal_detail || 'Tidak ada catatan tambahan.'}"
                        </p>
                    )}
                </div>
            </div>
        </div>
    </div>
);
