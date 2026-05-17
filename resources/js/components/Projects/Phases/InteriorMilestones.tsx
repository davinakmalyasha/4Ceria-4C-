import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    Plus, Check, Image, X, Save, Trash2, 
    ShoppingBag, DollarSign, Info, Armchair, ShieldCheck, Layers, RefreshCw,
    ChevronUp, ChevronDown, ArrowUpRight, Clock, Banknote
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import PaymentTriggerNotificationModal from './PaymentTriggerNotificationModal';
import AddonFeeModal from './AddonFeeModal';
import AddonMilestoneModal from './AddonMilestoneModal';


interface InteriorMilestonesProps {
    project: any;
    currentUser: any;
    isInteriorDesigner: boolean;
    isPM?: boolean;
}

export default function InteriorMilestones({ project, currentUser, isInteriorDesigner, isPM = false }: InteriorMilestonesProps) {
    const [milestones, setMilestones] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const { showToast } = useToast();

    // Form state
    const [formTitle, setFormTitle] = useState('');
    const [formType, setFormType] = useState('living_room');
    const [formDesc, setFormDesc] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [isSubmittingAudit, setIsSubmittingAudit] = useState(false);

    // Confirmation Modal state
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        milestone: any | null;
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
        milestone: any | null;
        isNewCreation: boolean;
    }>({
        isOpen: false,
        milestone: null,
        isNewCreation: false
    });

    const isOwner = currentUser?.id === project?.user_id;

    const fetchMilestones = async () => {
        try {
            const res = await axios.get(`/projects/${project.id}/milestones`, { params: { phase_context: 'interior' } });
            setMilestones((res.data?.data || []).sort((a: any, b: any) => a.sort_order - b.sort_order));
        } catch (error) { console.error(error); } finally { setLoading(false); }
    };

    useEffect(() => { fetchMilestones(); }, [project.id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const payload = {
                title: formTitle,
                type: formType,
                description: formDesc,
                phase_context: 'interior'
            };
            await axios.post(`/projects/${project.id}/milestones`, payload);
            showToast('Room design added', 'success');
            setShowForm(false); fetchMilestones();
        } catch (err) { showToast('Error adding room', 'error'); } finally { setSubmitting(false); }
    };

    const handleAuditSubmit = async (milestone: any, status: 'approved' | 'revision') => {
        setIsSubmittingAudit(true);
        try {
            const payload = {
                role_type: 'interior',
                milestones: [{ 
                    id: milestone.id, 
                    status: status === 'approved' ? 'approved' : 'revision_requested', 
                    note: ''
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

    const handleApprovalClick = (m: any) => {
        const linkedTermin = project.payment_termins?.find((t: any) => 
            t.milestone_id === m.id && 
            t.role_type === 'interior' &&
            t.status === 'locked'
        );

        if (linkedTermin) {
            setConfirmModal({ isOpen: true, milestone: m, termin: linkedTermin });
        } else {
            handleAuditSubmit(m, 'approved');
        }
    };

    const handleFeePMReview = async (m: any, co: any) => {
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

    const handleFeeOwnerApprove = async (m: any, co: any) => {
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

    if (loading) return <div className="py-20 text-center text-slate-400 font-bold uppercase text-[10px]">Loading Rooms...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Room Designs</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Room-by-room design development</p>
                </div>
                {isInteriorDesigner && !showForm && (
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setShowForm(true)} 
                            className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2 bg-slate-900 text-white hover:scale-105"
                        >
                            <Plus size={14} /> Add Interior Phase
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
                <form onSubmit={handleSubmit} className="bg-white border-2 border-purple-100 rounded-[2rem] p-6 space-y-4 shadow-xl">
                    <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="e.g. Master Bedroom v2" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black outline-none focus:border-purple-500" required />
                    <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Concept notes..." className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium outline-none focus:border-purple-500 min-h-[80px]" />
                    <button type="submit" disabled={submitting} className="w-full py-4 bg-purple-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest">{submitting ? 'Saving...' : 'Confirm Room Design'}</button>
                </form>
            )}

            <div className="space-y-3">
                {milestones.map(m => (
                    <div key={m.id} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden group">
                        <button onClick={() => setExpandedId(expandedId === m.id ? null : m.id)} className="w-full p-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
                                    <Armchair size={20} />
                                </div>
                                <div className="text-left">
                                    <p className="text-xs font-black text-slate-900">{m.title}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{m.type}</p>
                                </div>
                            </div>
                             <div className="flex items-center gap-3">
                                <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-slate-100`}>{m.approval_status || 'In Progress'}</span>
                                {m.content?.is_addon && (
                                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-purple-100 text-purple-600">Revision / Add-on</span>
                                )}
                                {m.change_orders && m.change_orders.length > 0 && (
                                    <div className="flex gap-2">
                                        {m.change_orders.map((co: any) => (
                                            <span key={co.id} className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                                                co.status === 'owner_approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                co.status === 'rejected' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                                'bg-amber-50 text-amber-600 border-amber-100'
                                            }`}>
                                                Fee: {(co.status || 'proposed').replace('_', ' ')}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {expandedId === m.id ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                            </div>
                        </button>
                        {expandedId === m.id && (
                            <div className="p-5 pt-0 border-t border-slate-50">
                                <p className="text-xs text-slate-600 leading-relaxed mt-4">{m.description || 'No description provided.'}</p>
                                {(() => {
                                    const activeCO = m.change_orders?.[0];
                                    const isFeePending = activeCO && activeCO.status !== 'owner_approved' && activeCO.status !== 'rejected';
                                    
                                    if (isFeePending) {
                                        if (isPM && activeCO.status === 'proposed') {
                                            return (
                                                <button 
                                                    disabled={isSubmittingAudit}
                                                    onClick={() => handleFeePMReview(m, activeCO)}
                                                    className="mt-4 w-full py-2 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-amber-600 transition-all shadow-md shadow-amber-100"
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
                                                    className="mt-4 w-full py-2 bg-purple-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-purple-700 transition-all shadow-md shadow-purple-100"
                                                >
                                                    {isSubmittingAudit ? <RefreshCw size={12} className="animate-spin" /> : <Banknote size={14} />}
                                                    Approve Extra Fee
                                                </button>
                                            );
                                        }
                                        return (
                                            <div className="mt-4 w-full py-2 bg-slate-100 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-slate-200">
                                                <Clock size={12} /> Fee Under Review
                                            </div>
                                        );
                                    }

                                    return (isOwner || isPM) && m.approval_status === 'pending' && (
                                        <button 
                                            disabled={isSubmittingAudit}
                                            onClick={() => handleApprovalClick(m)} 
                                            className="mt-4 w-full py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all"
                                        >
                                            {isSubmittingAudit ? <RefreshCw size={12} className="animate-spin" /> : <Check size={14} />}
                                            Approve Room Design
                                        </button>
                                    );
                                })()}

                                {isInteriorDesigner && m.content?.is_addon && (!m.change_orders || m.change_orders.length === 0) && (
                                    <button 
                                        onClick={() => setAddonModal({ isOpen: true, milestone: m })}
                                        className="mt-4 w-full py-2 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-amber-600 transition-all shadow-md shadow-amber-100"
                                    >
                                        <Banknote size={14} /> Request Fee
                                    </button>
                                )}
                                
                                {m.approval_status === 'approved' && project.payment_termins?.some((t: any) => t.milestone_id === m.id) && (
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const termin = project.payment_termins?.find((t: any) => t.milestone_id === m.id);
                                            if (termin) setUnlockedTerminNotice(termin);
                                        }}
                                        className="mt-4 w-full py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all shadow-md shadow-emerald-100"
                                    >
                                        <ArrowUpRight size={14} /> Share Payment Link
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

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
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Interior Verification</p>
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
                    phaseContext="interior"
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
