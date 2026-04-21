import React from 'react';
import { CalendarRange, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface PMScheduleProps {
    project: any;
    user: any;
}

export default function PMSchedule({ project, user }: PMScheduleProps) {
    const isPM = project.pm_id === user?.id;
    const phases = project.needed_phases || [];
    const completed = project.completed_phases || [];

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Timeline & Schedule Control</h2>
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">Master Plan Management & Delay Recovery</p>
                </div>
                
                <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                        {/* Status Bubbles */}
                        <div className="w-8 h-8 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-white">
                            <CheckCircle2 size={14} />
                        </div>
                        <div className="w-8 h-8 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-gray-400 font-bold text-[10px]">
                            {phases.length}
                        </div>
                    </div>
                    <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">
                        {completed.length} / {phases.length} Phases Done
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Master Execution Timeline</h3>
                            <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-tighter rounded-lg">Live Tracker</span>
                        </div>

                        <div className="space-y-8">
                            {phases.map((phase: string, i: number) => {
                                const isCompleted = completed.includes(phase);
                                const isCurrent = !isCompleted && (i === 0 || completed.includes(phases[i-1]));
                                
                                return (
                                    <div key={phase} className="relative pl-8 pb-8 last:pb-0">
                                        {/* Connector Line */}
                                        {i !== phases.length - 1 && (
                                            <div className={`absolute left-4 top-8 bottom-0 w-0.5 ${isCompleted ? 'bg-emerald-500' : 'bg-gray-100'}`} />
                                        )}
                                        
                                        {/* Phase Indicator */}
                                        <div className={`
                                            absolute left-0 top-0 w-8 h-8 rounded-xl flex items-center justify-center z-10
                                            ${isCompleted ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100' : 
                                              isCurrent ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-white border-2 border-gray-100 text-gray-300'}
                                        `}>
                                            {isCompleted ? <CheckCircle2 size={16} /> : <span className="text-xs font-black">{i + 1}</span>}
                                        </div>

                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div>
                                                <h4 className={`text-sm font-black uppercase tracking-tight ${isCompleted ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                                                    {phase.charAt(0).toUpperCase() + phase.slice(1)} Phase
                                                </h4>
                                                <p className="text-xs text-gray-400 font-medium mt-1">
                                                    Target completion: {new Date(project.deadline || Date.now()).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })}
                                                </p>
                                            </div>

                                            {isCurrent && isPM && (
                                                <button className="px-4 py-2 bg-gray-50 text-gray-900 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-gray-100 transition-all">
                                                    Log Delay / Adjust
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-gray-50 rounded-[2.5rem] p-8 border border-gray-100">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-yellow-100 text-yellow-600 rounded-xl">
                                <AlertTriangle size={20} />
                            </div>
                            <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Delay Alerts</h4>
                        </div>
                        
                        <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm border-l-4 border-l-emerald-500">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Current Health</p>
                            <p className="text-xs font-bold text-gray-900">Project is proceeding on schedule.</p>
                        </div>
                    </div>

                    <div className="bg-gray-900 rounded-[2.5rem] p-8 text-white shadow-xl shadow-gray-200">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-white/20 rounded-xl text-white">
                                <Clock size={20} />
                            </div>
                            <h4 className="text-xs font-black uppercase tracking-widest opacity-80">Timeline Summary</h4>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-[10px] uppercase tracking-widest opacity-50 mb-1">Lead Time</p>
                                <p className="text-sm font-black">-- Days</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-widest opacity-50 mb-1">Est. Finish</p>
                                <p className="text-sm font-black">Q4 2026</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
