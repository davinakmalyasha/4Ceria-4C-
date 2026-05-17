import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    FileText, Upload, Trash2, Calendar, ClipboardCheck, 
    TrendingUp, Plus, X, Image as ImageIcon, CheckCircle2,
    AlertCircle, Activity, Layout, Edit
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../../../context/ToastContext';

interface PMReportsProps {
    project: any;
    user: any;
    onRefresh: () => void;
    initialFilter?: string;
    onClearFilter?: () => void;
}

export default function PMReports({ project, user, onRefresh, initialFilter, onClearFilter }: PMReportsProps) {
    const { showToast } = useToast();
    const [structuredReports, setStructuredReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingReport, setEditingReport] = useState<any>(null);

    // Form State
    const [summary, setSummary] = useState('');
    const [progress, setProgress] = useState(project.progress || 0);
    const [health, setHealth] = useState('on_track');
    const [phaseSlug, setPhaseSlug] = useState('');
    const [photos, setPhotos] = useState<File[]>([]);
    const [attachments, setAttachments] = useState<File[]>([]);
    const [existingPhotos, setExistingPhotos] = useState<string[]>([]);

    const isPM = Number(project.pm_id) === Number(user?.id);
    const timelinePhases = ['legal', 'design', 'build', 'materials', 'handover'];

    const fetchReports = async () => {
        try {
            const res = await axios.get(`/projects/${project.id}/reports`);
            setStructuredReports(res.data);
        } catch (err) {
            console.error('Failed to fetch reports:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, [project.id]);

    const handleEdit = (report: any) => {
        setEditingReport(report);
        setSummary(report.summary);
        setProgress(report.progress_percentage);
        setHealth(report.budget_health);
        setPhaseSlug(report.phase_slug || '');
        setPhotos([]);
        setExistingPhotos(report.site_photos || []);
        setIsCreating(true);
    };

    const resetForm = () => {
        setEditingReport(null);
        setSummary('');
        setProgress(project.progress || 0);
        setHealth('on_track');
        setPhaseSlug('');
        setPhotos([]);
        setAttachments([]);
        setExistingPhotos([]);
        setIsCreating(false);
    };

    const handleSubmitReport = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const formData = new FormData();
            formData.append('summary', summary);
            formData.append('progress_percentage', progress.toString());
            formData.append('budget_health', health);
            formData.append('phase_slug', phaseSlug);
            
            // Handle Photos
            photos.forEach(file => formData.append('photos[]', file));
            
            // Handle Attachments
            attachments.forEach(file => formData.append('attachments[]', file));

            if (editingReport) {
                formData.append('_method', 'PUT');
                existingPhotos.forEach(path => formData.append('existing_photos[]', path));
                
                await axios.post(`/projects/${project.id}/reports/${editingReport.id}`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                showToast('Report updated!', 'success');
            } else {
                await axios.post(`/projects/${project.id}/reports`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                showToast('Executive report published!', 'success');
            }
            resetForm();
            fetchReports();
            onRefresh();
        } catch (err: any) {
            console.error('Failed to save report:', err);
            const validationErrors = err.response?.data?.errors;
            let errorMessage = err.response?.data?.message || 'Failed to save report';
            
            if (validationErrors) {
                const firstError = Object.values(validationErrors)[0] as string[];
                if (firstError && firstError.length > 0) {
                    errorMessage = firstError[0];
                }
            }
            
            showToast(errorMessage, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteReport = async (id: number) => {
        if (!confirm('Permanently delete this executive report?')) return;
        try {
            await axios.delete(`/projects/${project.id}/reports/${id}`);
            showToast('Report removed.', 'info');
            fetchReports();
        } catch (err) {
            showToast('Failed to delete report', 'error');
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Executive Reports</h2>
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">Strategic Progress & Stakeholder Updates</p>
                </div>
                
                {isPM && (
                    <button 
                        onClick={() => setIsCreating(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white hover:bg-black rounded-2xl shadow-lg shadow-gray-200 transition-all active:scale-95"
                    >
                        <Plus size={18} />
                        <span className="text-xs font-black uppercase tracking-widest">Create Weekly Report</span>
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between px-1">
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Weekly Intelligence Feed</h3>
                        {initialFilter && (
                            <button 
                                onClick={onClearFilter}
                                className="flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-indigo-100 transition-all"
                            >
                                <X size={12} />
                                Phase: {initialFilter} (Clear)
                            </button>
                        )}
                    </div>
                    
                    {loading ? (
                        <div className="space-y-4">
                            {[1, 2].map(i => <div key={i} className="h-48 bg-gray-50 rounded-[2.5rem] animate-pulse" />)}
                        </div>
                    ) : structuredReports.filter(r => !initialFilter || r.phase_slug === initialFilter).length === 0 ? (
                        <div className="bg-gray-50/50 rounded-[2.5rem] p-16 text-center border border-dashed border-gray-200">
                            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-4 text-gray-300">
                                <FileText size={32} />
                            </div>
                            <p className="text-gray-500 font-bold text-sm">No executive data found.</p>
                            <p className="text-gray-400 text-xs mt-1">
                                {initialFilter ? `There are no reports linked to the ${initialFilter} phase yet.` : 'Publish structured reports to keep stakeholders informed of strategic progress.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Structured Reports */}
                            {structuredReports
                                .filter(report => !initialFilter || report.phase_slug === initialFilter)
                                .map((report) => (
                                <div key={report.id} className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden group hover:border-gray-200 transition-all">
                                    <div className="p-8">
                                        <div className="flex items-start justify-between mb-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-900">
                                                    <Calendar size={20} />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Week of {new Date(report.published_at).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</p>
                                                        {report.phase_slug && (
                                                            <>
                                                                <span className="text-[10px] text-gray-300">•</span>
                                                                <span className="px-2 py-0.5 bg-gray-900 text-white text-[8px] font-black uppercase tracking-tighter rounded-md flex items-center gap-1">
                                                                    <Layout size={8} />
                                                                    {report.phase_slug.charAt(0).toUpperCase() + report.phase_slug.slice(1)} Phase
                                                                </span>
                                                                {initialFilter === report.phase_slug && (
                                                                    <span className="px-2 py-0.5 bg-red-500 text-white text-[8px] font-black uppercase tracking-tighter rounded-md flex items-center gap-1 shadow-sm shadow-red-200">
                                                                        Linked
                                                                    </span>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                    <h4 className="text-sm font-black text-gray-900">
                                                        {new Date(report.published_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })} Update
                                                    </h4>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                                    report.budget_health === 'on_track' ? 'bg-emerald-50 text-emerald-600' :
                                                    report.budget_health === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                                                }`}>
                                                    <Activity size={12} />
                                                    {report.budget_health.replace('_', ' ')}
                                                </div>
                                                {isPM && (
                                                    <div className="flex items-center gap-1">
                                                        <button 
                                                            onClick={() => handleEdit(report)}
                                                            className="p-2 text-gray-300 hover:text-indigo-500 transition-colors"
                                                        >
                                                            <Edit size={16} />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDeleteReport(report.id)} 
                                                            className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="prose prose-sm max-w-none text-gray-600 font-medium leading-relaxed mb-8">
                                            {report.summary}
                                        </div>

                                        {/* Photos Grid (Images Only) */}
                                        {report.site_photos?.filter((url: string) => /\.(jpg|jpeg|png|webp|gif)$/i.test(url)).length > 0 && (
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                                                {report.site_photos.filter((url: string) => /\.(jpg|jpeg|png|webp|gif)$/i.test(url)).map((url: string, i: number) => (
                                                    <a 
                                                        key={i} 
                                                        href={`/storage/${url}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="aspect-square bg-gray-50 rounded-2xl overflow-hidden shadow-inner border border-gray-100 group/img relative"
                                                    >
                                                        <img 
                                                            src={`/storage/${url}`} 
                                                            className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-500"
                                                        />
                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-all">
                                                            <div className="px-4 py-2 bg-white rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-900 shadow-xl">
                                                                View
                                                            </div>
                                                        </div>
                                                    </a>
                                                ))}
                                            </div>
                                        )}

                                        {/* Attachments Section (Including legacy files) */}
                                        {( (report.attachments && report.attachments.length > 0) || (report.site_photos?.filter((url: string) => !/\.(jpg|jpeg|png|webp|gif)$/i.test(url)).length > 0) ) && (
                                            <div className="space-y-2 mb-8">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                    <FileText size={12} className="text-amber-500" />
                                                    Strategic Attachments
                                                </p>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                    {/* New Attachments */}
                                                    {report.attachments?.map((file: any, idx: number) => (
                                                        <a 
                                                            key={`new-${idx}`}
                                                            href={`/storage/${file.path}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-3 p-3 bg-gray-50 hover:bg-amber-50 border border-gray-100 hover:border-amber-100 rounded-2xl transition-all group"
                                                        >
                                                            <div className="p-2 bg-white rounded-xl shadow-sm text-amber-500 group-hover:scale-110 transition-transform">
                                                                <FileText size={18} />
                                                            </div>
                                                            <div className="flex flex-col min-w-0">
                                                                <span className="text-[10px] font-black text-gray-900 truncate">{file.name}</span>
                                                                <span className="text-[8px] font-bold text-gray-400 uppercase">{(file.size / 1024).toFixed(1)} KB</span>
                                                            </div>
                                                        </a>
                                                    ))}

                                                    {/* Legacy Files (Uploaded as photos) */}
                                                    {report.site_photos?.filter((url: string) => !/\.(jpg|jpeg|png|webp|gif)$/i.test(url)).map((url: string, i: number) => (
                                                        <a 
                                                            key={`legacy-${i}`}
                                                            href={`/storage/${url}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-3 p-3 bg-gray-50 hover:bg-amber-50 border border-gray-100 hover:border-amber-100 rounded-2xl transition-all group"
                                                        >
                                                            <div className="p-2 bg-white rounded-xl shadow-sm text-amber-500 group-hover:scale-110 transition-transform">
                                                                <FileText size={18} />
                                                            </div>
                                                            <div className="flex flex-col min-w-0">
                                                                <span className="text-[10px] font-black text-gray-900 truncate">{url.split('/').pop()}</span>
                                                                <span className="text-[8px] font-bold text-gray-400 uppercase">Legacy File</span>
                                                            </div>
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="pt-6 border-t border-gray-50 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center font-black text-xs">
                                                    {report.progress_percentage}%
                                                </div>
                                                <div className="w-32 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${report.progress_percentage}%` }} />
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Submitted by</span>
                                                <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">{report.creator?.name}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}

                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    <div className="bg-emerald-600 rounded-[2.5rem] p-8 text-white shadow-xl shadow-emerald-100 sticky top-24">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-white/20 rounded-xl">
                                <TrendingUp size={20} />
                            </div>
                            <h4 className="text-xs font-black uppercase tracking-widest">Executive Health</h4>
                        </div>
                        
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="opacity-80">Phase Completion</span>
                                    <span className="font-black">{project.progress || 0}%</span>
                                </div>
                                <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                                    <motion.div 
                                        initial={{ width: 0 }}
                                        animate={{ width: `${project.progress || 0}%` }}
                                        className="h-full bg-white"
                                    />
                                </div>
                            </div>

                            <div className="pt-6 border-t border-white/10 space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Transparency Score</span>
                                    <span className="text-xs font-black">{Math.min(structuredReports.length * 20, 100)}%</span>
                                </div>
                                <p className="text-[10px] opacity-70 leading-relaxed italic">
                                    "Transparent reporting builds trust and accelerates project decision-making."
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Create Report Modal */}
            <AnimatePresence>
                {isCreating && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => !isSubmitting && setIsCreating(false)}
                            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden"
                        >
                            <div className="flex items-center justify-between p-8 border-b border-gray-100">
                                <div>
                                    <h3 className="text-xl font-black text-gray-900">{editingReport ? 'Edit Executive Report' : 'New Executive Report'}</h3>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Building Stakeholder Confidence</p>
                                </div>
                                <button onClick={resetForm} className="p-2 hover:bg-gray-50 rounded-xl transition-all">
                                    <X size={20} className="text-gray-400" />
                                </button>
                            </div>

                            <form onSubmit={handleSubmitReport} className="p-8 space-y-8">
                                {/* Executive Summary */}
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-gray-900">
                                        <FileText size={16} />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Executive Summary</span>
                                    </div>
                                    <textarea 
                                        required
                                        value={summary}
                                        onChange={(e) => setSummary(e.target.value)}
                                        placeholder="Briefly explain the key milestones, wins, or blockers for this week..."
                                        className="w-full h-32 p-5 bg-gray-50 rounded-[1.5rem] border-2 border-transparent focus:border-gray-900 focus:bg-white transition-all text-sm font-medium resize-none"
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Progress Slider */}
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between text-gray-900">
                                            <div className="flex items-center gap-2">
                                                <TrendingUp size={16} />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Progress %</span>
                                            </div>
                                            <span className="text-sm font-black">{progress}%</span>
                                        </div>
                                        <input 
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={progress}
                                            onChange={(e) => setProgress(Number(e.target.value))}
                                            className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-gray-900"
                                        />
                                    </div>

                                    {/* Budget Health */}
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-gray-900">
                                            <AlertCircle size={16} />
                                            <span className="text-[10px] font-black uppercase tracking-widest">Budget Health</span>
                                        </div>
                                        <select 
                                            value={health}
                                            onChange={(e) => setHealth(e.target.value)}
                                            className="w-full p-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-gray-900 transition-all text-sm font-bold appearance-none cursor-pointer"
                                        >
                                            <option value="on_track">🟢 On Track</option>
                                            <option value="warning">🟡 Warning</option>
                                            <option value="critical">🔴 Critical</option>
                                        </select>
                                    </div>

                                    {/* Timeline Link */}
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-gray-900">
                                            <Activity size={16} />
                                            <span className="text-[10px] font-black uppercase tracking-widest">Related Timeline Phase</span>
                                        </div>
                                        <select 
                                            value={phaseSlug}
                                            onChange={(e) => setPhaseSlug(e.target.value)}
                                            className="w-full p-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-gray-900 transition-all text-sm font-bold appearance-none cursor-pointer"
                                        >
                                            <option value="">No Specific Phase</option>
                                            {timelinePhases.map(phase => (
                                                <option key={phase} value={phase}>
                                                    {phase.charAt(0).toUpperCase() + phase.slice(1)} Phase
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Photos */}
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-gray-900">
                                        <ImageIcon size={16} />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Site Photos (Optional)</span>
                                    </div>
                                    <div className="flex flex-wrap gap-3">
                                        {/* Existing Photos */}
                                        {existingPhotos.map((path, idx) => (
                                            <div key={`existing-${idx}`} className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-indigo-100 group">
                                                <img src={`/storage/${path}`} className="w-full h-full object-cover" />
                                                <button 
                                                    type="button"
                                                    onClick={() => setExistingPhotos(existingPhotos.filter((_, i) => i !== idx))}
                                                    className="absolute inset-0 bg-red-500/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                                                >
                                                    <Trash2 size={16} className="text-white" />
                                                </button>
                                                <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-indigo-500 text-[6px] text-white font-black rounded-md uppercase tracking-tighter">
                                                    Stored
                                                </div>
                                            </div>
                                        ))}

                                        {/* New Photos */}
                                        {photos.map((file, idx) => (
                                            <div key={idx} className="relative">
                                                <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-200 overflow-hidden">
                                                    <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" />
                                                    <span className="absolute top-1 left-1 px-1 bg-emerald-500 text-[8px] font-black text-white rounded uppercase">New</span>
                                                </div>
                                                <button 
                                                    type="button"
                                                    onClick={() => setPhotos(prev => prev.filter((_, i) => i !== idx))}
                                                    className="absolute -top-2 -right-2 p-1 bg-gray-900 text-white rounded-full shadow-lg"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ))}
                                        
                                        <label className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 hover:border-indigo-500 hover:bg-indigo-50/30 transition-all flex flex-col items-center justify-center cursor-pointer group">
                                            <Plus size={20} className="text-gray-300 group-hover:text-indigo-500 transition-colors" />
                                            <span className="text-[8px] font-black text-gray-300 uppercase mt-1 group-hover:text-indigo-500">Add Photo</span>
                                            <input 
                                                type="file" 
                                                multiple 
                                                accept="image/*"
                                                className="hidden" 
                                                onChange={(e) => {
                                                    if (e.target.files) {
                                                        setPhotos(prev => [...prev, ...Array.from(e.target.files!)]);
                                                    }
                                                }}
                                            />
                                        </label>
                                    </div>
                                </div>

                                {/* File Attachments */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                            <FileText size={14} className="text-amber-500" />
                                            Executive Attachments (PDFs, Docs, etc.)
                                        </label>
                                        <span className="text-[10px] font-bold text-gray-300 italic">Optional</span>
                                    </div>
                                    
                                    <div className="space-y-2">
                                        {attachments.map((file, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-3 bg-amber-50/50 border border-amber-100 rounded-xl">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-white rounded-lg shadow-sm">
                                                        <FileText size={16} className="text-amber-600" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-black text-gray-900 truncate max-w-[200px]">{file.name}</p>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase">{(file.size / 1024).toFixed(1)} KB</p>
                                                    </div>
                                                </div>
                                                <button 
                                                    type="button"
                                                    onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                                                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        ))}
                                        
                                        <label className="block w-full p-4 border-2 border-dashed border-gray-100 rounded-2xl hover:border-amber-300 hover:bg-amber-50/30 transition-all cursor-pointer text-center group">
                                            <div className="flex items-center justify-center gap-2">
                                                <Upload size={16} className="text-gray-300 group-hover:text-amber-500 transition-colors" />
                                                <span className="text-xs font-black text-gray-400 uppercase tracking-widest group-hover:text-amber-500">Upload Stakeholder Documents</span>
                                            </div>
                                            <input 
                                                type="file" 
                                                multiple 
                                                className="hidden" 
                                                onChange={(e) => {
                                                    if (e.target.files) {
                                                        setAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
                                                    }
                                                }}
                                            />
                                        </label>
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-3 pt-6">
                                    <button 
                                        type="button"
                                        onClick={resetForm}
                                        className="px-6 py-3 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-gray-900 transition-all"
                                    >
                                        Discard
                                    </button>
                                    <button 
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-100 transition-all flex items-center gap-2"
                                    >
                                        {isSubmitting ? (
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <CheckCircle2 size={18} />
                                        )}
                                        {editingReport ? 'Update Report' : 'Publish Report'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
