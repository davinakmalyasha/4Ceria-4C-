import React, { useState } from 'react';
import axios from 'axios';
import { Calendar, X, Send, AlertTriangle } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

interface ExtensionRequestModalProps {
    project: any;
    onClose: () => void;
    onSuccess: () => void;
}

export default function ExtensionRequestModal({ project, onClose, onSuccess }: ExtensionRequestModalProps) {
    const [reason, setReason] = useState('');
    const [days, setDays] = useState(7);
    const [desc, setDesc] = useState('');
    const [loading, setLoading] = useState(false);
    const { showToast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await axios.post(`/projects/${project.id}/extensions`, {
                reason,
                days_requested: days,
                description: desc
            });
            showToast('Extension proposal submitted', 'success');
            onSuccess();
            onClose();
        } catch (error) {
            showToast('Failed to submit proposal', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-[2rem] p-8 max-w-lg w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
                            <Calendar size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-slate-900 uppercase tracking-widest">Propose Extension</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Request more time for the project</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-900 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Primary Reason</label>
                        <select 
                            value={reason} 
                            onChange={e => setReason(e.target.value)}
                            required
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:border-slate-900 outline-none transition-all"
                        >
                            <option value="">Select a reason...</option>
                            <option value="Force Majeure (Weather/Earthquake)">Force Majeure (Weather/Earthquake)</option>
                            <option value="Material Delay">Material Delay</option>
                            <option value="Owner Scope Change">Owner Scope Change</option>
                            <option value="Technical Complexity">Technical Complexity</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Days Requested</label>
                        <input 
                            type="number" 
                            min="1" 
                            max="90"
                            value={days}
                            onChange={e => setDays(parseInt(e.target.value))}
                            required
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:border-slate-900 outline-none transition-all"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Detailed Explanation</label>
                        <textarea 
                            value={desc}
                            onChange={e => setDesc(e.target.value)}
                            placeholder="Explain exactly why you need more time..."
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold h-24 focus:border-slate-900 outline-none resize-none transition-all"
                        />
                    </div>

                    <div className="p-4 bg-amber-50 rounded-2xl flex gap-3 border border-amber-100">
                        <AlertTriangle className="text-amber-600 shrink-0" size={18} />
                        <p className="text-[10px] text-amber-800 font-bold leading-relaxed uppercase tracking-widest">
                            Timeline extensions require PM review and explicit Owner approval. Penalties for delay may still apply until approved.
                        </p>
                    </div>

                    <button 
                        type="submit" 
                        disabled={loading || !reason}
                        className="w-full py-4 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-black transition-all disabled:opacity-50"
                    >
                        {loading ? 'Submitting...' : <><Send size={16} /> Submit Proposal</>}
                    </button>
                </form>
            </div>
        </div>
    );
}
