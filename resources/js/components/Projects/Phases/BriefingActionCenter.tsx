import React, { useState, useRef, useEffect } from 'react';
import { 
    Send, CheckCircle2, Lock, Unlock, MessageCircle, Info, 
    CreditCard, Banknote, Clock, ShieldCheck, FileText, 
    Paperclip, X, AlertCircle, Search, RefreshCw, Cloud
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
        <div className="bg-zinc-50 border border-zinc-200 rounded-3xl overflow-hidden shadow-sm">
            {/* Header Status Bar */}
            <div className={`px-6 py-4 flex items-center justify-between ${
                status === 'approved' ? 'bg-green-600 text-white' : 
                status === 'proposed' || status === 'pm_verified' ? 'bg-amber-500 text-white' : 
                'bg-zinc-100 text-zinc-600'
            }`}>
                <div className="flex items-center gap-2 font-semibold">
                    {status === 'draft' && <Info className="w-5 h-5" />}
                    {status === 'proposed' && <Search className="w-5 h-5 animate-pulse" />}
                    {status === 'pm_verified' && <ShieldCheck className="w-5 h-5" />}
                    {status === 'approved' && <CheckCircle2 className="w-5 h-5" />}
                    <span className="capitalize">
                        {status === 'draft' ? 'Phase 1: Discussion & Agreement' : 
                         status === 'proposed' ? 'Phase 2: Project Manager Technical Audit' :
                         status === 'pm_verified' ? 'Phase 3: Owner Final Review' :
                         'Phase 4: Active Project'}
                    </span>
                </div>
                {status === 'approved' && project.design_payment_verified_at && (
                    <span className="flex items-center gap-1 text-sm bg-white/20 px-3 py-1 rounded-full border border-white/20 font-bold">
                        <Unlock className="w-4 h-4" />
                        DESIGN WORKSPACE OPEN
                    </span>
                )}
            </div>

            <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Side: Financials & Brief Details */}
                <div className="space-y-6">
                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
                            <Banknote className="w-4 h-4" />
                            Financial Agreement
                        </h4>
                        
                        {(isArchitect && status === 'draft') || isEditingFee ? (
                            <div className="space-y-4 animate-in fade-in slide-in-from-left-2 p-6 bg-white rounded-3xl border border-zinc-200">
                                <div>
                                    <label className="block text-[10px] font-black text-zinc-500 mb-1 uppercase tracking-tight">Final Fee (IDR)</label>
                                    <input 
                                        type="number"
                                        value={feeInput === 0 ? '' : feeInput}
                                        onChange={(e) => setFeeInput(e.target.value === '' ? 0 : Number(e.target.value))}
                                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-amber-500 transition-all font-bold text-lg"
                                        placeholder="0"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-zinc-500 mb-1 uppercase tracking-tight">Payment Instructions</label>
                                    <textarea 
                                        value={bankInput}
                                        onChange={(e) => setBankInput(e.target.value)}
                                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-amber-500 transition-all text-sm h-24"
                                        placeholder="e.g. Bank BCA, Acc: 12345, Name: Giska"
                                    />
                                </div>
                                <div>
                                    <TerminBuilder 
                                        termins={localTermins}
                                        onUpdate={setLocalTermins}
                                        totalFee={feeInput}
                                        milestones={project.milestones || []}
                                        isEditable={true}
                                    />
                                </div>
                                <button
                                    onClick={handleUpdateFinances}
                                    disabled={isLoading || (localTermins.length > 0 && Math.round(localTermins.reduce((s,t) => s + Number(t.percentage || 0), 0)) !== 100)}
                                    className="w-full bg-zinc-900 text-white rounded-xl py-3 font-bold hover:bg-zinc-800 transition-all disabled:opacity-50"
                                >
                                    Confirm Terms
                                </button>
                                {localTermins.length > 0 && Math.round(localTermins.reduce((s,t) => s + Number(t.percentage || 0), 0)) !== 100 && (
                                    <p className="text-[10px] text-red-500 text-center font-bold">The payment termin percentages must total 100%.</p>
                                )}
                            </div>
                        ) : (
                            <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-5">
                                    <ShieldCheck className="w-24 h-24" />
                                </div>
                                <div className="flex items-baseline justify-between mb-4 relative z-10">
                                    <span className="text-zinc-500 text-sm font-medium">Final Fee</span>
                                    <span className="text-2xl font-black text-zinc-900">
                                        Rp {project.negotiated_fee?.toLocaleString() || '0'}
                                    </span>
                                </div>
                                <div className="pt-4 border-t border-zinc-50 space-y-4 relative z-10">
                                    <span className="text-zinc-400 text-[10px] font-bold uppercase block mb-2 tracking-widest">Payment Schedule</span>
                                    {localTermins.length > 0 ? (
                                        <div className="space-y-2">
                                            {localTermins.map((t, i) => (
                                                <div key={i} className="bg-zinc-50 rounded-lg overflow-hidden border border-zinc-100/50">
                                                    <div className="flex items-center justify-between text-xs p-2.5">
                                                        <span className="font-bold text-zinc-700">{t.label}</span>
                                                        <span className="text-zinc-500 font-medium">
                                                            {t.percentage}% / Rp {t.amount?.toLocaleString()}
                                                        </span>
                                                    </div>
                                                    {t.notes && (
                                                        <div className="px-2.5 pb-2.5 pt-0">
                                                            <div className="bg-white/50 rounded-lg p-2 text-[10px] text-zinc-500 italic border border-zinc-100/50 leading-relaxed translate-y-[-2px]">
                                                                "{t.notes}"
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-zinc-400 text-xs italic">Single 100% payment upon completion.</p>
                                    )}
                                    <div className="pt-2">
                                        <span className="text-zinc-400 text-[10px] font-bold uppercase block mb-2 tracking-widest">Instructions</span>
                                        <p className="text-zinc-700 text-sm whitespace-pre-wrap italic bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                                            {project.payment_instructions || 'Consult with professional for details.'}
                                        </p>
                                    </div>
                                </div>
                                {isArchitect && status === 'draft' && (
                                    <button 
                                        onClick={() => setIsEditingFee(true)}
                                        className="absolute top-4 right-4 text-[10px] font-black text-amber-600 hover:bg-amber-50 px-3 py-1 rounded-full uppercase transition-all"
                                    >
                                        Modify
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Side: PM Audit & Actions */}
                <div className="space-y-6">
                    {/* Status UI */}
                    <div className="p-6 rounded-3xl bg-white border border-zinc-200 min-h-[300px] flex flex-col">
                        {status === 'draft' && (
                            <div className="flex-1 flex flex-col justify-center items-center text-center gap-4">
                                <FileText className="w-12 h-12 text-zinc-300" />
                                <div>
                                    <h4 className="font-bold text-zinc-900">Brief Preparation</h4>
                                    <p className="text-sm text-zinc-500 max-w-xs mx-auto">
                                        {isArchitect 
                                            ? "Finalize the fee and payment terms above, then click Lock & Propose to start the audit process."
                                            : "Awaiting Architect to finalize the agreement terms and lock the brief."}
                                    </p>
                                </div>
                                {isArchitect && (
                                    <div className="w-full mt-4 space-y-3">
                                        <div className="text-left font-black text-[10px] text-zinc-400 uppercase tracking-widest pl-1">Proposal Message (Optional)</div>
                                        <textarea
                                            value={archNoteInput}
                                            onChange={(e) => setArchNoteInput(e.target.value)}
                                            placeholder="Tell the client about this brief (e.g. adjustments made, next steps)..."
                                            className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-xs h-24 focus:ring-2 focus:ring-amber-500 transition-all outline-none"
                                        />
                                        <button
                                            onClick={() => handleAction('submit-planning', 'Plan submitted for audit')}
                                            disabled={isLoading || !project.negotiated_fee}
                                            className="w-full flex items-center justify-center gap-2 bg-amber-500 text-white rounded-2xl py-4 font-bold hover:bg-amber-600 shadow-lg shadow-amber-200 transition-all disabled:opacity-50"
                                        >
                                            <Send className="w-5 h-5" />
                                            Lock & Propose Plan
                                        </button>

                                        {/* PM REVISION FEEDBACK */}
                                        {(project.pm_audit_notes || (project.pm_audit_attachments && project.pm_audit_attachments.length > 0)) && (
                                            <div className="mt-8 pt-6 border-t border-zinc-100 text-left animate-in fade-in slide-in-from-bottom-4">
                                                <div className="flex items-center gap-2 mb-4">
                                                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                                    <h5 className="text-[10px] font-black text-red-500 uppercase tracking-widest">PM Revision Feedback</h5>
                                                </div>
                                                
                                                {project.pm_audit_notes && (
                                                    <div className="bg-red-50/50 border border-red-100 p-4 rounded-2xl mb-4">
                                                        <p className="text-xs text-red-800 leading-relaxed italic">
                                                            "{project.pm_audit_notes}"
                                                        </p>
                                                    </div>
                                                )}

                                                {project.pm_audit_attachments && project.pm_audit_attachments.length > 0 && (
                                                    <div className="grid grid-cols-3 gap-2">
                                                        {project.pm_audit_attachments.map((url, i) => (
                                                            <a 
                                                                key={i} 
                                                                href={url} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer"
                                                                className="relative aspect-square rounded-xl border border-red-100 overflow-hidden bg-white shadow-sm hover:shadow-md transition-all group"
                                                            >
                                                                {isImage(url) ? (
                                                                    <img 
                                                                        src={url} 
                                                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                                                                        alt={`Evidence ${i + 1}`}
                                                                    />
                                                                ) : (
                                                                    <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-red-50/30">
                                                                        <FileText className="w-6 h-6 text-red-200" />
                                                                        <span className="text-[7px] font-black text-red-300 uppercase tracking-widest">PDF DOC</span>
                                                                    </div>
                                                                )}
                                                            </a>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {(status === 'proposed' || status === 'pm_verified') && (
                            <div className="space-y-6 flex-1 flex flex-col">
                                <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                                            <ShieldCheck className="w-5 h-5 text-amber-600" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-sm font-black uppercase text-zinc-900 leading-none">Technical Audit Center</h4>
                                                {project.planning_iteration && project.planning_iteration > 0 && (
                                                    <span className="bg-zinc-900 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter">
                                                        Submission #{project.planning_iteration}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-widest font-bold">
                                                {status === 'proposed' ? 'Managed by Project Manager' : 'Audit Complete & Verified'}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    {isPM && status === 'proposed' && (
                                        <div className="flex items-center gap-1.5 transition-all">
                                            {isAutoSaving ? (
                                                <div className="flex items-center gap-1.5 text-amber-600 animate-pulse">
                                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                                    <span className="text-[10px] font-black uppercase tracking-tight">Syncing</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5 text-zinc-300">
                                                    <Cloud className="w-3 h-3" />
                                                    <span className="text-[10px] font-black uppercase tracking-tight">Saved</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {isPM && status === 'proposed' ? (
                                    // PM AUDIT WORKSPACE
                                    <div className="space-y-4 flex-1 animate-in fade-in zoom-in-95">
                                        {project.architect_notes && (
                                            <div className="bg-zinc-50 border border-zinc-100 p-4 rounded-2xl flex items-start gap-3 shadow-inner">
                                                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm flex-shrink-0 border border-zinc-100">
                                                    <MessageCircle className="w-4 h-4 text-zinc-400" />
                                                </div>
                                                <div>
                                                    <h5 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1 text-zinc-500">Architect Message</h5>
                                                    <p className="text-xs text-zinc-600 italic">"{project.architect_notes}"</p>
                                                </div>
                                            </div>
                                        )}
                                        
                                        <div>
                                            <label className="block text-[10px] font-black text-zinc-400 mb-2 uppercase tracking-widest">Technical Audit Notes</label>
                                            <textarea 
                                                value={auditNote}
                                                onChange={(e) => setAuditNote(e.target.value)}
                                                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-sm h-32 focus:ring-2 focus:ring-zinc-900 transition-all"
                                                placeholder="Write your technical analysis here... (visible to Owner & Architect)"
                                            />
                                        </div>
                                        
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Technical Attachments ({auditFiles.length}/3)</label>
                                                <button 
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="text-[10px] font-black text-amber-600 flex items-center gap-1 hover:underline"
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
                                            <div className="grid grid-cols-3 gap-3">
                                                {project.pm_audit_attachments?.map((url, i) => (
                                                    <div key={i} className="relative aspect-square rounded-2xl border border-zinc-200 overflow-hidden bg-white shadow-sm hover:shadow-md transition-all group">
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
                                                            {/* View Overlay */}
                                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-all">
                                                                <Search className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                                            </div>
                                                        </a>
                                                        
                                                        <button 
                                                            onClick={() => handleDeleteAttachment(i)}
                                                            className="absolute top-1.5 right-1.5 w-6 h-6 bg-white/90 backdrop-blur shadow-sm rounded-full flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-all z-10"
                                                            disabled={isLoading || isAutoSaving}
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                                {(!project.pm_audit_attachments || project.pm_audit_attachments.length === 0) && (
                                                    <div className="col-span-3 py-8 border-2 border-dashed border-zinc-100 rounded-2xl flex flex-col items-center justify-center text-zinc-400">
                                                        <Paperclip className="w-5 h-5 mb-2 opacity-20" />
                                                        <p className="text-[10px] italic">No technical evidence uploaded.</p>
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
                                                className="w-full bg-zinc-900 text-white rounded-2xl py-4 text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-[0.98] disabled:opacity-50"
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
                                                className="col-span-2 text-xs font-bold text-red-500 hover:bg-red-50 py-2 rounded-xl border border-transparent hover:border-red-100 transition-all"
                                            >
                                                Request Official Revision
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-6 flex-1 animate-in fade-in slide-in-from-bottom-2">
                                        {project.architect_notes && (
                                            <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-100 flex gap-4 items-start">
                                                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm flex-shrink-0 border border-zinc-100">
                                                    <MessageCircle className="w-4 h-4 text-zinc-400" />
                                                </div>
                                                <div>
                                                    <h5 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Architect Message</h5>
                                                    <p className="text-xs text-zinc-600 italic">"{project.architect_notes}"</p>
                                                </div>
                                            </div>
                                        )}

                                        <div className="bg-amber-50/50 p-6 rounded-3xl border border-amber-100 relative group">
                                            <div className="absolute top-4 right-4">
                                                {status === 'proposed' && <Clock className="w-5 h-5 text-amber-500 animate-spin-slow" />}
                                                {status === 'pm_verified' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                                            </div>
                                            <h5 className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-3">Live Audit Report</h5>
                                            <p className="text-sm text-zinc-700 leading-relaxed italic">
                                                {project.pm_audit_notes || (status === 'proposed' ? 'The Project Manager is currently analyzing technical feasibility...' : 'No additional notes provided.')}
                                            </p>
                                            
                                            {project.pm_audit_attachments && project.pm_audit_attachments.length > 0 && (
                                                <div className="mt-6 pt-6 border-t border-amber-100">
                                                    <h6 className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-4">Supporting Evidence</h6>
                                                    <div className="grid grid-cols-3 gap-3">
                                                        {project.pm_audit_attachments.map((url, i) => (
                                                            <a 
                                                                key={i} 
                                                                href={url} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer"
                                                                className="relative aspect-square rounded-2xl border border-amber-200 overflow-hidden bg-white shadow-sm hover:shadow-lg transition-all group"
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
                                                                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent flex items-end p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <span className="text-[8px] font-black text-white uppercase tracking-widest">Evidence {i+1}</span>
                                                                </div>
                                                            </a>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {isOwner && status === 'pm_verified' && (
                                            <div className="space-y-3">
                                                <button
                                                    onClick={() => handleAction('approve-planning', 'Agreement Finalized!')}
                                                    disabled={isLoading}
                                                    className="w-full bg-amber-500 text-white rounded-2xl py-4 font-bold hover:bg-amber-600 transition-all shadow-xl shadow-amber-100"
                                                >
                                                    Approve & Confirm DP
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (confirm('Request revision? The brief will return to Discussion Phase.')) {
                                                            handleAction('reject-planning', 'Revision requested');
                                                        }
                                                    }}
                                                    className="w-full text-xs font-bold text-zinc-400 hover:text-zinc-600 py-2"
                                                >
                                                    Need further adjustments? Request Revision
                                                </button>
                                            </div>
                                        )}

                                        {isOwner && status === 'proposed' && (
                                            <div className="p-4 bg-zinc-100 rounded-2xl border border-zinc-200 text-center">
                                                <p className="text-xs font-bold text-zinc-500">Analyzing Project Viability...</p>
                                                <p className="text-[10px] text-zinc-400 mt-1">Please wait for the PM to sign off on technical specs.</p>
                                            </div>
                                        )}

                                        {isArchitect && (
                                            <div className="p-6 border-2 border-dashed border-zinc-200 rounded-3xl text-center">
                                                <AlertCircle className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                                                <p className="text-xs font-bold text-zinc-500">Brief Locked for Audit</p>
                                                <p className="text-[10px] text-zinc-400 mt-1">You can modify this brief if the PM or Owner requests a revision.</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {status === 'approved' && (
                            <div className="flex-1 flex flex-col">
                                {!project.design_payment_verified_at ? (
                                    <div className="flex-1 flex flex-col justify-center items-center gap-6 animate-in zoom-in-95">
                                        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center shadow-inner">
                                            <CreditCard className="w-10 h-10" />
                                        </div>
                                        <div className="text-center space-y-4">
                                            <div>
                                                <h4 className="font-black text-zinc-900 text-lg uppercase">Agreement Secured</h4>
                                                <p className="text-sm text-zinc-500 max-w-xs mx-auto">Please settle the Down Payment to unlock the first project phase.</p>
                                            </div>
                                            
                                            {isOwner && (
                                                <a
                                                    href={generateWhatsAppLink()}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center justify-center gap-2 bg-[#25D366] text-white rounded-2xl py-4 px-8 font-bold hover:brightness-110 transition-all shadow-lg shadow-green-100"
                                                >
                                                    <MessageCircle className="w-5 h-5" />
                                                    Pay & Confirm DP
                                                </a>
                                            )}

                                            {isArchitect && (
                                                <button
                                                    onClick={() => handleAction('verify-payment', 'Payment verified! Workspace active.')}
                                                    disabled={isLoading}
                                                    className="w-full flex items-center justify-center gap-2 bg-zinc-900 text-white rounded-2xl py-4 font-bold hover:bg-zinc-800 transition-all"
                                                >
                                                    <Unlock className="w-5 h-5" />
                                                    Confirm DP Received
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col justify-center items-center gap-4 animate-in fade-in">
                                        <div className="w-24 h-24 bg-green-100 text-green-600 rounded-3xl flex items-center justify-center shadow-lg transform rotate-3">
                                            <CheckCircle2 className="w-12 h-12" />
                                        </div>
                                        <div className="text-center space-y-4">
                                            <h4 className="font-black text-zinc-900 text-xl">PROYEK AKTIF</h4>
                                            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mt-1">Design Exploration Stage</p>
                                            
                                            <div className="mt-4 pt-4 border-t border-zinc-100">
                                                <button 
                                                    onClick={() => document.querySelector<HTMLButtonElement>('button[data-tab-id="legalities"]')?.click()}
                                                    className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg"
                                                >
                                                    <FileText size={16} />
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
            </div>
        </div>
    );
};

export default BriefingActionCenter;

