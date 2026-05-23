import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Pencil, Check, X, Save, Trash2, Layers, Clock, ShieldCheck, RefreshCw, Banknote } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { CONSTRUCTION_MILESTONE_TYPES } from '../../../constants/ContractorStandardPresets';
import ExtensionRequestModal from './ExtensionRequestModal';
import PaymentTriggerNotificationModal from './PaymentTriggerNotificationModal';
import AddonFeeModal from './AddonFeeModal';
import AddonMilestoneModal from './AddonMilestoneModal';

interface ConstructionMilestonesProps {
    project: any;
    currentUser: any;
    isContractor: boolean;
    isPM?: boolean;
    filterType?: string;
}

interface Milestone {
    id: number;
    title: string;
    description: string | null;
    image: string | null;
    type: string;
    is_completed: boolean;
    approval_status?: 'in_progress' | 'pending' | 'approved' | 'revision';
    revision_notes?: string;
    content?: {
        gallery?: string[];
        links?: { label: string; url: string }[];
        checklist?: { label: string; checked: boolean }[];
        revision_history?: { note: string; date: string; version: number }[];
    };
    sort_order: number;
    created_at: string;
    change_orders?: any[];
}

export default function ConstructionMilestones({ project, currentUser, isContractor, isPM = false, filterType }: ConstructionMilestonesProps) {
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const { showToast } = useToast();

    const displayedMilestones = filterType 
        ? milestones.filter(m => m.type === filterType)
        : milestones;

    // Form state
    const [formTitle, setFormTitle] = useState('');
    const [formType, setFormType] = useState('generic');
    const [formDesc, setFormDesc] = useState('');
    const [existingGallery, setExistingGallery] = useState<string[]>([]);
    const [newGalleryFiles, setNewGalleryFiles] = useState<File[]>([]);
    const [formChecklist, setFormChecklist] = useState<{ label: string; checked: boolean }[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [showExtensionModal, setShowExtensionModal] = useState(false);
    const [isSubmittingAudit, setIsSubmittingAudit] = useState(false);

    // Confirmation Modal state
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        milestone: Milestone | null;
        termin: any | null;
    }>({
        isOpen: false,
        milestone: null,
        termin: null
    });

    // Notification Modal state
    const [unlockedTerminNotice, setUnlockedTerminNotice] = useState<any | null>(null);

    // Addon Modal state
    const [addonModal, setAddonModal] = useState<{
        isOpen: boolean;
        milestone: Milestone | null;
        isNewCreation: boolean;
    }>({
        isOpen: false,
        milestone: null,
        isNewCreation: false
    });

    // Material Request State
    const [requestingMaterialFor, setRequestingMaterialFor] = useState<Milestone | null>(null);
    const [materialForm, setMaterialForm] = useState({ name: '', quantity: '', unit: '', notes: '' });

    const fetchMilestones = async () => {
        try {
            const res = await axios.get(`/projects/${project.id}/milestones`, { params: { phase_context: 'build' } });
            setMilestones((res.data?.data || []).sort((a: any, b: any) => a.sort_order - b.sort_order));
        } catch (error) { console.error(error); } finally { setLoading(false); }
    };

    useEffect(() => { fetchMilestones(); }, [project.id]);

    const resetForm = () => {
        setFormTitle(''); setFormType('generic'); setFormDesc('');
        setExistingGallery([]); setNewGalleryFiles([]); setFormChecklist([]);
        setEditingId(null); setShowForm(false);
    };

    const handleQuickAdd = (type: string, title: string, checklist: string[]) => {
        resetForm(); setFormType(type); setFormTitle(title);
        setFormChecklist(checklist.map(label => ({ label, checked: false })));
        setShowForm(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        const formData = new FormData();
        formData.append('title', formTitle);
        formData.append('type', filterType || formType);
        formData.append('description', formDesc);
        formData.append('phase_context', 'build');
        formData.append('content', JSON.stringify({ checklist: formChecklist }));
        formData.append('retained_gallery', JSON.stringify(existingGallery));
        newGalleryFiles.forEach(f => formData.append('gallery[]', f));
        
        try {
            if (editingId) {
                formData.append('_method', 'PUT');
                await axios.post(`/projects/${project.id}/milestones/${editingId}`, formData);
                showToast('Updated', 'success');
            } else {
                await axios.post(`/projects/${project.id}/milestones`, formData);
                showToast('Added', 'success');
            }
            resetForm(); fetchMilestones();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Error', 'error');
        } finally { setSubmitting(false); }
    };

    const handleAuditSubmit = async (milestone: Milestone, status: 'approved' | 'revision') => {
        setIsSubmittingAudit(true);
        try {
            const payload = {
                role_type: 'build',
                milestones: [{ 
                    id: milestone.id, 
                    status: status === 'approved' ? 'approved' : 'revision_requested', 
                    note: '' // Simplified for construction
                }]
            };
            const res = await axios.post(`/projects/${project.id}/technical-audit-submit`, payload);
            
            if (status === 'approved') {
                const unlocked = res.data?.unlocked_termins || [];
                if (unlocked.length > 0) {
                    setUnlockedTerminNotice(unlocked[0]);
                } else {
                    showToast('Milestone Approved', 'success');
                }
            } else {
                showToast('Revision Requested', 'info');
            }
            
            fetchMilestones();
            setConfirmModal({ isOpen: false, milestone: null, termin: null });
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to submit audit', 'error');
        } finally {
            setIsSubmittingAudit(false);
        }
    };

    const handleApprovalClick = (m: Milestone) => {
        const linkedTermin = project.payment_termins?.find((t: any) => 
            t.milestone_id === m.id && 
            t.role_type === 'kontraktor' &&
            t.status === 'locked'
        );

        if (linkedTermin) {
            setConfirmModal({ isOpen: true, milestone: m, termin: linkedTermin });
        } else {
            handleAuditSubmit(m, 'approved');
        }
    };

    const handleFeePMReview = async (m: Milestone, co: any) => {
        if (!window.confirm('Forward this fee proposal to the Owner for approval?')) return;
        setIsSubmittingAudit(true);
        try {
            await axios.post(`/projects/${project.id}/change-orders/${co.id}/pm-review`, {
                action: 'approve',
                pm_notes: 'Reviewed and forwarded by PM'
            });
            showToast('Fee proposal forwarded to Owner', 'success');
            fetchMilestones();
            if (onRefresh) onRefresh();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to forward fee', 'error');
        } finally {
            setIsSubmittingAudit(false);
        }
    };

    const handleFeeOwnerApprove = async (m: Milestone, co: any) => {
        if (!window.confirm('Approve this extra fee? This will generate a new payment item.')) return;
        setIsSubmittingAudit(true);
        try {
            await axios.post(`/projects/${project.id}/change-orders/${co.id}/owner-decide`, {
                action: 'approve',
                owner_notes: 'Approved by Owner'
            });
            showToast('Extra fee approved! Payment item generated.', 'success');
            fetchMilestones();
            if (onRefresh) onRefresh();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to approve fee', 'error');
        } finally {
            setIsSubmittingAudit(false);
        }
    };

    const handleRequestRevision = async (m: Milestone) => {
        const notes = window.prompt("Detail revision:");
        if (!notes) return;
        handleAuditSubmit(m, 'revision');
    };

    const handleSubmitPhase = async (m: Milestone) => {
        if (!window.confirm('Submit for review?')) return;
        try {
            await axios.put(`/projects/${project.id}/milestones/${m.id}`, { approval_status: 'pending' });
            showToast('Submitted', 'success'); fetchMilestones();
        } catch (error) { showToast('Error', 'error'); }
    };

    if (loading) return <div className="py-20 text-center text-slate-400 font-bold uppercase text-[10px]">Loading Milestones...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Construction Milestones</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Physical progress tracking</p>
                </div>
                {isContractor && !showForm && (
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setShowExtensionModal(true)} 
                            className="px-4 py-2 bg-amber-50 text-amber-600 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all"
                        >
                            <Clock size={14} /> Extension
                        </button>
                        <button 
                            onClick={() => { setShowForm(true); }} 
                            className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2 bg-slate-900 text-white hover:scale-105"
                        >
                            <Plus size={14} /> Add Milestone
                        </button>
                        <button 
                            onClick={() => setAddonModal({ isOpen: true, milestone: null, isNewCreation: true })} 
                            className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2 bg-purple-600 text-white hover:scale-105"
                        >
                            <Plus size={14} /> Add Revision / Add-on
                        </button>
                    </div>
                )}
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} className="bg-slate-900 rounded-[2rem] p-6 space-y-4">
                    <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Phase Name" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-xs outline-none focus:border-white" required />
                    <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Description" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-xs min-h-[80px]" />
                    <button type="submit" disabled={submitting} className="w-full py-4 bg-white text-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest">{submitting ? 'Saving...' : 'Save Milestone'}</button>
                </form>
            )}

            <div className="space-y-4">
                {displayedMilestones.map((m, idx) => (
                    <div key={m.id} className="bg-white border-2 border-slate-100 rounded-2xl p-6 flex flex-col md:flex-row gap-6">
                        <div className="flex-1">
                            <h5 className="text-xs font-black text-slate-900 uppercase tracking-widest">{m.title}</h5>
                            <p className="text-[10px] text-slate-500 font-medium mt-1">{m.description}</p>
                            <div className="mt-4 flex gap-2">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${m.is_completed ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{m.approval_status || (m.is_completed ? 'Completed' : 'Active')}</span>
                                {m.content?.is_addon && (
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-purple-100 text-purple-600">Revision / Add-on</span>
                                )}
                                {m.change_orders && m.change_orders.length > 0 && (
                                    <div className="flex gap-2">
                                        {m.change_orders.map(co => (
                                            <span key={co.id} className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                                                co.status === 'owner_approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                co.status === 'rejected' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                                'bg-amber-50 text-amber-600 border-amber-100'
                                            }`}>
                                                Fee: {(co.status || 'proposed').replace('_', ' ')} (Rp {Number(co.cost_impact).toLocaleString()})
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {isContractor && m.approval_status !== 'approved' && !m.is_completed && (
                                <button onClick={() => handleSubmitPhase(m)} className="mt-4 px-4 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">Submit for Review</button>
                            )}
                            {(() => {
                                const activeCO = m.change_orders?.[0];
                                const isFeePending = activeCO && activeCO.status !== 'owner_approved' && activeCO.status !== 'rejected';
                                
                                if (isFeePending) {
                                    if (isPM && activeCO.status === 'proposed') {
                                        return (
                                            <button 
                                                disabled={isSubmittingAudit}
                                                onClick={() => handleFeePMReview(m, activeCO)}
                                                className="mt-4 px-4 py-2 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all shadow-md shadow-amber-100 flex items-center gap-2"
                                            >
                                                {isSubmittingAudit ? <RefreshCw size={12} className="animate-spin" /> : <Check size={14} />}
                                                Review & Forward Fee
                                            </button>
                                        );
                                    }
                                    if (isOwner && activeCO.status === 'pm_reviewed') {
                                        return (
                                            <button 
                                                disabled={isSubmittingAudit}
                                                onClick={() => handleFeeOwnerApprove(m, activeCO)}
                                                className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-700 transition-all shadow-md shadow-purple-100 flex items-center gap-2"
                                            >
                                                {isSubmittingAudit ? <RefreshCw size={12} className="animate-spin" /> : <Banknote size={14} />}
                                                Approve Extra Fee
                                            </button>
                                        );
                                    }
                                    return (
                                        <div className="mt-4 px-4 py-2 bg-slate-100 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-200 flex items-center gap-2 w-fit">
                                            <Clock size={12} /> Fee Under Review
                                        </div>
                                    );
                                }

                                return !isContractor && m.approval_status === 'pending' && (
                                    <div className="mt-4 flex gap-2">
                                        <button 
                                            disabled={isSubmittingAudit}
                                            onClick={() => handleRequestRevision(m)} 
                                            className="px-4 py-2 border border-red-200 text-red-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-red-50 transition-all"
                                        >
                                            Revise
                                        </button>
                                        <button 
                                            disabled={isSubmittingAudit}
                                            onClick={() => handleApprovalClick(m)} 
                                            className="px-4 py-2 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100 flex items-center gap-2"
                                        >
                                            {isSubmittingAudit ? <RefreshCw size={12} className="animate-spin" /> : <Check size={14} />}
                                            Approve
                                        </button>
                                    </div>
                                );
                            })()}
                            
                            {isContractor && m.content?.is_addon && (!m.change_orders || m.change_orders.length === 0) && (
                                <button 
                                    onClick={() => setAddonModal({ isOpen: true, milestone: m })}
                                    className="mt-4 px-4 py-2 bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-amber-600 transition-all shadow-lg shadow-amber-100 flex items-center gap-2 w-fit"
                                >
                                    <Banknote size={14} /> Request Fee
                                </button>
                            )}

                            {m.approval_status === 'approved' && project.payment_termins?.some((t: any) => t.milestone_id === m.id) && (
                                <button 
                                    onClick={() => {
                                        const termin = project.payment_termins?.find((t: any) => t.milestone_id === m.id);
                                        if (termin) setUnlockedTerminNotice(termin);
                                    }}
                                    className="mt-4 px-4 py-2 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100 flex items-center gap-2 w-fit"
                                >
                                    <Check size={14} /> Share Payment Link
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {showExtensionModal && <ExtensionRequestModal project={project} onClose={() => setShowExtensionModal(false)} onSuccess={fetchMilestones} />}

            {/* Confirmation Modal */}
            {confirmModal.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-slate-100">
                        <div className="flex flex-col items-center text-center gap-4 mb-8">
                            <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-[2rem] flex items-center justify-center">
                                <ShieldCheck size={40} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900 tracking-tight">Approve Progress?</h3>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Construction Verification</p>
                            </div>
                        </div>

                        <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 mb-8 space-y-4">
                            <div className="flex items-start gap-3 text-left">
                                <Layers className="text-slate-400 mt-0.5" size={16} />
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Phase</p>
                                    <p className="text-sm font-black text-slate-900">{confirmModal.milestone?.title}</p>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-200/60 text-left">
                                <div className="flex items-start gap-3">
                                    <div className="p-2 bg-emerald-500 text-white rounded-lg">
                                        <Check size={16} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Unlocks Payment</p>
                                        <p className="text-sm font-black text-slate-900">{confirmModal.termin?.label}</p>
                                        <p className="text-lg font-black text-emerald-600">Rp {Number(confirmModal.termin?.amount).toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button 
                                onClick={() => setConfirmModal({ isOpen: false, milestone: null, termin: null })}
                                className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={() => confirmModal.milestone && handleAuditSubmit(confirmModal.milestone, 'approved')}
                                disabled={isSubmittingAudit}
                                className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl"
                            >
                                {isSubmittingAudit ? 'Processing...' : 'Confirm & Approve'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Notification Modal */}
            <PaymentTriggerNotificationModal 
                isOpen={!!unlockedTerminNotice}
                onClose={() => setUnlockedTerminNotice(null)}
                termin={unlockedTerminNotice}
                project={project}
            />

            {addonModal.isOpen && addonModal.isNewCreation && (
                <AddonMilestoneModal 
                    project={project}
                    phaseContext="build"
                    onClose={() => setAddonModal({ isOpen: false, milestone: null, isNewCreation: false })}
                    onSuccess={fetchMilestones}
                />
            )}

            {addonModal.isOpen && !addonModal.isNewCreation && (
                <AddonFeeModal 
                    project={project}
                    milestone={addonModal.milestone}
                    onClose={() => setAddonModal({ isOpen: false, milestone: null, isNewCreation: false })}
                    onSuccess={fetchMilestones}
                />
            )}
        </div>
    );
}
