import React, { useState } from 'react';
import { FileText, PenTool, CheckCircle2, Shield } from 'lucide-react';

const steps = ['Review Terms', 'Digital Signature', 'Confirmed'] as const;
const stepIcons = [FileText, PenTool, CheckCircle2];

export default function ContractWidget() {
    const [step, setStep] = useState<number>(0);

    return (
        <div className="p-5 bg-white rounded-2xl border border-neutral-200 shadow-sm max-w-sm mx-auto my-4 transition-all hover:shadow-md">
            <div className="flex items-center justify-between mb-4">
                <h4 className="font-extrabold text-neutral-800 text-sm">Contract Signing</h4>
                <Shield className="w-4 h-4 text-red-500" />
            </div>

            <div className="flex items-center gap-1 mb-4">
                {steps.map((label, i) => {
                    const Icon = stepIcons[i];
                    const done = step > i;
                    const active = step === i;
                    return (
                        <React.Fragment key={label}>
                            {i > 0 && <div className={`flex-1 h-0.5 ${done ? 'bg-emerald-400' : 'bg-neutral-200'}`} />}
                            <div className="flex flex-col items-center gap-1">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                                    done ? 'bg-emerald-100' : active ? 'bg-red-50 ring-2 ring-red-300' : 'bg-neutral-100'
                                }`}>
                                    <Icon className={`w-3.5 h-3.5 ${done ? 'text-emerald-600' : active ? 'text-red-500' : 'text-neutral-400'}`} />
                                </div>
                                <span className={`text-[9px] font-bold ${active ? 'text-red-500' : 'text-neutral-400'}`}>{label}</span>
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>

            {step === 0 && (
                <div className="space-y-2 mb-3">
                    <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-100 space-y-1.5">
                        <div className="flex justify-between text-[10px]">
                            <span className="text-neutral-400 font-semibold">Client</span>
                            <span className="text-neutral-700 font-bold">Budi Santoso</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                            <span className="text-neutral-400 font-semibold">Contractor</span>
                            <span className="text-neutral-700 font-bold">CV Maju Jaya</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                            <span className="text-neutral-400 font-semibold">Amount</span>
                            <span className="text-emerald-600 font-extrabold">Rp 120.000.000</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                            <span className="text-neutral-400 font-semibold">Milestones</span>
                            <span className="text-neutral-700 font-bold">4 phases</span>
                        </div>
                    </div>
                    <button onClick={() => setStep(1)}
                        className="w-full py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-xl transition-all">
                        Review &amp; Accept Terms
                    </button>
                </div>
            )}

            {step === 1 && (
                <div className="space-y-2">
                    <div className="h-16 bg-neutral-50 rounded-xl border-2 border-dashed border-neutral-300 flex items-center justify-center">
                        <p className="text-[10px] text-neutral-400 font-semibold italic">Draw your signature here</p>
                    </div>
                    <button onClick={() => setStep(2)}
                        className="w-full py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5">
                        <PenTool className="w-3.5 h-3.5" /> Sign Contract
                    </button>
                </div>
            )}

            {step === 2 && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-center space-y-1">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                    <p className="text-xs font-extrabold text-emerald-700">Contract Signed!</p>
                    <p className="text-[10px] text-emerald-600 font-semibold">ID: CTR-2026-00847</p>
                    <p className="text-[9px] text-neutral-400">Both parties notified. Escrow funded.</p>
                </div>
            )}
        </div>
    );
}
