import React, { useState } from 'react';
import { 
    CheckCircle2, CreditCard, Clock, ShieldCheck, Zap, 
    Unlock, MessageCircle, AlertCircle, Search
} from 'lucide-react';
import { Project } from '../../../types/project.types';
import axios from 'axios';
import { useToast } from '../../../context/ToastContext';

interface SpecialistActionCenterProps {
    project: Project;
    isPro: boolean;
    isOwner: boolean;
    isPM: boolean;
    roleType: string; // 'structural' | 'mep'
    onProjectUpdate: (updatedProject: Project) => void;
}

const SpecialistActionCenter: React.FC<SpecialistActionCenterProps> = ({ 
    project, isPro, isOwner, isPM, roleType, onProjectUpdate 
}) => {
    const { showToast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    // Identify if this specialist has been paid/kicked off
    const isPaid = project[`${roleType}_payment_verified_at`];
    const isKickedOff = project[`${roleType}_kickoff_at`];
    
    // Status identification for UI
    let status = 'draft';
    if (isKickedOff) status = 'active';
    else if (isPaid) status = 'paid';
    else status = 'pending_payment';

    const handleAction = async (endpoint: string, successMsg: string, extraData: any = {}) => {
        setIsLoading(true);
        try {
            const response = await axios.post(`/projects/${project.id}/${endpoint}`, {
                ...extraData,
                role: roleType
            });
            
            onProjectUpdate(response.data.data);
            showToast(successMsg, 'success');
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Action failed', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const generateWhatsAppLink = () => {
        const text = `Hi, I have accepted your bid for ${roleType.toUpperCase()} specialist for project "${project.title}". I am ready to process the payment. Please provide any additional details if needed.`;
        return `https://wa.me/?text=${encodeURIComponent(text)}`;
    };

    return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
            {/* Header Status Bar */}
            <div className={`px-8 py-5 flex items-center justify-between ${
                status === 'active' ? 'bg-green-600 text-white' : 
                'bg-amber-500 text-white'
            }`}>
                <div className="flex items-center gap-3 font-black text-[10px] uppercase tracking-[0.2em]">
                    {status === 'pending_payment' && <Search className="w-5 h-5 animate-pulse" />}
                    {status === 'paid' && <Clock className="w-5 h-5" />}
                    {status === 'active' && <CheckCircle2 className="w-5 h-5" />}
                    <span>
                        {status === 'pending_payment' ? `${roleType.toUpperCase()} PHASE: Awaiting Deposit` :
                         status === 'paid' ? `${roleType.toUpperCase()} PHASE: Standby (Awaiting Authorization)` :
                         `${roleType.toUpperCase()} PHASE: ACTIVE EXECUTION`}
                    </span>
                </div>
            </div>

            <div className="p-10">
                {status === 'pending_payment' && (
                    <div className="flex flex-col justify-center items-center gap-10 animate-in zoom-in-95 py-6">
                        <div className="w-24 h-24 bg-zinc-800 text-amber-500 rounded-[2rem] flex items-center justify-center shadow-inner relative overflow-hidden">
                            <div className="absolute inset-0 bg-amber-500/10 animate-pulse" />
                            <CreditCard className="w-10 h-10 relative z-10" />
                        </div>
                        <div className="text-center space-y-6">
                            <div>
                                <h4 className="font-black text-white text-2xl uppercase tracking-tight">Contract Secured</h4>
                                <p className="text-zinc-500 text-sm max-w-sm mx-auto mt-2 leading-relaxed">
                                    The hiring agreement for {roleType.toUpperCase()} is finalized. Please settle the Down Payment to unlock the specialist workspace.
                                </p>
                            </div>
                            
                            {isOwner && (
                                <a
                                    href={generateWhatsAppLink()}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-3 bg-[#25D366] text-white rounded-[1.5rem] py-5 px-10 font-black text-xs uppercase tracking-widest hover:brightness-110 transition-all shadow-xl shadow-green-950/20"
                                >
                                    <MessageCircle className="w-5 h-5" />
                                    Pay & Confirm Specialist DP
                                </a>
                            )}

                            {isPro && (
                                <button
                                    onClick={() => handleAction('verify-payment', 'Payment verified! Standby for NTP.')}
                                    disabled={isLoading}
                                    className="w-full flex items-center justify-center gap-3 bg-white text-zinc-900 rounded-[1.5rem] py-5 font-black text-xs uppercase tracking-widest hover:bg-zinc-200 transition-all shadow-xl"
                                >
                                    <Unlock className="w-5 h-5" />
                                    Confirm DP Received
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {status === 'paid' && (
                    <div className="flex flex-col justify-center items-center gap-10 animate-in zoom-in-95 py-6">
                        <div className="w-24 h-24 bg-zinc-800 text-amber-500 rounded-[2rem] flex items-center justify-center shadow-inner relative overflow-hidden">
                            <div className="absolute inset-0 bg-amber-500/10 animate-pulse" />
                            <Clock className="w-10 h-10 relative z-10" />
                        </div>
                        <div className="text-center space-y-6">
                            <div>
                                <h4 className="font-black text-white text-2xl uppercase tracking-tight">Standby Mode</h4>
                                <p className="text-zinc-500 text-sm max-w-sm mx-auto mt-2 leading-relaxed">
                                    {isPro 
                                        ? `Deposit verified. Please wait for the official Notice to Proceed (NTP) before starting ${roleType} work.`
                                        : `Deposit verified. You can now issue the official Notice to Proceed to the ${roleType.toUpperCase()} Specialist.`}
                                </p>
                            </div>
                            
                            {(isOwner || isPM) && (
                                <button
                                    onClick={() => handleAction('kickoff', 'Notice to Proceed issued!')}
                                    disabled={isLoading}
                                    className="w-full flex items-center justify-center gap-3 bg-white text-zinc-900 rounded-[1.5rem] py-5 font-black text-xs uppercase tracking-widest hover:bg-zinc-200 transition-all shadow-xl"
                                >
                                    <Zap className="w-5 h-5 fill-current" />
                                    Issue Notice to Proceed
                                </button>
                            )}

                            {isPro && (
                                <div className="px-8 py-5 bg-zinc-800/50 rounded-[1.5rem] border border-zinc-700/50">
                                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Waiting for Lead Authorization</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {status === 'active' && (
                    <div className="flex flex-col justify-center items-center gap-8 animate-in fade-in py-10">
                        <div className="w-32 h-32 bg-white text-zinc-900 rounded-[3rem] flex items-center justify-center shadow-2xl transform rotate-3 relative">
                            <div className="absolute inset-0 bg-zinc-800 rounded-[3rem] transform -rotate-6 -z-10" />
                            <CheckCircle2 className="w-16 h-16" />
                        </div>
                        <div className="text-center space-y-4 pt-6">
                            <h4 className="font-black text-white text-3xl tracking-tighter uppercase">SPESIALIS AKTIF</h4>
                            <p className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.4em]">{roleType.toUpperCase()} Engineering Stage</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SpecialistActionCenter;
