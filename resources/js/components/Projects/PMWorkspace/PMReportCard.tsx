import React from 'react';
import { Calendar, Layout, Activity, Edit, Trash2, FileText } from 'lucide-react';

export interface ProjectReport {
    id: number;
    project_id: number;
    creator_id: number;
    phase_slug: string | null;
    summary: string;
    progress_percentage: number;
    budget_health: string;
    site_photos: string[] | null;
    attachments: Array<{
        name: string;
        path: string;
        size: number;
    }> | null;
    published_at: string;
    created_at: string;
    creator?: {
        id: number;
        name: string;
    };
}

interface PMReportCardProps {
    report: ProjectReport;
    isPM: boolean;
    onEdit: (report: ProjectReport) => void;
    onDelete: (id: number) => void;
}

export default function PMReportCard({ report, isPM, onEdit, onDelete }: PMReportCardProps) {
    const isImage = (url: string) => /\.(jpg|jpeg|png|webp|gif)$/i.test(url);
    const photos = report.site_photos || [];
    const images = photos.filter(isImage);
    const legacyFiles = photos.filter(url => !isImage(url));
    const docs = report.attachments || [];

    return (
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden p-6 hover:border-slate-200 transition-all">
            <div className="flex items-start justify-between mb-4 gap-2">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-700 shrink-0">
                        <Calendar size={18} />
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                Week of {new Date(report.published_at).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                            </span>
                            {report.phase_slug && (
                                <span className="px-1.5 py-0.5 bg-slate-900 text-white text-[8px] font-black uppercase tracking-tighter rounded flex items-center gap-1">
                                    <Layout size={8} /> {report.phase_slug.replace('_', ' ')}
                                </span>
                            )}
                        </div>
                        <h4 className="text-xs font-black text-slate-900">
                            {new Date(report.published_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })} Update
                        </h4>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                        report.budget_health === 'on_track' ? 'bg-emerald-50 text-emerald-600' :
                        report.budget_health === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                    }`}>
                        <Activity size={10} /> {report.budget_health.replace('_', ' ')}
                    </span>
                    {isPM && (
                        <div className="flex items-center">
                            <button onClick={() => onEdit(report)} className="p-1.5 text-slate-300 hover:text-indigo-600 transition-colors">
                                <Edit size={14} />
                            </button>
                            <button onClick={() => onDelete(report.id)} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <p className="text-xs text-slate-600 font-medium leading-relaxed mb-4 whitespace-pre-wrap">{report.summary}</p>

            {images.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                    {images.map((url, idx) => (
                        <a key={idx} href={`/storage/${url}`} target="_blank" rel="noopener noreferrer" className="aspect-square bg-slate-50 rounded-xl overflow-hidden border border-slate-100 group relative">
                            <img src={`/storage/${url}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="Site" />
                        </a>
                    ))}
                </div>
            )}

            {(docs.length > 0 || legacyFiles.length > 0) && (
                <div className="space-y-1.5 mb-4">
                    {docs.map((file, idx) => (
                        <a key={`new-${idx}`} href={`/storage/${file.path}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-slate-50 hover:bg-amber-50 border border-slate-100 rounded-xl transition-all text-[9px] font-black text-slate-900 group">
                            <FileText size={14} className="text-amber-500 shrink-0" />
                            <span className="truncate flex-1">{file.name}</span>
                        </a>
                    ))}
                    {legacyFiles.map((url, idx) => (
                        <a key={`legacy-${idx}`} href={`/storage/${url}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-slate-50 hover:bg-amber-50 border border-slate-100 rounded-xl transition-all text-[9px] font-black text-slate-900 group">
                            <FileText size={14} className="text-amber-500 shrink-0" />
                            <span className="truncate flex-1">{url.split('/').pop()}</span>
                        </a>
                    ))}
                </div>
            )}

            <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-slate-900 bg-slate-50 px-1.5 py-0.5 rounded">{report.progress_percentage}%</span>
                    <div className="w-20 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-slate-900 rounded-full" style={{ width: `${report.progress_percentage}%` }} />
                    </div>
                </div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">PM: {report.creator?.name || 'Manager'}</span>
            </div>
        </div>
    );
}
