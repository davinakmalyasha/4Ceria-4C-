import React, { useState } from 'react';
import { CheckCircle2, Circle, Clock, Check } from 'lucide-react';
import { motion } from 'framer-motion';

export default function MilestoneWidget() {
    const [step, setStep] = useState<number>(1); // 1 = Pending release, 2 = Under review, 3 = Approved

    return (
        <div className="p-5 bg-white rounded-2xl border border-neutral-200 shadow-sm max-w-sm mx-auto my-4 transition-all">
            <h4 className="font-extrabold text-neutral-800 text-sm mb-3">Construction Milestones</h4>
            
            <div className="space-y-3.5 mb-4">
                {/* Milestone 1: Earthworks */}
                <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" />
                    <div>
                        <p className="text-xs font-bold text-neutral-800 line-through">1. Foundations & Concrete slab</p>
                        <p className="text-[10px] text-emerald-600 font-extrabold">Paid • Rp 25.000.000</p>
                    </div>
                </div>

                {/* Milestone 2: Brickwork */}
                <div className="flex items-start gap-2.5">
                    {step === 1 && <Circle className="w-4 h-4 text-neutral-300 mt-0.5" />}
                    {step === 2 && <Clock className="w-4 h-4 text-amber-500 animate-spin mt-0.5" />}
                    {step === 3 && <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" />}
                    
                    <div>
                        <p className={`text-xs font-bold ${step === 3 ? 'line-through text-neutral-500' : 'text-neutral-800'}`}>
                            2. Brick Walls & Structure
                        </p>
                        {step === 1 && (
                            <span className="text-[10px] text-neutral-400 font-semibold">Funds Secured on Platform • Rp 30.000.000</span>
                        )}
                        {step === 2 && (
                            <span className="text-[10px] text-amber-600 font-extrabold">Awaiting Client Approval...</span>
                        )}
                        {step === 3 && (
                            <span className="text-[10px] text-emerald-600 font-extrabold">Paid & Released!</span>
                        )}
                    </div>
                </div>
            </div>

            {step === 1 && (
                <button 
                    onClick={() => setStep(2)}
                    className="w-full py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-xl transition-all"
                >
                    Request Payout Release (As Builder)
                </button>
            )}

            {step === 2 && (
                <button 
                    onClick={() => setStep(3)}
                    className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-all"
                >
                    Approve Progress (As Client)
                </button>
            )}

            {step === 3 && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center gap-2 text-emerald-700 text-xs font-extrabold">
                    <Check className="w-4 h-4" /> Funds successfully released to builder!
                </div>
            )}
        </div>
    );
}
