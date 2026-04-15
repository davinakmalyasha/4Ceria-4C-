import React from 'react';
import axios from 'axios';
import {
    Star, MessageCircle, ExternalLink, Settings,
    FileText, Box, Check, Briefcase, BookOpen, Package,
    ShieldCheck, Clock, Pencil, Layers, Hammer, Wallet, Users
} from 'lucide-react';
import { PhaseKey } from '../../../types/phase.types';
import DesignBriefManager from './DesignBriefManager';
import DesignProgress from './DesignProgress';
import ProjectDeliverables from './ProjectDeliverables';
import ProjectReference from './ProjectReference';
import ProjectRequirements from '../ProjectRequirements';
import TechnicalResourcing from './TechnicalResourcing';
import ConstructionBriefManager from './ConstructionBriefManager';
import ConstructionProgress from './ConstructionProgress';
import DailySiteLog from './DailySiteLog';
import PaymentTermins from './PaymentTermins';
import MaterialOrderTracker from './MaterialOrderTracker';
import InteriorProgress from './InteriorProgress';
import InteriorBriefManager from './InteriorBriefManager';
import { useToast } from '../../../context/ToastContext';
import { PHASE_ORDER } from '../../../types/phase.types';

interface PhaseAssignedProProps {
    project: any;
    phaseKey: PhaseKey;
    user: any;
    config: { selectedKey: string; profileKey: string };
    onRefresh: () => void;
    onPhaseComplete?: (nextPhase: PhaseKey) => void;
    onOpenChat?: (user: any) => void;
    onViewProfile?: (pro: any, phaseKey: PhaseKey) => void;
}
export default function PhaseAssignedPro({
    project, phaseKey, user, config,
    onRefresh, onPhaseComplete, onOpenChat, onViewProfile
}: PhaseAssignedProProps) {
    const { showToast } = useToast();
    const pro = config.profileKey ? project?.[config.profileKey] : null;
    if (!pro && phaseKey !== 'materials') return null;

    const name = String(pro?.user?.name || pro?.nama || pro?.name || 'Professional');
    const rating = pro?.average_rating || 0;

    // Check if current user is the hired professional
    const isOwner = user?.id === project.user_id;
    const proUserId = pro?.user_id || pro?.user?.id;
    const isHiredPro = user?.role_type === config.profileKey && user?.id === proUserId;

    const [activeSubTab, setActiveSubTab] = React.useState(
        phaseKey === 'build' ? 'site_command' :
            phaseKey === 'materials' ? 'orders' :
                phaseKey === 'interior' ? 'planning' :
                    'managing'
    );

    const [isUpdating, setIsUpdating] = React.useState(false);
    const [isRequestingFee, setIsRequestingFee] = React.useState(false);
    const [feeTitle, setFeeTitle] = React.useState('');
    const [feeAmount, setFeeAmount] = React.useState('');
    const [feeDescription, setFeeDescription] = React.useState('');

    const handleRequestFee = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await axios.post(`/api/projects/${project.id}/budget/addendums`, {
                title: feeTitle,
                amount: parseFloat(feeAmount),
                description: feeDescription
            });
            showToast('Extra Fee Request submitted to Project Owner', 'success');
            setIsRequestingFee(false);
            setFeeTitle(''); setFeeAmount(''); setFeeDescription('');
        } catch (error) {
            showToast('Failed to submit request', 'error');
        }
    };

    const handleMarkComplete = async () => {
        if (!isOwner) return;

        const confirmMsg = `Are you sure you want to mark ${phaseKey} as completed? This will move your project forward.`;
        if (!window.confirm(confirmMsg)) return;

        setIsUpdating(true);
        try {
            const currentCompleted = project.completed_phases || [];
            if (!currentCompleted.includes(phaseKey)) {
                const nextCompleted = [...currentCompleted, phaseKey];

                // Prepare data for update
                const updateData: any = {
                    completed_phases: nextCompleted
                };

                // Logic for transitioning from design to build
                if (phaseKey === 'design') {
                    updateData.target_role = 'both';
                }

                await axios.put(`/projects/${project.id}`, updateData);

                showToast(`${phaseKey.charAt(0).toUpperCase() + phaseKey.slice(1)} phase completed!`, 'success');

                // 1. Refresh global project state
                onRefresh();

                // 2. Calculate next phase automatically
                if (typeof onPhaseComplete === 'function') {
                    const neededPhases = project.needed_phases && project.needed_phases.length > 0
                        ? project.needed_phases
                        : PHASE_ORDER;

                    const currentIndex = neededPhases.indexOf(phaseKey);

                    if (currentIndex !== -1 && currentIndex < neededPhases.length - 1) {
                        const nextPhase = neededPhases[currentIndex + 1] as PhaseKey;
                        // Small delay to ensure state reflects completion if needed
                        setTimeout(() => onPhaseComplete(nextPhase), 100);
                    }
                }
            }
        } catch (err: any) {
            console.error('Failed to complete phase:', err);
            showToast(err.response?.data?.message || 'Failed to update phase.', 'error');
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div className="bg-white border border-gray-100 rounded-[2.5rem] p-8 shadow-sm">
            {/* Design Package Sealed Banner — only in design tab */}
            {phaseKey === 'design' && project.design_completed_at && (
                <div className="mb-8 p-8 bg-black rounded-[3rem] border border-zinc-800 shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-zinc-800 rounded-full blur-[100px] opacity-20 -translate-y-1/2 translate-x-1/2" />
                    <div className="relative flex flex-col md:flex-row items-center justify-between gap-8">
                        <div className="flex items-center gap-6">
                            <div className="w-20 h-20 bg-zinc-800 text-white rounded-[2rem] flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform duration-700">
                                <ShieldCheck size={40} className="text-zinc-400" />
                            </div>
                            <div>
                                <h4 className="text-2xl font-black text-white tracking-tight">Design Package Sealed</h4>
                                <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.2em] mt-2 flex items-center gap-2">
                                    <Clock size={12} /> Handed over on {new Date(project.design_completed_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                                </p>
                            </div>
                        </div>
                        <div className="px-8 py-4 bg-zinc-800 rounded-2xl border border-zinc-700 flex flex-col items-center">
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Status</span>
                            <span className="text-emerald-400 text-xs font-black tracking-widest uppercase flex items-center gap-2">
                                <Check size={14} /> Ready for Build
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Owner Decision Panel — Only show after brief is locked */}
            {isOwner && !(project.completed_phases || []).includes(phaseKey) && (
                (phaseKey === 'design' && project.design_locked_at) ||
                (phaseKey === 'build' && project.construction_locked_at) ||
                !['design', 'build'].includes(phaseKey)
            ) && (
                    <div className="mb-8 p-6 bg-emerald-50 border-2 border-emerald-100 rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-500 shadow-sm">
                                <Check size={24} />
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-emerald-900 uppercase tracking-widest">Phase Progression</h4>
                                <p className="text-[10px] text-emerald-600 font-bold leading-tight max-w-xs">
                                    Working with {name}. Click below when this phase is ready to advance.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleMarkComplete}
                            disabled={isUpdating}
                            className="w-full md:w-auto px-8 py-3 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50"
                        >
                            {isUpdating ? 'Advancing...' : (phaseKey === 'design' ? 'Complete Design & Find Builder' : 'Mark as Completed')}
                        </button>
                    </div>
                )}

            {/* Architect Seal Workshop Button */}
            {isHiredPro && phaseKey === 'design' && !project.design_completed_at && (
                <div className="mb-8 p-8 bg-zinc-50 border border-zinc-200 rounded-[3rem] shadow-sm flex flex-col items-center text-center gap-6">
                    <div className="max-w-md">
                        <h4 className="text-xl font-black text-zinc-900 tracking-tight">Design Handover Workshop</h4>
                        <p className="text-xs text-zinc-500 font-bold mt-2 leading-relaxed uppercase tracking-wider">
                            By sealing this design, you certify that all blueprints, BoM, and technical specs are finalized and ready for procurement.
                            The owner will be notified to proceed with building.
                        </p>
                    </div>
                    <button
                        onClick={async () => {
                            if (project.requires_structural && !project.structural_id) {
                                showToast('Cannot seal design: A Structural Engineer is legally required but not hired.', 'error');
                                return;
                            }
                            if (!window.confirm("Seal design package? This officially hands over the project to the owner for construction.")) return;
                            setIsUpdating(true);
                            try {
                                await axios.post(`/api/projects/${project.id}/seal-design`);
                                showToast('Design Package Sealed & Handed Over', 'success');
                                onRefresh();
                            } catch (error: any) {
                                // Provide specific feedback if milestones are incomplete (422)
                                const message = error.response?.data?.message || 'Handover failed.';
                                showToast(message, 'error');
                            } finally {
                                setIsUpdating(false);
                            }
                        }}
                        disabled={isUpdating || (project.requires_structural && !project.structural_id)}
                        className={`group relative px-12 py-5 rounded-[2rem] font-black text-xs uppercase tracking-[0.25em] shadow-2xl transition-all flex items-center gap-4 overflow-hidden ${(project.requires_structural && !project.structural_id)
                            ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed opacity-70'
                            : 'bg-zinc-900 text-white hover:bg-black'
                            }`}
                    >
                        <ShieldCheck size={20} className={!(project.requires_structural && !project.structural_id) ? "group-hover:rotate-12 transition-transform" : ""} />
                        {isUpdating ? 'SEALING...' : 'SEAL & HANDOVER DESIGN'}
                    </button>
                </div>
            )}

            {/* Contractor Seal Workshop Button */}
            {isHiredPro && phaseKey === 'build' && !project.construction_completed_at && (
                <div className="mb-8 p-8 bg-slate-900 border border-slate-800 rounded-[3rem] shadow-sm flex flex-col items-center text-center gap-6">
                    <div className="max-w-md">
                        <h4 className="text-xl font-black text-white tracking-tight">Construction Handover Workshop</h4>
                        <p className="text-xs text-slate-500 font-bold mt-2 leading-relaxed uppercase tracking-wider">
                            By sealing this construction package, you certify that the physical building matches all blueprints and the site is ready for handover.
                            The project will be marked as Construction Completed.
                        </p>
                    </div>
                    <button
                        onClick={async () => {
                            if (!window.confirm("Seal construction package? This formally completes the build phase.")) return;
                            setIsUpdating(true);
                            try {
                                await axios.post(`/api/projects/${project.id}/seal-construction`);
                                showToast('Construction Package Sealed & Completed', 'success');
                                onRefresh();
                            } catch (error: any) {
                                const message = error.response?.data?.message || 'Handover failed.';
                                showToast(message, 'error');
                            } finally {
                                setIsUpdating(false);
                            }
                        }}
                        disabled={isUpdating}
                        className="group relative px-12 py-5 bg-white text-slate-900 rounded-[2rem] font-black text-xs uppercase tracking-[0.25em] shadow-2xl hover:bg-slate-50 transition-all flex items-center gap-4 overflow-hidden"
                    >
                        <ShieldCheck size={20} className="group-hover:rotate-12 transition-transform" />
                        {isUpdating ? 'SEALING...' : 'SEAL & HANDOVER SITE'}
                    </button>
                </div>
            )}

            {/* Interior Designer Seal Workshop Button */}
            {isHiredPro && phaseKey === 'interior' && !project.interior_completed_at && (
                <div className="mb-8 p-8 bg-purple-900 border border-purple-800 rounded-[3rem] shadow-sm flex flex-col items-center text-center gap-6">
                    <div className="max-w-md">
                        <h4 className="text-xl font-black text-white tracking-tight">Interior Design Handover</h4>
                        <p className="text-xs text-purple-400 font-bold mt-2 leading-relaxed uppercase tracking-wider">
                            By sealing this interior package, you certify that all room designs, mood boards, and specifications
                            are finalized and approved by the client.
                        </p>
                    </div>
                    <button
                        onClick={async () => {
                            if (!window.confirm("Seal interior design? This formally completes the interior phase.")) return;
                            setIsUpdating(true);
                            try {
                                await axios.post(`/api/projects/${project.id}/seal-interior`);
                                showToast('Interior Design Sealed & Completed', 'success');
                                onRefresh();
                            } catch (error: any) {
                                const message = error.response?.data?.message || 'Seal failed.';
                                showToast(message, 'error');
                            } finally {
                                setIsUpdating(false);
                            }
                        }}
                        disabled={isUpdating}
                        className="group relative px-12 py-5 bg-white text-purple-900 rounded-[2rem] font-black text-xs uppercase tracking-[0.25em] shadow-2xl hover:bg-purple-50 transition-all flex items-center gap-4 overflow-hidden"
                    >
                        <ShieldCheck size={20} className="group-hover:rotate-12 transition-transform" />
                        {isUpdating ? 'SEALING...' : 'SEAL & HANDOVER INTERIOR'}
                    </button>
                </div>
            )}

            {pro && (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 pb-8 border-b border-gray-50">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center overflow-hidden shadow-inner">
                            {pro?.foto ? (
                                <img src={`/storage/${pro.foto}`} alt={name} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-xl font-black text-gray-400">{name.charAt(0)}</span>
                            )}
                        </div>
                        <div>
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-0.5">Assigned Professional</p>
                            <h3 className="text-xl font-black text-slate-900 tracking-tight">{name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <Star size={14} className="text-amber-400 fill-amber-400" />
                                <span className="text-sm text-slate-500 font-bold">{rating}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 items-center flex-wrap">
                        <a
                            href={pro?.user?.phone_number ? `https://wa.me/${String(pro.user.phone_number).replace(/\D/g, '').replace(/^0/, '62')}` : '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-2 px-6 py-3 bg-[#25D366] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg ${!pro?.user?.phone_number ? 'opacity-50 cursor-not-allowed' : ''}`}
                            onClick={(e) => !pro?.user?.phone_number && e.preventDefault()}
                        >
                            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg> WhatsApp
                        </a>
                        <button
                            onClick={() => onOpenChat && pro?.user && onOpenChat(pro.user)}
                            className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg"
                        >
                            <MessageCircle size={14} /> Open Channel
                        </button>
                        <button
                            onClick={() => onViewProfile && onViewProfile(pro, phaseKey)}
                            className="p-3 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-2xl transition-all"
                        >
                            <ExternalLink size={20} />
                        </button>
                        {isHiredPro && (
                            <button
                                onClick={() => setIsRequestingFee(true)}
                                className="flex items-center gap-2 px-6 py-3 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                            >
                                <Wallet size={14} /> Request Extra Fee
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Extra Fee Modal */}
            {isRequestingFee && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl animate-fade-in">
                        <h3 className="text-xl font-black text-slate-900 mb-2">Request Extra Fee (Addendum)</h3>
                        <p className="text-sm text-slate-500 mb-6">Submit a formal request for sudden costs or additional work. The Project Owner must approve this before it is added to your ledger.</p>
                        <form onSubmit={handleRequestFee} className="space-y-4">
                            <div>
                                <label className="block text-[10px] uppercase tracking-widest font-black text-slate-400 mb-1">Fee Title</label>
                                <input type="text" value={feeTitle} onChange={e => setFeeTitle(e.target.value)} required placeholder="e.g. 3 Extra Revisions" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:border-slate-400 outline-none" />
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase tracking-widest font-black text-slate-400 mb-1">Amount (Rp)</label>
                                <input type="number" value={feeAmount} onChange={e => setFeeAmount(e.target.value)} required min="1" placeholder="e.g. 2500000" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:border-slate-400 outline-none" />
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase tracking-widest font-black text-slate-400 mb-1">Reason / Description</label>
                                <textarea value={feeDescription} onChange={e => setFeeDescription(e.target.value)} required rows={3} placeholder="Explain why this extra cost is needed..." className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:border-slate-400 outline-none resize-none" />
                            </div>
                            <div className="flex gap-3 pt-4 border-t border-slate-100">
                                <button type="submit" className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all">Submit Request</button>
                                <button type="button" onClick={() => setIsRequestingFee(false)} className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* If Design Phase, show the Workspace Navigation */}
            {phaseKey === 'design' && (
                <div className="space-y-8">
                    <div className="flex items-center gap-1 p-1 bg-slate-50 rounded-2xl w-fit overflow-x-auto">
                        {[
                            { id: 'managing', label: project.design_locked_at ? 'Brief' : 'Planning', icon: Settings },
                            { id: 'progress', label: 'Design Progress', icon: FileText },
                            { id: 'technical', label: 'Technical Resourcing', icon: Users },
                            { id: 'bom', label: 'Bill of Materials', icon: Package },
                            { id: 'reference', label: 'Brief & Proposal', icon: BookOpen },
                            { id: 'results', label: 'Results & Files', icon: Box }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveSubTab(tab.id)}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeSubTab === tab.id
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-400 hover:text-slate-600'
                                    }`}
                            >
                                <tab.icon size={14} />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="transition-all">
                        {activeSubTab === 'managing' && (
                            <DesignBriefManager
                                project={project}
                                isArchitect={isHiredPro}
                                onRefresh={onRefresh}
                            />
                        )}
                        {activeSubTab === 'progress' && (
                            <DesignProgress project={project} currentUser={user} isArchitect={isHiredPro} />
                        )}
                        {activeSubTab === 'technical' && (
                            <TechnicalResourcing project={project} user={user} isArchitect={isHiredPro} onRefresh={onRefresh} />
                        )}
                        {activeSubTab === 'reference' && (
                            <ProjectReference project={project} user={user} isArchitect={isHiredPro} />
                        )}
                        {activeSubTab === 'bom' && (
                            <ProjectRequirements
                                project={project}
                                onUpdate={onRefresh}
                                hideInventoryActions={isHiredPro && user.role_type === 'arsitek'}
                            />
                        )}
                        {activeSubTab === 'results' && (
                            <ProjectDeliverables project={project} currentUser={user} isPro={isHiredPro} />
                        )}
                    </div>
                </div>
            )}

            {/* If Build Phase, show the Contractor Workspace Navigation */}
            {phaseKey === 'build' && (
                <div className="space-y-8">
                    <div className="flex items-center gap-1 p-1 bg-slate-50 rounded-2xl w-fit overflow-x-auto">
                        {[
                            { id: 'site_command', label: project.construction_locked_at ? 'Brief' : 'Planning', icon: Settings },
                            { id: 'progress', label: 'Build Progress', icon: Hammer },
                            { id: 'logs', label: 'Daily Logs', icon: Layers },
                            { id: 'payments', label: 'Payment Termins', icon: Wallet },
                            { id: 'results', label: 'Results & Files', icon: Box }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveSubTab(tab.id)}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeSubTab === tab.id
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-400 hover:text-slate-600'
                                    }`}
                            >
                                <tab.icon size={14} />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="transition-all">
                        {activeSubTab === 'site_command' && (
                            <ConstructionBriefManager
                                key={`${project.id}-${project.updated_at}`}
                                project={project}
                                isContractor={isHiredPro}
                                onRefresh={onRefresh}
                            />
                        )}
                        {activeSubTab === 'progress' && (
                            <ConstructionProgress
                                project={project}
                                currentUser={user}
                                isContractor={isHiredPro}
                            />
                        )}

                        {activeSubTab === 'logs' && (
                            <DailySiteLog
                                project={project}
                                isContractor={isHiredPro}
                            />
                        )}
                        {activeSubTab === 'payments' && (
                            <PaymentTermins
                                project={project}
                                isContractor={isHiredPro}
                            />
                        )}
                        {activeSubTab === 'results' && (
                            <ProjectDeliverables project={project} currentUser={user} isPro={isHiredPro} />
                        )}
                    </div>
                </div>
            )}

            {/* Material Phase Workspace */}
            {phaseKey === 'materials' && (
                <div className="space-y-8">
                    <div className="flex items-center gap-1 p-1 bg-slate-50 rounded-2xl w-fit overflow-x-auto">
                        {[
                            { id: 'orders', label: 'Order Tracker', icon: Package },
                            { id: 'bom', label: 'Bill of Materials', icon: Layers },
                            { id: 'results', label: 'Results & Files', icon: Box }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveSubTab(tab.id)}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeSubTab === tab.id
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-400 hover:text-slate-600'
                                    }`}
                            >
                                <tab.icon size={14} />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="transition-all">
                        {activeSubTab === 'orders' && (
                            <MaterialOrderTracker project={project} currentUser={user} />
                        )}
                        {activeSubTab === 'bom' && (
                            <ProjectRequirements project={project} onUpdate={onRefresh} />
                        )}
                        {activeSubTab === 'results' && (
                            <ProjectDeliverables project={project} currentUser={user} isPro={isHiredPro} />
                        )}
                    </div>
                </div>
            )}

            {/* Interior Phase Workspace */}
            {phaseKey === 'interior' && (
                <div className="space-y-8">
                    <div className="flex items-center gap-1 p-1 bg-slate-50 rounded-2xl w-fit overflow-x-auto">
                        {[
                            { id: 'planning', label: project.interior_locked_at ? 'Brief' : 'Planning', icon: Settings },
                            { id: 'progress', label: 'Room Designs', icon: Layers },
                            { id: 'results', label: 'Results & Files', icon: Box }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveSubTab(tab.id)}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeSubTab === tab.id
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-400 hover:text-slate-600'
                                    }`}
                            >
                                <tab.icon size={14} />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="transition-all">
                        {activeSubTab === 'planning' && (
                            <InteriorBriefManager
                                project={project}
                                isInteriorDesigner={isHiredPro}
                                onRefresh={onRefresh}
                            />
                        )}
                        {activeSubTab === 'progress' && (
                            <InteriorProgress
                                project={project}
                                currentUser={user}
                                isInteriorDesigner={isHiredPro}
                            />
                        )}
                        {activeSubTab === 'results' && (
                            <ProjectDeliverables project={project} currentUser={user} isPro={isHiredPro} />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
