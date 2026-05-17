import React, { useState, useRef, useEffect } from 'react';
import { 
    Send, CheckCircle2, Lock, Unlock, MessageCircle, Info, 
    CreditCard, Banknote, Clock, ShieldCheck, FileText, 
    Paperclip, X, AlertCircle, Search, RefreshCw, Cloud, Settings
} from 'lucide-react';
import { Project, Termin } from '../../../types/project.types';
import axios from 'axios';
import { useToast } from '../../../context/ToastContext';
import TerminBuilder from './TerminBuilder';

interface BriefingActionCenterProps {
    project: Project;
    isArchitect: boolean;
    isOwner: boolean;
    isPM: boolean;
    onProjectUpdate: (updatedProject: Project) => void;
}

const BriefingActionCenter: React.FC<BriefingActionCenterProps> = ({ 
    project, isArchitect, isOwner, isPM, onProjectUpdate 
}) => {
    const { showToast } = useToast();

    // Helper to detect images
    const isImage = (url: string) => {
        return url.match(/\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i);
    };

    const [isLoading, setIsLoading] = useState(false);
    const [isEditingFee, setIsEditingFee] = useState(false);
    const [feeInput, setFeeInput] = useState(project.negotiated_fee || 0);
    const [bankInput, setBankInput] = useState(project.payment_instructions || '');
    const [localTermins, setLocalTermins] = useState<Partial<Termin>[]>( project.payment_termins || []);

    // PM Audit State
    const [auditNote, setAuditNote] = useState(project.pm_audit_notes || '');
    const [isAutoSaving, setIsAutoSaving] = useState(false);
    const [archNoteInput, setArchNoteInput] = useState(project.architect_notes || '');
    const [auditFiles, setAuditFiles] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const status = project.planning_status || 'draft';

    const handleAction = async (endpoint: string, successMsg: string, extraData: any = {}) => {
        setIsLoading(true);
        try {
            const formData = new FormData();
            Object.keys(extraData).forEach(key => {
                formData.append(key, extraData[key]);
            });

            // Add architect notes if submitting
            if (endpoint === 'submit-planning') {
                formData.append('architect_notes', archNoteInput);
            }

            auditFiles.forEach((file) => {
                formData.append('attachments[]', file);
            });

            const response = await axios.post(`/projects/${project.id}/${endpoint}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            
            onProjectUpdate(response.data.data);
            setAuditFiles([]);
            showToast(successMsg, 'success');
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Action failed', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // Debounced Auto-save for PM Notes
    useEffect(() => {
        // Don't auto-save if value hasn't changed from database (to avoid initial loop)
        if (auditNote === (project.pm_audit_notes || '')) return;
        if (status !== 'proposed' || !isPM) return;

        const timer = setTimeout(async () => {
            setIsAutoSaving(true);
            try {
                const response = await axios.post(`/projects/${project.id}/update-planning-audit`, {
                    pm_audit_notes: auditNote
                });
                onProjectUpdate(response.data.data);
            } catch (err) {
                console.error("Auto-save failed", err);
            } finally {
                // Buffer to show "Saved" for a moment
                setTimeout(() => setIsAutoSaving(false), 1000);
            }
        }, 2000); // 2 second debounce

        return () => clearTimeout(timer);
    }, [auditNote]);

    const handleUpdateFinances = async () => {
        setIsLoading(true);
        try {
            const response = await axios.post(`/projects/${project.id}/update`, {
                negotiated_fee: feeInput,
                payment_instructions: bankInput,
                payment_termins: localTermins,
                target_role: 'arsitek'
            });
            onProjectUpdate(response.data.data);
            setIsEditingFee(false);
            showToast('Agreement and Payment Schedule updated', 'success');
        } catch (error) {
            showToast('Failed to update financial terms', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files);
            const currentCount = project.pm_audit_attachments?.length || 0;
            
            if (currentCount + newFiles.length > 3) {
                showToast('Maximum 3 total attachments allowed', 'error');
                return;
            }

            setIsAutoSaving(true);
            try {
                const formData = new FormData();
                newFiles.forEach(file => formData.append('attachments[]', file));
                
                const response = await axios.post(`/projects/${project.id}/update-planning-audit`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                
                onProjectUpdate(response.data.data);
                showToast(`${newFiles.length} file(s) uploaded`, 'success');
            } catch (err) {
                showToast('Failed to upload files', 'error');
            } finally {
                setIsAutoSaving(false);
            }
        }
    };

    const handleDeleteAttachment = async (index: number) => {
        if (!confirm('Remove this attachment?')) return;
        
        setIsAutoSaving(true);
        try {
            const response = await axios.post(`/projects/${project.id}/update-planning-audit`, {
                delete_attachment_index: index
            });
            onProjectUpdate(response.data.data);
            showToast('Attachment removed', 'success');
        } catch (err) {
            showToast('Failed to remove attachment', 'error');
        } finally {
            setIsAutoSaving(false);
        }
    };

    const generateWhatsAppLink = () => {
        const text = `Hi ${project.accepted_arsitek_bid?.arsitek_id ? 'Architect' : 'Professional'}, I have approved the Design Brief for project "${project.title}". I am ready to process the payment of IDR ${project.negotiated_fee?.toLocaleString()}. Please provide any additional details if needed.`;
        return `https://wa.me/?text=${encodeURIComponent(text)}`;
    };

    return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl">
            {/* Header Status Bar (Only for non-draft or if PM is auditing) */}
            {status !== 'draft' && (
                <div className={`px-6 py-4 flex items-center justify-between ${
                    status === 'approved' ? 'bg-green-600 text-white' : 
                    'bg-amber-500 text-white'
                }`}>
                    <div className="flex items-center gap-2 font-semibold">
                        {status === 'proposed' && <Search className="w-5 h-5 animate-pulse" />}
                        {status === 'pm_verified' && <ShieldCheck className="w-5 h-5" />}
                        {status === 'approved' && <CheckCircle2 className="w-5 h-5" />}
                        <span className="capitalize">
                            {status === 'proposed' ? 'Phase 2: Project Manager Technical Audit' :
                             status === 'pm_verified' ? 'Phase 3: Owner Final Review' :
                             'Phase 4: Active Project'}
                        </span>
                    </div>
                </div>
            )}

            <div className={status === 'draft' ? 'p-6' : 'p-8'}>
                {status === 'draft' && (
                    <div className="flex flex-col lg:flex-row items-center gap-6">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                                <div className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center text-amber-500">
                                    <Settings size={18} />
                                </div>
                                <h4 className="text-sm font-black text-white uppercase tracking-tight">Finalize Planning</h4>
                            </div>
                            <p className="text-zinc-500 text-[11px] leading-relaxed max-w-xl">
                                Lock your technical specifications and propose the plan to the Project Manager for audit. 
                                This will freeze the requirements board.
                            </p>
                        </div>
                        
                        {isArchitect && (
                            <div className="flex flex-col md:flex-row items-center gap-3 w-full lg:w-auto">
                                <input
                                    type="text"
                                    value={archNoteInput}
                                    onChange={(e) => setArchNoteInput(e.target.value)}
                                    placeholder="Add a proposal note..."
                                    className="w-full md:w-64 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-xs text-white focus:ring-1 focus:ring-amber-500 transition-all outline-none"
                                />
                                <button
                                    onClick={() => handleAction('submit-planning', 'Plan submitted for audit')}
                                    disabled={isLoading}
                                    className="w-full md:w-auto flex items-center justify-center gap-2 bg-white text-zinc-900 rounded-xl px-6 py-2.5 font-black text-[11px] uppercase tracking-widest hover:bg-zinc-200 shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 whitespace-nowrap"
                                >
                                    <Send className="w-4 h-4" />
                                    Lock & Propose Plan
                                </button>
                            </div>
                        )}
                        {!isArchitect && (
                            <div className="px-5 py-2.5 bg-zinc-800 rounded-xl border border-zinc-700">
                                <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em]">Awaiting Architect Proposal</p>
                            </div>
                        )}

                        {isArchitect && project.pm_audit_notes && (
                            <div className="w-full lg:w-auto p-3 bg-red-950/30 border border-red-900/50 rounded-xl flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                                <p className="text-[10px] text-red-400 italic">Revision: "{project.pm_audit_notes}"</p>
                            </div>
                        )}
                    </div>
                )}

                {(status === 'proposed' || status === 'pm_verified') && (
                    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex items-center justify-between border-b border-zinc-200 pb-6">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600 shadow-sm">
                                    <ShieldCheck className="w-6 h-6" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-lg font-black uppercase text-zinc-900 leading-none">Technical Audit Center</h4>
                                        {project.planning_iteration > 0 && (
                                            <span className="bg-zinc-900 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-tighter">
                                                Iteration #{project.planning_iteration}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-zinc-500 mt-1 uppercase tracking-widest font-bold">
                                        {status === 'proposed' ? 'Managed by Project Manager' : 'Audit Complete & Verified'}
                                    </p>
                                </div>
                            </div>
                            
                            {isPM && status === 'proposed' && (
                                <div className="flex items-center gap-2">
                                    {isAutoSaving ? (
                                        <div className="flex items-center gap-2 text-amber-600 animate-pulse">
                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                            <span className="text-[10px] font-black uppercase tracking-tight">Syncing</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 text-zinc-300">
                                            <Cloud className="w-3 h-3" />
                                            <span className="text-[10px] font-black uppercase tracking-tight">Saved</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {isPM && status === 'proposed' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    {project.architect_notes && (
                                        <div className="bg-zinc-50 border border-zinc-100 p-6 rounded-3xl flex items-start gap-4 shadow-inner">
                                            <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-sm flex-shrink-0 border border-zinc-100">
                                                <MessageCircle className="w-5 h-5 text-zinc-400" />
                                            </div>
                                            <div>
                                                <h5 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Architect Message</h5>
                                                <p className="text-sm text-zinc-600 italic leading-relaxed">"{project.architect_notes}"</p>
                                            </div>
                                        </div>
                                    )}
                                    
                                    <div className="space-y-3">
                                        <label className="block text-[11px] font-black text-zinc-900 mb-2 uppercase tracking-widest pl-1">Technical Audit Notes</label>
                                        <textarea 
                                            value={auditNote}
                                            onChange={(e) => setAuditNote(e.target.value)}
                                            className="w-full bg-zinc-50 border border-zinc-200 rounded-3xl p-5 text-sm h-48 focus:ring-2 focus:ring-zinc-900 transition-all outline-none"
                                            placeholder="Write your technical analysis here... (visible to Owner & Architect)"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div>
                                        <div className="flex items-center justify-between mb-4 px-1">
                                            <label className="text-[11px] font-black text-zinc-900 uppercase tracking-widest">Supporting Evidence ({project.pm_audit_attachments?.length || 0}/3)</label>
                                            <button 
                                                onClick={() => fileInputRef.current?.click()}
                                                className="text-[10px] font-black text-amber-600 flex items-center gap-1.5 hover:underline bg-amber-50 px-3 py-1.5 rounded-full"
                                            >
                                                <Paperclip className="w-3 h-3" />
                                                Add Image/PDF
                                            </button>
                                        </div>
                                        <input 
                                            type="file" 
                                            ref={fileInputRef} 
                                            onChange={handleFileChange} 
                                            className="hidden" 
                                            multiple 
                                            accept="image/*,.pdf"
                                        />
                                        <div className="grid grid-cols-2 gap-4">
                                            {project.pm_audit_attachments?.map((url, i) => (
                                                <div key={i} className="relative aspect-[4/3] rounded-2xl border border-zinc-200 overflow-hidden bg-white shadow-sm hover:shadow-md transition-all group">
                                                    <a 
                                                        href={url} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="w-full h-full flex items-center justify-center overflow-hidden"
                                                    >
                                                        {isImage(url) ? (
                                                            <img 
                                                                src={url} 
                                                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                                                                alt={`Evidence ${i + 1}`}
                                                            />
                                                        ) : (
                                                            <div className="flex flex-col items-center gap-2">
                                                                <FileText className="w-8 h-8 text-zinc-300" />
                                                                <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest">PDF DOC</span>
                                                            </div>
                                                        )}
                                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-all">
                                                            <Search className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                                        </div>
                                                    </a>
                                                    
                                                    <button 
                                                        onClick={() => handleDeleteAttachment(i)}
                                                        className="absolute top-2 right-2 w-7 h-7 bg-white/95 backdrop-blur shadow-sm rounded-full flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-all z-10"
                                                        disabled={isLoading || isAutoSaving}
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                            {(!project.pm_audit_attachments || project.pm_audit_attachments.length === 0) && (
                                                <div className="col-span-2 aspect-[4/3] border-2 border-dashed border-zinc-100 rounded-3xl flex flex-col items-center justify-center text-zinc-400 bg-zinc-50/50">
                                                    <Paperclip className="w-8 h-8 mb-3 opacity-20" />
                                                    <p className="text-[11px] italic font-medium">No technical evidence uploaded.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="pt-4 space-y-3">
                                        <button
                                            onClick={() => {
                                                if (!auditNote) return showToast('Please provide an audit note', 'error');
                                                handleAction('verify-planning-pm', 'Technical Verification Finalized!', { pm_audit_notes: auditNote });
                                            }}
                                            disabled={isLoading || isAutoSaving}
                                            className="w-full bg-zinc-900 text-white rounded-2xl py-4 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-black transition-all shadow-xl active:scale-[0.98] disabled:opacity-50"
                                        >
                                            Verify & Finalize Plan
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (!auditNote) return showToast('Reason needed for revision', 'error');
                                                if (confirm('Request revision from Architect?')) {
                                                    handleAction('reject-planning', 'Revision requested', { pm_audit_notes: auditNote });
                                                }
                                            }}
                                            disabled={isLoading}
                                            className="w-full text-[10px] font-black text-red-500 hover:bg-red-50 py-3 rounded-2xl border border-transparent hover:border-red-100 transition-all uppercase tracking-widest"
                                        >
                                            Request Official Revision
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="max-w-2xl mx-auto space-y-8">
                                {project.architect_notes && (
                                    <div className="bg-zinc-50 p-6 rounded-3xl border border-zinc-100 flex gap-5 items-start shadow-inner">
                                        <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-sm flex-shrink-0 border border-zinc-100">
                                            <MessageCircle className="w-5 h-5 text-zinc-400" />
                                        </div>
                                        <div>
                                            <h5 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Architect Message</h5>
                                            <p className="text-sm text-zinc-600 italic leading-relaxed">"{project.architect_notes}"</p>
                                        </div>
                                    </div>
                                )}

                                <div className="bg-amber-50/50 p-8 rounded-[2.5rem] border border-amber-100 relative group overflow-hidden">
                                    <div className="absolute top-6 right-6">
                                        {status === 'proposed' && <Clock className="w-6 h-6 text-amber-500 animate-spin-slow" />}
                                        {status === 'pm_verified' && <CheckCircle2 className="w-6 h-6 text-green-500" />}
                                    </div>
                                    <div className="absolute -bottom-6 -left-6 opacity-[0.03] rotate-12">
                                        <ShieldCheck size={160} className="text-amber-900" />
                                    </div>
                                    
                                    <div className="relative z-10">
                                        <h5 className="text-[11px] font-black text-amber-600 uppercase tracking-widest mb-4">Live Audit Report</h5>
                                        <p className="text-base text-zinc-800 leading-relaxed italic font-medium">
                                            {project.pm_audit_notes || (status === 'proposed' ? 'The Project Manager is currently analyzing technical feasibility...' : 'No additional notes provided.')}
                                        </p>
                                        
                                        {project.pm_audit_attachments && project.pm_audit_attachments.length > 0 && (
                                            <div className="mt-8 pt-8 border-t border-amber-100">
                                                <h6 className="text-[11px] font-black text-amber-600 uppercase tracking-widest mb-5">Supporting Evidence</h6>
                                                <div className="grid grid-cols-3 gap-4">
                                                    {project.pm_audit_attachments.map((url, i) => (
                                                        <a 
                                                            key={i} 
                                                            href={url} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            className="relative aspect-square rounded-[1.5rem] border border-amber-200 overflow-hidden bg-white shadow-sm hover:shadow-xl transition-all group"
                                                        >
                                                            {isImage(url) ? (
                                                                <img 
                                                                    src={url} 
                                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                                                                    alt={`Evidence ${i + 1}`}
                                                                />
                                                            ) : (
                                                                <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-amber-50">
                                                                    <FileText className="w-8 h-8 text-amber-200" />
                                                                    <span className="text-[8px] font-black text-amber-400 uppercase tracking-widest">TECHNICAL DOC</span>
                                                                </div>
                                                            )}
                                                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent flex items-end p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <span className="text-[9px] font-black text-white uppercase tracking-widest">Evidence {i+1}</span>
                                                            </div>
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {isOwner && status === 'pm_verified' && (
                                    <div className="space-y-4 pt-4">
                                        <button
                                            onClick={() => handleAction('approve-planning', 'Agreement Finalized!')}
                                            disabled={isLoading}
                                            className="w-full bg-zinc-900 text-white rounded-3xl py-5 font-black text-xs uppercase tracking-[0.2em] hover:bg-black transition-all shadow-2xl active:scale-[0.98]"
                                        >
                                            Approve & Confirm Plan
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (confirm('Request revision? The brief will return to Discussion Phase.')) {
                                                    handleAction('reject-planning', 'Revision requested');
                                                }
                                            }}
                                            className="w-full text-[10px] font-black text-zinc-400 hover:text-zinc-600 py-2 uppercase tracking-widest"
                                        >
                                            Request Revision
                                        </button>
                                    </div>
                                )}

                                {isArchitect && (
                                    <div className="p-10 border-2 border-dashed border-zinc-200 rounded-[2.5rem] text-center bg-zinc-50/30">
                                        <AlertCircle className="w-10 h-10 text-zinc-300 mx-auto mb-4" />
                                        <p className="text-sm font-bold text-zinc-900">Brief Locked for Audit</p>
                                        <p className="text-xs text-zinc-400 mt-2 leading-relaxed">Your specifications are currently under technical review. You can modify them if a revision is requested.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {status === 'approved' && (
                    <div className="max-w-xl mx-auto py-12">
                        {!project.design_payment_verified_at ? (
                            <div className="flex flex-col justify-center items-center gap-8 animate-in zoom-in-95">
                                <div className="w-24 h-24 bg-green-100 text-green-600 rounded-[2rem] flex items-center justify-center shadow-inner relative overflow-hidden">
                                    <div className="absolute inset-0 bg-green-200/20 animate-pulse" />
                                    <CreditCard className="w-10 h-10 relative z-10" />
                                </div>
                                <div className="text-center space-y-6">
                                    <div>
                                        <h4 className="font-black text-zinc-900 text-2xl uppercase tracking-tight">Agreement Secured</h4>
                                        <p className="text-zinc-500 text-sm max-w-sm mx-auto mt-2 leading-relaxed">
                                            The design roadmap is finalized. Please settle the Down Payment to unlock the project workspace.
                                        </p>
                                    </div>
                                    
                                    {isOwner && (
                                        <a
                                            href={generateWhatsAppLink()}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-center gap-3 bg-[#25D366] text-white rounded-[1.5rem] py-5 px-10 font-black text-xs uppercase tracking-widest hover:brightness-110 transition-all shadow-xl shadow-green-100"
                                        >
                                            <MessageCircle className="w-5 h-5" />
                                            Pay & Confirm DP
                                        </a>
                                    )}

                                    {isArchitect && (
                                        <button
                                            onClick={() => handleAction('verify-payment', 'Payment verified! Workspace active.')}
                                            disabled={isLoading}
                                            className="w-full flex items-center justify-center gap-3 bg-zinc-900 text-white rounded-[1.5rem] py-5 font-black text-xs uppercase tracking-widest hover:bg-black transition-all"
                                        >
                                            <Unlock className="w-5 h-5" />
                                            Confirm DP Received
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : !project.arsitek_kickoff_at ? (
                            <div className="flex flex-col justify-center items-center gap-8 animate-in zoom-in-95">
                                <div className="w-24 h-24 bg-amber-100 text-amber-600 rounded-[2rem] flex items-center justify-center shadow-inner relative overflow-hidden">
                                    <div className="absolute inset-0 bg-amber-200/20 animate-pulse" />
                                    <Clock className="w-10 h-10 relative z-10" />
                                </div>
                                <div className="text-center space-y-6">
                                    <div>
                                        <h4 className="font-black text-zinc-900 text-2xl uppercase tracking-tight">Standby Mode</h4>
                                        <p className="text-zinc-500 text-sm max-w-sm mx-auto mt-2 leading-relaxed">
                                            {isArchitect 
                                                ? "Payment verified. Please wait for the official Notice to Proceed (NTP) before starting design work."
                                                : "Payment verified. You can now issue the official Notice to Proceed to the Architect."}
                                        </p>
                                        {!project.legal_handover_submitted_at && (isOwner || isPM) && (
                                            <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-red-600 text-[10px] font-bold uppercase">
                                                <AlertCircle size={14} />
                                                Note: Notary has not finalized legal documents yet.
                                            </div>
                                        )}
                                    </div>
                                    
                                    {(isOwner || isPM) && (
                                        <button
                                            onClick={() => handleAction('kickoff', 'Notice to Proceed issued!', { role: 'arsitek' })}
                                            disabled={isLoading}
                                            className="w-full flex items-center justify-center gap-3 bg-zinc-900 text-white rounded-[1.5rem] py-5 font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-xl"
                                        >
                                            <Zap className="w-5 h-5 fill-current" />
                                            Issue Notice to Proceed
                                        </button>
                                    )}

                                    {isArchitect && (
                                        <div className="px-6 py-4 bg-zinc-100 rounded-2xl border border-zinc-200">
                                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Waiting for PM Authorization</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col justify-center items-center gap-6 animate-in fade-in">
                                <div className="w-28 h-28 bg-zinc-900 text-white rounded-[2.5rem] flex items-center justify-center shadow-2xl transform rotate-3 relative">
                                    <div className="absolute inset-0 bg-white/10 rounded-[2.5rem] transform -rotate-6 -z-10" />
                                    <CheckCircle2 className="w-14 h-14" />
                                </div>
                                <div className="text-center space-y-6 pt-4">
                                    <h4 className="font-black text-zinc-900 text-3xl tracking-tighter uppercase">PROYEK AKTIF</h4>
                                    <p className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.3em]">Design Exploration Stage</p>
                                    
                                    <div className="pt-8">
                                        <button 
                                            onClick={() => document.querySelector<HTMLButtonElement>('button[data-tab-id="legalities"]')?.click()}
                                            className="inline-flex items-center gap-3 px-8 py-4 bg-zinc-100 text-zinc-900 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all border border-zinc-200"
                                        >
                                            <FileText size={18} />
                                            Finalize Legal Contract (SPK)
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default BriefingActionCenter;
