import React from 'react';
import axios from 'axios';
import {
    Star, MessageCircle, ExternalLink, Settings,
    FileText, Box, Check, Briefcase, BookOpen, Package,
    ShieldCheck, Clock, Pencil, Layers, Hammer, Wallet, Users, AlertTriangle, LogOut,
    FolderOpen, Plus, DollarSign, UserPlus
} from 'lucide-react';
import LifecycleActionModal from '../Details/LifecycleActionModal';
import AddendumProposalModal from './AddendumProposalModal';
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
import MaterialOrderTracker from './MaterialOrderTracker';
import InteriorProgress from './InteriorProgress';
import InteriorBriefManager from './InteriorBriefManager';
import LegalBriefManager from './LegalBriefManager';
import LegalProgress from './LegalProgress';
import LegalVault from './LegalVault';
import { ErrorBoundary } from '../../Common/ErrorBoundary';
import StickyNotesLayer from './StickyNotesLayer';
import ProfessionalNegotiationCard from './ProfessionalNegotiationCard';
import SpecialistActionCenter from './SpecialistActionCenter';
import { useToast } from '../../../context/ToastContext';
import { PHASE_ORDER } from '../../../types/phase.types';

interface PhaseAssignedProProps {
    project: any;
    phaseKey: PhaseKey;
    activeSubRole?: string;
    user: any;
    config: { selectedKey: string; profileKey: string };
    onRefresh: () => void;
    onPhaseComplete?: (nextPhase: PhaseKey) => void;
    onOpenChat?: (user: any) => void;
    onViewProfile?: (pro: any, phaseKey: PhaseKey) => void;
    isContractor?: boolean;
    onGoToPayments?: () => void;
    onShortlist?: (bidId: number, role: string) => void;
    onRecommend?: (bidId: number, role: string) => void;
}
export default function PhaseAssignedPro({
    project, phaseKey, activeSubRole, user, config,
    onRefresh, onPhaseComplete, onOpenChat, onViewProfile,
    onGoToPayments, onShortlist, onRecommend
}: PhaseAssignedProProps) {
    const { showToast } = useToast();
    const ROLE_MAP: Record<string, string> = {
        management: 'project_manager',
        legal: 'notaris',
        design: 'arsitek',
        build: 'kontraktor',
        interior: 'interior',
        technical: 'structural',
        structural: 'structural',
        mep: 'mep'
    };
    const roleKey = activeSubRole || ROLE_MAP[phaseKey] || phaseKey;
    const bidKey = config.bidKey;
    const acceptedBid = bidKey ? project?.[bidKey]?.find((b: any) => 
        ['accepted', 'contract_pending', 'active', 'awaiting_payment'].includes(b.status)
    ) : null;
    const pro = (config.profileKey ? project?.[config.profileKey] : null) || acceptedBid?.bidder;
    const externalVendor = project.external_vendors?.find((v: any) => v.phase_role === roleKey);
    const isHiredContractor = user?.role_type === 'kontraktor' && project.selected_kontraktor_id === user?.id;

    if (!pro && !externalVendor && phaseKey !== 'materials' && !(phaseKey === 'interior' && isHiredContractor)) return null;

    const name = pro 
        ? String(pro?.user?.name || pro?.nama || pro?.name || 'Professional') 
        : (externalVendor ? externalVendor.contact_person : (isHiredContractor ? 'Contractor Coordination' : 'Professional'));
    
    const rating = pro?.average_rating || 0;

    // Check if current user is the hired professional
    const isOwner = user?.id === project.user_id;
    const proUserId = pro?.user_id || pro?.user?.id;
    const isHiredPro = user?.role_type === config.profileKey && user?.id === proUserId;
    const isExternal = !!externalVendor && !pro;

    const [activeSubTab, setActiveSubTab] = React.useState(
        phaseKey === 'legal' ? 'planning' :
            phaseKey === 'build' ? 'site_command' :
                phaseKey === 'materials' ? 'orders' :
                    phaseKey === 'interior' ? 'planning' :
                        'managing'
    );

    const [isUpdating, setIsUpdating] = React.useState(false);
    const [isAddendumModalOpen, setIsAddendumModalOpen] = React.useState(false);
    const [initialAddendumType, setInitialAddendumType] = React.useState<'extra_fee' | 'specialist_assignment'>('extra_fee');
    const [isResignModalOpen, setIsResignModalOpen] = React.useState(false);

    const isPM = user?.role_type === 'project_manager' && project.pm_id === user.id;

    const submittedAt = 
        phaseKey === 'design' ? project.design_handover_submitted_at :
        phaseKey === 'build' ? project.construction_handover_submitted_at :
        phaseKey === 'interior' ? project.interior_handover_submitted_at : null;

    const revisionNotes = 
        phaseKey === 'design' ? project.design_handover_notes :
        phaseKey === 'build' ? project.construction_handover_notes :
        phaseKey === 'interior' ? project.interior_handover_notes : null;



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
    const handleResign = async (reason: string) => {
        try {
            await axios.post(`/projects/${project.id}/resign`, { reason });
            showToast('Anda berhasil mengundurkan diri dari proyek.', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Gagal mengundurkan diri.', 'error');
            throw error;
        }
    };

    return (
        <div className="bg-white border border-gray-100 rounded-[2.5rem] p-8 shadow-sm relative">

            {/* ACTIVE NEGOTIATIONS SECTION — Visible across all phases for the hired pro */}
            {isHiredPro && project.addendums?.some((a: any) => a.status === 'negotiating' && a.user_id === user.id) && (
                <div className="mb-8 space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center shadow-sm">
                            <DollarSign size={20} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 tracking-tight">Financial Hub</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Fee Negotiations</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-6">
                        {project.addendums
                            .filter((a: any) => a.status === 'negotiating' && a.user_id === user.id)
                            .map((addendum: any) => (
                                <ProfessionalNegotiationCard 
                                    key={addendum.id}
                                    addendum={addendum}
                                    project={project}
                                    onRefresh={onRefresh}
                                />
                            ))
                        }
                    </div>
                </div>
            )}
            
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

            {/* Architect Handover Workshop Button */}
            {isHiredPro && phaseKey === 'design' && !project.design_completed_at && (
                <div className="mb-8 p-8 bg-zinc-50 border border-zinc-200 rounded-[3rem] shadow-sm flex flex-col items-center text-center gap-6">
                    <div className="max-w-md">
                        <h4 className="text-xl font-black text-zinc-900 tracking-tight">Design Handover Workshop</h4>
                        <p className="text-xs text-zinc-500 font-bold mt-2 leading-relaxed uppercase tracking-wider">
                            By requesting handover, you certify that all blueprints, BoM, and technical specs are finalized. 
                            The PM will technically verify the package before it is sealed.
                        </p>
                    </div>

                    {submittedAt && (
                        <div className="px-6 py-3 bg-amber-50 border border-amber-100 rounded-2xl flex items-center gap-3 animate-pulse">
                            <Clock size={16} className="text-amber-500" />
                            <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Awaiting PM Verification Since {new Date(submittedAt).toLocaleDateString()}</span>
                        </div>
                    )}

                    {revisionNotes && !submittedAt && (
                        <div className="p-5 bg-red-50 border border-red-100 rounded-2xl text-left w-full">
                            <div className="flex items-center gap-2 mb-2 text-red-600">
                                <AlertTriangle size={16} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Handover Needs Revision</span>
                            </div>
                            <p className="text-xs font-bold text-red-700">{revisionNotes}</p>
                        </div>
                    )}

                    <button
                        onClick={async () => {
                            if (project.requires_structural && !project.structural_id) {
                                showToast('Cannot submit: A Structural Engineer is legally required but not hired.', 'error');
                                return;
                            }
                            if (!window.confirm("Submit design package for PM verification?")) return;
                            setIsUpdating(true);
                            try {
                                await axios.post(`/projects/${project.id}/seal-design`);
                                showToast('Design Package Submitted for Review', 'success');
                                onRefresh();
                            } catch (error: any) {
                                const message = error.response?.data?.message || 'Handover failed.';
                                showToast(message, 'error');
                            } finally {
                                setIsUpdating(false);
                            }
                        }}
                        disabled={isUpdating || !!submittedAt || (project.requires_structural && !project.structural_id)}
                        className={`group relative px-12 py-5 rounded-[2rem] font-black text-xs uppercase tracking-[0.25em] shadow-2xl transition-all flex items-center gap-4 overflow-hidden ${(project.requires_structural && !project.structural_id) || submittedAt
                            ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed opacity-70'
                            : 'bg-zinc-900 text-white hover:bg-black'
                            }`}
                    >
                        <ShieldCheck size={20} className={!(project.requires_structural && !project.structural_id) && !submittedAt ? "group-hover:rotate-12 transition-transform" : ""} />
                        {isUpdating ? 'SUBMITTING...' : submittedAt ? 'PENDING PM REVIEW' : revisionNotes ? 'RESUBMIT HANDOVER' : 'SUBMIT DESIGN PACKAGE'}
                    </button>
                </div>
            )}

            {/* Contractor Handover Workshop Button */}
            {isHiredPro && phaseKey === 'build' && !project.construction_completed_at && (
                <div className="mb-8 p-8 bg-slate-900 border border-slate-800 rounded-[3rem] shadow-sm flex flex-col items-center text-center gap-6">
                    <div className="max-w-md">
                        <h4 className="text-xl font-black text-white tracking-tight">Construction Handover Site</h4>
                        <p className="text-xs text-slate-500 font-bold mt-2 leading-relaxed uppercase tracking-wider">
                            Submit the physical site for PM verification. By doing this, you certify that the build matches all finalized blueprints.
                        </p>
                    </div>

                    {submittedAt && (
                        <div className="px-6 py-3 bg-white/10 rounded-2xl flex items-center gap-3 animate-pulse">
                            <Clock size={16} className="text-emerald-400" />
                            <span className="text-[10px] font-black text-white/70 uppercase tracking-widest">PM Review in Progress Since {new Date(submittedAt).toLocaleDateString()}</span>
                        </div>
                    )}

                    {revisionNotes && !submittedAt && (
                        <div className="p-5 bg-red-400/10 border border-red-400/20 rounded-2xl text-left w-full">
                            <div className="flex items-center gap-2 mb-2 text-red-400">
                                <AlertTriangle size={16} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Handover Needs Revision</span>
                            </div>
                            <p className="text-xs font-bold text-red-100">{revisionNotes}</p>
                        </div>
                    )}

                    <button
                        onClick={async () => {
                            if (!window.confirm("Submit construction handover for PM verification?")) return;
                            setIsUpdating(true);
                            try {
                                await axios.post(`/projects/${project.id}/seal-construction`);
                                showToast('Handover Request Sent to PM', 'success');
                                onRefresh();
                            } catch (error: any) {
                                const message = error.response?.data?.message || 'Handover failed.';
                                showToast(message, 'error');
                            } finally {
                                setIsUpdating(false);
                            }
                        }}
                        disabled={isUpdating || !!submittedAt}
                        className="group relative px-12 py-5 bg-white text-slate-900 rounded-[2rem] font-black text-xs uppercase tracking-[0.25em] shadow-2xl hover:bg-slate-50 transition-all flex items-center gap-4 overflow-hidden disabled:opacity-50"
                    >
                        <ShieldCheck size={20} className={!submittedAt ? "group-hover:rotate-12 transition-transform" : ""} />
                        {isUpdating ? 'SUBMITTING...' : submittedAt ? 'PENDING VERIFICATION' : revisionNotes ? 'RESUBMIT HANDOVER' : 'REQUEST SITE HANDOVER'}
                    </button>
                </div>
            )}

            {/* PM HANDOVER REDIRECT */}
            {isPM && submittedAt && !(project.completed_phases || []).includes(phaseKey) && (
                <div className="mb-8 p-8 bg-emerald-50 border-2 border-emerald-100 rounded-[3rem] shadow-sm flex items-center gap-6">
                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-[2rem] flex items-center justify-center shadow-inner">
                        <ShieldCheck size={32} />
                    </div>
                    <div>
                        <h4 className="text-xl font-black text-emerald-900 tracking-tight">Handover Review Pending</h4>
                        <p className="text-sm text-emerald-700 font-bold mt-1">
                            A technical handover has been submitted for this phase. Please go to your <b>PM Dashboard (Overview Tab)</b> to review and seal this phase in the Unified Handover Queue.
                        </p>
                    </div>
                </div>
            )}

            {/* Interior Designer Handover Workshop Button */}
            {isHiredPro && phaseKey === 'interior' && !project.interior_completed_at && (
                <div className="mb-8 p-8 bg-purple-900 border border-purple-800 rounded-[3rem] shadow-sm flex flex-col items-center text-center gap-6">
                    <div className="max-w-md">
                        <h4 className="text-xl font-black text-white tracking-tight">Interior Design Handover</h4>
                        <p className="text-xs text-purple-400 font-bold mt-2 leading-relaxed uppercase tracking-wider">
                            By submitting this interior package, you certify that all room designs, mood boards, and specifications
                            are finalized. The PM will verify the deliverables.
                        </p>
                    </div>

                    {submittedAt && (
                        <div className="px-6 py-3 bg-white/10 rounded-2xl flex items-center gap-3 animate-pulse">
                            <Clock size={16} className="text-purple-300" />
                            <span className="text-[10px] font-black text-white/70 uppercase tracking-widest">Awaiting Verification Since {new Date(submittedAt).toLocaleDateString()}</span>
                        </div>
                    )}

                    {revisionNotes && !submittedAt && (
                        <div className="p-5 bg-purple-400/10 border border-purple-400/20 rounded-2xl text-left w-full">
                            <div className="flex items-center gap-2 mb-2 text-purple-300">
                                <AlertTriangle size={16} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Revision Requested</span>
                            </div>
                            <p className="text-xs font-bold text-purple-100">{revisionNotes}</p>
                        </div>
                    )}

                    <button
                        onClick={async () => {
                            if (!window.confirm("Submit interior design for verification?")) return;
                            setIsUpdating(true);
                            try {
                                await axios.post(`/projects/${project.id}/seal-interior`);
                                showToast('Interior Handover Submitted', 'success');
                                onRefresh();
                            } catch (error: any) {
                                const message = error.response?.data?.message || 'Seal failed.';
                                showToast(message, 'error');
                            } finally {
                                setIsUpdating(false);
                            }
                        }}
                        disabled={isUpdating || !!submittedAt}
                        className="group relative px-12 py-5 bg-white text-purple-900 rounded-[2rem] font-black text-xs uppercase tracking-[0.25em] shadow-2xl hover:bg-purple-50 transition-all flex items-center gap-4 overflow-hidden disabled:opacity-50"
                    >
                        <ShieldCheck size={20} className={!submittedAt ? "group-hover:rotate-12 transition-transform" : ""} />
                        {isUpdating ? 'SUBMITTING...' : submittedAt ? 'PENDING PM REVIEW' : revisionNotes ? 'RESUBMIT INTERIOR' : 'SUBMIT INTERIOR HANDOVER'}
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
                            <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Assigned Professional</p>
                                {isExternal && (
                                    <span className="px-2 py-0.5 bg-slate-900 text-white text-[8px] font-black rounded-md tracking-tighter">EXTERNAL</span>
                                )}
                            </div>
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
                                onClick={() => {
                                    setInitialAddendumType('specialist_assignment');
                                    setIsAddendumModalOpen(true);
                                }}
                                className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white hover:bg-black rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg"
                            >
                                <UserPlus size={14} /> Bring Own Team
                            </button>
                        )}
                        {isHiredPro && (
                            <button
                                onClick={() => setIsResignModalOpen(true)}
                                className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 hover:bg-red-100 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                            >
                                <LogOut size={14} /> Resign Proyek
                            </button>
                        )}
                    </div>
                </div>
            )}

            <AddendumProposalModal 
                project={project}
                isOpen={isAddendumModalOpen}
                initialType={initialAddendumType}
                onClose={() => setIsAddendumModalOpen(false)}
                onRefresh={onRefresh}
            />

            {/* If Legal Phase, show the Legal Workspace Navigation */}
            {phaseKey === 'legal' && (
                <div className="space-y-8">
                    <div className="flex items-center gap-1 p-1 bg-slate-50 rounded-2xl w-fit overflow-x-auto">
                        {[
                            { id: 'planning', label: 'Contract & Scope', icon: FileText },
                            { id: 'vault', label: 'Official Document Vault', icon: ShieldCheck },
                            { id: 'progress', label: 'Notary Progress', icon: Layers },
                            { id: 'archive', label: 'Architect Technical Files', icon: FolderOpen },
                        ].filter(Boolean).map((tab: any) => (
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
                            <LegalBriefManager
                                project={project}
                                onRefresh={onRefresh}
                            />
                        )}
                        {activeSubTab === 'vault' && (
                            <ErrorBoundary name="LegalVault">
                                <LegalVault
                                    project={project}
                                    currentUser={user}
                                    isNotaris={isHiredPro}
                                    isArchitect={user?.role_type === 'arsitek' && project.selected_arsitek_id === user?.id}
                                    isPM={isPM}
                                    isOwner={isOwner}
                                    onUpdate={onRefresh}
                                />
                            </ErrorBoundary>
                        )}
                        {activeSubTab === 'progress' && (
                            <ErrorBoundary name="LegalProgress">
                                <LegalProgress
                                    project={project}
                                    currentUser={user}
                                    isNotaris={isHiredPro}
                                    onUpdate={onRefresh}
                                    onGoToPayments={onGoToPayments}
                                />
                            </ErrorBoundary>
                        )}
                        {activeSubTab === 'archive' && (
                            <ProjectDeliverables 
                                project={project} 
                                currentUser={user} 
                                isPro={isHiredPro || isPM || isOwner} 
                            />
                        )}
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
                            { id: 'bom', label: 'Bill of Materials', icon: Package }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveSubTab(tab.id)}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap relative ${activeSubTab === tab.id
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-400 hover:text-slate-600'
                                    }`}
                            >
                                <tab.icon size={14} />
                                {tab.label}
                                {tab.count > 0 && (
                                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] flex items-center justify-center rounded-full border-2 border-white animate-bounce">
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="transition-all">
                        {activeSubTab === 'managing' && (
                            <DesignBriefManager
                                project={project}
                                isArchitect={isHiredPro}
                                isOwner={isOwner}
                                isPM={isPM}
                                onRefresh={onRefresh}
                            />
                        )}
                        {activeSubTab === 'progress' && (
                            <DesignProgress project={project} currentUser={user} isArchitect={isHiredPro} isPM={isPM} />
                        )}
                        {activeSubTab === 'bom' && (
                            <ProjectRequirements
                                project={project}
                                onUpdate={onRefresh}
                                hideInventoryActions={isHiredPro && user.role_type === 'arsitek'}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* If Build Phase, show the Contractor Workspace Navigation */}
            {phaseKey === 'build' && (
                <div className="space-y-8">
                    <div className="flex items-center gap-1 p-1 bg-slate-50 rounded-2xl w-fit overflow-x-auto">
                        {(() => {
                            const cat = project?.project_category;
                            const isMaint = cat === 'maintenance';
                            const isReno = cat === 'renovation';
                            return [
                                { id: 'site_command', label: project.construction_locked_at ? 'Brief' : (isMaint ? 'Scope Perbaikan' : 'Planning'), icon: Settings },
                                { id: 'progress', label: isMaint ? 'Repair Progress' : isReno ? 'Renovation Progress' : 'Build Progress', icon: Hammer },
                                { id: 'logs', label: 'Daily Logs', icon: Layers },
                                { id: 'results', label: 'Results & Files', icon: Box }
                            ];
                        })().map((tab) => (
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
                        {activeSubTab === 'site_command' ? (
                            <ConstructionBriefManager
                                key={`${project.id}-${project.updated_at}`}
                                project={project}
                                isContractor={isHiredPro}
                                isOwner={isOwner}
                                isPM={user?.id === project.pm_id}
                                onRefresh={onRefresh}
                            />
                        ) : (() => {
                            // PBG gate only applies to new_build and renovation
                            const needsPBG = ['new_build', 'renovation'].includes(project?.project_category);
                            const isPBGApproved = !needsPBG || project?.milestones?.some((m: any) => 
                                m.content?.req_id === 'pbg_permit' && 
                                m.approval_status === 'approved'
                            ) || !!project?.pbg_verified_at;

                            if (!isPBGApproved) {
                                return (
                                    <div className="p-12 text-center bg-red-50 border-2 border-red-200 rounded-[2rem]">
                                        <ShieldCheck className="w-16 h-16 text-red-500 mx-auto mb-6" />
                                        <h3 className="text-2xl font-black text-red-900 tracking-tight mb-2">CONSTRUCTION SITE LOCKED</h3>
                                        <p className="text-red-700 font-medium max-w-lg mx-auto mb-8">
                                            Physical construction tracking is prohibited until the PBG (Building Permit) is secured and verified. Wait for the Notary to upload the PBG to the Document Vault.
                                        </p>
                                        {(user?.id === project.user_id || user?.id === project.pm_id) && (
                                            <button
                                                onClick={async (e) => {
                                                    const btn = e.currentTarget;
                                                    btn.disabled = true;
                                                    btn.innerHTML = 'Verifying...';
                                                    if (confirm('I confirm that the PBG has been issued. Unlock the construction phase?')) {
                                                        try {
                                                            await window.axios.post(`/projects/${project.id}/verify-pbg`);
                                                            onRefresh();
                                                        } catch (err) {
                                                            console.error(err);
                                                            btn.disabled = false;
                                                            btn.innerHTML = 'Verify PBG & Unlock Construction';
                                                        }
                                                    } else {
                                                        btn.disabled = false;
                                                        btn.innerHTML = 'Verify PBG & Unlock Construction';
                                                    }
                                                }}
                                                className="px-8 py-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-black text-xs tracking-widest uppercase rounded-2xl shadow-xl shadow-red-600/20 hover:-translate-y-1 transition-all"
                                            >
                                                Verify PBG & Unlock Construction
                                            </button>
                                        )}
                                    </div>
                                );
                            }

                            return (
                                <>
                                    {activeSubTab === 'progress' && (
                                        <ConstructionProgress
                                            project={project}
                                            currentUser={user}
                                            isContractor={isHiredPro}
                                            isPM={user?.id === project.pm_id}
                                        />
                                    )}

                                    {activeSubTab === 'logs' && (
                                        <DailySiteLog
                                            project={project}
                                            isContractor={isHiredPro}
                                        />
                                    )}
                                    {activeSubTab === 'results' && (
                                        <ProjectDeliverables project={project} currentUser={user} isPro={isHiredPro} />
                                    )}
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Structural/MEP Phase Workspace */}
            {(roleKey === 'structural' || roleKey === 'mep') && (
                <div className="space-y-8">
                     <div className="flex items-center gap-1 p-1 bg-slate-50 rounded-2xl w-fit overflow-x-auto">
                        {[
                            { id: 'managing', label: 'Brief & Contract', icon: Settings },
                            { id: 'progress', label: 'Technical Progress', icon: Layers },
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
                            <SpecialistActionCenter 
                                project={project} 
                                isPro={isHiredPro}
                                isOwner={isOwner}
                                isPM={isPM}
                                roleType={roleKey}
                                onProjectUpdate={onRefresh}
                            />
                        )}
                        {activeSubTab === 'progress' && (
                            <DesignProgress 
                                project={project} 
                                currentUser={user} 
                                isArchitect={isHiredPro}
                                isPM={isPM}
                                roleType={roleKey}
                            />
                        )}
                        {activeSubTab === 'results' && (
                            <ProjectDeliverables 
                                project={project} 
                                currentUser={user} 
                                isPro={isHiredPro || isOwner || isPM} 
                            />
                        )}
                    </div>
                </div>
            )}
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
                                isContractor={isContractor || isHiredContractor}
                                isPM={isPM}
                            />
                        )}
                        {activeSubTab === 'results' && (
                            <ProjectDeliverables project={project} currentUser={user} isPro={isHiredPro} />
                        )}
                    </div>
                </div>
            )}

            <LifecycleActionModal
                isOpen={isResignModalOpen}
                onClose={() => setIsResignModalOpen(false)}
                onConfirm={handleResign}
                type="resign"
                title="Undur Diri dari Proyek"
                description="Apakah Anda yakin ingin mengundurkan diri? Tindakan ini akan menghapus Anda dari proyek dan membuka kembali bidding untuk Project Owner."
            />
        </div>
    );
}
