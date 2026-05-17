import React from 'react';
import { Share2, UserPlus, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import axios from 'axios';
import { useToast } from '../../../context/ToastContext';
import ImportExternalVendorModal from './ImportExternalVendorModal';

interface PhaseInitiationPanelProps {
    projectId: number;
    phaseKey: string;
    phaseLabel: string;
    onRefresh: () => void;
}

export default function PhaseInitiationPanel({
    projectId,
    phaseKey,
    phaseLabel,
    onRefresh,
    project // New prop
}: any) {
    const { showToast } = useToast();
    const [isBroadcasting, setIsBroadcasting] = React.useState(false);
    const [isAutoPilot, setIsAutoPilot] = React.useState(false); // New state
    const [showImportModal, setShowImportModal] = React.useState(false);

    // Map PhaseKey to DB role
    const ROLE_MAP = {
        management: 'project_manager',
        legal: 'notaris',
        technical: 'structural', // Structural is the primary technical role
        design: 'arsitek',
        build: 'kontraktor',
        interior: 'interior'
    };

    const currentRole = ROLE_MAP[phaseKey] || phaseKey;

    const choice = project?.bidding_choices?.[currentRole];
    const isPublished = project?.published_bidding_roles?.includes(currentRole);
    const isAutoPilotChoice = ['find', 'cert_only'].includes(choice) && !isPublished;
    
    // Safety lock to prevent double-triggering in a single session
    const hasTriggered = React.useRef(false);

    // Auto-Pilot Logic: If wizard choice was "find" or "cert_only", do it automatically
    React.useEffect(() => {
        if (isAutoPilotChoice && !isBroadcasting && !isAutoPilot && !hasTriggered.current) {
            console.log(`[DEBUG] Auto-Pilot Triggered for ${currentRole}`);
            hasTriggered.current = true;
            setIsAutoPilot(true);
            handleBroadcast();
        }
    }, [phaseKey, project, choice, isAutoPilotChoice]);

    const handleBroadcast = async () => {
        setIsBroadcasting(true);
        try {
            if (phaseKey === 'technical') {
                await Promise.all([
                    axios.post(`/projects/${projectId}/broadcast-phase`, { role: 'structural' }),
                    axios.post(`/projects/${projectId}/broadcast-phase`, { role: 'mep' })
                ]);
            } else {
                await axios.post(`/projects/${projectId}/broadcast-phase`, {
                    role: currentRole
                });
            }
            showToast(`${phaseLabel} phase published to Bidding Board!`, 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to publish phase.', 'error');
            setIsAutoPilot(false); 
            hasTriggered.current = false;
        } finally {
            setIsBroadcasting(false);
        }
    };

    if (isAutoPilot || isBroadcasting) {
        return (
            <div className="bg-slate-950 border-2 border-white/5 rounded-[3rem] p-16 shadow-2xl text-center relative overflow-hidden group">
                {/* Animated Background Gradients */}
                <div className="absolute inset-0 bg-gradient-to-br from-red-600/10 via-transparent to-blue-600/10 animate-pulse" />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent" />
                
                <div className="relative z-10 space-y-8">
                    <div className="relative inline-block">
                        <div className="absolute inset-0 bg-red-500 blur-3xl opacity-20 animate-pulse" />
                        <div className="w-24 h-24 bg-zinc-900 border-2 border-white/10 text-red-500 rounded-[2rem] flex items-center justify-center mx-auto shadow-2xl relative">
                            <Zap size={48} className="fill-red-500 animate-pulse" />
                        </div>
                    </div>
                    
                    <div className="space-y-3">
                        <h3 className="text-3xl font-black text-white tracking-tighter uppercase italic">Auto-Pilot Engaged</h3>
                        <div className="flex flex-col items-center gap-1">
                            <p className="text-xs font-black text-red-500 uppercase tracking-[0.2em]">Executing Strategic Decision</p>
                            <p className="text-sm font-bold text-slate-400 max-w-sm mx-auto leading-relaxed">
                                We're broadcasting the <span className="text-white">{phaseLabel}</span> phase to the Papan Lelang based on your Wizard choices.
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-center gap-3 pt-4">
                        {[0, 1, 2].map((i) => (
                            <div 
                                key={i}
                                className="w-3 h-3 bg-red-500 rounded-full animate-bounce"
                                style={{ animationDelay: `${i * 0.15}s` }}
                            />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (isAutoPilotChoice) return null;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="bg-white border-2 border-slate-900 rounded-[3rem] p-10 shadow-2xl relative overflow-hidden group">
                {/* Decorative Background */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-slate-50 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2 group-hover:bg-slate-100 transition-colors" />
                
                <div className="relative">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center">
                            <Zap size={24} />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Phase Initiation Required</h3>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">This phase is currently locked and invisible to professionals.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
                        {/* Option 1: Broadcast */}
                        <div className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-[2.5rem] p-8 transition-all group/card cursor-pointer flex flex-col justify-between" onClick={handleBroadcast}>
                            <div>
                                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-slate-900 shadow-sm mb-6 group-hover/card:scale-110 transition-transform">
                                    <Share2 size={28} />
                                </div>
                                <h4 className="text-lg font-black text-slate-900 tracking-tight mb-2">Broadcast to Bidding Board</h4>
                                <p className="text-sm text-slate-500 font-medium leading-relaxed">
                                    Publish this phase to the 4C Public Board. Verified professionals will be able to view details and submit proposals.
                                </p>
                            </div>
                            <div className="mt-8 flex items-center justify-between">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Public Discovery</span>
                                <div className="p-3 bg-white text-slate-900 rounded-xl shadow-sm group-hover/card:translate-x-2 transition-transform">
                                    {isBroadcasting ? <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" /> : <ArrowRight size={20} />}
                                </div>
                            </div>
                        </div>

                        {/* Option 2: Import */}
                        <div className="bg-slate-900 hover:bg-black border border-slate-800 rounded-[2.5rem] p-8 transition-all group/card cursor-pointer flex flex-col justify-between shadow-xl" onClick={() => setShowImportModal(true)}>
                            <div>
                                <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-white shadow-sm mb-6 group-hover/card:scale-110 transition-transform">
                                    <UserPlus size={28} />
                                </div>
                                <h4 className="text-lg font-black text-white tracking-tight mb-2">Import External Professional</h4>
                                <p className="text-sm text-slate-400 font-medium leading-relaxed">
                                    Already have an offline {phaseLabel}? Bring them into the 4C workflow to manage their milestones and files in one place.
                                </p>
                            </div>
                            <div className="mt-8 flex items-center justify-between">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Workspace Management</span>
                                <div className="p-3 bg-white/10 text-white rounded-xl shadow-sm group-hover/card:translate-x-2 transition-transform">
                                    <ArrowRight size={20} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-10 pt-8 border-t border-slate-100 flex items-center gap-3">
                        <ShieldCheck size={16} className="text-emerald-500" />
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">You maintain full control over who access your project data.</p>
                    </div>
                </div>
            </div>

            {showImportModal && (
                <ImportExternalVendorModal
                    projectId={projectId}
                    phaseKey={phaseKey}
                    phaseLabel={phaseLabel}
                    onSuccess={onRefresh}
                    onClose={() => setShowImportModal(false)}
                />
            )}
        </div>
    );
}
