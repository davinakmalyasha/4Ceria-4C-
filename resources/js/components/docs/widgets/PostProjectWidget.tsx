import React, { useState } from 'react';
import { Plus, X, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function PostProjectWidget() {
    const [step, setStep] = useState<number>(1);
    const [title, setTitle] = useState('Renovasi Dapur Ubud');
    const [budget, setBudget] = useState(45); // in millions
    const [docInput, setDocInput] = useState('');
    const [docsList, setDocsList] = useState<string[]>(['AJB', 'SHM']);
    const [submitted, setSubmitted] = useState(false);

    const handleAddDoc = () => {
        if (docInput.trim() && !docsList.includes(docInput.trim())) {
            setDocsList([...docsList, docInput.trim()]);
            setDocInput('');
        }
    };

    const handleRemoveDoc = (doc: string) => {
        setDocsList(docsList.filter(d => d !== doc));
    };

    if (submitted) {
        return (
            <div className="p-6 bg-white rounded-2xl border border-neutral-200 shadow-sm max-w-sm mx-auto text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto animate-bounce" />
                <h4 className="font-extrabold text-neutral-800 text-sm">Project Brief Published!</h4>
                <p className="text-xs text-neutral-400">Your brief is now active on the bidding board. Architects can submit proposals.</p>
                <button onClick={() => { setSubmitted(false); setStep(1); }} className="px-4 py-2 bg-neutral-900 text-white text-xs font-bold rounded-xl">Create Another</button>
            </div>
        );
    }

    return (
        <div className="p-5 bg-white rounded-2xl border border-neutral-200 shadow-sm max-w-sm mx-auto my-3">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-neutral-100">
                <span className="text-[10px] font-black uppercase text-red-500 tracking-wider">Project Wizard</span>
                <span className="text-[10px] text-neutral-400 font-bold">Step {step} of 3</span>
            </div>

            <div className="min-h-[140px] flex flex-col justify-center">
                {step === 1 && (
                    <div className="space-y-3">
                        <div>
                            <label className="text-[9px] font-bold text-neutral-400 uppercase">Project Title</label>
                            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 mt-0.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold focus:outline-none" />
                        </div>
                        <div>
                            <label className="text-[9px] font-bold text-neutral-400 uppercase">Proyek Type</label>
                            <select className="w-full px-3 py-2 mt-0.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold focus:outline-none">
                                <option>Renovasi Dapur</option>
                                <option>Fondasi Gedung</option>
                                <option>Finishing Atap</option>
                            </select>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-3">
                        <label className="text-[9px] font-bold text-neutral-400 uppercase block">Estimated Budget</label>
                        <div className="flex justify-between font-black text-sm text-neutral-800">
                            <span>Rp {budget}M</span>
                            <span className="text-neutral-400 text-xs font-normal">Cap Limit</span>
                        </div>
                        <input type="range" min="10" max="250" value={budget} onChange={e => setBudget(Number(e.target.value))} className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-red-500" />
                        <p className="text-[9px] text-neutral-400">Builders cannot submit proposals higher than your set cap.</p>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-3">
                        <label className="text-[9px] font-bold text-neutral-400 uppercase block">Required Certificates</label>
                        <div className="flex gap-2">
                            <input type="text" placeholder="e.g. IMB, PBB" value={docInput} onChange={e => setDocInput(e.target.value)} className="flex-grow px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold focus:outline-none" />
                            <button onClick={handleAddDoc} className="p-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl transition-all"><Plus className="w-4 h-4" /></button>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            {docsList.map(doc => (
                                <span key={doc} className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-100 text-neutral-700 text-[10px] font-bold rounded-lg border border-neutral-200">
                                    {doc}
                                    <button onClick={() => handleRemoveDoc(doc)}><X className="w-2.5 h-2.5 text-neutral-400 hover:text-neutral-600" /></button>
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex justify-between items-center mt-5 pt-3 border-t border-neutral-100">
                {step > 1 ? (
                    <button onClick={() => setStep(step - 1)} className="flex items-center gap-1 text-[11px] font-bold text-neutral-500 hover:text-neutral-800 transition-all"><ArrowLeft className="w-3.5 h-3.5" /> Back</button>
                ) : <span />}
                
                {step < 3 ? (
                    <button onClick={() => setStep(step + 1)} className="flex items-center gap-1 px-4 py-2 bg-neutral-900 text-white text-[11px] font-bold rounded-xl hover:bg-neutral-800 transition-all">Next <ArrowRight className="w-3.5 h-3.5" /></button>
                ) : (
                    <button onClick={() => setSubmitted(true)} className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white text-[11px] font-bold rounded-xl transition-all">Publish Brief</button>
                )}
            </div>
        </div>
    );
}
