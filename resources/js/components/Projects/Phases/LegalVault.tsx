import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { 
    ShieldCheck, FileText, Upload, CheckCircle2, 
    Download, Eye, AlertCircle, Clock, Loader2,
    ChevronRight, Save, MessageSquare, Box, Plus,
    Wallet, Receipt, History, ArrowRightCircle
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { Project, ProjectMilestone } from '../../../types/project.types';
import { motion, AnimatePresence } from 'framer-motion';
import { LEGAL_REQUIREMENTS, getLegalRequirementById } from '../../../constants/LegalStandardPresets';

interface LegalVaultProps {
    project: Project;
    currentUser: any;
    isNotaris: boolean;
    isArchitect: boolean;
    defaultProRole?: 'notaris' | 'arsitek' | 'kontraktor' | 'interior';
    onUpdate?: () => void;
}

export default function LegalVault({ project, currentUser, isNotaris, isArchitect, defaultProRole, onUpdate }: LegalVaultProps) {
    const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
    const [financials, setFinancials] = useState<any>(null);
    const [selectedReqId, setSelectedReqId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [submittingId, setSubmittingId] = useState<string | number | null>(null);
    const [editNote, setEditNote] = useState('');
    const [isSealing, setIsSealing] = useState(false);
    const [vaultView, setVaultView] = useState<'deliverables' | 'personal'>('deliverables');

    if (!project) {
        return (
            <div className="py-20 text-center animate-pulse">
                <ShieldCheck size={40} className="mx-auto text-zinc-100 mb-4" />
                <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">Hydrating Vault...</p>
            </div>
        );
    }
    
    // Financial Modal State
    const [isRequestingDisbursement, setIsRequestingDisbursement] = useState(false);
    const [disbTitle, setDisbTitle] = useState('');
    const [disbAmount, setDisbAmount] = useState('');
    const [disbDesc, setDisbDesc] = useState('');
    
    // Multi-professional contract state
    const [activeProRole, setActiveProRole] = useState<'notaris' | 'arsitek' | 'kontraktor' | 'pm' | 'interior' | null>(null);
    
    const { showToast } = useToast();

    const isOwner = currentUser?.id === project?.user_id;
    const isPM = currentUser?.role_type === 'project_manager' && project?.pm_id === currentUser?.id;
    const canApprove = isOwner || isPM;

    // The source of truth: What the Notary finalized in the BriefManager
    const templateSlots = useMemo(() => {
        const reqs = Array.isArray(project?.legal_requirements) ? project.legal_requirements : [];
        let combined = [...reqs];
        
        // NEW FALLBACK: Try deriving from accepted bid's selected services if requirements is empty
        if (combined.length === 0 && project.accepted_notaris_bid?.selected_services) {
            const bidServices = project.accepted_notaris_bid.selected_services;
            if (Array.isArray(bidServices)) {
                combined = bidServices.map((s: any) => String(s.id || s));
            }
        }

        // FALLBACK: If legal_requirements is empty, try deriving from existing milestones (legacy data)
        if (reqs.length === 0 && milestones.length > 0) {
            const milestoneIds = milestones
                .filter(m => m.type === 'legal' || m.phase_context === 'legal')
                .map(m => m.content?.req_id)
                .filter(Boolean);
            
            if (milestoneIds.length > 0) {
                combined = Array.from(new Set(milestoneIds)) as string[];
            }
        }

        // If still empty, return empty — LegalVault will show "Scope Not Defined" banner
        if (combined.length === 0) return [];

        const is_numeric = (n: any) => !isNaN(parseFloat(n)) && isFinite(n);

        return combined.map(reqId => {
            const activeMilestone = milestones.find(m => m.type === 'legal' && String(m.content?.req_id) === String(reqId));
            const preset = getLegalRequirementById(reqId);
            
            // Try to find title in bid services if it's a numeric ID
            let fallbackLabel = reqId.toUpperCase().replace('_', ' ');
            if (is_numeric(reqId) && project.accepted_notaris_bid?.selected_services) {
                const service = project.accepted_notaris_bid.selected_services.find((s: any) => String(s.id || s) === String(reqId));
                if (service && typeof service === 'object') {
                    fallbackLabel = service.title || fallbackLabel;
                }
            }

            const label = activeMilestone?.title || preset?.label || fallbackLabel;
            const desc = preset?.desc || 'Project specific legal deliverable';
            
            return {
                id: reqId,
                label,
                desc,
                milestone_code: preset?.milestone_code || 'L-MISC',
                responsibleRole: preset?.responsibleRole || 'Notary',
                category: preset?.category
            };
        });
    }, [project.legal_requirements, milestones]);

    const activeSlots = useMemo(() => {
        if (vaultView === 'personal') {
            return templateSlots.filter(s => s.category === 'personal_id');
        }
        return templateSlots.filter(s => s.category !== 'personal_id');
    }, [templateSlots, vaultView]);

    const isScopeEmpty = templateSlots.length === 0;

    const fetchMilestones = async () => {
        try {
            const [milestoneRes, financialRes] = await Promise.all([
                axios.get(`/projects/${project?.id}/milestones`),
                axios.get(`/projects/${project?.id}/legal-financials`)
            ]);
            
            setMilestones(milestoneRes.data?.data || []);
            setFinancials(financialRes.data || null);
            
        } catch (error) {
            console.error('Failed to fetch legal data', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (activeSlots.length > 0) {
            if (!selectedReqId || !activeSlots.find(s => s.id === selectedReqId)) {
                setSelectedReqId(activeSlots[0].id);
            }
        } else {
            setSelectedReqId(null);
        }
    }, [vaultView, activeSlots]);

    useEffect(() => {
        fetchMilestones();
        
        // Default active pro role based on current user or requested context
        if (defaultProRole) setActiveProRole(defaultProRole);
        else if (isNotaris) setActiveProRole('notaris');
        else if (isArchitect) setActiveProRole('arsitek');
        else if (currentUser?.role_type === 'kontraktor') setActiveProRole('kontraktor');
        else if (currentUser?.role_type === 'interior') setActiveProRole('interior');
        else setActiveProRole('notaris'); // Default for PM/Owner global view
    }, [project.id, defaultProRole]);

    // Find the milestone matching the current slot
    const activeMilestone = useMemo(() => {
        if (!selectedReqId) return null;
        const preset = getLegalRequirementById(selectedReqId);
        const slot = templateSlots.find(s => s.id === selectedReqId);
        
        if (preset?.isProfessionalSpecific) {
            const m = milestones.find(ms => {
                const matchesId = ms.content?.req_id === selectedReqId || ms.title === slot?.label;
                if (!matchesId) return false;
                
                // Filter by role
                if (activeProRole === 'notaris') return ms.notaris_id !== null && ms.notaris_id !== undefined;
                if (activeProRole === 'arsitek') return ms.arsitek_id !== null && ms.arsitek_id !== undefined;
                if (activeProRole === 'kontraktor') return ms.kontraktor_id !== null && ms.kontraktor_id !== undefined;
                if (activeProRole === 'interior') return ms.interior_id !== null && ms.interior_id !== undefined;
                return false; 
            });

            // FALLBACK: If no milestone matches the SPECIFIC role tab, but one exists for this slot globally, show it
            // This prevents "Empty Drawer" confusion when a document is shared or incorrectly tagged.
            if (!m) {
                return milestones.find(ms => ms.content?.req_id === selectedReqId || ms.title === slot?.label);
            }
            return m;
        }
        
        return milestones.find(m => m.title === slot?.label || m.content?.req_id === selectedReqId);
    }, [selectedReqId, milestones, templateSlots, activeProRole]);

    // Check if the overall phase can be sealed
    const allMilestonesApproved = useMemo(() => {
        if (templateSlots.length === 0) return false;
        // Every requested slot must have a milestone that is approved
        return templateSlots.every(slot => {
            const m = milestones.find(ms => ms.title === slot.label || ms.content?.req_id === slot.id);
            return m?.approval_status === 'approved' || m?.is_completed;
        });
    }, [milestones, templateSlots]);

    const isPhaseSealed = !!project.legal_completed_at;

    // Update editNote when activeMilestone changes
    useEffect(() => {
        setEditNote(activeMilestone?.description || '');
    }, [activeMilestone]);

    const handleAction = async (file?: File, forcedNote?: string) => {
        if (!selectedReqId) return;
        const slot = templateSlots.find(s => s.id === selectedReqId);
        if (!slot) return;

        setSubmittingId(selectedReqId);
        
        try {
            const formData = new FormData();
            if (file) formData.append('gallery[]', file);
            formData.append('description', forcedNote !== undefined ? forcedNote : editNote);
            formData.append('phase_context', 'legal');
            formData.append('type', 'legal');
            formData.append('title', slot.label);
            
            formData.append('content', JSON.stringify({
                ...activeMilestone?.content,
                req_id: selectedReqId
            }));

            // Pass targeted professional ID if slot is professional-specific
            // This allows PMs to upload for a specific role correctly.
            const preset = getLegalRequirementById(selectedReqId);
            if (preset?.isProfessionalSpecific && activeProRole) {
                if (activeProRole === 'notaris' && project.selected_notaris_id) formData.append('target_notaris_id', String(project.selected_notaris_id));
                if (activeProRole === 'arsitek' && project.selected_arsitek_id) formData.append('target_arsitek_id', String(project.selected_arsitek_id));
                if (activeProRole === 'kontraktor' && project.selected_kontraktor_id) formData.append('target_kontraktor_id', String(project.selected_kontraktor_id));
                if (activeProRole === 'interior' && project.selected_interior_id) formData.append('target_interior_id', String(project.selected_interior_id));
            }

            if (activeMilestone) {
                // Update existing
                formData.append('_method', 'PUT');
                if (file) formData.append('approval_status', 'pending');
                await axios.post(`/projects/${project.id}/milestones/${activeMilestone.id}`, formData);
                showToast('Vault entry updated', 'success');
            } else {
                // Create new on the fly
                await axios.post(`/projects/${project.id}/milestones`, formData);
                showToast(`Initialized slot: ${slot.label}`, 'success');
            }
            
            fetchMilestones();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Action failed', 'error');
        } finally {
            setSubmittingId(null);
        }
    };

    const canUpload = useMemo(() => {
        if (isPhaseSealed) return false;
        if (!selectedReqId) return false;
        
        const slot = templateSlots.find(s => s.id === selectedReqId);
        if (!slot) return false;

        // Notary acts as Administrator: they can upload ANY document (e.g. assisting offline users)
        if (isNotaris) return true;

        const role = slot.responsibleRole;
        if (role === 'Any' || role === 'Owner & Pro') return true;
        
        // Owner can upload to Owner slots
        if (isOwner && role === 'Owner') return true;
        
        // Architect can upload to Architect slots
        if (isArchitect && (role === 'Architect' || role === 'Architect & Notary')) return true;
        
        return false;
    }, [selectedReqId, isPhaseSealed, isNotaris, isArchitect, isPM, isOwner, templateSlots]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            handleAction(e.target.files[0]);
            e.target.value = '';
        }
    };

    const handleStatusUpdate = async (status: 'approved' | 'revision') => {
        if (!activeMilestone) return;
        let notes = '';
        if (status === 'revision') {
            notes = window.prompt('Please specify the revision notes:') || '';
            if (!notes) return;
        }

        setSubmittingId(String(activeMilestone.id));
        try {
            await axios.post(`/projects/${project.id}/milestones/${activeMilestone.id}`, {
                _method: 'PUT',
                approval_status: status,
                is_completed: status === 'approved',
                revision_notes: notes
            });
            showToast(status === 'approved' ? 'Verified & Archived' : 'Revision Requested', 'success');
            fetchMilestones();
            if (onUpdate) onUpdate();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Verification failed', 'error');
        } finally {
            setSubmittingId(null);
        }
    };

    const handleSealPhase = async () => {
        if (!allMilestonesApproved && !window.confirm('Some documents are not yet approved. Seal anyway? (Admin/PM override)')) return;
        if (allMilestonesApproved && !window.confirm('Are you sure you want to finalize and seal the Legal Phase? This will mark the digital vault as archived.')) return;
        
        setIsSealing(true);
        try {
            await axios.post(`/projects/${project.id}/seal-legal`);
            showToast('Legal Phase formally sealed and archived', 'success');
            if (onUpdate) onUpdate();
            fetchMilestones();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to seal legal phase', 'error');
        } finally {
            setIsSealing(false);
        }
    };

    const handleDisbursementSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await axios.post(`/projects/${project.id}/legal-disbursements`, {
                title: disbTitle,
                amount: disbAmount,
                description: disbDesc
            });
            showToast('Disbursement request sent', 'success');
            setIsRequestingDisbursement(false);
            setDisbTitle(''); setDisbAmount(''); setDisbDesc('');
            fetchMilestones();
        } catch (error: any) {
            showToast('Failed to request disbursement', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyDisbursement = async (id: number, status: 'approved' | 'rejected') => {
        try {
            await axios.post(`/projects/${project.id}/legal-disbursements/${id}/verify`, { status });
            showToast(`Budget order ${status}`, 'success');
            fetchMilestones();
        } catch (error) {
            showToast('Verification failed', 'error');
        }
    };

    // Helper to see if PM can verify
    const unapprovedHasFile = useMemo(() => {
        return activeMilestone && 
               activeMilestone.approval_status !== 'approved' && 
               (activeMilestone.content?.gallery?.length ?? 0) > 0;
    }, [activeMilestone]);

    // Helper to check for architect deliverables from design phase
    const architectBlueprints = useMemo(() => {
        const docBlueprints = (project.documents || []).filter((d: any) => d.category === 'blueprint');
        const milestoneBlueprints = milestones.filter(m => m.phase_context === 'design' && (m.approval_status === 'approved' || m.is_completed));
        return [...docBlueprints, ...milestoneBlueprints];
    }, [project.documents, milestones]);

    // Regulatory Dependency Check (Frontend Warning)
    const checkDependency = (id: string) => {
        if (id === 'pbg_permit') {
            if (architectBlueprints.length === 0) {
                return { 
                    blocked: false, // Not a hard block anymore as per user request for "Management Tool"
                    warning: 'Architect Technical Blueprints (Working Drawings) have not been verified yet.',
                    by: 'Architect' 
                };
            }
        }
        if (id === 'slf_certification') {
            const asBuilt = milestones.find(m => m.content?.req_id === 'as_built_drawings');
            if (!asBuilt || asBuilt.approval_status !== 'approved') return { blocked: true, by: 'As-Built Drawings (Record Drawings)' };
        }
        if (id === 'as_built_drawings') {
            const pbg = milestones.find(m => m.content?.req_id === 'pbg_permit');
            if (!pbg || pbg.approval_status !== 'approved') return { blocked: true, by: 'PBG (Building & Planning Permit)' };
        }
        return { blocked: false };
    };

    if (loading) return (
        <div className="py-20 text-center animate-pulse">
            <ShieldCheck className="mx-auto text-zinc-100 mb-4" size={40} />
            <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">Syncing Vault Ledger...</p>
        </div>
    );

    const formatIDR = (amount: number = 0) => {
        const value = Number(amount) || 0;
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(value);
    };

    if (isScopeEmpty) {
        return (
            <div className="py-16 text-center space-y-6 animate-in fade-in duration-500">
                <div className="w-20 h-20 mx-auto rounded-[2rem] bg-amber-50 flex items-center justify-center">
                    <AlertCircle size={36} className="text-amber-400" />
                </div>
                <div>
                    <h3 className="text-xl font-black text-zinc-900 mb-2">Legal Scope Not Yet Defined</h3>
                    <p className="text-sm text-zinc-500 font-medium max-w-md mx-auto leading-relaxed">
                        The legal scope is derived from the negotiated services in the contract. 
                        If this vault is empty, it means no legal services were selected during the bidding and negotiation phase.
                    </p>
                </div>
                <div className="flex items-center justify-center gap-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    <ShieldCheck size={14} />
                    Negotiated Agreement Source
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Modal: Request Disbursement */}
            <AnimatePresence>
                {isRequestingDisbursement && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-md">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="bg-white rounded-[3rem] p-10 max-w-lg w-full shadow-2xl border border-zinc-100"
                        >
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-inner">
                                    <Wallet size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-zinc-900">Request Disbursement</h3>
                                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Withdraw from Government Tax Escrow</p>
                                </div>
                            </div>

                            <form onSubmit={handleDisbursementSubmit} className="space-y-6">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2 ml-1">Fee Title</label>
                                    <input 
                                        type="text" 
                                        value={disbTitle} 
                                        onChange={e => setDisbTitle(e.target.value)}
                                        placeholder="e.g. BPHTB Tax Payment" 
                                        required 
                                        className="w-full px-6 py-4 bg-zinc-50 border-2 border-transparent focus:border-zinc-900 rounded-2xl text-sm font-bold outline-none transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2 ml-1">Amount (IDR)</label>
                                    <input 
                                        type="number" 
                                        value={disbAmount} 
                                        onChange={e => setDisbAmount(e.target.value)}
                                        placeholder="0" 
                                        required 
                                        className="w-full px-6 py-4 bg-zinc-50 border-2 border-transparent focus:border-zinc-900 rounded-2xl text-sm font-bold outline-none transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2 ml-1">Notes / Receipt Link</label>
                                    <textarea 
                                        value={disbDesc} 
                                        onChange={e => setDisbDesc(e.target.value)}
                                        placeholder="Describe what this payment is for..." 
                                        required 
                                        rows={3}
                                        className="w-full px-6 py-4 bg-zinc-50 border-2 border-transparent focus:border-zinc-900 rounded-2xl text-sm font-bold outline-none transition-all resize-none"
                                    />
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <button 
                                        type="button" 
                                        onClick={() => setIsRequestingDisbursement(false)}
                                        className="flex-1 py-4 bg-zinc-100 text-zinc-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit"
                                        className="flex-[2] py-4 bg-zinc-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-zinc-100"
                                    >
                                        Submit Request
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Header & Ledger Summary */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-8">
                <div className="max-w-xl text-left">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-xl">
                            <ShieldCheck size={20} />
                        </div>
                        <h3 className="text-2xl font-black text-zinc-900">Document Vault</h3>
                    </div>
                    <p className="text-zinc-500 text-sm font-medium leading-relaxed mb-6">
                        Complete your contract requirements below. Each slot represents a mandatory document 
                        requested by the client. Simply select a drawer and fill out the progress.
                    </p>

                    {/* Vault Selector Toggle */}
                    <div className="flex items-center p-1 bg-zinc-100 rounded-2xl w-fit border border-zinc-200">
                        <button 
                            onClick={() => setVaultView('deliverables')}
                            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                                vaultView === 'deliverables' 
                                ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200' 
                                : 'text-zinc-400 hover:text-zinc-600'
                            }`}
                        >
                            <Box size={14} />
                            Official Outcomes
                        </button>
                        <button 
                            onClick={() => setVaultView('personal')}
                            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                                vaultView === 'personal' 
                                ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200' 
                                : 'text-zinc-400 hover:text-zinc-600'
                            }`}
                        >
                            <ShieldCheck size={14} />
                            Client Identification
                        </button>
                    </div>
                </div>

                {/* The Digital Ledger Header */}
                {financials && (
                    <div className="w-full xl:w-auto bg-zinc-900 text-white p-6 md:p-10 rounded-[3rem] shadow-2xl flex flex-col md:flex-row items-center gap-10 border border-white/10 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-700 pointer-events-none">
                            <Wallet size={120} />
                        </div>

                        <div className="space-y-1 relative z-10 text-left">
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Gov Tax Escrow</p>
                            <h4 className="text-3xl font-black">{formatIDR(financials.allocated_tax)}</h4>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Funded & Reserved</p>
                            </div>
                        </div>

                        <div className="w-px h-12 bg-white/20 hidden md:block" />

                        <div className="flex flex-col gap-4 relative z-10 text-left">
                            <div className="space-y-0.5">
                                <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Total Disbursed</p>
                                <p className="text-sm font-black text-emerald-400">-{formatIDR(financials.total_spent)}</p>
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Pending Verification</p>
                                <p className="text-sm font-black text-amber-400">{formatIDR(financials.pending_approval)}</p>
                            </div>
                        </div>

                        {(isNotaris || isArchitect) && (
                            <button 
                                onClick={() => setIsRequestingDisbursement(true)}
                                className="w-full md:w-auto px-8 py-4 bg-white text-zinc-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-100 transition-all flex items-center justify-center gap-2 shadow-xl relative z-10"
                            >
                                <Plus size={14} /> Request Fund
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Sidebar: ALL Template Slots are visible here */}
                <div className="lg:col-span-4 space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-4 ml-2 text-left">
                        {vaultView === 'personal' ? 'Identity Verification Required' : 'Project Deliverables'}
                    </p>
                    {activeSlots.map((slot) => {
                        const preset = getLegalRequirementById(slot.id);
                        const m = milestones.find(item => {
                            const baseMatch = item.title === slot.label || item.content?.req_id === slot.id;
                            if (!baseMatch) return false;
                            
                            // For professional-specific slots, the sidebar indicator should show if ANY pro has uploaded if PM,
                            // or if YOU have uploaded if Pro.
                            if (preset?.isProfessionalSpecific && (isNotaris || isArchitect)) {
                                if (isNotaris) return item.notaris_id !== null;
                                if (isArchitect) return item.arsitek_id !== null;
                            }
                            // If PM is viewing the sidebar, the indicator should only show "Approved/Pending" if 
                            // the SPK for the CURRENTLY SELECTED role matches.
                            if (preset?.isProfessionalSpecific && !isNotaris && !isArchitect) {
                                if (activeProRole === 'notaris') return item.notaris_id !== null;
                                if (activeProRole === 'arsitek') return item.arsitek_id !== null;
                                if (activeProRole === 'kontraktor') return item.kontraktor_id !== null;
                                if (activeProRole === 'interior') return item.interior_id !== null;
                            }
                            return true;
                        });
                        const isSelected = selectedReqId === slot.id;
                        const hasFile = m?.content?.gallery?.length > 0;
                        const isApproved = m?.approval_status === 'approved';

                        return (
                            <button
                                key={slot.id}
                                onClick={() => setSelectedReqId(slot.id)}
                                className={`w-full group flex items-center justify-between p-4 rounded-[1.8rem] transition-all border-2 ${
                                    isSelected 
                                    ? 'bg-white border-zinc-900 shadow-xl shadow-zinc-100 scale-[1.02]' 
                                    : 'bg-transparent border-transparent hover:bg-white hover:border-zinc-100'
                                }`}
                            >
                                <div className="flex items-center gap-4 text-left">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${
                                        isApproved ? 'bg-emerald-50 text-emerald-600' : 
                                        m ? 'bg-zinc-900 text-white shadow-lg' : 'bg-zinc-50 text-zinc-300'
                                    }`}>
                                        {isApproved ? <ShieldCheck size={22} /> : (m ? <FileText size={22} /> : <Box size={22} />)}
                                    </div>
                                        <div>
                                            <p className="text-sm font-black text-zinc-900 truncate max-w-[200px]">{slot.label}</p>
                                            <p className={`text-[9px] font-bold uppercase tracking-wider ${isApproved ? 'text-emerald-500' : 'text-zinc-400'}`}>
                                                {slot.id === 'construction_contract' ? 'Unified SPK' : (isApproved ? 'Verified Result' : (hasFile ? 'Pending Review' : (m ? 'Drafting' : 'Empty Slot')))}
                                            </p>
                                        </div>
                                </div>
                                <div className={`flex items-center gap-2 ${isSelected ? 'opacity-100' : 'opacity-0'} transition-opacity`}>
                                    {hasFile && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                                    <ChevronRight size={16} className="text-zinc-900" />
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Workspace: Fill out the Template */}
                <div className="lg:col-span-8 bg-white/40 rounded-[2.5rem] p-4 lg:p-10 border border-zinc-200 min-h-[600px] backdrop-blur-sm shadow-inner text-left">
                    <AnimatePresence mode="wait">
                        {selectedReqId ? (
                            <motion.div
                                key={selectedReqId}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-10"
                            >
                                {/* Professional Selector for SPK/Professional-Specific slots */}
                                {getLegalRequirementById(selectedReqId)?.isProfessionalSpecific && (
                                    <div className="flex flex-wrap items-center gap-2 p-2 bg-zinc-100/50 rounded-2xl w-fit">
                                        {[
                                            { role: 'notaris', label: 'Notary', active: project.selected_notaris_id },
                                            { role: 'arsitek', label: 'Architect', active: project.selected_arsitek_id },
                                            { role: 'kontraktor', label: 'Contractor', active: project.selected_kontraktor_id },
                                            { role: 'interior', label: 'Interior', active: project.selected_interior_id }
                                        ].filter(p => p.active).map(p => (
                                            <button
                                                key={p.role}
                                                onClick={() => setActiveProRole(p.role as any)}
                                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                                    activeProRole === p.role 
                                                    ? 'bg-zinc-900 text-white shadow-lg' 
                                                    : 'bg-transparent text-zinc-400 hover:text-zinc-600'
                                                }`}
                                            >
                                                {p.label === 'Notary' ? 'Legal Expert' : p.label} (SPK)
                                            </button>
                                        ))}
                                        {(isNotaris || isArchitect) && (
                                            <div className="ml-2 pl-2 border-l border-zinc-200">
                                                <span className="text-[9px] font-black text-zinc-400 uppercase">Viewing as Professional</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Slot Info */}
                                <div className="space-y-4">
                                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                                        <div>
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="px-3 py-1 bg-zinc-900 text-white text-[9px] font-black rounded-full uppercase tracking-widest">
                                                    Slot: {getLegalRequirementById(selectedReqId)?.milestone_code || 'L-MISC'}
                                                </span>
                                                <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${
                                                    activeMilestone?.approval_status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                                                    (activeMilestone?.approval_status === 'pending' || (activeMilestone?.content?.gallery?.length ?? 0) > 0) ? 'bg-amber-100 text-amber-700' :
                                                    activeMilestone?.approval_status === 'revision' ? 'bg-red-100 text-red-700' :
                                                    'bg-zinc-100 text-zinc-400'
                                                }`}>
                                                    {activeMilestone?.approval_status === 'approved' ? 'APPROVED' : 
                                                     ((activeMilestone?.content?.gallery?.length ?? 0) > 0 ? 'PENDING REVIEW' : (activeMilestone?.approval_status || 'NOT STARTED'))}
                                                </span>
                                            </div>
                                            <h4 className="text-2xl font-black text-zinc-900 mb-1">
                                                {templateSlots.find(s => s.id === selectedReqId)?.label || 'Requirement Details'}
                                            </h4>
                                            <p className="text-sm font-medium text-zinc-400">
                                                {templateSlots.find(s => s.id === selectedReqId)?.desc || 'Official legal documentation slot.'}
                                            </p>
                                            
                                            {/* Dual-Standard Template Download */}
                                            {getLegalRequirementById(selectedReqId)?.templateUrl && (
                                                <div className="mt-4">
                                                    <a 
                                                        href={getLegalRequirementById(selectedReqId)?.templateUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                                                    >
                                                        <Download size={14} /> Output Standard Document Template
                                                    </a>
                                                </div>
                                            )}

                                            <div className="mt-4 flex items-center gap-2">
                                                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Primary Handling:</span>
                                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                                                    templateSlots.find(s => s.id === selectedReqId)?.responsibleRole === 'Architect' 
                                                    ? 'bg-blue-50 text-blue-600' 
                                                    : templateSlots.find(s => s.id === selectedReqId)?.responsibleRole === 'Architect & Notary'
                                                    ? 'bg-purple-50 text-purple-600'
                                                    : 'bg-indigo-50 text-indigo-600'
                                                }`}>
                                                    {templateSlots.find(s => s.id === selectedReqId)?.responsibleRole || 'Legal Expert'}
                                                </span>
                                            </div>
                                        </div>

                                        {(checkDependency(selectedReqId) as any).warning && (
                                            <div className="p-6 bg-amber-50 border border-amber-100 rounded-[2rem] flex items-center gap-5">
                                                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shadow-inner">
                                                    <AlertCircle size={24} />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700 mb-1">Prerequisite Alert</p>
                                                    <p className="text-[11px] font-bold text-amber-900 leading-relaxed">
                                                        {(checkDependency(selectedReqId) as any).warning}
                                                    </p>
                                                    <p className="text-[9px] font-medium text-amber-600 mt-1 uppercase tracking-widest">
                                                        Note: You can still proceed with management updates.
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {canUpload && (activeMilestone?.approval_status !== 'approved' || (isNotaris || isArchitect)) && (
                                            <div className="relative">
                                                <input 
                                                    type="file" 
                                                    id={`legal-upload-${selectedReqId}`}
                                                    className="hidden" 
                                                    onChange={handleFileUpload}
                                                    disabled={!!submittingId}
                                                />
                                                <label 
                                                    htmlFor={`legal-upload-${selectedReqId}`}
                                                    className={`flex items-center gap-3 px-8 py-4 ${activeMilestone?.approval_status === 'approved' ? 'bg-amber-600' : 'bg-zinc-900'} text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-black hover:scale-105 transition-all shadow-xl ${submittingId ? 'opacity-50' : ''}`}
                                                >
                                                    {submittingId === selectedReqId ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} 
                                                    {activeMilestone?.approval_status === 'approved' ? 'Replace Approved File' : (activeMilestone ? 'Replace File' : 'Upload & Start')}
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Drawer Item: The File */}
                                    <div className="space-y-4">
                                        <h5 className="text-[11px] font-black uppercase tracking-widest text-zinc-400 ml-2">
                                            {vaultView === 'personal' ? 'Identity Document' : 'Official Outcome'}
                                        </h5>
                                        {!activeMilestone?.content?.gallery?.length ? (
                                            <div className="bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-[2.5rem] p-16 text-center flex flex-col items-center justify-center group hover:border-zinc-400 transition-colors">
                                                <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mb-6 text-zinc-200 group-hover:text-zinc-400 transition-colors shadow-sm">
                                                    {vaultView === 'personal' ? <ShieldCheck size={40} /> : <Box size={40} />}
                                                </div>
                                                <p className="text-xs font-black text-zinc-400 uppercase tracking-widest leading-relaxed">
                                                    {vaultView === 'personal' ? 'Verification Required' : 'Drawer is Empty'}
                                                </p>
                                                <p className="text-[10px] text-zinc-300 font-bold mt-2 uppercase">
                                                    {vaultView === 'personal' 
                                                        ? 'Please upload your valid identity proof' 
                                                        : 'Please upload the finalized certificate'}
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="group bg-white p-8 rounded-[2.5rem] border border-zinc-200 shadow-sm hover:shadow-2xl transition-all duration-500">
                                                <div className="flex items-center justify-between mb-8">
                                                    <div className="w-16 h-16 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-lg">
                                                        <FileText size={32} />
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <a 
                                                            href={`/storage/${activeMilestone.content.gallery[0]}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="p-4 bg-zinc-50 text-zinc-900 rounded-2xl hover:bg-zinc-900 hover:text-white transition-all shadow-sm"
                                                            title="Download File"
                                                        >
                                                            <Download size={24} />
                                                        </a>
                                                    </div>
                                                </div>
                                                <p className="text-sm font-black text-zinc-900 mb-1">Legally Authenticated</p>
                                                <p className="text-[10px] text-zinc-400 font-bold uppercase truncate">
                                                    {activeMilestone.title}.PDF
                                                </p>
                                                
                                                <div className="mt-10 pt-6 border-t border-zinc-50 flex items-center justify-between">
                                                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                                                        <CheckCircle2 size={12} className="text-emerald-500" />
                                                        Stored in Vault
                                                    </span>
                                                    <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded text-[9px] font-black tracking-widest">VERIFIED</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Drawer Item: The Comment/Progress */}
                                    <div className="space-y-4">
                                        <h5 className="text-[11px] font-black uppercase tracking-widest text-zinc-400 ml-2">Progress Comment</h5>
                                        <div className="bg-white p-8 rounded-[2.5rem] border border-zinc-200 shadow-sm space-y-6">
                                            {canUpload && (activeMilestone?.approval_status !== 'approved' || (isNotaris || isArchitect)) ? (
                                                <>
                                                    <textarea 
                                                        value={editNote}
                                                        onChange={e => setEditNote(e.target.value)}
                                                        placeholder="Describe the current progress or explain the result for the client..."
                                                        className="w-full h-[200px] p-6 bg-zinc-50 border-2 border-transparent focus:border-zinc-900 focus:bg-white rounded-[2rem] text-sm font-bold outline-none transition-all resize-none shadow-inner"
                                                    />
                                                    <button 
                                                        onClick={() => handleAction()}
                                                        disabled={submittingId === selectedReqId || editNote === activeMilestone?.description}
                                                        className="w-full py-5 bg-zinc-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-3 disabled:opacity-20 shadow-xl"
                                                    >
                                                        {submittingId === selectedReqId ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                                        {activeMilestone?.approval_status === 'approved' ? 'Update Approved Comment' : 'Update Comment'}
                                                    </button>
                                                </>
                                            ) : (
                                                <div className="min-h-[200px] p-6 bg-zinc-50 rounded-[2rem] border border-zinc-100 italic">
                                                    <p className="text-sm font-bold text-zinc-600 leading-relaxed">
                                                        {activeMilestone?.description || 'The professional has not added any progress comments yet for this slot.'}
                                                    </p>
                                                </div>
                                            )}

                                            {activeMilestone?.revision_notes && (
                                                <div className="p-5 bg-red-50 border border-red-100 rounded-[1.5rem] animate-pulse">
                                                    <p className="text-[10px] font-black text-red-400 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                                                        <AlertCircle size={14} /> Attention Required
                                                    </p>
                                                    <p className="text-xs font-bold text-red-600 leading-relaxed">{activeMilestone.revision_notes}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Ledger Detail section */}
                                {financials && (financials.disbursements || []).length > 0 && (
                                    <div className="space-y-4">
                                        <h5 className="text-[11px] font-black uppercase tracking-widest text-zinc-400 ml-2">Fee Disbursement History</h5>
                                        <div className="bg-white rounded-[2.5rem] border border-zinc-200 overflow-hidden shadow-sm">
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left">
                                                    <thead>
                                                        <tr className="bg-zinc-50 border-b border-zinc-100">
                                                            <th className="px-8 py-4 text-[9px] font-black uppercase tracking-widest text-zinc-400">Date</th>
                                                            <th className="px-8 py-4 text-[9px] font-black uppercase tracking-widest text-zinc-400">Title / Description</th>
                                                            <th className="px-8 py-4 text-[9px] font-black uppercase tracking-widest text-zinc-400">Amount</th>
                                                            <th className="px-8 py-4 text-[9px] font-black uppercase tracking-widest text-zinc-400">Status</th>
                                                            {canApprove && <th className="px-8 py-4 text-[9px] font-black uppercase tracking-widest text-zinc-400">Action</th>}
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-zinc-50">
                                                        {(financials.disbursements || []).map((d: any) => (
                                                            <tr key={d.id} className="hover:bg-zinc-50/50 transition-colors">
                                                                <td className="px-8 py-6 whitespace-nowrap">
                                                                    <p className="text-[10px] font-bold text-zinc-400">{new Date(d.created_at).toLocaleDateString()}</p>
                                                                </td>
                                                                <td className="px-8 py-6">
                                                                    <p className="text-sm font-black text-zinc-900 mb-1">{(d.label || '').replace('[Legal Disbursement] ', '')}</p>
                                                                    <p className="text-[10px] text-zinc-400 font-medium leading-relaxed max-w-xs">{d.trigger_description || d.notes}</p>
                                                                </td>
                                                                <td className="px-8 py-6 whitespace-nowrap">
                                                                    <p className="text-sm font-black text-zinc-900">{formatIDR(d.amount)}</p>
                                                                </td>
                                                                <td className="px-8 py-6 whitespace-nowrap">
                                                                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                                                        d.status === 'paid' ? 'bg-emerald-50 text-emerald-600' :
                                                                        d.status === 'rejected' ? 'bg-red-50 text-red-600' :
                                                                        'bg-amber-50 text-amber-600'
                                                                    }`}>
                                                                        {d.status === 'pending_approval' ? 'Pending' : d.status}
                                                                    </span>
                                                                </td>
                                                                {canApprove && (
                                                                    <td className="px-8 py-6 whitespace-nowrap">
                                                                        {d.status === 'pending_approval' ? (
                                                                            <div className="flex items-center gap-2">
                                                                                <button 
                                                                                    onClick={() => handleVerifyDisbursement(d.id, 'rejected')}
                                                                                    className="p-2 text-red-400 hover:text-red-600 transition-colors"
                                                                                    title="Reject"
                                                                                >
                                                                                    <Plus className="rotate-45" size={18} />
                                                                                </button>
                                                                                <button 
                                                                                    onClick={() => handleVerifyDisbursement(d.id, 'paid')}
                                                                                    className="flex items-center gap-1 px-4 py-2 bg-zinc-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-black transition-all"
                                                                                >
                                                                                    Approve
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex items-center gap-2 text-zinc-300">
                                                                                <History size={14} />
                                                                                <span className="text-[9px] font-black uppercase tracking-widest">Locked</span>
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                )}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Verification Workflow */}
                                {unapprovedHasFile && canApprove && (
                                    <motion.div 
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="bg-emerald-600 p-10 rounded-[3rem] text-white shadow-2xl shadow-emerald-200 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden"
                                    >
                                        <div className="absolute top-0 right-0 p-10 opacity-10">
                                            <ShieldCheck size={200} />
                                        </div>
                                        <div className="relative z-10 space-y-2">
                                            <h5 className="text-xl font-black uppercase tracking-widest">Verify Deliverable</h5>
                                            {checkDependency(selectedReqId || '').blocked ? (
                                                <div className="flex items-center gap-2 text-amber-300 bg-amber-900/40 px-4 py-2 rounded-xl border border-amber-500/50 w-fit">
                                                    <AlertCircle size={14} />
                                                    <p className="text-[10px] font-black uppercase tracking-widest">
                                                        Wait: {checkDependency(selectedReqId || '').by} must be verified first
                                                    </p>
                                                </div>
                                            ) : (
                                                <p className="text-sm font-bold text-emerald-100 max-w-md">
                                                    Please review the authenticated document and notes. By verifying, you mark this legal requirement as officially completed.
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-4 relative z-10 w-full md:w-auto">
                                            <button 
                                                onClick={() => handleStatusUpdate('revision')}
                                                className="flex-1 md:flex-none px-8 py-4 bg-emerald-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-800 transition-all border border-emerald-500"
                                            >
                                                Revision
                                            </button>
                                            <button 
                                                onClick={() => handleStatusUpdate('approved')}
                                                disabled={checkDependency(selectedReqId || '').blocked}
                                                className="flex-1 md:flex-none px-12 py-4 bg-white text-emerald-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-50 transition-all shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                Approve & Close
                                            </button>
                                        </div>
                                    </motion.div>
                                )}

                                {/* Legal Phase Sealing CTA */}
                                {!isPhaseSealed && (allMilestonesApproved || isNotaris) && !unapprovedHasFile && (
                                    <motion.div 
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="bg-zinc-900 p-12 rounded-[3.5rem] text-white shadow-2xl flex flex-col md:flex-row items-center justify-between gap-10 relative overflow-hidden"
                                    >
                                        <div className="absolute top-0 right-0 p-10 opacity-5">
                                            <Save size={250} />
                                        </div>
                                        <div className="relative z-10 space-y-3">
                                            <div className="flex items-center gap-3 text-emerald-400 mb-2">
                                                <CheckCircle2 size={24} />
                                                <h5 className="text-xl font-black uppercase tracking-[0.2em]">
                                                    {isNotaris ? 'Finalize Legal Work' : 'Ready to Seal'}
                                                </h5>
                                            </div>
                                            <p className="text-sm font-bold text-zinc-400 max-w-lg leading-relaxed">
                                                {isNotaris 
                                                    ? 'By finalizing, you signal to the Client and PM that the legal documents are ready for review and project kickoff.'
                                                    : 'All required legal documents have been verified and archived. You can now formally finalize the Legal Phase to lock the vault and proceed.'}
                                            </p>
                                        </div>

                                        <button 
                                            onClick={handleSealPhase}
                                            disabled={isSealing}
                                            className="relative z-10 px-14 py-5 bg-white text-zinc-900 rounded-3xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-emerald-50 hover:text-emerald-600 transition-all shadow-[0_20px_50px_rgba(0,0,0,0.3)] disabled:opacity-50 flex items-center gap-3 group"
                                        >
                                            {isSealing ? (
                                                <Loader2 size={18} className="animate-spin" />
                                            ) : (
                                                <>
                                                    {isNotaris ? 'Finalize & Submit' : 'Seal Legal Phase'}
                                                    <ArrowRightCircle size={18} className="group-hover:translate-x-1 transition-transform" />
                                                </>
                                            )}
                                        </button>
                                    </motion.div>
                                )}

                                {/* Sealed State Header */}
                                {isPhaseSealed && (
                                    <div className="bg-zinc-50 border-2 border-emerald-100 rounded-[2.5rem] p-10 flex flex-col items-center text-center">
                                        <div className="w-20 h-20 bg-emerald-500 text-white rounded-3xl flex items-center justify-center shadow-xl shadow-emerald-100 mb-6">
                                            <ShieldCheck size={40} />
                                        </div>
                                        <h5 className="text-2xl font-black text-zinc-900 uppercase tracking-widest mb-2">Legal Phase Sealed</h5>
                                        <p className="text-zinc-500 font-medium max-w-md">
                                            This digital vault has been formally finalized and archived. Documents are locked for compliance.
                                        </p>
                                    </div>
                                )}
                            </motion.div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center py-20">
                                <Box size={80} className="text-zinc-100 mb-8" />
                                <h4 className="text-xl font-black text-zinc-300 uppercase tracking-[0.3em] mb-4">Vault Standby</h4>
                                <p className="text-sm text-zinc-400 font-medium max-w-sm">Select one of the requested certificate slots from the sidebar to manage the legal work progress.</p>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
