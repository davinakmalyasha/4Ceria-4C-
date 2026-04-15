import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, CheckCircle2, ShieldCheck, Activity, Package, Settings, PenTool } from 'lucide-react';
import { PhaseKey } from '../../../types/phase.types';
import { useToast } from '../../../context/ToastContext';
import ProjectRequirements from '../ProjectRequirements';

interface MepWorkspaceProps {
    project: any;
    user: any;
    onRefresh: () => void;
    currentPhase: PhaseKey;
}

export default function MepWorkspace({ project, user, onRefresh, currentPhase }: MepWorkspaceProps) {
    const { showToast } = useToast();
    const [subTab, setSubTab] = useState<'design' | 'materials'>('design');

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">MEP Engineering Workspace</h3>
                    <p className="text-sm font-medium text-slate-500 mt-1 flex items-center gap-2">
                        <Zap size={14} className="text-blue-500" />
                        Mechanical, Electrical, and Plumbing
                    </p>
                </div>
                <span className="px-4 py-1.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                    <Activity size={14} /> Global Workspace Active
                </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Phase specific contextual cards */}
                
                <div className={`p-6 rounded-3xl border-2 transition-all ${
                    currentPhase === 'design' ? 'border-blue-500/30 bg-blue-50/50 shadow-md scale-[1.02]' : 'border-slate-100 bg-slate-50/50 opacity-60'
                }`}>
                    <div className="flex items-center gap-3 mb-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${currentPhase === 'design' ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                            <PenTool size={18} />
                        </div>
                        <div>
                            <h4 className="text-sm font-black text-slate-900">Phase 1: Design</h4>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Schematics</p>
                        </div>
                    </div>
                    <p className="text-xs text-slate-600 font-medium">Draft electrical diagrams, plumbing layouts, and HVAC plans alongside the architect.</p>
                </div>

                <div className={`p-6 rounded-3xl border-2 transition-all ${
                    currentPhase === 'build' ? 'border-amber-500/30 bg-amber-50/50 shadow-md scale-[1.02]' : 'border-slate-100 bg-slate-50/50 opacity-60'
                }`}>
                    <div className="flex items-center gap-3 mb-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${currentPhase === 'build' ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                            <ShieldCheck size={18} />
                        </div>
                        <div>
                            <h4 className="text-sm font-black text-slate-900">Phase 2: Build</h4>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rough-in</p>
                        </div>
                    </div>
                    <p className="text-xs text-slate-600 font-medium">Install core wires, pipes, and ducts before the walls are sealed by the contractor.</p>
                </div>

                <div className={`p-6 rounded-3xl border-2 transition-all ${
                    currentPhase === 'interior' ? 'border-purple-500/30 bg-purple-50/50 shadow-md scale-[1.02]' : 'border-slate-100 bg-slate-50/50 opacity-60'
                }`}>
                    <div className="flex items-center gap-3 mb-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${currentPhase === 'interior' ? 'bg-purple-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                            <Settings size={18} />
                        </div>
                        <div>
                            <h4 className="text-sm font-black text-slate-900">Phase 3: Interior</h4>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fixtures</p>
                        </div>
                    </div>
                    <p className="text-xs text-slate-600 font-medium">Finalize installation of ACs, lights, sinks, and visible mechanical units.</p>
                </div>
            </div>

            <div className="flex items-center gap-2 border-b border-slate-100 pb-4 mt-8">
                <button 
                    onClick={() => setSubTab('design')}
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        subTab === 'design' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
                    }`}
                >
                    Technical Schematics
                </button>
                <button 
                    onClick={() => setSubTab('materials')}
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        subTab === 'materials' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
                    }`}
                >
                    <Package size={14} className="inline mr-2" />
                    MEP Materials & Inventory
                </button>
            </div>

            <div className="pt-4">
                {subTab === 'design' && (
                    <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-[2.5rem] bg-slate-50/50">
                        <Zap className="mx-auto text-slate-300 mb-4" size={32} />
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-2">Schematics Uploader</h4>
                        <p className="text-xs text-slate-500 font-medium max-w-sm mx-auto">
                            Upload your DWG, PDF, and load calculation documents here. The architect will use them for the master blueprint.
                        </p>
                        <button className="mt-6 px-8 py-3 bg-white border-2 border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-blue-500 hover:text-blue-600 transition-all shadow-sm">
                            Select Files
                        </button>
                    </div>
                )}
                
                {subTab === 'materials' && (
                    <ProjectRequirements 
                        project={project} 
                        onUpdate={onRefresh} 
                        hideInventoryActions={false}
                    />
                )}
            </div>
        </div>
    );
}
