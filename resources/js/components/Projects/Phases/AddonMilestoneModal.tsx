import React, { useState, useRef } from 'react';
import axios from 'axios';
import { 
    X, Save, Upload, Banknote, Clock, FileText, 
    Sparkles, RefreshCw, AlertCircle
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

interface AddonMilestoneModalProps {
    project: any;
    phaseContext: 'design' | 'build' | 'interior' | 'legal';
    onClose: () => void;
    onSuccess: () => void;
}

export default function AddonMilestoneModal({ project, phaseContext, onClose, onSuccess }: AddonMilestoneModalProps) {
    const { showToast } = useToast();
    const [submitting, setSubmitting] = useState(false);
    
    // Form state
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [costImpact, setCostImpact] = useState('');
    const [timeImpact, setTimeImpact] = useState('');
    
    // Gallery state
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        
        try {
            const formData = new FormData();
            formData.append('title', title);
            formData.append('description', description);
            formData.append('phase_context', phaseContext);
            formData.append('cost_impact', costImpact || '0');
            formData.append('time_impact_days', timeImpact || '0');
            
            selectedFiles.forEach(file => {
                formData.append('gallery[]', file);
            });

            await axios.post(`/projects/${project.id}/milestones`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            showToast('Add-on Milestone & Fee Proposal Submitted', 'success');
            onSuccess();
            onClose();
        } catch (err: any) {
            const msg = err.response?.data?.message || 'Error creating add-on';
            showToast(msg, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setSelectedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-300">
                
                {/* Header */}
                <div className="p-8 pb-4 flex justify-between items-center border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-purple-500/20 text-purple-400 flex items-center justify-center shadow-lg shadow-purple-500/10">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-white tracking-tight">New Add-on / Revision</h3>
                            <p className="text-[10px] text-white/40 font-bold uppercase tracking-[0.2em] mt-0.5">Unified Scope & Fee Proposal</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-white/20 hover:text-white transition-colors hover:bg-white/5 rounded-xl">
                        <X size={20} />
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                    
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1 flex items-center gap-2">
                                <FileText size={12} /> Milestone Title
                            </label>
                            <input 
                                value={title} 
                                onChange={e => setTitle(e.target.value)} 
                                placeholder="e.g. Master Bedroom Revision v3" 
                                className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-white text-sm outline-none focus:border-purple-500 focus:bg-white/10 transition-all font-bold placeholder:text-white/20" 
                                required 
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1 flex items-center gap-2">
                                <AlertCircle size={12} /> Reason / Justification
                            </label>
                            <textarea 
                                value={description} 
                                onChange={e => setDescription(e.target.value)} 
                                placeholder="Explain why this revision is needed and what it covers..." 
                                className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-white text-sm min-h-[120px] outline-none focus:border-purple-500 focus:bg-white/10 transition-all font-bold placeholder:text-white/20" 
                                required
                            />
                        </div>
                    </div>

                    {/* Financial & Time Impact */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1 flex items-center gap-2">
                                <Banknote size={12} className="text-emerald-400" /> Proposed Fee (Rp)
                            </label>
                            <div className="relative group">
                                <input 
                                    type="number"
                                    value={costImpact} 
                                    onChange={e => setCostImpact(e.target.value)} 
                                    placeholder="0" 
                                    className="w-full pl-12 pr-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-white text-sm outline-none focus:border-emerald-500 focus:bg-white/10 transition-all font-bold group-hover:border-white/20" 
                                />
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 font-black text-xs">Rp</div>
                            </div>
                            <p className="text-[9px] text-white/20 font-bold px-1 italic">Enter 0 if no extra fee is required</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1 flex items-center gap-2">
                                <Clock size={12} className="text-slate-400" /> Time Impact (Days)
                            </label>
                            <input 
                                type="number"
                                value={timeImpact} 
                                onChange={e => setTimeImpact(e.target.value)} 
                                placeholder="0" 
                                className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-white text-sm outline-none focus:border-slate-500 focus:bg-white/10 transition-all font-bold placeholder:text-white/20" 
                            />
                        </div>
                    </div>

                    {/* File Upload */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">Evidence / Briefs</label>
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full p-8 border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-purple-500/40 hover:bg-white/5 transition-all group"
                        >
                            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/40 group-hover:text-purple-400 group-hover:scale-110 transition-all">
                                <Upload size={20} />
                            </div>
                            <div className="text-center">
                                <p className="text-xs font-black text-white">Upload Reference Files</p>
                                <p className="text-[10px] text-white/40 font-bold mt-1">Images, PDFs, or Blueprints</p>
                            </div>
                        </div>
                        <input 
                            type="file" 
                            multiple 
                            ref={fileInputRef} 
                            onChange={handleFileChange} 
                            className="hidden" 
                        />
                        
                        {selectedFiles.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-4">
                                {selectedFiles.map((file, i) => (
                                    <div key={i} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black text-white flex items-center gap-2">
                                        <FileText size={10} className="text-white/40" />
                                        <span className="truncate max-w-[100px]">{file.name}</span>
                                        <button 
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setSelectedFiles(prev => prev.filter((_, idx) => idx !== i)); }}
                                            className="text-white/20 hover:text-rose-400"
                                        >
                                            <X size={10} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </form>

                {/* Footer Actions */}
                <div className="p-8 pt-4 border-t border-white/5 flex gap-3 bg-white/[0.02]">
                    <button 
                        onClick={onClose}
                        className="flex-1 py-4 bg-white/5 text-white/40 hover:text-white hover:bg-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSubmit}
                        disabled={submitting || !title || !description}
                        className="flex-[2] py-4 bg-purple-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-500 transition-all shadow-xl shadow-purple-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {submitting ? (
                            <RefreshCw size={14} className="animate-spin" />
                        ) : (
                            <><Save size={14} /> Submit Add-on Proposal</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
