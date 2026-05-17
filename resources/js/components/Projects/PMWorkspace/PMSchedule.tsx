import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    CalendarRange, Clock, AlertTriangle, CheckCircle2,
    Plus, Activity, TrendingUp, History, X, Save,
    Calendar, ClipboardList, AlertCircle, FileText, Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../../../context/ToastContext';

interface PMScheduleProps {
    project: any;
    user: any;
    onRefresh?: () => void;
    onNavigateToReports?: (phase?: string) => void;
}

export default function PMSchedule({ project, user, onRefresh, onNavigateToReports }: PMScheduleProps) {
    const { showToast } = useToast();
    const [timeline, setTimeline] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isManaging, setIsManaging] = useState(false);
    const [isLoggingDelay, setIsLoggingDelay] = useState(false);
    const [isCreatingReport, setIsCreatingReport] = useState(false);
    const [selectedPhase, setSelectedPhase] = useState<any>(null);
    const [submitting, setSubmitting] = useState(false);

    // Form States
    const [phaseData, setPhaseData] = useState<any>({
        target_start_date: '',
        target_end_date: '',
        status: 'pending',
        progress_percentage: 0,
        notes: ''
    });

    const [delayData, setDelayData] = useState({
        days: 1,
        reason: '',
        category: 'weather',
        logged_at: new Date().toISOString().split('T')[0]
    });

    const [reportData, setReportData] = useState({
        summary: '',
        progress_percentage: 0,
        budget_health: 'on_track',
        photos: [] as File[]
    });

    const isPM = Number(project.pm_id) === Number(user?.id);

    const fetchTimeline = async () => {
        try {
            const res = await axios.get(`/projects/${project.id}/schedules`);
            setTimeline(res.data);
        } catch (err) {
            console.error('Failed to fetch timeline:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTimeline();
    }, [project.id]);

    const handleOpenManager = (phase: any) => {
        setSelectedPhase(phase);
        setPhaseData({
            target_start_date: phase.target_start_date || '',
            target_end_date: phase.target_end_date || '',
            status: phase.status,
            progress_percentage: phase.progress_percentage,
            notes: phase.notes || ''
        });
        setIsManaging(true);
    };

    const handleUpdatePhase = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await axios.put(`/projects/${project.id}/schedules/${selectedPhase.id}`, phaseData);
            showToast('Schedule updated successfully', 'success');
            setIsManaging(false);
            fetchTimeline();
            onRefresh?.();
        } catch (err: any) {
            console.error('Failed to update schedule:', err);
            const errors = err.response?.data?.errors;
            let message = err.response?.data?.message || 'Failed to update schedule';
            
            if (errors) {
                const firstError = Object.values(errors)[0];
                if (Array.isArray(firstError)) message = firstError[0];
            }
            
            showToast(message, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleLogDelay = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await axios.post(`/projects/${project.id}/delays`, {
                ...delayData,
                phase_slug: selectedPhase.phase_slug
            });
            showToast('Delay logged and stakeholders notified', 'info');
            setIsLoggingDelay(false);
            fetchTimeline();
        } catch (err: any) {
            console.error('Failed to log delay:', err);
            const errors = err.response?.data?.errors;
            let message = err.response?.data?.message || 'Failed to log delay';
            
            if (errors) {
                const firstError = Object.values(errors)[0];
                if (Array.isArray(firstError)) message = firstError[0];
            }
            
            showToast(message, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCreateReport = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('summary', reportData.summary);
            formData.append('progress_percentage', reportData.progress_percentage.toString());
            formData.append('budget_health', reportData.budget_health);
            formData.append('phase_slug', selectedPhase.phase_slug);
            reportData.photos.forEach(file => formData.append('photos[]', file));

            await axios.post(`/projects/${project.id}/reports`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            showToast('Phase report published!', 'success');
            setIsCreatingReport(false);
            fetchTimeline();
        } catch (err: any) {
            console.error('Failed to publish report:', err);
            const errors = err.response?.data?.errors;
            let message = err.response?.data?.message || 'Failed to publish report';
            
            if (errors) {
                const firstError = Object.values(errors)[0];
                if (Array.isArray(firstError)) message = firstError[0];
            }
            
            showToast(message, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleOpenReportBuilder = (phase: any) => {
        setSelectedPhase(phase);
        setReportData({
            summary: '',
            progress_percentage: phase.progress_percentage,
            budget_health: 'on_track',
            photos: []
        });
        setIsCreatingReport(true);
    };

    const resetForm = () => {
        setIsManaging(false);
        setIsLoggingDelay(false);
        setIsCreatingReport(false);
        setSelectedPhase(null);
        setPhaseData({
            target_start_date: '',
            target_end_date: '',
            status: 'pending',
            progress_percentage: 0,
            notes: ''
        });
        setReportData({
            summary: '',
            progress_percentage: 0,
            budget_health: 'on_track',
            photos: []
        });
    };

    const handleLinkReport = async (reportId: number) => {
        setSubmitting(true);
        try {
            await axios.put(`/projects/${project.id}/reports/${reportId}`, {
                phase_slug: selectedPhase.phase_slug
            });
            showToast('Report linked to timeline!', 'success');
            setIsCreatingReport(false);
            fetchTimeline();
        } catch (err) {
            showToast('Failed to link report', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="p-20 text-center text-gray-400 font-bold uppercase tracking-widest animate-pulse">Initializing Master Plan...</div>;
    if (!timeline) return <div className="p-20 text-center text-gray-400 font-bold uppercase tracking-widest">Failed to load timeline. Please refresh.</div>;

    const { schedules = [], delays = [], unlinked_reports = [], summary = { completion_percentage: 0, total_delay_days: 0, current_phase: 'None' } } = timeline;

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-12">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h2 className="text-3xl font-black text-gray-900 tracking-tight">Execution Timeline</h2>
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">Strategic Scheduling & Delay Management</p>
                </div>

                <div className="flex items-center gap-6">
                    <div className="text-right">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Project Progress</p>
                        <div className="flex items-center gap-3">
                            <span className="text-xl font-black text-gray-900">{summary.completion_percentage}%</span>
                            <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${summary.completion_percentage}%` }}
                                    className="h-full bg-emerald-500"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Main Timeline Feed */}
                <div className="lg:col-span-3 space-y-6">
                    <div className="bg-white rounded-[2.5rem] border border-gray-100 p-10 shadow-sm relative overflow-hidden">
                        <div className="flex items-center justify-between mb-12">
                            <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Master Execution Flow</h3>
                            <div className="flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest rounded-lg">
                                <Activity size={12} />
                                Live Tracker Active
                            </div>
                        </div>

                        <div className="space-y-0">
                            {schedules.map((phase: any, i: number) => {
                                const isCompleted = phase.status === 'completed';
                                const isActive = phase.status === 'active';
                                const isDelayed = phase.status === 'delayed';

                                return (
                                    <div key={phase.id} className="relative pl-12 pb-12 last:pb-0">
                                        {/* Connector */}
                                        {i !== schedules.length - 1 && (
                                            <div className={`absolute left-[1.125rem] top-9 bottom-0 w-0.5 ${isCompleted ? 'bg-emerald-500' : 'bg-gray-100'}`} />
                                        )}

                                        {/* Indicator */}
                                        <div className={`
                                            absolute left-0 top-0 w-10 h-10 rounded-2xl flex items-center justify-center z-10 transition-all duration-500
                                            ${isCompleted ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-100' :
                                                isActive ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 scale-110' :
                                                    isDelayed ? 'bg-rose-500 text-white shadow-xl shadow-rose-100 animate-pulse' :
                                                        'bg-white border-2 border-gray-100 text-gray-300'}
                                        `}>
                                            {isCompleted ? <CheckCircle2 size={20} /> : <span className="text-sm font-black">{i + 1}</span>}
                                        </div>

                                        <div className="group bg-gray-50/50 hover:bg-white hover:shadow-xl hover:shadow-gray-100 border border-transparent hover:border-gray-100 p-6 rounded-[2rem] transition-all flex flex-col md:flex-row md:items-center justify-between gap-6">
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-3">
                                                    <h4 className={`text-base font-black uppercase tracking-tight ${isCompleted ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                                                        {phase.phase_slug.replace('_', ' ')} Phase
                                                    </h4>
                                                    {isActive && (
                                                        <span className="px-2 py-0.5 bg-indigo-500 text-white text-[8px] font-black uppercase tracking-widest rounded">In Progress</span>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] font-bold text-gray-400">
                                                    <div className="flex items-center gap-1.5">
                                                        <Calendar size={12} />
                                                        <span>Target: {phase.target_end_date ? new Date(phase.target_end_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <TrendingUp size={12} />
                                                        <span>{phase.progress_percentage}% Done</span>
                                                    </div>
                                                    {phase.report_count > 0 && (
                                                        <button
                                                            onClick={() => onNavigateToReports?.(phase.phase_slug)}
                                                            className="flex items-center gap-1.5 text-indigo-600 font-black hover:text-indigo-800 hover:bg-indigo-50 px-2 py-0.5 rounded-md transition-all cursor-pointer group/link"
                                                        >
                                                            <FileText size={12} className="group-hover/link:scale-110 transition-transform" />
                                                            <span>{phase.report_count} {phase.report_count === 1 ? 'Report' : 'Reports'} Linked</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {isPM && (
                                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => handleOpenReportBuilder(phase)}
                                                        className="px-4 py-2 text-indigo-600 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 rounded-xl transition-all flex items-center gap-2"
                                                    >
                                                        <Plus size={14} />
                                                        Add Report
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedPhase(phase);
                                                            setIsLoggingDelay(true);
                                                        }}
                                                        className="px-4 py-2 text-rose-600 text-[10px] font-black uppercase tracking-widest hover:bg-rose-50 rounded-xl transition-all"
                                                    >
                                                        Log Delay
                                                    </button>
                                                    <button
                                                        onClick={() => handleOpenManager(phase)}
                                                        className="px-5 py-2.5 bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-black transition-all shadow-lg shadow-gray-200"
                                                    >
                                                        Adjust Schedule
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Sidebar Context */}
                <div className="space-y-6">
                    {/* Project Health Card */}
                    <div className="bg-gray-50 rounded-[2.5rem] p-8 border border-gray-100">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2.5 bg-amber-100 text-amber-600 rounded-2xl">
                                <AlertTriangle size={20} />
                            </div>
                            <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Temporal Health</h4>
                        </div>

                        <div className={`p-6 rounded-3xl shadow-sm border-l-4 ${summary.total_delay_days > 0 ? 'bg-rose-50 border-rose-500' : 'bg-emerald-50 border-emerald-500'}`}>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Execution Status</p>
                            <p className="text-sm font-black text-gray-900 leading-tight">
                                {summary.total_delay_days > 0
                                    ? `Project is currently delayed by ${summary.total_delay_days} days across phases.`
                                    : 'All systems green. Project is proceeding on schedule.'}
                            </p>
                        </div>
                    </div>

                    {/* Timeline Summary Card */}
                    <div className="bg-gray-900 rounded-[3rem] p-8 text-white shadow-2xl shadow-gray-200 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10">
                            <Clock size={100} />
                        </div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-8">
                                <div className="p-2.5 bg-white/20 rounded-2xl text-white">
                                    <History size={20} />
                                </div>
                                <h4 className="text-xs font-black uppercase tracking-widest opacity-80">Timeline Pulse</h4>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest opacity-50 mb-2 font-bold">Total Logged Delays</p>
                                    <p className="text-2xl font-black">{summary.total_delay_days} <span className="text-xs opacity-50">Days</span></p>
                                </div>
                                <div className="pt-6 border-t border-white/10">
                                    <p className="text-[10px] uppercase tracking-widest opacity-50 mb-2 font-bold">Current Milestone</p>
                                    <p className="text-xs font-black uppercase tracking-widest text-indigo-400">{summary.current_phase?.replace('_', ' ') || 'None'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Phase Manager Modal */}
            <AnimatePresence>
                {isManaging && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={resetForm}
                            className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="relative w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
                        >
                            <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Phase Management</h3>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Adjusting {selectedPhase?.phase_slug.replace('_', ' ')}</p>
                                </div>
                                <button onClick={() => setIsManaging(false)} className="p-2 hover:bg-gray-50 rounded-xl text-gray-400 transition-colors">
                                    <X size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleUpdatePhase} className="p-8 space-y-8">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Target Start</label>
                                        <input
                                            type="date"
                                            value={phaseData.target_start_date}
                                            onChange={e => setPhaseData({ ...phaseData, target_start_date: e.target.value })}
                                            className="w-full p-4 bg-gray-50 rounded-2xl border-none text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Target End</label>
                                        <input
                                            type="date"
                                            value={phaseData.target_end_date}
                                            onChange={e => setPhaseData({ ...phaseData, target_end_date: e.target.value })}
                                            className="w-full p-4 bg-gray-50 rounded-2xl border-none text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Phase Status</label>
                                        <select
                                            value={phaseData.status}
                                            onChange={e => setPhaseData({ ...phaseData, status: e.target.value })}
                                            className="w-full p-4 bg-gray-50 rounded-2xl border-none text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 transition-all appearance-none cursor-pointer"
                                        >
                                            <option value="pending">Pending</option>
                                            <option value="active">Active (In Progress)</option>
                                            <option value="completed">Completed</option>
                                            <option value="delayed">Delayed</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Progress % ({phaseData.progress_percentage}%)</label>
                                        <div className="flex items-center gap-4 px-4 py-4 bg-gray-50 rounded-2xl">
                                            <input
                                                type="range" min="0" max="100"
                                                value={phaseData.progress_percentage}
                                                onChange={e => setPhaseData({ ...phaseData, progress_percentage: Number(e.target.value) })}
                                                className="flex-1 accent-indigo-600"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Phase Notes (Optional)</label>
                                    <textarea
                                        value={phaseData.notes}
                                        onChange={e => setPhaseData({ ...phaseData, notes: e.target.value })}
                                        className="w-full h-24 p-5 bg-gray-50 rounded-2xl border-none text-sm font-medium resize-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                        placeholder="Add internal notes for this phase..."
                                    />
                                </div>

                                <div className="flex items-center justify-end gap-3 pt-6">
                                    <button
                                        type="button" onClick={() => setIsManaging(false)}
                                        className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-900 transition-colors"
                                    >
                                        Discard
                                    </button>
                                    <button
                                        type="submit" disabled={submitting}
                                        className="px-8 py-3 bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-black transition-all shadow-lg shadow-gray-200 flex items-center gap-2"
                                    >
                                        {submitting ? <Activity className="animate-spin" size={16} /> : <Save size={16} />}
                                        Apply Schedule Update
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Delay Logger Modal */}
            <AnimatePresence>
                {isLoggingDelay && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setIsLoggingDelay(false)}
                            className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="relative w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
                        >
                            <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Log Project Delay</h3>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Impact Analysis: {selectedPhase?.phase_slug.replace('_', ' ')}</p>
                                </div>
                                <button onClick={() => setIsLoggingDelay(false)} className="p-2 hover:bg-gray-50 rounded-xl text-gray-400 transition-colors">
                                    <X size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleLogDelay} className="p-8 space-y-8">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Delay Duration</label>
                                        <div className="flex items-center gap-3 p-4 bg-rose-50 rounded-2xl border border-rose-100">
                                            <Clock className="text-rose-500" size={18} />
                                            <input
                                                type="number" min="1"
                                                value={delayData.days}
                                                onChange={e => setDelayData({ ...delayData, days: Number(e.target.value) })}
                                                className="bg-transparent border-none text-lg font-black text-rose-900 w-full focus:ring-0"
                                            />
                                            <span className="text-[10px] font-black uppercase text-rose-900">Days</span>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Delay Category</label>
                                        <select
                                            value={delayData.category}
                                            onChange={e => setDelayData({ ...delayData, category: e.target.value })}
                                            className="w-full p-4 bg-gray-50 rounded-2xl border-none text-sm font-bold focus:ring-2 focus:ring-rose-500/10 transition-all cursor-pointer"
                                        >
                                            <option value="weather">Weather Conditions</option>
                                            <option value="materials">Supply Chain / Materials</option>
                                            <option value="labor">Labor Shortage</option>
                                            <option value="permits">Administrative / Permits</option>
                                            <option value="design_change">Client Design Change</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Strategic Reason</label>
                                    <textarea
                                        required
                                        value={delayData.reason}
                                        onChange={e => setDelayData({ ...delayData, reason: e.target.value })}
                                        className="w-full h-32 p-5 bg-gray-50 rounded-2xl border-none text-sm font-medium resize-none focus:ring-2 focus:ring-rose-500/10 transition-all"
                                        placeholder="Explain the root cause and impact on the master schedule..."
                                    />
                                </div>

                                <div className="flex items-center justify-end gap-3 pt-6">
                                    <button
                                        type="button" onClick={() => setIsLoggingDelay(false)}
                                        className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-900 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit" disabled={submitting}
                                        className="px-8 py-3 bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-rose-700 transition-all shadow-lg shadow-rose-100 flex items-center gap-2"
                                    >
                                        {submitting ? <Activity className="animate-spin" size={16} /> : <AlertCircle size={16} />}
                                        Seal & Log Delay
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* Quick Report Modal */}
            <AnimatePresence>
                {isCreatingReport && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={resetForm}
                            className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
                        >
                            <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Phase Intelligence Report</h3>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Linking Evidence to: {selectedPhase?.phase_slug.replace('_', ' ')}</p>
                                </div>
                                <button onClick={resetForm} className="p-2 hover:bg-gray-50 rounded-xl text-gray-400 transition-colors">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
                                {unlinked_reports.length > 0 && (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Link Existing Reports</label>
                                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[8px] font-black rounded-full uppercase tracking-widest">{unlinked_reports.length} Available</span>
                                        </div>
                                        <div className="grid gap-3">
                                            {unlinked_reports.map((report: any) => (
                                                <div key={report.id} className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 flex items-center justify-between group hover:bg-white hover:shadow-lg hover:shadow-indigo-50/50 transition-all">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 bg-white rounded-xl text-indigo-500 shadow-sm">
                                                            <FileText size={16} />
                                                        </div>
                                                        <div className="max-w-[200px]">
                                                            <p className="text-xs font-black text-gray-900 truncate uppercase tracking-tight">{report.summary}</p>
                                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{new Date(report.created_at).toLocaleDateString()}</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleLinkReport(report.id)}
                                                        className="px-4 py-2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all opacity-0 group-hover:opacity-100"
                                                    >
                                                        Link
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-4 py-4">
                                            <div className="flex-1 h-px bg-gray-100" />
                                            <span className="text-[8px] font-black text-gray-300 uppercase tracking-[0.2em]">OR CREATE NEW</span>
                                            <div className="flex-1 h-px bg-gray-100" />
                                        </div>
                                    </div>
                                )}

                                <form onSubmit={handleCreateReport} className="space-y-8">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Executive Summary</label>
                                        <textarea
                                            required
                                            value={reportData.summary}
                                            onChange={e => setReportData({ ...reportData, summary: e.target.value })}
                                            className="w-full h-32 p-5 bg-gray-50 rounded-2xl border-none text-sm font-medium resize-none focus:ring-2 focus:ring-indigo-500/10 transition-all"
                                            placeholder="What happened in this phase this week?"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Phase Health</label>
                                            <select
                                                value={reportData.budget_health}
                                                onChange={e => setReportData({ ...reportData, budget_health: e.target.value })}
                                                className="w-full p-4 bg-gray-50 rounded-2xl border-none text-sm font-bold focus:ring-2 focus:ring-indigo-500/10 transition-all cursor-pointer"
                                            >
                                                <option value="on_track">🟢 On Track</option>
                                                <option value="warning">🟡 Attention</option>
                                                <option value="critical">🔴 Critical</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Progress ({reportData.progress_percentage}%)</label>
                                            <div className="px-4 py-4 bg-gray-50 rounded-2xl">
                                                <input
                                                    type="range" min="0" max="100"
                                                    value={reportData.progress_percentage}
                                                    onChange={e => setReportData({ ...reportData, progress_percentage: Number(e.target.value) })}
                                                    className="w-full accent-indigo-600 cursor-pointer"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Site Evidence (Photos)</label>
                                        <div className="flex flex-wrap gap-3">
                                            {reportData.photos.map((file, idx) => (
                                                <div key={idx} className="relative w-20 h-20 rounded-2xl overflow-hidden group border-2 border-indigo-100">
                                                    <img 
                                                        src={file instanceof File ? URL.createObjectURL(file) : ''} 
                                                        className="w-full h-full object-cover" 
                                                        onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                                                    />
                                                    <button
                                                        type="button" onClick={() => setReportData({ ...reportData, photos: reportData.photos.filter((_, i) => i !== idx) })}
                                                        className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                                                    >
                                                        <X size={16} className="text-white" />
                                                    </button>
                                                </div>
                                            ))}
                                            <label className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50/30 transition-all group">
                                                <ImageIcon className="text-gray-300 group-hover:text-indigo-500" size={20} />
                                                <input
                                                    type="file" multiple className="hidden"
                                                    accept="image/*"
                                                    onChange={e => {
                                                        if (e.target.files) {
                                                            const newPhotos = Array.from(e.target.files).filter(file => file.type.startsWith('image/'));
                                                            setReportData({ ...reportData, photos: [...reportData.photos, ...newPhotos] });
                                                        }
                                                    }}
                                                />
                                            </label>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-end gap-3 pt-6 border-t border-gray-50">
                                        <button
                                            type="button" onClick={resetForm}
                                            className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-900 transition-colors"
                                        >
                                            Discard
                                        </button>
                                        <button
                                            type="submit" disabled={submitting}
                                            className="px-8 py-3 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
                                        >
                                            {submitting ? <Activity className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                                            Publish Phase Report
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
