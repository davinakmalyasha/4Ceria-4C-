import React, { useState } from 'react';
import { X, DollarSign, Clock, AlertCircle } from 'lucide-react';
import axios from 'axios';
import { useToast } from '../../../context/ToastContext';

interface AddonFeeModalProps {
    project: any;
    milestone: any;
    onClose: () => void;
    onSuccess: () => void;
}

export default function AddonFeeModal({ project, milestone, onClose, onSuccess }: AddonFeeModalProps) {
    const [title, setTitle] = useState(`Additional Fee: ${milestone.title}`);
    const [description, setDescription] = useState('');
    const [costImpact, setCostImpact] = useState('');
    const [timeImpact, setTimeImpact] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const { showToast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await axios.post(`/projects/${project.id}/change-orders`, {
                title,
                description,
                cost_impact: costImpact,
                time_impact_days: timeImpact || 0,
                milestone_id: milestone.id
            });
            showToast('Additional fee request submitted for review.', 'success');
            onSuccess();
            onClose();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to submit fee request.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
            <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden">
                <div className="p-8">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-amber-500 text-white rounded-2xl">
                                <DollarSign size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Request Extra Fee</h3>
                                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">For Revision / Add-on Milestone</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                            <X size={24} className="text-slate-400" />
                        </button>
                    </div>

                    <div className="mb-6 p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3">
                        <AlertCircle size={20} className="text-amber-500 shrink-0" />
                        <div className="text-[10px] font-bold text-amber-700 leading-relaxed uppercase tracking-wider">
                            This request will be reviewed by the PM first, then sent to the Owner for final approval. Once approved, a payment termin will be generated.
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Request Title</label>
                            <input 
                                type="text" 
                                value={title} 
                                onChange={e => setTitle(e.target.value)} 
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black outline-none focus:border-slate-900" 
                                required 
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Additional Cost (Rp)</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">Rp</span>
                                    <input 
                                        type="number" 
                                        value={costImpact} 
                                        onChange={e => setCostImpact(e.target.value)} 
                                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black outline-none focus:border-slate-900" 
                                        placeholder="0"
                                        required 
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Timeline Delay (Days)</label>
                                <div className="relative">
                                    <Clock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input 
                                        type="number" 
                                        value={timeImpact} 
                                        onChange={e => setTimeImpact(e.target.value)} 
                                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black outline-none focus:border-slate-900" 
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Justification / Details</label>
                            <textarea 
                                value={description} 
                                onChange={e => setDescription(e.target.value)} 
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium outline-none focus:border-slate-900 min-h-[100px]" 
                                placeholder="Explain why this extra fee is required..."
                                required 
                            />
                        </div>

                        <div className="pt-4 flex gap-3">
                            <button 
                                type="submit" 
                                disabled={submitting} 
                                className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl disabled:opacity-50"
                            >
                                {submitting ? 'Submitting...' : 'Submit Fee Request'}
                            </button>
                            <button 
                                type="button" 
                                onClick={onClose} 
                                className="px-8 py-4 bg-white border border-slate-200 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
