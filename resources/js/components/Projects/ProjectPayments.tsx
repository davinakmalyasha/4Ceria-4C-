import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    CreditCard, CheckCircle2, AlertCircle, Loader2, DollarSign, Lock,
    ExternalLink, ShieldCheck, Upload, Eye, Check, MessageSquare, 
    MessageCircle, Info, Landmark, Paperclip, FileText, Image as ImageIcon,
    Plus, Trash2, Save, X, DollarSign as DollarIcon
} from 'lucide-react';
import axios from 'axios';
import { useToast } from '../../context/ToastContext';
import { PaymentProofModal } from './Contracts/PaymentProofModal';
import FilePreviewModal from '../Common/FilePreviewModal';
import { DEFAULT_TERMIN_TEMPLATE } from '../../constants/ContractorStandardPresets';

interface ProjectPaymentsProps {
    project: any;
    user: any;
    onRefresh: () => void;
    onOpenChat?: (user: any) => void;
}

export default function ProjectPayments({ project, user, onRefresh, onOpenChat }: ProjectPaymentsProps) {
    const { showToast } = useToast();
    const [selectedBid, setSelectedBid] = useState<any>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [addingToRole, setAddingToRole] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [previewFile, setPreviewFile] = useState<{ path: string; name: string } | null>(null);
    
    // Linking Modal State
    const [linkModal, setLinkModal] = useState<{isOpen: boolean, termin: any, roleType: string, milestones: any[]}>({
        isOpen: false, termin: null, roleType: '', milestones: []
    });

    const handleOpenLinkModal = async (termin: any, roleType: string) => {
        try {
            const phaseContext = roleType === 'arsitek' ? 'design' : roleType === 'kontraktor' ? 'construction' : roleType === 'interior' ? 'interior' : roleType === 'notaris' ? 'legal' : 'engineering';
            const res = await axios.get(`/projects/${project.id}/milestones`, { params: { phase_context: phaseContext } });
            setLinkModal({
                isOpen: true,
                termin,
                roleType,
                milestones: res.data?.data || []
            });
        } catch (e: any) {
            showToast('Failed to load milestones', 'error');
        }
    };

    const handleLinkSubmit = async (milestoneId: number) => {
        try {
            setIsSubmitting(true);
            await axios.post(`/projects/${project.id}/payment-termins/${linkModal.termin.id}/link-milestone`, {
                milestone_id: milestoneId
            });
            showToast('Payment linked to milestone', 'success');
            setLinkModal({ isOpen: false, termin: null, roleType: '', milestones: [] });
            onRefresh();
        } catch (e: any) {
            showToast(e.response?.data?.message || 'Failed to link milestone', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Get highlight ID from URL
    const searchParams = new URLSearchParams(window.location.search);
    const highlightId = searchParams.get('highlight');

    React.useEffect(() => {
        if (highlightId) {
            setTimeout(() => {
                const el = document.getElementById(`payment-${highlightId}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 500); // Small delay to ensure render
        }
    }, [highlightId]);

    // Form State for new termin
    const [newTermin, setNewTermin] = useState({
        label: '',
        percentage: 0,
        trigger_description: '',
        notes: ''
    });

    const groupedPayments = useMemo(() => {
        if (!project) return [];

        const roles = [
            { key: 'design', bids: project.bids_arsitek || [], roleType: 'arsitek' },
            { key: 'build', bids: project.bids_kontraktor || [], roleType: 'kontraktor' },
            { key: 'legal', bids: project.bids_notaris || [], roleType: 'notaris' },
            { key: 'interior', bids: project.bids_interior || [], roleType: 'interior' },
            { key: 'management', bids: project.bids_project_manager || [], roleType: 'project_manager' },
            { key: 'engineering', bids: (project.bids_structural || []).concat(project.bids_mep || []), roleType: 'engineering' },
        ];

        const groups: any[] = [];

        roles.forEach(role => {
            const roleBids = role.bids && Array.isArray(role.bids) ? role.bids : [];
            roleBids.forEach((bid: any) => {
                const isSignedByPro = !!bid.pro_signature_url;
                const isSignedByClient = !!bid.client_signature_url;
                
                // Only show payment groups for professionals who have signed and client has signed
                const isReadyForPayment = ['accepted', 'awaiting_payment', 'active', 'completed'].includes(bid.status) && 
                    (!isSignedByPro || isSignedByClient);

                if (isReadyForPayment) {
                    const roleTermins = (project.payment_termins || []).filter((t: any) => {
                        if (role.roleType === 'engineering') {
                            return t.role_type === 'structural' || t.role_type === 'mep';
                        }
                        return t.role_type === role.roleType || 
                               (role.roleType === 'project_manager' && t.role_type === 'pm') ||
                               (t.role_type === 'other' && t.recipient_id === bid.bidder?.user?.id);
                    });
                    
                    const proPayments: any[] = [];
                    let totalPrice = 0;
                    let paidPrice = 0;

                    if (roleTermins.length > 0) {
                        roleTermins.forEach((termin: any) => {
                            totalPrice += Number(termin.amount);
                            if (termin.status === 'paid') paidPrice += Number(termin.amount);
                            
                            proPayments.push({
                                ...bid,
                                id: termin.id,
                                bidId: bid.id,
                                label: termin.label,
                                proName: bid.bidder?.name || 'Professional',
                                price: termin.amount,
                                percentage: termin.percentage,
                                payment_proof_path: termin.payment_proof_path,
                                payment_status: termin.status,
                                notes: termin.notes,
                                verification_notes: termin.verification_notes,
                                proposal: termin.proposal,
                                isTermin: true,
                                role_type: termin.role_type,
                                phaseKey: role.key,
                                milestone: termin.milestone // Linked milestone data
                            });
                        });
                    } else {
                        totalPrice = Number(bid.calculated_total) || Number(bid.price);
                        if (bid.payment_status === 'paid') paidPrice = totalPrice;

                        proPayments.push({
                            ...bid,
                            label: 'Hiring Fee',
                            price: totalPrice,
                            percentage: 100,
                            isTermin: false,
                            phaseKey: role.key,
                            notes: bid.verification_notes,
                            verification_notes: bid.verification_notes,
                            payment_status: bid.payment_status || 'pending'
                        });
                    }

                    if (proPayments.length > 0) {
                        groups.push({
                            id: bid.id,
                            proName: bid.bidder?.name || 'Professional',
                            roleName: role.key,
                            roleType: role.roleType,
                            totalPrice,
                            paidPrice,
                            progress: totalPrice > 0 ? (paidPrice / totalPrice) * 100 : 0,
                            payments: proPayments,
                            bidder: bid.bidder,
                            rawBid: bid,
                            verificationNotes: bid.verification_notes,
                            pmNotes: project.pm_audit_notes,
                            architectNotes: project.architect_notes
                        });
                    }
                }
            });
        });
        // Process Addendums: Merge into existing groups or create new ones
        if (project.addendums && Array.isArray(project.addendums)) {
            project.addendums.forEach((addendum: any) => {
                // Ignore any addendums with zero or negative amounts
                if (Number(addendum.amount) <= 0) return;

                if (addendum.status === 'approved_unpaid' || addendum.status === 'verifying' || addendum.status === 'paid') {
                    // Try to find existing group for this role (e.g. arsitek, kontraktor)
                    // Group under 'arsitek' for the owner or PM/Architect to avoid redundancy, but keep it in its own role for the specialist themselves so they can see and verify it!
                    const isSpecialistSelf = user?.role_type === addendum.role_type || (addendum.assigned_user_id && user?.id === addendum.assigned_user_id);
                    const targetRoleType = (isSpecialistSelf)
                        ? addendum.role_type
                        : ((addendum.role_type === 'structural' || addendum.role_type === 'mep' || addendum.role_type === 'interior')
                            ? 'arsitek'
                            : addendum.role_type);

                    const existingGroup = groups.find(g => g.roleType === targetRoleType);
                    
                    const paymentObj = {
                        ...addendum,
                        id: addendum.id,
                        label: addendum.title || 'Specialist Assignment',
                        proName: addendum.team_member?.name || 'Professional',
                        price: addendum.amount,
                        percentage: 100,
                        payment_proof_path: addendum.payment_proof_path,
                        payment_status: addendum.status,
                        notes: addendum.description,
                        verification_notes: addendum.verification_notes,
                        isTermin: false,
                        isAddendum: true,
                        phaseKey: addendum.role_type === 'arsitek' ? 'design' : 
                                  addendum.role_type === 'kontraktor' ? 'build' : 
                                  addendum.role_type === 'notaris' ? 'legal' : 
                                  addendum.role_type === 'interior' ? 'interior' : 'management'
                    };

                    if (existingGroup) {
                        existingGroup.payments.push({ ...paymentObj, bidder: existingGroup.bidder });
                        existingGroup.totalPrice += Number(addendum.amount);
                        if (addendum.status === 'paid') {
                            existingGroup.paidPrice += Number(addendum.amount);
                        }
                        existingGroup.progress = existingGroup.totalPrice > 0 ? (existingGroup.paidPrice / existingGroup.totalPrice) * 100 : 0;
                    } else {
                        // Create new group if none exists for this professional role
                        const bidder = { user: { id: addendum.assigned_user_id || addendum.user_id }, phone: '' };
                        const proName = addendum.assigned_user_id === user?.id 
                            ? (user?.name || 'Interior Designer') 
                            : (addendum.team_member?.name || (addendum.role_type === 'arsitek' ? 'Architect' : 'Professional') + ' Add-on');
                        groups.push({
                            id: `addendum-${addendum.id}`,
                            proName: proName,
                            roleName: `${addendum.role_type.charAt(0).toUpperCase() + addendum.role_type.slice(1)} Add-on`,
                            roleType: addendum.role_type,
                            totalPrice: Number(addendum.amount),
                            paidPrice: addendum.status === 'paid' ? Number(addendum.amount) : 0,
                            progress: addendum.status === 'paid' ? 100 : 0,
                            payments: [{ ...paymentObj, bidder }],
                            bidder: bidder,
                            rawBid: null,
                            verificationNotes: addendum.verification_notes
                        });
                    }
                }
            });
        }

        return groups;
    }, [project]);

    const isOwner = user?.id && project?.user_id && String(user.id) === String(project.user_id);
    const isProjectPM = user?.id && project?.pm_id && String(user.id) === String(project.pm_id);
    const isGlobalPM = user?.role_type === 'project_manager';

    const handleActionClick = (payment: any) => {
        setSelectedBid(payment);
        setIsModalOpen(true);
    };

    const getBidType = (payment: any) => {
        if (!payment) return 'termin';
        if (payment.isTermin) return 'termin';
        if (payment.isAddendum) return 'addendum';
        const bidTypeMap: any = {
            design: 'arsitek_bid', build: 'kontraktor_bid', legal: 'notaris_bid', interior: 'interior_bid',
            management: 'pm_bid',
            engineering: payment.structural_id ? 'structural_bid' : 'mep_bid'
        };
        return bidTypeMap[payment.phaseKey] || 'termin';
    };

    const handleWhatsAppClick = (phone: string, label: string) => {
        if (!phone) {
            showToast('Phone number not available', 'error');
            return;
        }
        const cleanPhone = phone.replace(/\D/g, '');
        const message = encodeURIComponent(`Hi, I would like to discuss the payment for "${label}" in the project "${project?.title}".`);
        window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
    };

    const handleDeleteTermin = async (terminId: number) => {
        if (!window.confirm('Delete this payment stage?')) return;
        try {
            await axios.delete(`/projects/${project.id}/payment-termins/${terminId}`);
            showToast('Payment stage deleted', 'success');
            onRefresh();
        } catch (error) {
            showToast('Failed to delete stage', 'error');
        }
    };

    const handleAddTermin = async (roleType: string) => {
        if (!newTermin.label || newTermin.percentage <= 0) {
            showToast('Please fill in label and percentage', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            // Calculate amount based on role
            const group = groupedPayments.find(g => g.roleType === roleType);
            const amount = Math.round((newTermin.percentage / 100) * (group?.totalPrice || 0));

            await axios.post(`/projects/${project.id}/payment-termins`, {
                ...newTermin,
                amount,
                role_type: roleType
            });

            showToast('Payment stage added', 'success');
            setAddingToRole(null);
            setNewTermin({ label: '', percentage: 0, trigger_description: '', notes: '' });
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to add stage', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleApplyTemplate = async () => {
        if (!window.confirm('Apply the standard 5-stage payment template?')) return;
        
        setIsSubmitting(true);
        try {
            const group = groupedPayments.find(g => g.roleType === 'kontraktor');
            const totalContract = group?.totalPrice || 0;

            const promises = DEFAULT_TERMIN_TEMPLATE.map(t => {
                return axios.post(`/projects/${project.id}/payment-termins`, {
                    label: t.label,
                    percentage: t.percentage,
                    amount: Math.round((t.percentage / 100) * totalContract),
                    trigger_description: t.trigger,
                    status: 'locked',
                    role_type: 'kontraktor'
                });
            });

            await Promise.all(promises);
            showToast('Standard template applied!', 'success');
            onRefresh();
        } catch (error) {
            showToast('Failed to apply template', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const visibleGroups = useMemo(() => {
        return groupedPayments.filter(group => {
            const bidProId = group.bidder?.user?.id ? String(group.bidder.user.id) : null;
            const isProForThisGroup = user?.id && bidProId && String(user.id) === bidProId;

            // Show if Owner, the specific Pro, or the Project PM
            if (!isOwner && !isProForThisGroup && !isProjectPM && !isGlobalPM) return false;

            return true;
        });
    }, [groupedPayments, user, isOwner, isProjectPM, isGlobalPM]);

    return (
        <div className="space-y-8">

            {visibleGroups.length > 0 ? (
                <div className="grid grid-cols-1 gap-8">
                    {visibleGroups.map(group => {
                        const bidProId = group.bidder?.user?.id ? String(group.bidder.user.id) : null;
                        const isProForThisGroup = user?.id && bidProId && String(user.id) === bidProId;

                        return (
                            <motion.div 
                                key={`${group.roleName}-${group.id}`}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-white border border-gray-100 rounded-[2.5rem] overflow-hidden shadow-xl hover:shadow-2xl transition-all"
                            >
                                <div className="p-8">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                                        <div className="flex items-center gap-5">
                                            <div className="w-16 h-16 rounded-[1.25rem] bg-zinc-900 flex items-center justify-center text-2xl font-black text-white shadow-xl">
                                                {group.proName[0]}
                                            </div>
                                            <div>
                                                <h4 className="font-black text-gray-900 text-xl leading-tight">{group.proName}</h4>
                                                <div className="flex items-center gap-3 mt-1">
                                                    <span className="text-xs font-black uppercase text-gray-400 tracking-widest">{group.roleName}</span>
                                                    <span className="w-1 h-1 bg-gray-300 rounded-full" />
                                                    <span className="text-xs font-black text-emerald-600">Total: Rp {group.totalPrice.toLocaleString('id-ID')}</span>
                                                </div>
                                                {!isProForThisGroup && (
                                                    <div className="flex gap-2 mt-4">
                                                        <button 
                                                            onClick={() => {
                                                                const proUser = group.rawBid?.arsitek?.user || 
                                                                                group.rawBid?.kontraktor?.user || 
                                                                                group.rawBid?.notaris?.user || 
                                                                                group.rawBid?.interior?.user || 
                                                                                group.rawBid?.pm?.user || 
                                                                                group.rawBid?.structural?.user || 
                                                                                group.rawBid?.mep?.user || 
                                                                                group.bidder?.user || 
                                                                                group.rawBid?.user;
                                                                
                                                                if (onOpenChat && (proUser || group.bidder?.user)) {
                                                                    onOpenChat(proUser || group.bidder?.user);
                                                                } else {
                                                                    window.location.href = `/messages?user_id=${group.bidder?.user?.id}`;
                                                                }
                                                            }}
                                                            className="flex-1 py-3 bg-white border border-gray-200 text-gray-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 flex items-center justify-center gap-2 transition-all shadow-sm"
                                                        >
                                                            <MessageSquare size={14} /> Chat
                                                        </button>
                                                        {group.bidder?.phone && (
                                                            <a 
                                                                href={`https://wa.me/${group.bidder.phone.replace(/[^0-9]/g, '')}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-100"
                                                            >
                                                                <MessageCircle size={14} /> WhatsApp
                                                            </a>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end gap-2">
                                            <div className="flex items-center gap-3">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Payment Progress</span>
                                                <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">{Math.round(group.progress)}%</span>
                                            </div>
                                            <div className="w-48 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                <motion.div 
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${group.progress}%` }}
                                                    className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bank Note / Payment Instructions */}
                                    {(isOwner || isProjectPM || isGlobalPM) && (
                                        <div className="mb-8 p-6 bg-zinc-50 border border-zinc-100 rounded-[1.5rem] shadow-inner">
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="p-2.5 bg-zinc-900 text-white rounded-xl shadow-lg">
                                                    <Landmark size={20} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Bank Note</span>
                                                    <span className="text-xs font-black text-zinc-900 uppercase tracking-widest">
                                                        {project?.payment_instructions ? 'Payment Instructions' : 
                                                            group.verificationNotes ? 'Hiring Confirmation Note' : 
                                                            group.pmNotes ? 'PM Audit Note' : 
                                                            group.architectNotes ? 'Architect Technical Note' : 'Payment Instructions'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="text-sm text-zinc-600 font-bold leading-relaxed bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm italic">
                                                {project?.payment_instructions || group.verificationNotes || group.pmNotes || group.architectNotes || 'Please contact the professional via WhatsApp or Chat to get their bank account details for transfer.'}
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {group.payments.map((payment: any, index: number) => {
                                            const hasProof = !!payment.payment_proof_path;
                                            const isVerifying = payment.payment_status === 'verifying';
                                            const isPaid = payment.payment_status === 'paid';
                                            
                                            // Enforce strict PM gating
                                            let isLocked = payment.payment_status === 'locked';
                                            const isDownPayment = index === 0 || 
                                                                  payment.label.toLowerCase().includes('dp') || 
                                                                  payment.label.toLowerCase().includes('down payment') || 
                                                                  payment.label.toLowerCase().includes('downpayment');

                                            const isTeamPayment = payment.role_type === 'other';

                                            if (payment.isTermin && !isPaid && !isVerifying && !isTeamPayment) {
                                                if (payment.milestone && !isDownPayment) {
                                                    // Must be approved by PM (except Down Payment)
                                                    if (payment.milestone.approval_status !== 'approved') {
                                                        isLocked = true;
                                                    }
                                                } else if (index > 0 && !isDownPayment) {
                                                    // Termins without milestones (except DP) are locked until PM defines them
                                                    isLocked = true;
                                                }
                                            }

                                            const isHighlighted = highlightId === payment.id.toString();

                                            // Sequential payment lock:
                                            // Only lock if it is NOT a subcontractor/team payment ('other').
                                            // And only check preceding unpaid termins of the EXACT SAME role_type.
                                            let isSequentialLocked = false;
                                            if (payment.isTermin && !isPaid && !isVerifying && payment.role_type !== 'other') {
                                                isSequentialLocked = group.payments.slice(0, index).some((p: any) => 
                                                    p.isTermin && 
                                                    p.role_type === payment.role_type && 
                                                    p.payment_status !== 'paid' && 
                                                    p.payment_status !== 'verifying'
                                                );
                                            }

                                            const isVisuallyLocked = isLocked || isSequentialLocked;

                                            return (
                                                <div 
                                                    key={payment.id}
                                                    id={`payment-${payment.id}`}
                                                    className={`rounded-2xl p-5 transition-all group border relative ${
                                                        isHighlighted ? 'ring-4 ring-emerald-400 shadow-2xl shadow-emerald-200 scale-[1.02] z-10' : ''
                                                    } ${
                                                        isPaid ? 'bg-emerald-50/30 border-emerald-100' : 
                                                        isVisuallyLocked ? 'bg-slate-50 border-slate-100 opacity-70 grayscale-[0.5]' :
                                                        'bg-gray-50/50 border-gray-100 hover:bg-white hover:shadow-lg'
                                                    }`}
                                                >
                                                    {isVisuallyLocked && (
                                                        <div className="absolute top-3 right-3 bg-white/80 p-1 rounded-lg border border-slate-200">
                                                            <AlertCircle size={14} className="text-slate-400" />
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{payment.label}</span>
                                                            {!isPaid && (isProForThisGroup || isProjectPM || isGlobalPM) && payment.isTermin && (
                                                                <button 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeleteTermin(payment.id);
                                                                    }}
                                                                    className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            )}
                                                        </div>
                                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                                                            isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-50 text-emerald-600'
                                                        }`}>{payment.percentage}%</span>
                                                    </div>
                                                    
                                                    <div className="text-lg font-black text-gray-900 mb-2">
                                                        Rp {Number(payment.price).toLocaleString('id-ID')}
                                                    </div>

                                                    {payment.milestone ? (
                                                        <div className={`mb-4 p-3 rounded-xl text-[10px] font-black flex items-center gap-2 border ${
                                                            isLocked ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                        }`}>
                                                            <Check size={12} className={isLocked ? 'text-slate-400' : 'text-emerald-500'} />
                                                            <div className="flex flex-col">
                                                                <span className="text-[8px] uppercase tracking-widest opacity-60">Unlocked By</span>
                                                                <span className="truncate max-w-[150px]">{payment.milestone.title}</span>
                                                            </div>
                                                            {!isLocked && !isPaid && (
                                                                <span className="ml-auto bg-emerald-500 text-white px-1.5 py-0.5 rounded text-[8px] animate-pulse">READY</span>
                                                            )}
                                                        </div>
                                                    ) : payment.isTermin && index > 0 && (isProjectPM || isGlobalPM || isProForThisGroup) && (
                                                        <div className="mb-4">
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleOpenLinkModal(payment, group.roleType); }}
                                                                className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-blue-200 transition-colors flex items-center justify-center gap-1.5"
                                                            >
                                                                <Plus size={12} /> Link to Milestone
                                                            </button>
                                                        </div>
                                                    )}

                                                    {payment.notes && (
                                                        <div className="mb-4 p-3 bg-blue-50/50 border border-blue-100 rounded-xl text-[10px] text-blue-900 font-medium leading-relaxed italic">
                                                            <div className="flex items-center gap-1.5 mb-1.5 text-[9px] uppercase tracking-wider text-blue-700 not-italic font-black">
                                                                <Info size={12} /> Note from PM:
                                                            </div>
                                                            "{payment.notes}"
                                                        </div>
                                                    )}

                                                    {payment.verification_notes && (
                                                        <div className="mb-4 p-3 bg-red-50/50 border border-red-100 rounded-xl text-[10px] text-red-900 font-bold leading-relaxed italic">
                                                            <div className="flex items-center gap-1.5 mb-1.5 text-[9px] uppercase tracking-wider text-red-700 not-italic font-black">
                                                                <AlertCircle size={12} /> Rejection Feedback:
                                                            </div>
                                                            "{payment.verification_notes}"
                                                        </div>
                                                    )}

                                                    {payment.proposal && (
                                                        <div className="mb-4 p-3 bg-gray-50 border border-gray-100 rounded-xl text-[10px] text-gray-700 font-medium leading-relaxed italic">
                                                            <div className="flex items-center gap-1.5 mb-1.5 text-[9px] uppercase tracking-wider text-gray-500 not-italic font-black">
                                                                <FileText size={12} /> Pro's Proposal / Bank Info:
                                                            </div>
                                                            "{payment.proposal}"
                                                        </div>
                                                    )}

                                                    {(payment.attachment_1 || payment.attachment_2 || payment.attachment_3) && (
                                                        <div className="mb-4 flex flex-wrap gap-2">
                                                            {[payment.attachment_1, payment.attachment_2, payment.attachment_3].filter(Boolean).map((url, i) => (
                                                                <button 
                                                                    key={i} 
                                                                    type="button"
                                                                    onClick={() => setPreviewFile({ path: url, name: `${payment.label} Doc ${i + 1}` })}
                                                                    className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-[9px] font-black text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-all shadow-sm cursor-pointer"
                                                                >
                                                                    <Paperclip size={12} /> Doc {i+1}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}

                                                    <div className="flex items-center gap-3 mb-5">
                                                        <div className={`w-2 h-2 rounded-full ${
                                                            isPaid ? 'bg-emerald-500' : 
                                                            isSequentialLocked ? 'bg-slate-300' :
                                                            isLocked ? 'bg-slate-300' :
                                                            hasProof ? 'bg-emerald-500 animate-pulse' : 
                                                            'bg-amber-400'
                                                        }`} />
                                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                                            {isPaid ? 'Paid & Verified' : 
                                                             isSequentialLocked ? 'Pay previous stages first' :
                                                             isLocked ? 'Locked until approval' :
                                                             hasProof ? (isVerifying ? 'Verifying Proof' : 'Proof Submitted') : 
                                                             'Awaiting Payment'}
                                                        </span>
                                                    </div>

                                                    {hasProof && (
                                                        <div 
                                                            onClick={() => {
                                                                if (isPaid) {
                                                                    setPreviewFile({
                                                                        path: payment.payment_proof_path,
                                                                        name: `${payment.label} Proof`
                                                                    });
                                                                } else {
                                                                    handleActionClick(payment);
                                                                }
                                                            }}
                                                            className="mb-5 relative group cursor-pointer"
                                                        >
                                                            <div className="aspect-video bg-gray-100 rounded-xl overflow-hidden border border-gray-200 shadow-inner group-hover:border-emerald-500/50 transition-all">
                                                                <img 
                                                                    src={payment.payment_proof_path} 
                                                                    alt="Payment Proof" 
                                                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                                                />
                                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                    <Eye size={20} className="text-white" />
                                                                </div>
                                                            </div>
                                                            <div className="absolute -bottom-1 -right-1 p-1 bg-white rounded-lg shadow-md border border-gray-100">
                                                                <ImageIcon size={12} className="text-emerald-500" />
                                                            </div>
                                                        </div>
                                                    )}

                                                    {isPaid ? (
                                                        <div className="w-full py-3 bg-emerald-100/50 border border-emerald-200 text-emerald-700 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
                                                            <CheckCircle2 size={14} /> Completed
                                                        </div>
                                                    ) : isSequentialLocked ? (
                                                        <div className="w-full py-3 bg-slate-100 border border-slate-200 text-slate-400 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 cursor-not-allowed">
                                                            <Lock size={14} /> Pay Previous Stages First
                                                        </div>
                                                    ) : isLocked ? (
                                                        <div className="w-full py-3 bg-slate-100 border border-slate-200 text-slate-400 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 cursor-not-allowed">
                                                            <AlertCircle size={14} /> Locked
                                                        </div>
                                                    ) : (
                                                        <button 
                                                            onClick={() => handleActionClick(payment)}
                                                            disabled={!isOwner && !isProjectPM && !isGlobalPM && !hasProof}
                                                            className={`w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                                                                (isOwner && !isProForThisGroup) || (hasProof && (isProjectPM || isGlobalPM || isOwner) && !isProForThisGroup)
                                                                ? (hasProof ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-[#FF2D20] text-white hover:bg-red-700 shadow-md shadow-red-200 ring-2 ring-red-100')
                                                                : (hasProof ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-md shadow-emerald-200' : 'bg-gray-100 text-gray-400 cursor-not-allowed')
                                                            }`}
                                                        >
                                                            {hasProof ? (
                                                                ((isOwner || isProjectPM || isGlobalPM) && !isProForThisGroup) ? <><Eye size={14}/> View Proof</> : <><Eye size={14}/> View & Verify</>
                                                            ) : (
                                                                (isOwner && !isProForThisGroup) ? <><Upload size={14}/> Upload Proof</> : 'No Proof Yet'
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {/* Add Stage Button / Form */}
                                        {(isProForThisGroup || isProjectPM || isGlobalPM) && (
                                            <div className="mt-4">
                                                {addingToRole === group.roleType ? (
                                                    <motion.div 
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: 'auto' }}
                                                        className="bg-zinc-50 border border-zinc-200 rounded-2xl p-6 space-y-4"
                                                    >
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <div className="space-y-2">
                                                                <label className="text-[10px] font-black uppercase text-zinc-400">Stage Label</label>
                                                                <input 
                                                                    type="text" 
                                                                    placeholder="e.g. Down Payment"
                                                                    value={newTermin.label}
                                                                    onChange={e => setNewTermin({...newTermin, label: e.target.value})}
                                                                    className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-xs font-bold focus:border-zinc-900 outline-none"
                                                                />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <label className="text-[10px] font-black uppercase text-zinc-400">Percentage (%)</label>
                                                                <div className="relative">
                                                                    <input 
                                                                        type="number" 
                                                                        placeholder="30"
                                                                        value={newTermin.percentage || ''}
                                                                        onChange={e => setNewTermin({...newTermin, percentage: Number(e.target.value)})}
                                                                        className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-xs font-bold focus:border-zinc-900 outline-none"
                                                                    />
                                                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 text-xs font-black">%</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <label className="text-[10px] font-black uppercase text-zinc-400">Trigger Description</label>
                                                            <textarea 
                                                                placeholder="When will this be billed? (e.g. After floor plan approval)"
                                                                value={newTermin.trigger_description}
                                                                onChange={e => setNewTermin({...newTermin, trigger_description: e.target.value})}
                                                                className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-xs font-bold focus:border-zinc-900 outline-none min-h-[80px]"
                                                            />
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button 
                                                                onClick={() => handleAddTermin(group.roleType)}
                                                                disabled={isSubmitting}
                                                                className="flex-1 py-3 bg-zinc-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all"
                                                            >
                                                                {isSubmitting ? 'Adding...' : 'Create Stage'}
                                                            </button>
                                                            <button 
                                                                onClick={() => setAddingToRole(null)}
                                                                className="px-6 py-3 bg-white border border-zinc-200 text-zinc-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-50 transition-all"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </motion.div>
                                                ) : (
                                                    <div className="flex flex-col gap-3">
                                                        {group.payments.length === 0 && (
                                                            <>
                                                                <button 
                                                                    onClick={() => setAddingToRole(group.roleType)}
                                                                    className="w-full py-4 border-2 border-dashed border-zinc-200 rounded-2xl text-zinc-400 hover:border-zinc-400 hover:text-zinc-600 transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest"
                                                                >
                                                                    <Plus size={14} /> Add Payment Stage / Milestone
                                                                </button>
                                                                {group.roleType === 'kontraktor' && (
                                                                    <button 
                                                                        onClick={handleApplyTemplate}
                                                                        disabled={isSubmitting}
                                                                        className="w-full py-3 bg-zinc-50 text-zinc-500 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-zinc-100 transition-all border border-zinc-200"
                                                                    >
                                                                        Apply Standard 5-Stage Template
                                                                    </button>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            ) : (
                <div className="py-24 border-2 border-dashed border-gray-100 rounded-[3rem] flex flex-col items-center justify-center text-center">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center text-gray-200 mb-6">
                        <CreditCard size={40} />
                    </div>
                    <h3 className="text-gray-400 font-black text-2xl">No Pending Payments</h3>
                    <p className="text-gray-300 text-sm mt-2 max-w-md uppercase tracking-widest font-bold leading-relaxed">
                        Accepted professionals will appear here for final payment verification before project start.
                    </p>
                </div>
            )}

            {selectedBid && (
                <PaymentProofModal 
                    key={`${getBidType(selectedBid)}-${selectedBid.id}`}
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    project={project}
                    termin={{
                        id: selectedBid.id,
                        label: selectedBid.label,
                        amount: selectedBid.price,
                        percentage: selectedBid.percentage,
                        proposal: selectedBid.proposal,
                        payment_proof_path: selectedBid.payment_proof_path,
                        payment_status: selectedBid.payment_status,
                        type: getBidType(selectedBid)
                    }}
                    isProfessional={
                        (user?.id && selectedBid.bidder?.user?.id && String(user.id) === String(selectedBid.bidder.user.id))
                    }
                    onSuccess={onRefresh}
                />
            )}
            <AnimatePresence>
                {linkModal.isOpen && (
                    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
                            onClick={() => !isSubmitting && setLinkModal({ isOpen: false, termin: null, roleType: '', milestones: [] })}
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-md relative z-10 shadow-2xl border border-zinc-100"
                        >
                            <button 
                                onClick={() => !isSubmitting && setLinkModal({ isOpen: false, termin: null, roleType: '', milestones: [] })}
                                className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"
                            >
                                <X size={20} />
                            </button>

                            <div className="mb-8">
                                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-5">
                                    <Plus size={24} />
                                </div>
                                <h3 className="text-xl font-black text-zinc-900 mb-2">Link Milestone</h3>
                                <p className="text-sm text-zinc-500">
                                    Connect <b>{linkModal.termin?.label}</b> to an existing milestone so it can be unlocked when the PM approves the work.
                                </p>
                            </div>

                            <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                                {linkModal.milestones.length === 0 ? (
                                    <div className="text-center py-6 text-sm text-zinc-500">
                                        No milestones available for this phase.
                                    </div>
                                ) : (
                                    linkModal.milestones.map((m: any) => {
                                        const isApproved = m.approval_status === 'approved';
                                        return (
                                            <button
                                                key={m.id}
                                                onClick={() => handleLinkSubmit(m.id)}
                                                disabled={isSubmitting}
                                                className="w-full p-4 rounded-xl border border-zinc-200 hover:border-blue-500 hover:bg-blue-50 transition-all text-left flex flex-col gap-1 group"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="font-bold text-sm text-zinc-900 group-hover:text-blue-700">{m.title}</span>
                                                    {isApproved && <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">APPROVED</span>}
                                                </div>
                                                {m.description && <span className="text-xs text-zinc-500 truncate">{m.description}</span>}
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            <FilePreviewModal
                isOpen={!!previewFile}
                onClose={() => setPreviewFile(null)}
                filePath={previewFile?.path || null}
                fileName={previewFile?.name || ''}
            />
        </div>
    );
}
