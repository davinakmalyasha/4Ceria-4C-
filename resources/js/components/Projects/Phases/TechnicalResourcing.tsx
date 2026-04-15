import React, { useState } from 'react';
import axios from 'axios';
import { ShieldCheck, HardHat, Zap, CheckCircle2, AlertTriangle, Users } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

interface TechnicalResourcingProps {
    project: any;
    user: any;
    isArchitect: boolean;
    onRefresh: () => void;
}

export default function TechnicalResourcing({ project, user, isArchitect, onRefresh }: TechnicalResourcingProps) {
    const { showToast } = useToast();
    const [isRequestingSE, setIsRequestingSE] = useState(false);
    const [isRequestingMEP, setIsRequestingMEP] = useState(false);

    const requiresStructural = project.requires_structural;
    const hasStructural = !!project.structural_id;
    const hasMEP = !!project.mep_id;

    const requestSubcontractor = async (type: 'structural' | 'mep') => {
        const isSE = type === 'structural';
        const setLoad = isSE ? setIsRequestingSE : setIsRequestingMEP;
        
        if (!window.confirm(`Request an Addendum from the owner to hire a ${isSE ? 'Structural' : 'MEP'} Engineer?`)) return;

        setLoad(true);
        try {
            // For now, we simulate this by either directly showing a Toast, 
            // since actual bidding for Subcontractors might require a full flow.
            // In a real system, this would create an 'Addendum' or a 'Sub-Bid' record.
            showToast(`Request sent to Owner to approve budget for ${isSE ? 'Structural' : 'MEP'} Engineer.`, 'success');
        } catch (error) {
            showToast('Failed to send request.', 'error');
        } finally {
            setLoad(false);
        }
    };

    return (
        <div className="bg-white border-2 border-slate-100 rounded-[2.5rem] p-8 shadow-sm space-y-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-slate-50 rounded-bl-[5rem] -mr-12 -mt-12 -z-10" />
            
            <div className="flex items-center gap-4 border-b border-slate-100 pb-6">
                <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0">
                    <Users size={28} />
                </div>
                <div>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">Technical Resourcing</h3>
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mt-1">
                        Sub-Contracting & Engineering Delegation
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Structural Engineer Block */}
                <div className={`p-6 border-2 rounded-3xl space-y-5 transition-colors ${
                    requiresStructural ? 'border-red-500/30 bg-red-50/30' : 'border-slate-100 bg-slate-50/50'
                }`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                requiresStructural ? 'bg-red-100 text-red-600' : 'bg-slate-200 text-slate-600'
                            }`}>
                                <HardHat size={20} />
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-slate-900">Structural Engineer</h4>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Load & Physics Assessment
                                </p>
                            </div>
                        </div>
                        {hasStructural ? (
                            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-widest">Hired</span>
                        ) : requiresStructural ? (
                            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-[10px] font-black uppercase tracking-widest">Required</span>
                        ) : (
                            <span className="px-3 py-1 bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest">Optional</span>
                        )}
                    </div>

                    {!hasStructural && requiresStructural && (
                        <div className="p-3 bg-red-100/50 border border-red-200 rounded-2xl flex items-start gap-3">
                            <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={16} />
                            <p className="text-[11px] text-red-800 font-medium">
                                The Physics Engine has determined this project requires a Structural Engineer. You cannot seal the design phase until one is hired.
                            </p>
                        </div>
                    )}

                    {isArchitect && !hasStructural && (
                        <button 
                            onClick={() => requestSubcontractor('structural')}
                            disabled={isRequestingSE}
                            className={`w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                requiresStructural 
                                ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20' 
                                : 'bg-white border-2 border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                        >
                            {isRequestingSE ? 'Requesting...' : 'Request Owner Addendum to Hire'}
                        </button>
                    )}
                </div>

                {/* MEP Engineer Block */}
                <div className="p-6 border-2 border-slate-100 bg-slate-50/50 rounded-3xl space-y-5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                                <Zap size={20} />
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-slate-900">MEP Engineer</h4>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Mechanical, Electrical, Plumbing
                                </p>
                            </div>
                        </div>
                        {hasMEP ? (
                            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-widest">Hired</span>
                        ) : (
                            <span className="px-3 py-1 bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest">Optional</span>
                        )}
                    </div>

                    {!hasMEP && (
                        <div className="p-3 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-3">
                            <ShieldCheck className="text-blue-500 shrink-0 mt-0.5" size={16} />
                            <p className="text-[11px] text-blue-800 font-medium">
                                Hire an MEP Engineer to design the electrical diagrams, HVAC schematics, and plumbing layouts.
                            </p>
                        </div>
                    )}

                    {isArchitect && !hasMEP && (
                        <button 
                            onClick={() => requestSubcontractor('mep')}
                            disabled={isRequestingMEP}
                            className="w-full py-4 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-slate-300 transition-all"
                        >
                            {isRequestingMEP ? 'Requesting...' : 'Request Owner Addendum to Hire'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
