import React from 'react';
import { FileText, TrendingUp, AlertCircle, Activity } from 'lucide-react';

interface PMReportFormFieldsProps {
    summary: string;
    setSummary: (val: string) => void;
    health: string;
    setHealth: (val: string) => void;
    phaseSlug: string;
    setPhaseSlug: (val: string) => void;
    progress: number;
    setProgress: (val: number) => void;
    timelinePhases: string[];
}

export default function PMReportFormFields({
    summary, setSummary, health, setHealth,
    phaseSlug, setPhaseSlug, progress, setProgress,
    timelinePhases
}: PMReportFormFieldsProps) {
    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                    <FileText size={12} /> Executive Summary
                </label>
                <textarea
                    required
                    value={summary}
                    onChange={e => setSummary(e.target.value)}
                    placeholder="Briefly explain the key milestones, wins, or blockers for this week..."
                    className="w-full h-24 p-4 bg-slate-50 rounded-2xl border-none text-xs font-medium resize-none focus:ring-2 focus:ring-slate-900/10 transition-all"
                />
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                        <AlertCircle size={12} /> Budget Health
                    </label>
                    <select
                        value={health}
                        onChange={e => setHealth(e.target.value)}
                        className="w-full p-3 bg-slate-50 rounded-xl border-none text-xs font-bold focus:ring-2 focus:ring-slate-900/10 transition-all cursor-pointer"
                    >
                        <option value="on_track">🟢 On Track</option>
                        <option value="warning">🟡 Warning</option>
                        <option value="critical">🔴 Critical</option>
                    </select>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                        <Activity size={12} /> Timeline Phase
                    </label>
                    <select
                        value={phaseSlug}
                        onChange={e => setPhaseSlug(e.target.value)}
                        className="w-full p-3 bg-slate-50 rounded-xl border-none text-xs font-bold focus:ring-2 focus:ring-slate-900/10 transition-all cursor-pointer"
                    >
                        <option value="">No Specific Phase</option>
                        {timelinePhases.map(phase => (
                            <option key={phase} value={phase}>
                                {phase.charAt(0).toUpperCase() + phase.slice(1).replace('_', ' ')} Phase
                            </option>
                        ))}
                    </select>
                </div>

                <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-slate-400">
                        <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                            <TrendingUp size={12} /> Progress ({progress}%)
                        </span>
                    </div>
                    <div className="px-3 py-2 bg-slate-50 rounded-xl flex items-center h-[42px]">
                        <input
                            type="range" min="0" max="100"
                            value={progress}
                            onChange={e => setProgress(Number(e.target.value))}
                            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
