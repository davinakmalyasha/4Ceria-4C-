import React from 'react';
import { ShieldCheck, ArrowRight, Wallet, AlertCircle, Info, Banknote, FileText } from 'lucide-react';
import { Project, ProjectAddendum, formatCurrency } from '../../../types/project.types';

interface EngineeringBudgetCardProps {
    addendum: ProjectAddendum;
    project: Project;
    onApprove: (id: number) => void;
    onDecline: (id: number) => void;
    isProcessing: boolean;
}

export default function EngineeringBudgetCard({ 
    addendum, 
    project, 
    onApprove, 
    onDecline, 
    isProcessing 
}: EngineeringBudgetCardProps) {
    const remainingBudget = project.budget || 0;
    const proposedFee = addendum.amount;
    const potentialBalance = remainingBudget - proposedFee;
    const isOverBudget = potentialBalance < 0;

    return (
        <div className={`p-8 rounded-[2.5rem] border-2 shadow-xl relative overflow-hidden transition-all animate-in fade-in zoom-in-95 duration-500 ${
            isOverBudget ? 'bg-red-50 border-red-200' : 'bg-slate-900 border-slate-800 text-white'
        }`}>
            {/* Background elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl" />
            
            <div className="relative z-10 space-y-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-6">
                    <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shrink-0 ${
                            isOverBudget ? 'bg-red-500 text-white' : 'bg-indigo-500 text-white'
                        }`}>
                            <Banknote size={28} />
                        </div>
                        <div>
                            <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${
                                isOverBudget ? 'text-red-600' : 'text-indigo-400'
                            }`}>
                                Budget Authorization Required
                            </span>
                            <h3 className={`text-xl font-black tracking-tight ${
                                isOverBudget ? 'text-red-900' : 'text-white'
                            }`}>
                                Engineering Specialist Hiring
                            </h3>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start py-2">
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <p className={`text-[10px] font-black uppercase tracking-widest ${
                                isOverBudget ? 'text-red-400' : 'text-white/40'
                            }`}>
                                {addendum.type === 'specialist_assignment' ? 'Specialist Proposal' : 'Change Order Description'}
                            </p>
                            <p className={`text-sm leading-relaxed font-medium ${
                                isOverBudget ? 'text-red-800' : 'text-white/80'
                            }`}>
                                {addendum.description}
                            </p>
                            {addendum.type === 'specialist_assignment' && addendum.teamMember && (
                                <div className="mt-2 p-3 bg-white/5 rounded-xl border border-white/10">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-1">Proposed Professional</p>
                                    <p className="text-sm font-black text-white">{addendum.teamMember.name}</p>
                                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">
                                        {addendum.specialist_type?.toUpperCase()} Specialist
                                    </p>
                                </div>
                            )}
                            {addendum.attachment_path && (
                                <a 
                                    href={addendum.attachment_path.startsWith('http') ? addendum.attachment_path : `/storage/${addendum.attachment_path}`} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg text-[9px] font-black uppercase tracking-widest border border-indigo-500/30 hover:bg-indigo-500/30 transition-all"
                                >
                                    <FileText size={12} /> View Supporting Document
                                </a>
                            )}
                        </div>

                        <div className={`p-4 rounded-2xl flex items-start gap-3 border ${
                            isOverBudget ? 'bg-red-100 border-red-200 text-red-700' : 'bg-white/5 border-white/10 text-white/60'
                        }`}>
                            <Info size={16} className="shrink-0 mt-0.5" />
                            <p className="text-[11px] leading-relaxed">
                                Global Standards require Owner explicit authorization for sub-consultant hiring that impacts the base project budget.
                            </p>
                        </div>
                    </div>

                    <div className={`p-6 rounded-[2rem] space-y-6 ${
                        isOverBudget ? 'bg-white border-2 border-red-200 shadow-lg' : 'bg-white/5 border border-white/10'
                    }`}>
                        <div className="space-y-4">
                            <div className="flex justify-between items-end">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${
                                    isOverBudget ? 'text-slate-400' : 'text-white/40'
                                }`}>
                                    Currently Available
                                </span>
                                <span className={`text-sm font-black ${
                                    isOverBudget ? 'text-slate-900' : 'text-white'
                                }`}>
                                    {formatCurrency(remainingBudget)}
                                </span>
                            </div>
                            <div className="flex justify-between items-end">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${
                                    isOverBudget ? 'text-red-600' : 'text-indigo-400'
                                }`}>
                                    Commitment Value
                                </span>
                                <span className={`text-xl font-black ${
                                    isOverBudget ? 'text-red-600' : 'text-white'
                                }`}>
                                    - {formatCurrency(proposedFee)}
                                </span>
                            </div>
                            <div className={`h-px ${isOverBudget ? 'bg-slate-100' : 'bg-white/10'}`} />
                            <div className="flex justify-between items-end">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${
                                    isOverBudget ? 'text-slate-400' : 'text-white/40'
                                }`}>
                                    Post-Hiring Balance
                                </span>
                                <span className={`text-xl font-black ${
                                    isOverBudget ? 'text-red-600' : 'text-emerald-400'
                                }`}>
                                    {formatCurrency(potentialBalance)}
                                </span>
                            </div>
                        </div>

                        {isOverBudget && (
                            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-xl border border-red-100">
                                <AlertCircle size={16} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Insufficient Funds</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 border-t border-white/10">
                    <button
                        onClick={() => onDecline(addendum.id)}
                        disabled={isProcessing}
                        className={`w-full sm:w-auto px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${
                            isOverBudget ? 'bg-red-200 text-red-900 hover:bg-red-300' : 'bg-white/10 text-white hover:bg-white/20'
                        }`}
                    >
                        Decline Selection
                    </button>
                    <button
                        onClick={() => onApprove(addendum.id)}
                        disabled={isProcessing || isOverBudget}
                        className={`flex-1 w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-2xl ${
                            isOverBudget 
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                                : 'bg-indigo-500 text-white hover:bg-indigo-600 hover:-translate-y-1 active:scale-95 shadow-indigo-500/25'
                        }`}
                    >
                        {isProcessing ? 'Processing Authorization...' : (
                            <>
                                <ShieldCheck size={18} />
                                Authorize & Hire Engineer
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
