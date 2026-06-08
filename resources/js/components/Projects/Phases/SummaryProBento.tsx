import React, { useMemo } from 'react';
import { CheckCircle2, Clock, Briefcase, Layers } from 'lucide-react';

interface SummaryProBentoProps {
    termins: any[];
    roleLabel: string;
    pro: any;
}

export default function SummaryProBento({ termins, roleLabel, pro }: SummaryProBentoProps) {
    const stats = useMemo(() => {
        const total = termins.length;
        const completed = termins.filter(t => t.status === 'paid').length;
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
        return { total, completed, percentage };
    }, [termins]);

    // Role-specific descriptions to help peers understand what this colleague does
    const roleDescriptions: Record<string, string> = {
        'Project Manager': 'Orchestrates design, coordinates legal permissions, and audits technical deliveries to ensure build standards.',
        'Notary Legal Specialist': 'Authorizes building permits (PBG/IMB), handles zoning checks, and certifies legal documentation.',
        'Architectural Designer': 'Drafts spatial concepts, layout blueprints, 3D renderings, and guides stylistic direction.',
        'Lead Contractor': 'Manages raw materials procurement, handles physical labor resourcing, and directs heavy construction execution.',
        'Interior Designer': 'Details furniture placement layouts, custom cabinetry drafting, material finishes, and lighting plans.',
        'Structural Engineer': 'Calculates load-bearing beams, reinforcement details, foundation layout, and ensures seismic structural safety.',
        'MEP Specialist': 'Designs electrical schematics, sanitation plumbing, air ventilation routing, and fire safety systems.',
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {/* Bento Block 1: Technical Focus & Progress (3 cols) */}
            <div className="md:col-span-3 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-between space-y-6">
                <div className="space-y-3">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-50 border border-slate-100 rounded-xl">
                        <Briefcase size={12} className="text-slate-400" />
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Technical Focus</span>
                    </div>
                    <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                        {roleDescriptions[roleLabel] || 'Responsible for executing and auditing technical requirements within this project phase.'}
                    </p>
                </div>

                {stats.total > 0 && (
                    <div className="pt-4 border-t border-slate-100/60 space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Phase Progress</span>
                            <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                                {stats.completed}/{stats.total} Milestones Done
                            </span>
                        </div>
                        
                        <div className="flex items-center gap-3">
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-emerald-500 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" 
                                    style={{ width: `${stats.percentage}%` }}
                                />
                            </div>
                            <span className="text-xs font-black text-slate-900 shrink-0">{stats.percentage}%</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Bento Block 2: Work Scope Checklist (2 cols) */}
            <div className="md:col-span-2 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-between space-y-4">
                <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3">Milestone Progress</span>
                    {termins.length === 0 ? (
                        <div className="py-6 text-center border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-1 text-slate-350">
                            <Layers size={18} />
                            <span className="text-[8px] font-black uppercase tracking-wider">No active milestones</span>
                        </div>
                    ) : (
                        <div className="space-y-2.5 max-h-[140px] overflow-y-auto pr-1">
                            {termins.map((t, idx) => {
                                const isDone = t.status === 'paid';
                                return (
                                    <div key={t.id || idx} className="flex items-center justify-between text-xs">
                                        <span className="font-semibold text-slate-700 truncate max-w-[120px]">{t.label}</span>
                                        {isDone ? (
                                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[8px] font-black rounded uppercase tracking-wider flex items-center gap-1 shrink-0">
                                                <CheckCircle2 size={8} /> Done
                                            </span>
                                        ) : (
                                            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[8px] font-black rounded uppercase tracking-wider flex items-center gap-1 shrink-0">
                                                <Clock size={8} /> Pending
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
