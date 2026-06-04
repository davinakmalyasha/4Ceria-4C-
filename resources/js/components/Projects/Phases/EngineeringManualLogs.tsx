import React, { useState } from 'react';
import axios from 'axios';
import { 
    HardHat, Wrench, Plus, Upload, FileText, 
    Trash2, Clock, CheckCircle2, ChevronRight,
    AlertCircle, RefreshCw, X
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { ErrorBoundary } from '../../Common/ErrorBoundary';

interface EngineeringManualLogsProps {
    project: any;
    currentUser: any;
    onRefresh: () => void;
}

export default function EngineeringManualLogs({ project, currentUser, onRefresh }: EngineeringManualLogsProps) {
    const { showToast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activeRole, setActiveRole] = useState<'structural' | 'mep' | null>(null);
    const [showLogForm, setShowLogForm] = useState(false);
    const [logTitle, setLogTitle] = useState('');
    const [logDesc, setLogDesc] = useState('');
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

    const isArchitect = (project?.selected_arsitek_id && currentUser?.arsitek?.id === project?.selected_arsitek_id) || (project?.arsitek?.user_id === currentUser?.id);

    const handleAddLog = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeRole) return;
        setIsSubmitting(true);

        try {
            const formData = new FormData();
            formData.append('role_type', activeRole);
            formData.append('title', logTitle);
            formData.append('description', logDesc);
            selectedFiles.forEach(f => formData.append('files[]', f));

            await axios.post(`/projects/${project.id}/engineering-logs`, formData);
            showToast('Technical log recorded', 'success');
            setShowLogForm(false);
            setLogTitle('');
            setLogDesc('');
            setSelectedFiles([]);
            onRefresh();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to record log', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteLog = async (logId: number) => {
        if (!window.confirm('Remove this log entry?')) return;
        try {
            await axios.delete(`/projects/${project.id}/engineering-logs/${logId}`);
            showToast('Log removed', 'success');
            onRefresh();
        } catch (err: any) {
            showToast('Failed to remove log', 'error');
        }
    };

    const handleUploadBaseDesign = async (role: 'structural' | 'mep') => {
        const input = document.createElement('input');
        input.type = 'file';
        input.onchange = async (e: any) => {
            const file = e.target.files?.[0];
            if (!file) return;

            setIsSubmitting(true);
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('category', 'engineering_base_design');
                formData.append('target_role', role);

                await axios.post(`/projects/${project.id}/documents`, formData);
                showToast('Base design uploaded', 'success');
                onRefresh();
            } catch (err: any) {
                showToast('Failed to upload design', 'error');
            } finally {
                setIsSubmitting(false);
            }
        };
        input.click();
    };

    const renderBox = (role: 'structural' | 'mep') => {
        const isStructural = role === 'structural';
        const colorClass = isStructural ? 'indigo' : 'amber';
        const Icon = isStructural ? HardHat : Wrench;
        const logs = project.milestones?.filter((m: any) => m.phase_context === role) || [];
        const baseDesigns = project.documents?.filter((d: any) => 
            d.category === 'engineering_base_design' && d.target_role === role
        ) || [];

        const externalVendor = project.external_vendors?.find((v: any) => v.phase_role === role);
        const profile = isStructural ? project.structural_profile : project.mep_profile;
        const isAssigned = isStructural ? (!!project.structural_id || !!externalVendor) : (!!project.mep_id || !!externalVendor);
        
        const paymentStatus = profile?.payment_status || 'unpaid';
        const displayName = profile?.name || externalVendor?.company_name || externalVendor?.contact_person || (isAssigned ? 'Hired Specialist' : 'Internal Team');

        return (
            <div className={`flex-1 bg-white border-2 border-${colorClass}-50 rounded-[2.5rem] p-8 shadow-sm hover:shadow-md transition-all relative overflow-hidden group`}>
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 bg-${colorClass}-50 text-${colorClass}-500 rounded-2xl flex items-center justify-center shadow-inner`}>
                            <Icon size={28} />
                        </div>
                        <div>
                            <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                                {isStructural ? 'Structural Engineer' : 'MEP Engineer'}
                            </h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                {isStructural ? 'Forces & Structural Calculations' : 'Mechanical, Electrical, Plumbing'}
                            </p>
                        </div>
                    </div>
                    <div className={`px-4 py-1.5 rounded-xl bg-${isAssigned ? 'emerald' : 'slate'}-50 text-${isAssigned ? 'emerald' : 'slate'}-600 text-[10px] font-black uppercase tracking-widest border border-${isAssigned ? 'emerald' : 'slate'}-100`}>
                        {isAssigned ? 'Assigned' : 'Open'}
                    </div>
                </div>

                {/* Specialist Info */}
                <div className="bg-slate-50 rounded-3xl p-4 flex items-center justify-between mb-6 border border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full bg-${colorClass}-500 text-white flex items-center justify-center font-black text-xs`}>
                            {displayName.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-900 uppercase">
                                {displayName}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                                    {profile ? 'Platform Hired' : externalVendor ? 'External Vendor' : 'Architect Managed Team'}
                                </p>
                                {isAssigned && (
                                    <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest ${
                                        (profile?.payment_status === 'paid' || externalVendor?.payment_status === 'paid') ? 'bg-emerald-100 text-emerald-600' : 
                                        (profile?.payment_status === 'verifying' || externalVendor?.payment_status === 'verifying') ? 'bg-amber-100 text-amber-600' : 
                                        'bg-red-100 text-red-600'
                                    }`}>
                                        {profile?.payment_status || externalVendor?.payment_status || 'unpaid'}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        <Clock size={12} />
                        {isAssigned ? 'Active Workspace' : 'Manual Entry'}
                    </div>
                </div>

                {/* Actions */}
                {isArchitect && (
                    <div className="space-y-3 mb-8">
                        <button 
                            disabled={isSubmitting}
                            onClick={() => handleUploadBaseDesign(role)}
                            className={`w-full py-4 border-2 border-dashed border-${colorClass}-200 text-${colorClass}-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-${colorClass}-50 transition-all flex items-center justify-center gap-2`}
                        >
                            <Upload size={14} />
                            Upload Base Design for Engineer
                        </button>
                        
                        {baseDesigns.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {baseDesigns.map((doc: any) => (
                                    <a key={doc.id} href={doc.file_path} target="_blank" className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg text-[8px] font-bold text-slate-600 hover:bg-slate-200">
                                        <FileText size={10} />
                                        {doc.file_name}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Log Feed */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h5 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Technical Progress Logs</h5>
                        {isArchitect && (
                            <button 
                                onClick={() => { setActiveRole(role); setShowLogForm(true); }}
                                className="p-1.5 bg-slate-900 text-white rounded-lg hover:scale-110 transition-transform"
                            >
                                <Plus size={12} />
                            </button>
                        )}
                    </div>
                    
                    <div className="min-h-[160px] bg-slate-50/50 rounded-[2rem] p-6 border border-dashed border-slate-200 flex flex-col gap-4">
                        {logs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center flex-1 text-slate-300 gap-3">
                                <Icon size={32} strokeWidth={1} />
                                <p className="text-[9px] font-black uppercase tracking-widest">No technical logs recorded yet.</p>
                            </div>
                        ) : (
                            logs.map((log: any) => (
                                <div key={log.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-start justify-between group/log">
                                    <div className="space-y-1">
                                        <h6 className="text-[11px] font-black text-slate-900 uppercase tracking-tight">{log.title}</h6>
                                        <p className="text-[9px] text-slate-500 font-medium leading-relaxed">{log.description}</p>
                                        {log.content?.gallery?.length > 0 && (
                                            <div className="flex gap-1 mt-2">
                                                {log.content.gallery.map((img: string, i: number) => (
                                                    <a key={i} href={`/storage/${img}`} target="_blank" className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200">
                                                        <FileText size={12} />
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {isArchitect && (
                                        <button 
                                            onClick={() => handleDeleteLog(log.id)}
                                            className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover/log:opacity-100 transition-all"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Decorative Pattern */}
                <div className={`absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none group-hover:scale-125 transition-transform`}>
                    <Icon size={120} />
                </div>
            </div>
        );
    };

    return (
        <ErrorBoundary name="EngineeringManualLogs">
            <div className="flex flex-col lg:flex-row gap-8 items-stretch">
                {renderBox('structural')}
                {renderBox('mep')}

                {/* Log Modal */}
                {showLogForm && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-slate-100">
                            <div className="flex justify-between items-center mb-8">
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Record Technical Log</h3>
                                <button onClick={() => setShowLogForm(false)} className="p-2 text-slate-400 hover:text-slate-900"><X size={20} /></button>
                            </div>

                            <form onSubmit={handleAddLog} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Log Title</label>
                                    <input 
                                        required
                                        value={logTitle}
                                        onChange={e => setLogTitle(e.target.value)}
                                        placeholder="e.g. Foundation Design Finalized"
                                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-slate-900 transition-all"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Description</label>
                                    <textarea 
                                        value={logDesc}
                                        onChange={e => setLogDesc(e.target.value)}
                                        placeholder="Add technical details or summary of progress..."
                                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold min-h-[100px] outline-none focus:border-slate-900 transition-all"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Attachments (Drawings/Specs)</label>
                                    <input 
                                        type="file" 
                                        multiple 
                                        onChange={e => setSelectedFiles(Array.from(e.target.files || []))}
                                        className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:uppercase file:bg-slate-900 file:text-white hover:file:bg-black cursor-pointer"
                                    />
                                </div>

                                <button 
                                    disabled={isSubmitting}
                                    className="w-full py-5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-900/20"
                                >
                                    {isSubmitting ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                    {isSubmitting ? 'Recording...' : 'Submit Technical Log'}
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </ErrorBoundary>
    );
}
