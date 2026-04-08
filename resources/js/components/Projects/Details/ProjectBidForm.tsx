import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Coins, FileText, Calendar, Upload, CheckCircle, AlertCircle, X } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

interface Props {
    project: any;
    user: any;
    onSuccess: () => void;
}

export const ProjectBidForm: React.FC<Props> = ({ project, user, onSuccess }) => {
    const { showToast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [price, setPrice] = useState('');
    const [proposal, setProposal] = useState('');
    const [duration, setDuration] = useState('');
    const [durationUnit, setDurationUnit] = useState('days');
    const [attachments, setAttachments] = useState<File[]>([]);

    const professionalProfile = user?.role_type === 'arsitek' ? user?.arsitek : user?.kontraktor;
    const isVerified = professionalProfile?.verification_status === 'verified';

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (attachments.length + files.length > 3) {
            showToast('Maximum 3 attachments allowed', 'error');
            return;
        }
        setAttachments([...attachments, ...files]);
    };

    const removeAttachment = (index: number) => {
        setAttachments(attachments.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isVerified) return;
        
        setIsLoading(true);
        const formData = new FormData();
        formData.append('price', price);
        formData.append('proposal', proposal);
        formData.append('estimated_duration', duration);
        formData.append('duration_unit', durationUnit);
        
        attachments.forEach((file, index) => {
            formData.append(`attachment_${index + 1}`, file);
        });

        try {
            await axios.post(`/projects/${project.id}/bids`, formData);
            showToast('Proposal submitted successfully!', 'success');
            onSuccess();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to submit proposal', 'error');
        } finally {
            setIsLoading(true); // Keep loading state until refresh
        }
    };

    if (!isVerified) {
        return (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-amber-50 border-2 border-amber-100 rounded-[2.5rem] p-10 flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 bg-white rounded-3xl shadow-sm border border-amber-100 flex items-center justify-center text-amber-500 mb-2">
                    <AlertCircle size={32} />
                </div>
                <h4 className="text-xl font-black text-amber-900 tracking-tight">Verification Required</h4>
                <p className="text-amber-700/80 text-sm max-w-sm font-medium leading-relaxed">
                    You need to be verified first before applying a bid. Complete your professional profile and wait for admin approval.
                </p>
                <button 
                    disabled 
                    className="mt-4 px-8 py-3 bg-white border-2 border-amber-200 text-amber-600 rounded-2xl font-black text-xs uppercase tracking-widest opacity-50 cursor-not-allowed"
                >
                    Submit Bid Restricted
                </button>
            </motion.div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-[2.5rem] border-2 border-zinc-100 p-10 shadow-[0_20px_50px_rgba(0,0,0,0.04)] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-50/50 rounded-bl-[5rem] -mr-16 -mt-16 -z-10" />
            
            <div className="flex items-center gap-4 mb-10">
                <div className="w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center text-white shadow-xl">
                    <FileText size={24} />
                </div>
                <div>
                    <h3 className="text-2xl font-black text-gray-900 tracking-tight">Submit Your Proposal</h3>
                    <p className="text-sm text-gray-400 font-bold uppercase tracking-widest">Investment & Strategy</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Price Input */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <Coins size={14} className="text-red-500" /> Investment Bid (Rp)
                        </label>
                        <div className="relative group">
                            <input 
                                type="number" 
                                required
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                placeholder="0"
                                className="w-full px-6 py-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl font-black text-xl text-gray-900 focus:bg-white focus:border-red-500 outline-none transition-all placeholder:text-zinc-200"
                            />
                            <div className="absolute right-6 top-1/2 -translate-y-1/2 text-xs font-black text-zinc-300 uppercase tracking-widest group-focus-within:text-red-500 transition-colors">IDR</div>
                        </div>
                    </div>

                    {/* Timeline Input */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <Calendar size={14} className="text-blue-500" /> Estimated Timeline
                        </label>
                        <div className="flex gap-2">
                            <input 
                                type="number" 
                                required
                                value={duration}
                                onChange={(e) => setDuration(e.target.value)}
                                placeholder="0"
                                className="flex-1 px-6 py-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl font-black text-xl text-gray-900 focus:bg-white focus:border-blue-500 outline-none transition-all placeholder:text-zinc-200"
                            />
                            <select 
                                value={durationUnit}
                                onChange={(e) => setDurationUnit(e.target.value)}
                                className="w-28 px-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl font-black text-xs uppercase tracking-widest text-zinc-500 focus:bg-white focus:border-blue-500 outline-none transition-all"
                            >
                                <option value="days">Days</option>
                                <option value="weeks">Weeks</option>
                                <option value="months">Months</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Proposal Text */}
                <div className="space-y-3">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FileText size={14} className="text-emerald-500" /> Executive Proposal
                    </label>
                    <textarea 
                        required
                        value={proposal}
                        onChange={(e) => setProposal(e.target.value)}
                        rows={5}
                        placeholder="Detail your approach, materials, and why you're the best fit for this project..."
                        className="w-full px-6 py-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl font-medium text-[13.5px] text-gray-600 focus:bg-white focus:border-emerald-500 outline-none transition-all resize-none placeholder:text-zinc-300"
                    />
                </div>

                {/* Attachments */}
                <div className="space-y-4">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <Upload size={14} className="text-zinc-400" /> Supporting Attachments (Max 3)
                    </label>
                    <div className="flex flex-wrap gap-3">
                        {attachments.map((file, i) => (
                            <div key={i} className="flex items-center gap-3 pl-4 pr-2 py-2 bg-zinc-50 rounded-xl border border-zinc-100 group">
                                <span className="text-[10px] font-black text-zinc-500 truncate max-w-[120px]">{file.name}</span>
                                <button type="button" onClick={() => removeAttachment(i)} className="p-1 hover:bg-zinc-200 rounded-lg text-zinc-400 hover:text-zinc-900 transition-colors">
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                        {attachments.length < 3 && (
                            <label className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-dashed border-zinc-200 rounded-xl cursor-pointer hover:border-zinc-900 hover:bg-zinc-50 transition-all text-[10px] font-black text-zinc-400 hover:text-zinc-900 uppercase tracking-widest">
                                <Upload size={14} /> Add File
                                <input type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png" />
                            </label>
                        )}
                    </div>
                </div>

                {/* Submit Action */}
                <div className="pt-6 border-t border-zinc-100">
                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="w-full py-5 bg-zinc-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.3em] shadow-2xl shadow-zinc-200 hover:bg-[#FF2D20] hover:shadow-[#FF2D20]/20 hover:-translate-y-1 active:scale-95 transition-all disabled:opacity-50 disabled:translate-y-0 flex items-center justify-center gap-3"
                    >
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <><CheckCircle size={18} /> Submit Proposal Now</>
                        )}
                    </button>
                    <p className="text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-6">
                        By submitting, you agree to our Terms of Project Engagement.
                    </p>
                </div>
            </form>
        </motion.div>
    );
};
