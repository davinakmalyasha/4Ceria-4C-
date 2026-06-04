import React from 'react';
import { motion } from 'framer-motion';
import { X, CheckCircle2, Activity, FileText } from 'lucide-react';
import PMReportFormFields from './PMReportFormFields';
import PMReportFileUploader from './PMReportFileUploader';
import { ProjectReport } from './PMReportCard';

interface PMReportFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    editingReport: ProjectReport | null;
    isSubmitting: boolean;
    onSubmit: (e: React.FormEvent) => void;
    summary: string;
    setSummary: (val: string) => void;
    health: string;
    setHealth: (val: string) => void;
    phaseSlug: string;
    setPhaseSlug: (val: string) => void;
    progress: number;
    setProgress: (val: number) => void;
    photos: File[];
    setPhotos: React.Dispatch<React.SetStateAction<File[]>>;
    attachments: File[];
    setAttachments: React.Dispatch<React.SetStateAction<File[]>>;
    existingPhotos: string[];
    setExistingPhotos: (val: string[]) => void;
    timelinePhases: string[];
    unlinkedReports?: ProjectReport[];
    onLinkReport?: (id: number) => void;
}

export default function PMReportFormModal({
    isOpen, onClose, editingReport, isSubmitting, onSubmit,
    summary, setSummary, health, setHealth,
    phaseSlug, setPhaseSlug, progress, setProgress,
    photos, setPhotos, attachments, setAttachments,
    existingPhotos, setExistingPhotos, timelinePhases,
    unlinkedReports = [], onLinkReport
}: PMReportFormModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="relative w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
                    <div>
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">{editingReport ? 'Edit Executive Report' : 'New Executive Report'}</h3>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Building Stakeholder Confidence</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-50 rounded-xl transition-all"><X size={16} className="text-slate-400" /></button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {!editingReport && unlinkedReports.length > 0 && (
                        <div className="space-y-2 border-b border-slate-100 pb-4 shrink-0">
                            <label className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Link Existing Unlinked Reports</label>
                            <div className="grid gap-2 max-h-[160px] overflow-y-auto pr-1">
                                {unlinkedReports.map(r => (
                                    <div key={r.id} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between gap-3 text-[10px]">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <FileText size={14} className="text-indigo-500 shrink-0" />
                                            <span className="font-medium text-slate-700 truncate">{r.summary}</span>
                                        </div>
                                        <button type="button" onClick={() => onLinkReport?.(r.id)} className="px-2.5 py-1 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors uppercase shrink-0">Link</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <form onSubmit={onSubmit} className="space-y-6">
                        <PMReportFormFields summary={summary} setSummary={setSummary} health={health} setHealth={setHealth} phaseSlug={phaseSlug} setPhaseSlug={setPhaseSlug} progress={progress} setProgress={setProgress} timelinePhases={timelinePhases} />
                        <PMReportFileUploader photos={photos} setPhotos={setPhotos} attachments={attachments} setAttachments={setAttachments} existingPhotos={existingPhotos} setExistingPhotos={setExistingPhotos} />

                        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-50 shrink-0">
                            <button type="button" onClick={onClose} className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors">Discard</button>
                            <button type="submit" disabled={isSubmitting} className="px-5 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-black transition-all flex items-center gap-1.5 shadow-md shadow-slate-100 disabled:opacity-55">
                                {isSubmitting ? <Activity className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                                {editingReport ? 'Update Report' : 'Publish Report'}
                            </button>
                        </div>
                    </form>
                </div>
            </motion.div>
        </div>
    );
}

