import React from 'react';
import { Image as ImageIcon, Plus, X, FileText, Trash2, Upload } from 'lucide-react';

interface PMReportFileUploaderProps {
    photos: File[];
    setPhotos: React.Dispatch<React.SetStateAction<File[]>>;
    attachments: File[];
    setAttachments: React.Dispatch<React.SetStateAction<File[]>>;
    existingPhotos: string[];
    setExistingPhotos: (val: string[]) => void;
}

export default function PMReportFileUploader({
    photos, setPhotos, attachments, setAttachments,
    existingPhotos, setExistingPhotos
}: PMReportFileUploaderProps) {
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                    <ImageIcon size={12} /> Site Evidence (Photos)
                </label>
                <div className="flex flex-wrap gap-2">
                    {existingPhotos.map((path, idx) => (
                        <div key={`exist-${idx}`} className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-100 group shrink-0">
                            <img src={`/storage/${path}`} className="w-full h-full object-cover" alt="Stored" />
                            <button type="button" onClick={() => setExistingPhotos(existingPhotos.filter((_, i) => i !== idx))} className="absolute inset-0 bg-red-500/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                                <Trash2 size={12} className="text-white" />
                            </button>
                        </div>
                    ))}
                    {photos.map((file, idx) => (
                        <div key={`new-${idx}`} className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-100 group shrink-0">
                            <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" alt="New" />
                            <button type="button" onClick={() => setPhotos(prev => prev.filter((_, i) => i !== idx))} className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                                <X size={12} className="text-white" />
                            </button>
                        </div>
                    ))}
                    <label className="w-16 h-16 rounded-xl border border-dashed border-slate-200 hover:border-slate-800 transition-colors flex flex-col items-center justify-center cursor-pointer shrink-0">
                        <Plus size={16} className="text-slate-300" />
                        <span className="text-[8px] font-black text-slate-300 uppercase mt-0.5">Photo</span>
                        <input type="file" multiple accept="image/*" className="hidden" onChange={e => e.target.files && setPhotos(prev => [...prev, ...Array.from(e.target.files!)])} />
                    </label>
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                    <FileText size={12} className="text-amber-500" /> Executive Documents
                </label>
                {attachments.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-amber-50/50 border border-amber-100 rounded-xl text-[9px] font-black text-slate-900">
                        <div className="flex items-center gap-2">
                            <FileText size={14} className="text-amber-500" />
                            <span className="truncate max-w-[200px]">{file.name}</span>
                        </div>
                        <button type="button" onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                            <Trash2 size={12} />
                        </button>
                    </div>
                ))}
                <label className="block w-full p-3 border border-dashed border-slate-200 rounded-xl hover:border-slate-800 hover:bg-slate-50/50 transition-all cursor-pointer text-center group">
                    <div className="flex items-center justify-center gap-1.5">
                        <Upload size={12} className="text-slate-300 group-hover:text-slate-800 transition-colors" />
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest group-hover:text-slate-800">Upload Stakeholder Documents</span>
                    </div>
                    <input type="file" multiple className="hidden" onChange={e => e.target.files && setAttachments(prev => [...prev, ...Array.from(e.target.files!)])} />
                </label>
            </div>
        </div>
    );
}
