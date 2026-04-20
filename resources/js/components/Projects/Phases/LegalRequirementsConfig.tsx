import React, { useState } from 'react';
import { Shield, CheckCircle2, Lock, Scale } from 'lucide-react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { useToast } from '../../../context/ToastContext';
import { LEGAL_REQUIREMENTS } from '../../../constants/LegalStandardPresets';

interface LegalRequirementsConfigProps {
    project: any;
    onUpdate: () => void;
    readOnly?: boolean;
}

const REQUIREMENTS = LEGAL_REQUIREMENTS;

export default function LegalRequirementsConfig({ project, onUpdate, readOnly }: LegalRequirementsConfigProps) {
    const { showToast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [selected, setSelected] = useState<string[]>(project.legal_requirements || []);

    const toggle = (id: string) => {
        if (readOnly) return;
        setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const handleSave = async () => {
        setIsLoading(true);
        try {
            await axios.post(`/projects/${project.id}/update`, {
                legal_requirements: selected
            });
            showToast('Legal specifications locked for bidding.', 'success');
            onUpdate();
        } catch (err) {
            showToast('Failed to save requirements.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-zinc-900 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-zinc-800 rounded-full blur-[100px] opacity-20 -translate-y-1/2 translate-x-1/2" />
            
            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-zinc-800 rounded-2xl flex items-center justify-center text-amber-400 shadow-inner">
                        <Scale size={28} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-white tracking-tight">Legal Requirements</h3>
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mt-1 flex items-center gap-2">
                            <Shield size={10} /> Define the Scope for Notary Bidding
                        </p>
                    </div>
                </div>
                {!readOnly && (
                    <button 
                        onClick={handleSave}
                        disabled={isLoading || JSON.stringify(selected) === JSON.stringify(project.legal_requirements || [])}
                        className="px-6 py-3 bg-white text-zinc-900 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-amber-400 transition-all disabled:opacity-30 flex items-center gap-2"
                    >
                        {isLoading ? 'Saving...' : <><Lock size={14} /> Lock Scope</>}
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {REQUIREMENTS.map(item => {
                    const isActive = selected.includes(item.id);
                    return (
                        <button
                            key={item.id}
                            disabled={readOnly}
                            onClick={() => toggle(item.id)}
                            className={`p-6 rounded-3xl border text-left transition-all relative overflow-hidden group ${
                                isActive 
                                ? 'bg-zinc-800 border-amber-500/50 shadow-lg shadow-amber-500/5' 
                                : 'bg-zinc-800/30 border-zinc-800 hover:border-zinc-700'
                            }`}
                        >
                            <div className={`mb-4 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                                isActive ? 'bg-amber-500 text-white' : 'bg-zinc-800 text-zinc-600'
                            }`}>
                                {isActive ? <CheckCircle2 size={20} /> : <Shield size={20} />}
                            </div>
                            <h4 className={`text-sm font-black tracking-tight mb-2 ${isActive ? 'text-white' : 'text-zinc-500'}`}>
                                {item.label}
                            </h4>
                            <p className="text-[10px] text-zinc-600 font-bold leading-relaxed uppercase tracking-widest">
                                {item.desc}
                            </p>
                            
                            {isActive && (
                                <motion.div 
                                    layoutId="glow"
                                    className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none" 
                                />
                            )}
                        </button>
                    );
                })}
            </div>
            
            {selected.length === 0 && !readOnly && (
                <div className="mt-6 flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                    <Shield className="text-amber-500 shrink-0" size={16} />
                    <p className="text-[10px] text-amber-200 font-black uppercase tracking-widest leading-relaxed">
                        Notice: If no requirements are selected, the Notary will assume a "Land Authentication Only" scope for their bid.
                    </p>
                </div>
            )}
        </div>
    );
}
