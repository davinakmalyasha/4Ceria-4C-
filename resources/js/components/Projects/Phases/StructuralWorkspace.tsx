import React from 'react';
import { motion } from 'framer-motion';
import { HardHat, FileText, CheckCircle2, ShieldCheck, Upload } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

interface StructuralWorkspaceProps {
    project: any;
    user: any;
    onRefresh: () => void;
}

export default function StructuralWorkspace({ project, user, onRefresh }: StructuralWorkspaceProps) {
    const { showToast } = useToast();
    const isDesignCompleted = !!project.design_completed_at;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">Structural Engineering Workspace</h3>
                    <p className="text-sm font-medium text-slate-500 mt-1">Load calculations and structural integrity</p>
                </div>
                {isDesignCompleted ? (
                    <span className="px-4 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                        <CheckCircle2 size={14} /> Completed
                    </span>
                ) : (
                    <span className="px-4 py-1.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                        <ShieldCheck size={14} /> Design Phase Active
                    </span>
                )}
            </div>

            <div className="bg-slate-900 rounded-[2.5rem] p-8 shadow-xl text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-slate-800 rounded-full blur-[100px] opacity-20 -translate-y-1/2 translate-x-1/2" />
                
                <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <div>
                            <h4 className="text-lg font-black tracking-tight flex items-center gap-3">
                                <HardHat className="text-amber-400" size={24} /> 
                                Physics Requirements
                            </h4>
                            <p className="text-sm text-slate-400 mt-2">
                                Based on the Architect's brief, this project exceeds standard parameter limits. 
                                Please provide explicit load calculations for:
                            </p>
                            <ul className="mt-4 space-y-2 text-sm text-slate-300 font-medium">
                                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-amber-400 rounded-full" /> Max Clear Span: {project.design_details?.maxClearSpan || 0}m</li>
                                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-amber-400 rounded-full" /> Floor Count: {project.design_details?.floorCount || 1}</li>
                                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-amber-400 rounded-full" /> Cantilever: {project.design_details?.cantileverLength || 0}m</li>
                            </ul>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Required Deliverables</h4>
                        <button className="w-full p-6 border-2 border-dashed border-slate-700 bg-slate-800/50 hover:bg-slate-800 rounded-3xl transition-all group flex flex-col items-center justify-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-slate-700 flex items-center justify-center text-slate-400 group-hover:text-amber-400 group-hover:scale-110 transition-all">
                                <Upload size={24} />
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-black text-white">Upload Load Calculations</p>
                                <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest">PDF or Excel Format</p>
                            </div>
                        </button>
                        
                        <button className="w-full p-6 border-2 border-dashed border-slate-700 bg-slate-800/50 hover:bg-slate-800 rounded-3xl transition-all group flex flex-col items-center justify-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-slate-700 flex items-center justify-center text-slate-400 group-hover:text-amber-400 group-hover:scale-110 transition-all">
                                <Upload size={24} />
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-black text-white">Upload Reinforcement Drawings</p>
                                <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest">DWG or PDF Format</p>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex flex-col sm:flex-row gap-4 items-center justify-between text-amber-900">
                <div className="flex items-center gap-3">
                    <ShieldCheck className="shrink-0 text-amber-500" size={24} />
                    <p className="text-xs font-bold leading-relaxed max-w-lg">
                        Once you verify the structure is safe and upload the documents, the Architect can seal the Design Phase. 
                    </p>
                </div>
                <button 
                    onClick={() => {
                        showToast('Deliverables marked as completed. Architect notified.', 'success');
                        onRefresh();
                    }}
                    className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-95 whitespace-nowrap"
                >
                    Mark as Verified
                </button>
            </div>
        </div>
    );
}
