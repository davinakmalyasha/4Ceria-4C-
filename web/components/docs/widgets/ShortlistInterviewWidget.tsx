import React, { useState } from 'react';
import { Check, Lock, Unlock, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ShortlistInterviewWidget() {
    const [step, setStep] = useState(1); // 1 = Shortlisting, 2 = Interviewing/Counter, 3 = Hired
    const [proposalFee, setProposalFee] = useState(10000000);
    const [counterFee] = useState(9000000);
    const [isCountered, setIsCountered] = useState(false);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            maximumFractionDigits: 0
        }).format(val);
    };

    return (
        <div className="p-6 bg-white rounded-3xl border border-neutral-200 shadow-sm max-w-sm mx-auto my-4 transition-all hover:shadow-md">
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] bg-indigo-50 text-indigo-600 font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider">
                    Interactive Tutorial
                </span>
                <span className="text-xs text-neutral-400 font-bold">
                    Step {step} of 3
                </span>
            </div>

            <AnimatePresence mode="wait">
                {step === 1 && (
                    <motion.div
                        key="step1"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-4"
                    >
                        <h4 className="font-extrabold text-neutral-800 text-sm">1. Shortlist a Professional</h4>
                        <p className="text-xs text-neutral-500 leading-relaxed">
                            When a professional bids on your project, you can shortlist them for interviews to unlock negotiation.
                        </p>
                        
                        {/* Proposal Card */}
                        <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100 flex items-center justify-between">
                            <div>
                                <h5 className="font-extrabold text-neutral-800 text-xs">Aisha Project Management</h5>
                                <p className="text-[10px] text-neutral-400 mt-0.5">Initial Bid: {formatCurrency(10000000)}</p>
                            </div>
                            <span className="text-[9px] font-black uppercase bg-neutral-200 text-neutral-600 px-2 py-0.5 rounded">
                                Pending
                            </span>
                        </div>

                        <button
                            onClick={() => setStep(2)}
                            className="w-full py-3 bg-zinc-950 hover:bg-zinc-900 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                        >
                            Shortlist for Interview
                            <ArrowRight size={14} />
                        </button>
                    </motion.div>
                )}

                {step === 2 && (
                    <motion.div
                        key="step2"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-4"
                    >
                        <h4 className="font-extrabold text-neutral-800 text-sm">2. Interview & Discuss Fee</h4>
                        <p className="text-xs text-neutral-500 leading-relaxed">
                            The workspace is unlocked for them! However, all other tabs are locked except the <strong>Tendering Hub</strong> until hired.
                        </p>

                        {/* Workspace Sidebar Mock */}
                        <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-100 space-y-1.5 text-[10px] font-bold text-neutral-500">
                            <p className="text-[8px] text-neutral-400 uppercase tracking-widest px-1">Workspace Mock Menu</p>
                            <div className="flex items-center justify-between px-2 py-1 bg-neutral-100 rounded text-neutral-400">
                                <span>Overview</span>
                                <Lock size={10} />
                            </div>
                            <div className="flex items-center justify-between px-2 py-1 bg-zinc-900 text-white rounded">
                                <span>Tendering Hub</span>
                                <Unlock size={10} className="text-emerald-450" />
                            </div>
                            <div className="flex items-center justify-between px-2 py-1 bg-neutral-100 rounded text-neutral-400">
                                <span>Process</span>
                                <Lock size={10} />
                            </div>
                        </div>

                        {/* Counter Offer Mock */}
                        <div className="p-4 bg-indigo-50/50 border border-indigo-105 rounded-2xl space-y-3">
                            <div className="flex justify-between items-center text-xs pb-2 border-b border-indigo-100/30">
                                <span className="font-bold text-neutral-600">Fee Structure:</span>
                                <span className="font-extrabold text-indigo-700">{isCountered ? 'Percentage (9%)' : 'Percentage (10%)'}</span>
                            </div>
                            
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-bold text-neutral-600">Proposed Fee:</span>
                                <span className="font-black text-indigo-700">{formatCurrency(proposalFee)}</span>
                            </div>

                            {/* Detailed milestones schedule */}
                            <div className="space-y-1.5 pt-1 text-[10px] text-neutral-500">
                                <div className="flex justify-between items-center bg-white/60 px-2.5 py-1.5 rounded-lg border border-indigo-100/30">
                                    <span>DP (Down Payment - 50%)</span>
                                    <span className="font-bold text-neutral-700">{formatCurrency(proposalFee * 0.5)}</span>
                                </div>
                                <div className="flex justify-between items-center bg-white/60 px-2.5 py-1.5 rounded-lg border border-indigo-100/30">
                                    <span>Selesai (Completion - 50%)</span>
                                    <span className="font-bold text-neutral-700">{formatCurrency(proposalFee * 0.5)}</span>
                                </div>
                            </div>

                            {isCountered ? (
                                <div className="p-2.5 bg-white border border-indigo-100 rounded-xl text-[10px] font-medium text-indigo-600 text-center">
                                    Counter-offer of <strong>{formatCurrency(counterFee)} (9%)</strong> sent to the client!
                                </div>
                            ) : (
                                <div className="flex gap-2 pt-1">
                                    <button
                                        onClick={() => {
                                            setProposalFee(counterFee);
                                            setIsCountered(true);
                                        }}
                                        className="w-full py-2 bg-white border border-indigo-200 text-indigo-600 rounded-xl text-[10px] font-extrabold uppercase tracking-wider hover:bg-indigo-50 transition-all shadow-sm animate-pulse"
                                    >
                                        Counter to {formatCurrency(counterFee)} (9%)
                                    </button>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => setStep(3)}
                            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5"
                        >
                            Accept & Hire Professional
                        </button>
                    </motion.div>
                )}

                {step === 3 && (
                    <motion.div
                        key="step3"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-4"
                    >
                        <h4 className="font-extrabold text-neutral-800 text-sm">3. Hired & Fully Unlocked</h4>
                        <p className="text-xs text-neutral-500 leading-relaxed">
                            Once hired, the lock restrictions disappear, and the professional has full access to the project workspace.
                        </p>

                        {/* Final Agreed Details */}
                        <div className="p-4 bg-emerald-50/30 border border-emerald-100 rounded-2xl space-y-2.5 text-xs">
                            <div className="flex justify-between items-center pb-2 border-b border-emerald-100/30">
                                <span className="font-bold text-neutral-600">Agreed Fee:</span>
                                <span className="font-black text-emerald-700">{formatCurrency(proposalFee)} ({isCountered ? '9%' : '10%'})</span>
                            </div>
                            <div className="space-y-1 text-[10px] text-neutral-500">
                                <div className="flex justify-between items-center">
                                    <span>DP (50%)</span>
                                    <span className="font-bold text-neutral-700">{formatCurrency(proposalFee * 0.5)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Selesai (50%)</span>
                                    <span className="font-bold text-neutral-700">{formatCurrency(proposalFee * 0.5)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Unlocked Workspace Mock */}
                        <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-100 space-y-1.5 text-[10px] font-bold text-neutral-800">
                            <p className="text-[8px] text-neutral-400 uppercase tracking-widest px-1">Workspace Mock Menu</p>
                            <div className="flex items-center justify-between px-2 py-1 bg-white border border-neutral-100 rounded text-neutral-700">
                                <span>Overview</span>
                                <Check size={10} className="text-emerald-500" />
                            </div>
                            <div className="flex items-center justify-between px-2 py-1 bg-white border border-neutral-100 rounded text-neutral-700">
                                <span>Tendering Hub</span>
                                <Check size={10} className="text-emerald-500" />
                            </div>
                            <div className="flex items-center justify-between px-2 py-1 bg-white border border-neutral-100 rounded text-neutral-700">
                                <span>Process</span>
                                <Check size={10} className="text-emerald-500" />
                            </div>
                        </div>

                        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center gap-2 text-emerald-700 text-xs font-black">
                            <Check size={16} /> Fully Unlocked & Hired!
                        </div>

                        <button
                            onClick={() => {
                                setStep(1);
                                setIsCountered(false);
                                setProposalFee(10000000);
                            }}
                            className="w-full py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold rounded-xl transition-all"
                        >
                            Reset Tutorial
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
