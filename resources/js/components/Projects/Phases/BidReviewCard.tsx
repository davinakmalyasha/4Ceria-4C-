import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Clock, DollarSign, Check, X, Loader2, 
    Shield, Users, Hammer, CreditCard, 
    ChevronDown, ChevronUp, Construction, Info, Activity, Star,
    FileText, ExternalLink, Box, Layout, Zap, Grid, Eye, Sofa, CheckCircle2, ListChecks, MessageCircle, Smartphone, Upload, CheckCircle,
    MapPin, ShieldCheck
} from 'lucide-react';
import { ARCHITECT_SERVICE_SCOPES, ARCHITECT_DELIVERABLES } from '../../../constants/ArchitectStandardPresets';
import { CONSTRUCTION_METHODS, PAYMENT_SCHEDULE_OPTIONS } from '../../../constants/ContractorStandardPresets';
import { PM_SERVICE_SCOPES, PM_DELIVERABLES, PM_FEE_TYPES, stripPMAutomatedProposal } from '../../../constants/ProjectManagerStandardPresets';
import { NOTARY_SERVICE_SCOPES } from '../../../constants/NotaryStandardPresets';
import { 
    STRUCTURAL_SERVICE_SCOPES, STRUCTURAL_DELIVERABLES, 
    MEP_SERVICE_SCOPES, MEP_DELIVERABLES 
} from '../../../constants/EngineeringStandardPresets';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import axios from 'axios';
import { ContractSignModal } from '../Contracts/ContractSignModal';
import { PaymentProofModal } from '../Contracts/PaymentProofModal';
import { ProfilePreviewCard } from '../../Shared/ProfilePreviewCard';
import { getProfile, ROLE_LABELS } from '../../Shared/ProfilePreviewHelpers';
import ConfirmModal from '../ConfirmModal';
import { NegotiationHistory } from './NegotiationHistory';
import { ProposeFeeModal } from './ProposeFeeModal';
import { PortfolioProject } from '../../../types/project.types';

const ensureArray = (value: any): any[] => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return parsed.map(item => {
                        if (typeof item === 'string') {
                            try {
                                const subParsed = JSON.parse(item);
                                if (Array.isArray(subParsed)) return subParsed;
                                return item;
                            } catch(e) {}
                        }
                        return item;
                    }).flat();
                }
            } catch (e) {}
        }
        return trimmed.split(',').map(x => x.trim()).filter(Boolean);
    }
    return [];
};

interface BidReviewCardProps {
    bid: any;
    phaseKey: string;
    onAction?: (bidId: number, action: 'shortlist' | 'accept' | 'decline' | 'recommend') => void;
    isActioning?: boolean;
    isPM?: boolean;
    readOnly?: boolean;
    onOpenChat?: (user: any) => void;
    onRefresh?: () => void;
    projectId?: number;
    project?: any;
    bidType?: 'arsitek' | 'kontraktor' | 'notaris' | 'interior' | 'project_manager' | 'structural' | 'mep';
}

export const BidReviewCard: React.FC<BidReviewCardProps> = ({ 
    bid, phaseKey, onAction, isActioning, isPM, readOnly, onOpenChat, onRefresh, projectId, project: passedProject, bidType 
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const { user } = useAuth();
    const { showToast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [negotiatedFee, setNegotiatedFee] = useState<number>(0);


    // Sync state with props
    useEffect(() => {
        setNegotiatedFee(Number(bid.price) || 0);
    }, [bid.price]);
    
    // Modal states
    const [isSignModalOpen, setIsSignModalOpen] = useState(false);
    const [isProofModalOpen, setIsProofModalOpen] = useState(false);
    const [isProposeFeeModalOpen, setIsProposeFeeModalOpen] = useState(false);
    const [selectedTermin, setSelectedTermin] = useState<any>(null);
    const [isVerifyingProof, setIsVerifyingProof] = useState(false);
    const [portfolios, setPortfolios] = useState<PortfolioProject[]>([]);
    const [isLoadingPortfolios, setIsLoadingPortfolios] = useState(false);
    const [isConfirmFeeModalOpen, setIsConfirmFeeModalOpen] = useState(false);

    const isContractor = phaseKey === 'build';
    const hasHistory = bid.negotiation_logs && bid.negotiation_logs.length > 0;

    // Status & Role identification
    const activeProject = passedProject || bid.project;
    const isOwner = user?.id === (activeProject?.user_id || activeProject?.owner_id || projectId);
    const isPro = user?.role_type !== 'user';
    
    // Better pro identification (handling both flat and nested bidder objects)
    const proId = bid.bidder?.id || bid.bidder_id || bid.arsitek_id || bid.kontraktor_id || bid.notaris_id || bid.interior_id || bid.pm_id || bid.structural_id || bid.mep_id;
    const proUserId = bid.bidder?.user?.id || bid.bidder?.user_id || bid.user_id || bid.arsitek?.user_id || bid.kontraktor?.user_id || bid.notaris?.user_id || bid.interior?.user_id || bid.pm_id || bid.structural_engineer?.user_id || bid.mep_engineer?.user_id;
    const proType = bidType || (
        phaseKey === 'design' ? 'arsitek' : 
        phaseKey === 'build' ? 'kontraktor' : 
        phaseKey === 'legal' ? 'notaris' : 
        phaseKey === 'management' ? 'project_manager' : 
        phaseKey === 'engineering' ? (bid.structural_id || bid.structuralEngineer ? 'structural' : 'mep') : 'interior'
    );
    
    // Check if the current user is the professional of THIS bid
    const isThePro = !!proId && (
        (proType === 'arsitek' && (user?.arsitek?.id === proId || user?.id === bid.arsitek?.user_id)) ||
        (proType === 'kontraktor' && (user?.kontraktor?.id === proId || user?.id === bid.kontraktor?.user_id)) ||
        (proType === 'notaris' && (user?.notaris_profile?.id === proId || user?.id === bid.notaris?.user_id)) ||
        (proType === 'interior' && (user?.interior_profile?.id === proId || user?.id === bid.interior?.user_id)) ||
        (proType === 'project_manager' && (user?.project_manager?.id === proId || user?.id === proId)) ||
        (proType === 'structural' && (user?.structural_engineer?.id === proId || user?.id === proUserId)) ||
        (proType === 'mep' && (user?.mep_engineer?.id === proId || user?.id === proUserId))
    );

    const isLeadArchitect = user?.role_type === 'arsitek' && (activeProject?.arsitek?.user?.id === user?.id || activeProject?.arsitek?.user_id === user?.id);
    const isLeadContractor = user?.role_type === 'kontraktor' && (activeProject?.kontraktor?.user?.id === user?.id || activeProject?.kontraktor?.user_id === user?.id);
    const isSpecialist = phaseKey === 'engineering';
    const canRecommend = isSpecialist && (isLeadArchitect || isLeadContractor);
    const isOwnerOrPM = user?.id === activeProject?.user_id || user?.id === activeProject?.pm_id;
    const isProjectManager = activeProject?.pm_id && user?.id === activeProject?.pm_id;
    const showFinancials = isThePro || (bid.status !== 'pending' && bid.status !== 'invited');

    const resolveProName = () => {
        if (isThePro) return `You (${proType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')})`;
        
        // Phase-specific data resolution
        const name = 
            bid.arsitek?.nama || 
            bid.kontraktor?.nama || 
            bid.notaris?.nama || 
            bid.interior?.nama || 
            bid.pm?.nama || 
            bid.structural?.nama || 
            bid.mep?.nama || 
            bid.bidder?.name || 
            bid.user?.name || 
            'Professional';
            
        return name;
    };

    const proName = resolveProName();
    const proInitial = proName?.charAt(0).toUpperCase() || 'P';

    const professionalUser = bid.arsitek?.user || bid.kontraktor?.user || bid.notaris?.user || bid.interior?.user || bid.pm?.user || bid.structural?.user || bid.mep?.user || bid.bidder?.user || bid.user;
    const profile = React.useMemo(() => {
        // Fallback directly to bidder object if it has filled profile fields
        const directBidder = bid.bidder;
        if (directBidder && (directBidder.deskripsi || directBidder.lokasi || directBidder.pengalaman_tahun || directBidder.spesialisasi || directBidder.specialization || directBidder.location)) {
            return {
                ...directBidder,
                rate_harga: directBidder.rate_harga ?? directBidder.rate,
                lokasi: directBidder.lokasi ?? directBidder.location,
                pengalaman_tahun: directBidder.pengalaman_tahun ?? directBidder.experience_years,
                spesialisasi: directBidder.spesialisasi ?? directBidder.specialization,
            };
        }

        // Check direct profile relations
        const directProfile = bid.pm || bid.arsitek || bid.kontraktor || bid.notaris || bid.interior || bid.structural || bid.structuralEngineer || bid.mep || bid.mepEngineer;
        if (directProfile && (directProfile.deskripsi || directProfile.alasan_hire || directProfile.pengalaman_tahun || directProfile.pengalaman)) {
            return directProfile;
        }

        if (!professionalUser) return null;
        return getProfile({
            ...professionalUser,
            role_type: professionalUser?.role_type || proType,
            arsitek: bid.arsitek || professionalUser?.arsitek || (proType === 'arsitek' ? bid.bidder : null),
            kontraktor: bid.kontraktor || professionalUser?.kontraktor || (proType === 'kontraktor' ? bid.bidder : null),
            notaris_profile: bid.notaris || professionalUser?.notaris_profile || (proType === 'notaris' ? bid.bidder : null),
            interior_profile: bid.interior || professionalUser?.interior_profile || (proType === 'interior' ? bid.bidder : null),
            project_manager: bid.pm || professionalUser?.project_manager || (proType === 'project_manager' ? bid.bidder : null),
            structural_engineer: bid.structural || bid.structuralEngineer || professionalUser?.structural_engineer || (proType === 'structural' ? bid.bidder : null),
            mep_engineer: bid.mep || bid.mepEngineer || professionalUser?.mep_engineer || (proType === 'mep' ? bid.bidder : null)
        }) || getProfile(bid) || getProfile(professionalUser || {});
    }, [professionalUser, proType, bid]);
    useEffect(() => {
        if (isExpanded && professionalUser?.id && portfolios.length === 0 && !isLoadingPortfolios) {
            setIsLoadingPortfolios(true);
            axios.get(`/portfolios?user_id=${professionalUser.id}`)
                .then(res => setPortfolios(res.data))
                .catch(() => {})
                .finally(() => setIsLoadingPortfolios(false));
        }
    }, [isExpanded, professionalUser?.id]);
    
    // Helper to calculate actual IDR value for percentage-based bids
    const getDisplayPrice = (val: number) => {
        if (bid.fee_type === 'percentage') {
            const budget = Number(activeProject?.budget) || 0;
            return (val / 100) * budget;
        }
        if (bid.fee_type === 'sqm') {
            const area = Number(activeProject?.project_dimensions?.building_area) || Number(activeProject?.project_dimensions?.land_area) || 1;
            return val * area;
        }
        return val;
    };

    const resolvedAgreedPrice = Number(bid.calculated_total) || getDisplayPrice(Number(bid.price)) || 0;

    const formattedAgreedPrice = resolvedAgreedPrice.toLocaleString('id-ID');
    const formattedNegotiatedPrice = Number(getDisplayPrice(negotiatedFee)).toLocaleString('id-ID');

    useEffect(() => {
        if (bid.status !== 'contract_pending' && isSignModalOpen) {
            setIsSignModalOpen(false);
        }
    }, [bid.status, isSignModalOpen]);

    const handleNegotiate = async (priceOverride?: number) => {
        setIsSubmitting(true);
        try {
            await axios.post(`/projects/${projectId}/bids/${bid.id}/negotiate`, {
                bid_type: proType,
                price: priceOverride || negotiatedFee
            });
            showToast('Fee terms updated!', 'success');
            onRefresh?.();
        } catch (err: any) {
            const errorMsg = err.response ? `[${err.response.status}] ${err.response.data?.message || err.response.statusText}` : err.message;
            showToast(`Failed: ${errorMsg}`, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleConfirmFee = async () => {
        setIsConfirmFeeModalOpen(true);
    };

    const executeConfirmFeeAction = async () => {
        setIsConfirmFeeModalOpen(false);
        setIsSubmitting(true);
        try {
            await axios.post(`/projects/${projectId}/bids/${bid.id}/confirm-fee`, {
                bid_type: proType
            });
            showToast('Fee agreement confirmed! Awaiting final hiring from the owner.', 'success');
            onRefresh?.();
        } catch (err: any) {
            const errorMsg = err.response ? `[${err.response.status}] ${err.response.data?.message || err.response.statusText}` : err.message;
            showToast(`Failed: ${errorMsg}`, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleInviteResponse = async (action: 'accept' | 'reject') => {
        setIsSubmitting(true);
        try {
            const bidTypeMap: any = {
                design: 'arsitek', build: 'kontraktor', legal: 'notaris', interior: 'interior',
                management: 'project_manager',
                engineering: bid.structural_id ? 'structural' : 'mep'
            };
            const endpoint = action === 'accept' ? 'accept-invite' : 'reject-invite';
            await axios.post(`/projects/${projectId}/bids/${bid.id}/${endpoint}`, {
                bid_type: bidTypeMap[phaseKey]
            });
            showToast(`Invitation ${action}ed!`, 'success');
            onRefresh?.();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to respond', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Helper to find labels
    const getMethodLabel = (id: string) => CONSTRUCTION_METHODS.find(m => m.id === id)?.label || id;
    const getPaymentLabel = (id: string) => PAYMENT_SCHEDULE_OPTIONS.find(p => p.id === id)?.label || id;

    const getProPhone = () => {
        // Collect all possible phone values from EVERY conceivable object on the bid
        // We don't care if it's isPM or not, if there's a phone, we use it.
        const possiblePhones = [
            // Direct role objects
            bid.pm?.phone_number,
            bid.pm?.no_telp,
            bid.pm?.phone,
            bid.bidder?.phone,
            bid.bidder?.phone_number,
            bid.bidder?.no_telp,
            bid.arsitek?.phone,
            bid.arsitek?.no_telp,
            bid.kontraktor?.phone,
            bid.kontraktor?.no_telp,
            bid.notaris?.phone,
            bid.notaris?.no_telp,
            bid.interior?.phone,
            bid.interior?.no_telp,
            bid.structural?.phone,
            bid.structural?.no_telp,
            bid.mep?.phone,
            bid.mep?.no_telp,
            
            // Nested user objects
            bid.pm?.user?.phone_number,
            bid.pm?.user?.phone,
            bid.pm?.user?.no_telp,
            bid.bidder?.user?.phone_number,
            bid.bidder?.user?.phone,
            bid.bidder?.user?.no_telp,
            bid.user?.phone_number,
            bid.user?.phone,
            bid.user?.no_telp,

            // Relationship collections (arrays)
            bid.pm?.user?.phoneNumber,
            bid.bidder?.user?.phoneNumber,
            bid.user?.phoneNumber,
            bid.pm?.phoneNumber,
            bid.bidder?.phoneNumber
        ];

        // Find the first truthy value that isn't just whitespace or "null" string
        let phone = possiblePhones.find(p => {
            if (!p) return false;
            if (typeof p === 'string') {
                const clean = p.trim().toLowerCase();
                return clean.length > 0 && clean !== 'null' && clean !== 'undefined' && clean !== '-';
            }
            if (typeof p === 'number') return true;
            if (Array.isArray(p)) return p.length > 0;
            return false;
        });

        if (!phone) return null;

        // Handle array of phone objects
        if (Array.isArray(phone)) {
            const first = phone[0];
            if (!first) return null;
            // Recursively check common fields in the first array element
            return first.contact || first.phone_number || first.no_telp || first.phone || 
                   (typeof first === 'string' ? first : null);
        }

        return phone;
    };

    const proPhone = getProPhone();
    
    const scopesList = React.useMemo(() => ensureArray(bid.scopes), [bid.scopes]);
    const deliverablesList = React.useMemo(() => ensureArray(bid.deliverables), [bid.deliverables]);
    const terminsList = React.useMemo(() => ensureArray(bid.proposed_termins), [bid.proposed_termins]);
    const milestonesList = React.useMemo(() => ensureArray(bid.proposed_milestones), [bid.proposed_milestones]);
    
    // Format WhatsApp Message
    const getWhatsAppMessage = (termin?: any) => {
        const myName = user?.name || 'Professional';
        const projectTitle = activeProject?.title || 'Project';
        const roleLabel = proType.charAt(0).toUpperCase() + proType.slice(1).replace('_', ' ');
        
        if (termin) {
            return `Hi, I'm ${myName} (${roleLabel}) from the 4Ceria platform regarding project "${projectTitle}". I've signed the contract and am awaiting payment for: ${termin.label} (Rp ${Number(termin.amount).toLocaleString()}). Please let me know when you've uploaded the proof. Thank you!`;
        }
        
        return `Hi, I'm ${myName} (${roleLabel}) from the 4Ceria platform regarding project "${projectTitle}". I've finalized the contract terms. Looking forward to starting our collaboration!`;
    };

    // Format PM WhatsApp message for the project Owner (Client)
    const getPMWhatsAppMessage = (termin?: any) => {
        const pmName = user?.name || 'Project Manager';
        const ownerName = activeProject?.owner?.name || 'Client';
        const projectTitle = activeProject?.title || 'Project';
        const proName = resolveProName();
        const roleLabel = proType.charAt(0).toUpperCase() + proType.slice(1).replace('_', ' ');
        const terminLabel = termin ? termin.label : 'Deposit';
        const terminAmount = termin ? Number(termin.amount).toLocaleString('id-ID') : '0';

        return `Dear ${ownerName}, I'm ${pmName}, your Project Manager for "${projectTitle}". ${proName} (${roleLabel}) has signed the contract and we are ready to proceed. Please review and fulfill the payment for: ${terminLabel} (Rp ${terminAmount}) so we can begin the work. You can upload the payment proof directly on the 4Ceria platform. Thank you!`;
    };

    const handleWhatsAppClick = (phoneNumber?: string, termin?: any) => {
        if (!phoneNumber) {
            showToast("Phone number not available", "error");
            return;
        }
        // Clean phone number (remove non-digits)
        const cleanPhone = phoneNumber.replace(/\D/g, '');
        const message = encodeURIComponent(getWhatsAppMessage(termin));
        window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
    };


    return (
        <div className="bg-white border border-gray-100 rounded-[1.5rem] p-5 hover:border-zinc-900 group transition-all shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-zinc-900 flex items-center justify-center text-sm font-black text-white shadow-xl">
                        {proInitial}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h4 className="font-black text-gray-900 text-base">{proName}</h4>
                            {isContractor && bid.construction_method && (
                                <span className="px-2 py-0.5 bg-zinc-100 text-[10px] font-black uppercase text-zinc-500 rounded-md tracking-wider">
                                    {getMethodLabel(bid.construction_method)}
                                </span>
                            )}
                            {hasHistory && (
                                <div className="flex items-center gap-1 bg-slate-900 text-white px-2 py-0.5 rounded-md shadow-sm">
                                    <Clock size={10} className="text-slate-400" />
                                    <span className="text-[8px] font-black uppercase tracking-widest">{bid.negotiation_logs.length} Rounds</span>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-3 mt-1.5">
                            <div className="flex flex-col">
                                    <div className="flex items-center gap-1.5">
                                        {showFinancials ? (
                                            <div className={`px-3 py-1 rounded-full flex items-center gap-1.5 ${bid.fee_agreed_at ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-emerald-50 text-emerald-700'}`}>
                                                <span className="text-xs font-black">
                                                    {!bid.fee_agreed_at && bid.price_max && Number(bid.price_max) > 0 ? (
                                                        `Rp ${getDisplayPrice(Number(bid.price)).toLocaleString('id-ID')} - Rp ${getDisplayPrice(Number(bid.price_max)).toLocaleString('id-ID')}`
                                                    ) : (
                                                        `Rp ${formattedAgreedPrice}`
                                                    )}
                                                </span>
                                                {bid.fee_type === 'percentage' && (
                                                    <span className="text-[8px] font-bold opacity-60">
                                                        {!bid.fee_agreed_at && bid.price_max && Number(bid.price_max) > 0 ? (
                                                            `(${Number(bid.price)}% - ${Number(bid.price_max)}%)`
                                                        ) : (
                                                            `(${Number(bid.price).toFixed(2)}%)`
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                        ) : bid.price && Number(bid.price) > 0 ? (
                                            <div className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-150 shadow-sm flex items-center gap-1.5">
                                                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-500">Est. Bid:</span>
                                                <span className="text-xs font-black">
                                                    {bid.fee_type === 'percentage' ? (
                                                        bid.price_max && Number(bid.price_max) > 0 ? (
                                                            `${Number(bid.price)}% - ${Number(bid.price_max)}%`
                                                        ) : (
                                                            `${Number(bid.price)}%`
                                                        )
                                                    ) : (
                                                        bid.price_max && Number(bid.price_max) > 0 ? (
                                                            `Rp ${getDisplayPrice(Number(bid.price)).toLocaleString('id-ID')} - Rp ${getDisplayPrice(Number(bid.price_max)).toLocaleString('id-ID')}`
                                                        ) : (
                                                            `Rp ${getDisplayPrice(Number(bid.price)).toLocaleString('id-ID')}`
                                                        )
                                                    )}
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="px-3 py-1 bg-zinc-100 text-zinc-500 rounded-full border border-zinc-200 shadow-sm">
                                                <span className="text-[10px] font-black uppercase tracking-tight">Fee to be negotiated</span>
                                            </div>
                                        )}
                                        {bid.fee_agreed_at && (
                                            <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">Finalized Fee</span>
                                        )}
                                    </div>
                                </div>
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100 shadow-sm animate-in fade-in slide-in-from-left-4 duration-700">
                                <Clock size={14} className="opacity-70" />
                                <span className="text-[11px] font-bold tracking-tight leading-none">
                                    {bid.estimated_duration} {bid.duration_unit}
                                </span>
                            </div>
                            {phaseKey === 'legal' && bid.tax_estimate && (
                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-full border border-amber-100 shadow-sm">
                                    <Info size={13} className="text-amber-500" />
                                    <span className="text-amber-900 font-black uppercase text-[9px]">Est. Tax: Rp {Number(bid.tax_estimate).toLocaleString('id-ID')}</span>
                                </div>
                            )}
                        </div>

                        {/* Simple Data Preview (Fee Structure, Schedule, Scopes) */}
                        <div className="flex flex-wrap gap-2 items-center mt-3 text-xs font-semibold text-zinc-600">
                            {/* Fee Structure Summary */}
                            <span className="px-2 py-0.5 bg-zinc-50 text-[10px] rounded-md border border-zinc-200/50 text-zinc-500 font-black uppercase tracking-wider">
                                {bid.fee_type === 'percentage' ? 'Percentage' : bid.fee_type === 'sqm' ? 'Sqm-based' : 'Fixed Fee'}
                            </span>

                            {/* Termins summary */}
                            {terminsList && terminsList.length > 0 && (
                                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50/50 text-indigo-700 rounded-lg border border-indigo-100/30 text-[10px]">
                                    <span className="text-[9px] font-black uppercase text-indigo-400">Schedule:</span>
                                    <div className="flex items-center gap-1 font-bold">
                                        {terminsList.map((t: any, idx: number) => {
                                            const name = t.name || t.label || `Termin ${idx + 1}`;
                                            const percentage = t.percentage ?? t.bobot ?? 0;
                                            return (
                                                <span key={idx} className="whitespace-nowrap">
                                                    {name} ({percentage}%)
                                                    {idx < terminsList.length - 1 && <span className="text-zinc-300 mx-1">➔</span>}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Milestones summary if no termins */}
                            {(!terminsList || terminsList.length === 0) && milestonesList && milestonesList.length > 0 && (
                                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50/50 text-indigo-750 rounded-lg border border-indigo-100/30 text-[10px]">
                                    <span className="text-[9px] font-black uppercase text-indigo-400">Milestones:</span>
                                    <div className="flex items-center gap-1 font-bold">
                                        {milestonesList.map((m: any, idx: number) => (
                                            <span key={idx} className="whitespace-nowrap">
                                                {m.title || m.label}
                                                {idx < milestonesList.length - 1 && <span className="text-zinc-300 mx-1">➔</span>}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Scopes summary */}
                            {scopesList && scopesList.length > 0 && (
                                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-50 text-zinc-600 rounded-lg border border-zinc-150 text-[10px] max-w-[280px] truncate">
                                    <span className="text-[9px] font-black uppercase text-zinc-400">Scopes:</span>
                                    <span className="truncate" title={scopesList.join(', ')}>
                                        {scopesList.length} Items ({scopesList.slice(0, 2).join(', ')}{scopesList.length > 2 && '...'})
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {!readOnly && bid.status === 'pending' && (
                    <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                            <button 
                                onClick={() => onAction(bid.id, 'decline')}
                                disabled={isActioning}
                                className="p-3 bg-gray-50 text-gray-400 rounded-xl hover:bg-red-50 hover:text-red-600 transition-all disabled:opacity-50"
                                title="Decline"
                            >
                                <X size={18} />
                            </button>
                            <button 
                                onClick={() => onAction(bid.id, 'shortlist')}
                                disabled={isActioning}
                                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center gap-2 disabled:opacity-50"
                            >
                                {isActioning ? <Loader2 size={16} className="animate-spin" /> : <ListChecks size={16} />}
                                Shortlist
                            </button>
                        </div>
                        
                        <div className="flex items-center gap-2 mt-2">
                            {proPhone && (
                                <a
                                    href={`https://wa.me/${String(proPhone).replace(/[^0-9]/g, '')}?text=Halo%20${proName},%20saya%20pemilik%20proyek%20di%204Ceria.%20Ingin%20bertanya%20mengenai%20penawaran%20Anda.`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#25D366] text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[#20bd5a] transition-all shadow-sm"
                                >
                                    <Smartphone size={12} />
                                    WhatsApp
                                </a>
                            )}
                                <button 
                                    onClick={() => onOpenChat?.(professionalUser)}
                                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-sm"
                                >
                                    <MessageCircle size={12} />
                                    Chat
                                </button>
                        </div>
                    </div>
                )}

                {!readOnly && bid.status === 'invited' && (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full border border-blue-200 shadow-sm">
                            <Clock size={13} className="animate-pulse" />
                            <span className="text-[9px] font-black uppercase tracking-[0.15em]">Invited</span>
                        </div>
                        {isThePro ? (
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => handleInviteResponse('reject')}
                                    disabled={isSubmitting}
                                    className="p-3 bg-gray-50 text-gray-400 rounded-xl hover:bg-red-50 hover:text-red-600 transition-all disabled:opacity-50"
                                >
                                    <X size={18} />
                                </button>
                                <button 
                                    onClick={() => handleInviteResponse('accept')}
                                    disabled={isSubmitting}
                                    className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                    Accept
                                </button>
                            </div>
                        ) : (
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center mt-2 italic">Waiting for professional</p>
                        )}
                    </div>
                )}

                {!readOnly && bid.status === 'negotiating' && (
                    <div className="flex flex-col gap-2 min-w-[220px]">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-full border border-amber-200 shadow-sm">
                                <Activity size={13} />
                                <span className="text-[9px] font-black uppercase tracking-[0.15em]">Negotiating</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[8px] font-black px-2 py-1 bg-gray-100 text-gray-500 rounded-md border border-gray-200 uppercase">Round {Number(bid.negotiation_count ?? 0)}/5</span>
                                {hasHistory && (
                                    <button 
                                        onClick={() => setIsExpanded(true)}
                                        className="text-[8px] font-black text-blue-600 uppercase hover:underline"
                                    >
                                        View History
                                    </button>
                                )}
                            </div>
                        </div>

                        {bid.fee_agreed_at ? (
                            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-2">
                                <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest text-center flex items-center justify-center gap-2">
                                    <CheckCircle2 size={12} className="text-emerald-500" /> Agreement Confirmed
                                </p>
                                <p className="text-[9px] text-emerald-600 font-bold text-center uppercase tracking-tight">
                                    {isThePro 
                                        ? 'Awaiting Owner confirmation to finalize hiring' 
                                        : 'Professional has accepted. You can now proceed to hire.'}
                                </p>
                                {isOwner && (
                                    <button 
                                        onClick={() => onAction?.(bid.id, 'accept')}
                                        disabled={isActioning}
                                        className="w-full mt-2 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Check size={16} /> Confirm & Hire
                                    </button>
                                )}
                            </div>
                        ) : bid.offered_by_id == user?.id ? (
                            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-2">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Awaiting response from {isThePro ? 'Owner' : proName}</p>
                                <p className="text-[8px] text-gray-300 text-center uppercase tracking-widest">The counter-party has been notified of your proposal</p>
                            </div>
                        ) : (
                            <div className="bg-red-50/50 border border-red-100 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black text-red-600 uppercase tracking-widest animate-pulse">Your Turn</span>
                                    <span className="text-xs font-black text-slate-900">Rp {resolvedAgreedPrice.toLocaleString('id-ID')}</span>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => setIsProposeFeeModalOpen(true)}
                                        className="flex-1 py-2 bg-white border border-red-200 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-50 transition-all"
                                    >
                                        Counter
                                    </button>
                                    <button 
                                        onClick={() => isThePro ? handleConfirmFee() : onAction?.(bid.id, 'accept')}
                                        className="flex-[1.5] py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 shadow-md shadow-emerald-200 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Check size={14} /> {(user?.role_type === 'project_manager' && !isThePro) ? 'Approve Fee' : 'Accept'}
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-2 mt-2">
                            <button 
                                onClick={() => onOpenChat?.(professionalUser)}
                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-sm"
                            >
                                <MessageCircle size={12} /> Chat
                            </button>
                            <a 
                                href={`https://wa.me/${String(proPhone || '').replace(/[^0-9]/g, '')}?text=Halo%20${proName},%20saya%20pemilik%20proyek%20di%204Ceria.`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#25D366] text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[#20bd5a] transition-all shadow-sm"
                            >
                                <Smartphone size={12} /> WhatsApp
                            </a>
                        </div>
                    </div>
                )}

                {!readOnly && (bid.status === 'shortlisted' || bid.status === 'recommended') && (
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-2">
                            {bid.status !== 'recommended' && !bid.is_recommended && (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-full border border-amber-200 shadow-sm animate-pulse">
                                    <Users size={13} />
                                    <span className="text-[9px] font-black uppercase tracking-[0.15em]">Interviewing</span>
                                </div>
                            )}
                            {bid.fee_agreed_at && (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 shadow-sm">
                                    <CheckCircle size={13} />
                                    <span className="text-[9px] font-black uppercase tracking-[0.15em]">Fee Agreed</span>
                                </div>
                            )}
                            {(bid.status === 'recommended' || bid.is_recommended) && (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200 shadow-sm">
                                    <Star size={13} fill="currentColor" />
                                    <span className="text-[9px] font-black uppercase tracking-[0.15em]">Recommended</span>
                                </div>
                            )}
                        </div>
                        {isThePro ? (
                            <div className="space-y-2 mt-2">
                                {(!bid.price || bid.price <= 0 || !bid.proposed_termins) ? (
                                    <button 
                                        onClick={() => setIsProposeFeeModalOpen(true)}
                                        className="w-full py-3 bg-zinc-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-2 shadow-lg"
                                    >
                                        <DollarSign size={14} /> Propose Fee & Terms
                                    </button>
                                ) : (
                                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Awaiting Hiring Decision</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2 mt-2">
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => onAction?.(bid.id, 'decline')}
                                        disabled={isActioning}
                                        className="p-3 bg-gray-50 text-gray-400 rounded-xl hover:bg-red-50 hover:text-red-600 transition-all disabled:opacity-50"
                                    >
                                        <X size={18} />
                                    </button>
                                    
                                    {bid.fee_agreed_at ? (
                                        <button 
                                            onClick={() => onAction?.(bid.id, 'accept')}
                                            disabled={isActioning}
                                            className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2"
                                        >
                                            <Check size={16} /> Confirm & Hire
                                        </button>
                                    ) : (
                                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-center">
                                        <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">
                                            Awaiting Professional's Quote
                                        </p>
                                        <p className="text-[9px] text-amber-600 font-bold mt-1 uppercase tracking-tighter opacity-80">
                                            The professional must propose fee & terms first
                                        </p>
                                    </div>
                                )}
                                </div>
                            </div>
                        )}
                        
                        <div className="flex items-center gap-2 mt-2">
                            <button 
                                onClick={() => onOpenChat?.(professionalUser)}
                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-sm"
                            >
                                <MessageCircle size={12} /> Chat
                            </button>
                            <a 
                                href={`https://wa.me/${String(proPhone || '').replace(/[^0-9]/g, '')}?text=Halo%20${proName},%20saya%20pemilik%20proyek%20di%204Ceria.`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#25D366] text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[#20bd5a] transition-all shadow-sm"
                            >
                                <Smartphone size={12} /> WhatsApp
                            </a>
                        </div>
                    </div>
                )}

                {!readOnly && bid.status === 'accepted' && (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl border border-emerald-200 shadow-sm shadow-emerald-50">
                            <CheckCircle2 size={16} strokeWidth={3} />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Hired & Active</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {proPhone && (
                                <a
                                    href={`https://wa.me/${String(proPhone).replace(/[^0-9]/g, '')}?text=Halo%20${proName},%20saya%20pemilik%20proyek%20di%204Ceria.`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#25D366] text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[#20bd5a] transition-all shadow-sm"
                                >
                                    <Smartphone size={12} />
                                    WhatsApp
                                </a>
                            )}
                                <button 
                                    onClick={() => onOpenChat?.(professionalUser)}
                                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-sm"
                                >
                                    <MessageCircle size={12} />
                                    Chat
                                </button>
                        </div>
                    </div>
                )}

                {/* Status: Contract Pending (Awaiting Professional Sign) */}
                {!readOnly && bid.status === 'contract_pending' && (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-xl border border-amber-200 shadow-sm animate-pulse">
                            <Clock size={16} />
                            <span className="text-[9px] font-black uppercase tracking-[0.2em]">Contract Pending</span>
                        </div>
                        
                        {isThePro ? (
                            <div className="space-y-2">
                                <button 
                                    onClick={() => setIsSignModalOpen(true)}
                                    className="w-full py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2 transition-all"
                                >
                                    <Shield size={14} />
                                    Sign Contract & Define Termins
                                </button>
                                </div>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-[9px] font-bold text-zinc-400 uppercase text-center py-2">Awaiting professional signature...</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Status: Awaiting Payment or In Progress (if milestones are started/paid) */}
                {!readOnly && bid.status === 'awaiting_payment' && (() => {
                    const relatedTermins = activeProject?.payment_termins?.filter((t: any) => t.role_type === proType) || [];
                    const hasPaidTermin = bid.payment_status === 'paid' || relatedTermins.some((t: any) => t.status === 'paid');
                    const hasVerifyingTermin = bid.payment_status === 'verifying' || relatedTermins.some((t: any) => t.status === 'verifying');
                    
                    return (
                        <div className="flex flex-col gap-2">
                            {hasPaidTermin ? (
                                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200 shadow-sm">
                                    <CheckCircle2 size={16} className="text-emerald-600" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">In Progress</span>
                                </div>
                            ) : hasVerifyingTermin ? (
                                <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl border border-blue-200 shadow-sm animate-pulse">
                                    <Clock size={16} />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Verifying Payment</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-xl border border-amber-200 shadow-sm animate-pulse">
                                    <Clock size={16} />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Awaiting Payment</span>
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                {proPhone && (
                                    <a
                                        href={`https://wa.me/${String(proPhone).replace(/[^0-9]/g, '')}?text=Halo%20${proName},%20saya%20pemilik%20proyek%20di%204Ceria.`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#25D366] text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[#20bd5a] transition-all shadow-sm"
                                    >
                                        <Smartphone size={12} />
                                        WhatsApp
                                    </a>
                                )}
                                <button 
                                    onClick={() => onOpenChat?.(professionalUser)}
                                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-sm"
                                >
                                    <MessageCircle size={12} />
                                    Chat
                                </button>
                            </div>
                        </div>
                    );
                })()}

                {!readOnly && bid.status === 'rejected' && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-400 rounded-xl border border-gray-200">
                        <X size={16} strokeWidth={3} />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Declined</span>
                    </div>
                )}

            </div>

            {/* Universal Card Footer containing the Details toggle */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-100">
                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">
                    Bid Proposal & Details
                </span>
                <button 
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-1.5 text-[10px] font-black text-zinc-500 hover:text-zinc-900 uppercase tracking-widest transition-all"
                >
                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {isExpanded ? 'Hide Details' : 'Details'}
                </button>
            </div>

            {/* Unified Collapsible Details Section */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden space-y-6 pt-6 border-t border-gray-100 mt-6"
                    >
                        {/* Proposal Snippet - Universally Cleaned */}
                        {bid.proposal && (phaseKey !== 'legal' || !Array.isArray(bid.selected_services) || bid.selected_services.length === 0) && (() => {
                            const hasStructuredData = scopesList.length > 0 || deliverablesList.length > 0;
                            
                            let cleanProposal = bid.proposal;
                            if (isPM) {
                                cleanProposal = stripPMAutomatedProposal(bid.proposal);
                            } else {
                                if (bid.proposal.includes('--- PROFESSIONAL MESSAGE ---')) {
                                    cleanProposal = bid.proposal.split('--- PROFESSIONAL MESSAGE ---')[1].split('---')[0].trim();
                                } else if (bid.proposal.includes('=== ARCHITECTURAL PROPOSAL SUMMARY ===') || 
                                           bid.proposal.includes('=== CONTRACTOR PROPOSAL SUMMARY ===') ||
                                           bid.proposal.includes('=== INTERIOR DESIGN PROPOSAL ===')) {
                                    cleanProposal = bid.proposal.split('---').pop()?.trim() || bid.proposal;
                                }
                                if (!cleanProposal || cleanProposal.length < 5) cleanProposal = bid.proposal;
                            }

                            if (hasStructuredData && phaseKey === 'design') {
                                let style = "Custom";
                                let revisions = "As per agreement";
                                let feeStructure = "Contractual";

                                if (bid.proposal.includes('=== ARCHITECTURAL PROPOSAL SUMMARY ===')) {
                                    const styleMatch = bid.proposal.match(/• STYLE\/THEME: (.*)/);
                                    if (styleMatch) style = styleMatch[1].trim();

                                    const revisionMatch = bid.proposal.match(/• REVISION LIMIT: (.*)/);
                                    if (revisionMatch) revisions = revisionMatch[1].trim();

                                    const feeMatch = bid.proposal.match(/• FEE STRUCTURE: (.*)/);
                                    if (feeMatch) feeStructure = feeMatch[1].trim();
                                }

                                return (
                                    <div className="px-5 py-5 bg-zinc-50 rounded-[1.5rem] border border-zinc-100 shadow-inner">
                                        <p className="text-[13px] text-zinc-800 font-medium leading-relaxed italic border-l-4 border-red-500/20 pl-4 py-1 mb-6 whitespace-pre-wrap">
                                            "{cleanProposal}"
                                        </p>

                                        {/* Deliverables Grid */}
                                        {deliverablesList.length > 0 && (
                                            <div className="pt-4 border-t border-zinc-200/40">
                                                <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                                    <CheckCircle2 size={12} className="text-emerald-500" /> Promised Deliverables
                                                </p>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {deliverablesList.map((id: string) => {
                                                        const del = ARCHITECT_DELIVERABLES.find(d => d.id === id);
                                                        const label = del ? del.label : id;
                                                        const IconMap: Record<string, any> = { Box, Layout, Zap, Grid, Eye, Sofa };
                                                        const Icon = del ? (IconMap[del.icon as string] || FileText) : FileText;

                                                        return (
                                                            <div key={id} className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-zinc-100 shadow-sm">
                                                                <div className="w-6 h-6 rounded-md bg-zinc-50 flex items-center justify-center text-zinc-400">
                                                                    <Icon size={12} />
                                                                </div>
                                                                <span className="text-[9px] font-black text-zinc-900 leading-tight">{label}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Scopes Badges */}
                                        {scopesList.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mt-4">
                                                {scopesList.map((sId: string) => {
                                                    const scope = ARCHITECT_SERVICE_SCOPES.find(s => s.id === sId);
                                                    return (
                                                        <span key={sId} className="px-2 py-1 bg-zinc-900/5 text-zinc-500 text-[8px] font-black uppercase tracking-widest rounded-md border border-zinc-950/5">
                                                            {scope?.label || sId}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Extracted Details */}
                                        {bid.proposal.includes('=== ARCHITECTURAL PROPOSAL SUMMARY ===') && (
                                            <div className="mt-5 pt-5 border-t border-zinc-200/50 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                <div>
                                                    <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mb-1">Proposed Style</p>
                                                    <p className="text-[11px] font-black text-zinc-900">{style}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mb-1">Revisions Allowed</p>
                                                    <p className="text-[11px] font-black text-zinc-900">{revisions.replace('Times', '')} Times</p>
                                                </div>
                                                {showFinancials && (
                                                    <div>
                                                        <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mb-1 text-emerald-600/60">Professional Fee Info</p>
                                                        <p className="text-[11px] font-black text-zinc-900 flex items-baseline gap-1.5">
                                                            {feeStructure} 
                                                            <span className="text-emerald-600">(@ Rp {formattedAgreedPrice})</span>
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            }

                            // Legacy or non-design rendering
                            return (
                                <div className="px-4 py-3 bg-zinc-50 rounded-xl border-l-4 border-red-500/20 italic text-[12px] text-zinc-700 leading-relaxed font-medium whitespace-pre-wrap">
                                    "{cleanProposal}"
                                </div>
                            );
                        })()}

                        {/* Legal Attachments Section - NEW */}
                        {phaseKey === 'legal' && Array.isArray(bid.attachments) && bid.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {bid.attachments.map((url: string, index: number) => (
                                    <a 
                                        key={index}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-3 py-2 bg-zinc-50 border border-zinc-100 rounded-xl hover:bg-zinc-100 hover:border-zinc-900 transition-all group/doc"
                                    >
                                        <div className="w-8 h-8 bg-zinc-900 text-white rounded-lg flex items-center justify-center shadow-lg shadow-zinc-200">
                                            <FileText size={14} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black uppercase text-zinc-900 tracking-tight">Legal Document {index + 1}</span>
                                            <span className="text-[9px] font-bold text-gray-400 flex items-center gap-1">
                                                View File <ExternalLink size={8} />
                                            </span>
                                        </div>
                                    </a>
                                ))}
                            </div>
                        )}

                        {/* Notary Selected Services & Scopes */}
                        {phaseKey === 'legal' && bid.selected_services && (
                            <div className="space-y-6">
                                {/* If using the old package structure (array of objects) */}
                                {Array.isArray(bid.selected_services) && bid.selected_services.length > 0 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {bid.selected_services.map((service: any, idx: number) => (
                                            <div key={idx} className="bg-white border-2 border-zinc-50 rounded-2xl p-4 flex flex-col gap-2 relative overflow-hidden group/item hover:border-zinc-900 transition-all shadow-sm">
                                                <div className="flex flex-wrap items-center gap-3">
                                                    {hasHistory && (
                                                        <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-900/5 border border-slate-900/10 rounded-full">
                                                            <Clock size={10} className="text-slate-600" />
                                                            <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{bid.negotiation_logs.length} Rounds</span>
                                                        </div>
                                                    )}
                                                    <div className="w-6 h-6 bg-zinc-900 text-white rounded-lg flex items-center justify-center">
                                                        <Check size={12} />
                                                    </div>
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-900 truncate flex-1">
                                                        {service.title}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] font-bold text-gray-400 line-clamp-3 leading-relaxed min-h-[3em]">
                                                    {service.description || 'No detailed description provided for this package.'}
                                                </p>
                                                <div className="mt-2 pt-3 flex items-center justify-between border-t border-zinc-100">
                                                    <span className="text-[9px] font-black text-zinc-300 uppercase tracking-tighter">Package Professional Fee</span>
                                                    <span className="text-[11px] font-black text-zinc-900">
                                                        {showFinancials ? `Rp ${Number(service.price).toLocaleString('id-ID')}` : 'TBN'}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* New Structured Scopes (JSON object with scopes/deliverables) */}
                                {typeof bid.selected_services === 'object' && !Array.isArray(bid.selected_services) && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-zinc-50 rounded-[2rem] border border-zinc-100">
                                        <div className="space-y-4">
                                            <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                                                <ListChecks size={12} className="text-zinc-400" /> Included Services
                                            </label>
                                            <div className="flex flex-wrap gap-1.5">
                                                {ensureArray(bid.selected_services?.scopes).map((sId: string) => {
                                                    const scope = NOTARY_SERVICE_SCOPES.find(s => s.id === sId);
                                                    return (
                                                        <span key={sId} className="px-3 py-1.5 bg-white border border-zinc-200 text-zinc-600 text-[9px] font-black uppercase tracking-wider rounded-lg shadow-sm">
                                                            {scope?.label || sId}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                <Shield size={12} className="text-zinc-400" /> Legal Deliverables
                                            </label>
                                            <div className="flex flex-wrap gap-1.5">
                                                {ensureArray(bid.selected_services?.deliverables).map((dId: string) => {
                                                    const delLabel = dId.replace(/_/g, ' ');
                                                    return (
                                                        <span key={dId} className="px-3 py-1.5 bg-zinc-900 text-white text-[9px] font-black uppercase tracking-wider rounded-lg shadow-lg shadow-zinc-200">
                                                            {delLabel}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {/* Always Visible PM Details */}
                        {isPM && (
                            <div className="pt-6 border-t border-gray-100 space-y-4">
                                {(scopesList.length > 0 || deliverablesList.length > 0) && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {scopesList.length > 0 && (
                                            <div className="space-y-3">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                    <Users size={12} /> Management Scope
                                                </label>
                                                <div className="space-y-2">
                                                    {scopesList.map((sId: string) => {
                                                        const scope = PM_SERVICE_SCOPES.find(x => x.id === sId);
                                                        return (
                                                            <div key={sId} className="flex items-center gap-2 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                                                                <div className="w-1.5 h-1.5 bg-zinc-900 rounded-full animate-pulse" />
                                                                <span className="text-[11px] font-bold text-gray-700">{scope?.label || sId}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {deliverablesList.length > 0 && (
                                            <div className="space-y-3">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                    <Shield size={12} /> Key Deliverables
                                                </label>
                                                <div className="flex flex-wrap gap-2">
                                                    {deliverablesList.map((dId: string) => {
                                                        const del = PM_DELIVERABLES.find(x => x.id === dId);
                                                        return (
                                                            <span key={dId} className="px-3 py-1.5 bg-zinc-900 text-white text-[9px] font-black uppercase tracking-wider rounded-lg shadow-sm">
                                                                {del?.label || dId}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {showFinancials && (
                                        <div className="bg-zinc-50 p-4 rounded-2xl border border-gray-100 flex flex-col justify-center shadow-sm">
                                            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">Fee Structure</label>
                                            <div className="flex items-center gap-2 text-zinc-950">
                                                <CreditCard size={14} className="text-zinc-500" />
                                                <span className="text-[10px] font-black uppercase tracking-tight">
                                                    {PM_FEE_TYPES.find(f => f.id === bid.fee_type)?.label || 'Professional Fee'}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* PM Value Proposition Note */}
                                    <div className="bg-[#FF2D20]/5 border border-[#FF2D20]/10 p-4 rounded-2xl md:col-span-2 flex items-center gap-4 shadow-sm">
                                        <div className="w-8 h-8 rounded-lg bg-[#FF2D20]/10 flex items-center justify-center shrink-0 text-[#FF2D20]">
                                            <Zap size={16} />
                                        </div>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                                            <div className="flex items-center gap-1.5">
                                                <CheckCircle2 size={10} className="text-[#FF2D20] shrink-0" />
                                                <span className="text-[9px] font-bold text-gray-600 uppercase tracking-tight">100% Budget Security</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <CheckCircle2 size={10} className="text-[#FF2D20] shrink-0" />
                                                <span className="text-[9px] font-bold text-gray-600 uppercase tracking-tight">Quality Inspection</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <CheckCircle2 size={10} className="text-[#FF2D20] shrink-0" />
                                                <span className="text-[9px] font-bold text-gray-600 uppercase tracking-tight">Single Point Coordination</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Engineering Specific Details */}
                        {phaseKey === 'engineering' && (
                            <div className="space-y-8 animate-in fade-in duration-500">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Technical Profile */}
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                            <Shield size={12} className="text-red-500" /> Engineering Credentials
                                        </label>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 shadow-sm">
                                                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">License (SIKA/PE)</p>
                                                <p className="text-xs font-black text-gray-900 truncate">{bid.license_number || 'N/A'}</p>
                                            </div>
                                            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 shadow-sm">
                                                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Professional Experience</p>
                                                <p className="text-xs font-black text-gray-900">{bid.experience_years ? `${bid.experience_years} Years` : 'N/A'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Technical Notes */}
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                            <FileText size={12} className="text-blue-500" /> Technical Assumptions
                                        </label>
                                        <div className="p-4 bg-slate-900 rounded-2xl text-white border border-slate-800 shadow-xl relative overflow-hidden min-h-[85px]">
                                            <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/10 rounded-full blur-xl -mr-8 -mt-8" />
                                            <p className="text-[11px] font-medium leading-relaxed text-slate-300 italic relative z-10">
                                                {bid.technical_notes ? `"${bid.technical_notes}"` : 'No specific technical notes provided.'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Scope */}
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                            <Activity size={12} className="text-emerald-500" /> Analysis Scope
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                            {scopesList.map((sId: string) => {
                                                const scope = (bid.structural_id ? STRUCTURAL_SERVICE_SCOPES : MEP_SERVICE_SCOPES).find(x => x.id === sId);
                                                return (
                                                    <span key={sId} className="px-3 py-1.5 bg-white border border-gray-100 text-gray-600 text-[9px] font-black uppercase tracking-wider rounded-lg shadow-sm">
                                                        {scope?.label || sId}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Deliverables */}
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                            <Box size={12} className="text-zinc-900" /> Deliverables
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                            {deliverablesList.map((dId: string) => {
                                                const del = (bid.structural_id ? STRUCTURAL_DELIVERABLES : MEP_DELIVERABLES).find(x => x.id === dId);
                                                return (
                                                    <span key={dId} className="px-3 py-1.5 bg-zinc-900 text-white text-[9px] font-black uppercase tracking-wider rounded-lg shadow-lg shadow-zinc-200">
                                                        {del?.label || dId}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Negotiation History Section - Universal */}
                        {bid.negotiation_logs && bid.negotiation_logs.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-zinc-100">
                                <NegotiationHistory logs={bid.negotiation_logs} />
                            </div>
                        )}

                        {/* Proposed Payment Phases & Milestones Display */}
                        {terminsList.length > 0 && (
                            <div className="mt-4 p-4 bg-gradient-to-br from-slate-50 to-zinc-50 rounded-2xl border border-slate-100 space-y-4">
                                <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Proposed Payment Phases</h5>
                                <div className="space-y-2">
                                    {terminsList.map((t: { trigger_description: string; percentage: number; milestone_index?: number }, i: number) => (
                                        <div key={i} className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-100">
                                            <div className="flex items-center gap-3">
                                                <span className="w-6 h-6 bg-slate-900 text-white rounded-lg flex items-center justify-center text-[9px] font-black">{i + 1}</span>
                                                <span className="text-xs font-bold text-slate-700">{t.trigger_description}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs font-black text-slate-900">{t.percentage}%</span>
                                                {resolvedAgreedPrice > 0 && showFinancials && (
                                                    <span className="text-[10px] font-bold text-slate-400">
                                                        Rp {((Number(resolvedAgreedPrice) * t.percentage) / 100).toLocaleString('id-ID')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {milestonesList.length > 0 && (
                                    <div className="pt-3 border-t border-slate-100">
                                        <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Proposed Milestones</h5>
                                        <div className="space-y-2">
                                            {milestonesList.map((m: { title: string; description?: string }, i: number) => (
                                                <div key={i} className="flex items-start gap-2 bg-white p-3 rounded-xl border border-slate-100">
                                                    <div className="w-2 h-2 bg-emerald-400 rounded-full mt-1.5 flex-shrink-0" />
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-700">{m.title}</p>
                                                        {m.description && <p className="text-[10px] text-slate-400 mt-0.5">{m.description}</p>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Professional Credentials Section */}
                        <div className="space-y-4 pt-4 border-t border-zinc-100 animate-in fade-in duration-500">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Shield size={14} className="text-zinc-900" /> Professional Credentials
                            </label>
                            {profile ? (
                                <div className="space-y-5">
                                    <div className="bg-white rounded-3xl border border-gray-150 p-6 shadow-sm space-y-5">
                                        {/* Profile Header (Compact) */}
                                        <div className="flex items-center gap-4">
                                            {profile.foto ? (
                                                <img 
                                                    src={`/storage/${profile.foto}`} 
                                                    alt={proName} 
                                                    className="w-12 h-12 rounded-xl object-cover border border-gray-200 shadow-sm shrink-0" 
                                                />
                                            ) : (
                                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-950 flex items-center justify-center text-white text-lg font-black shrink-0 shadow-md">
                                                    {proInitial}
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-black text-gray-900 text-sm tracking-tight truncate">{proName}</h4>
                                                    {profile.verification_status && ['verified', 'approved'].includes(profile.verification_status) && (
                                                        <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded-md text-[7px] font-black uppercase tracking-widest border border-emerald-100 shrink-0">
                                                            Verified
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5">
                                                    {ROLE_LABELS[proType as string] || proType}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Stats Grid (Compact, only show non-empty) */}
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
                                            {(profile.pengalaman_tahun || profile.pengalaman) && (
                                                <div className="bg-gray-50/50 px-3 py-2 rounded-xl border border-gray-100 flex items-center gap-2">
                                                    <Clock size={12} className="text-zinc-500 shrink-0" />
                                                    <div>
                                                        <span className="text-[8px] text-gray-400 font-bold block uppercase tracking-wider">Experience</span>
                                                        <span className="font-black text-gray-900">{profile.pengalaman_tahun || profile.pengalaman} yr{Number(profile.pengalaman_tahun || profile.pengalaman) !== 1 ? 's' : ''}</span>
                                                    </div>
                                                </div>
                                            )}
                                            {(profile.lokasi || profile.alamat) && (
                                                <div className="bg-gray-50/50 px-3 py-2 rounded-xl border border-gray-100 flex items-center gap-2">
                                                    <MapPin size={12} className="text-zinc-500 shrink-0" />
                                                    <div className="min-w-0">
                                                        <span className="text-[8px] text-gray-400 font-bold block uppercase tracking-wider">Location</span>
                                                        <span className="font-black text-gray-900 truncate block">{profile.lokasi || profile.alamat}</span>
                                                    </div>
                                                </div>
                                            )}
                                            {(profile.nomor_sk || profile.no_kta || profile.nisp || profile.sk_nomor) && (
                                                <div className="bg-gray-50/50 px-3 py-2 rounded-xl border border-gray-100 flex items-center gap-2 min-w-0">
                                                    <ShieldCheck size={12} className="text-zinc-500 shrink-0" />
                                                    <div className="min-w-0">
                                                        <span className="text-[8px] text-gray-400 font-bold block uppercase tracking-wider">License / SK</span>
                                                        <span className="font-black text-gray-900 truncate block">{profile.nomor_sk || profile.no_kta || profile.nisp || profile.sk_nomor}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Bio / Description */}
                                        {(profile.deskripsi || profile.alasan_hire) && (
                                            <div className="space-y-1.5">
                                                <span className="text-[8px] text-gray-400 font-black uppercase tracking-wider block">About Professional</span>
                                                <p className="text-xs text-gray-600 leading-relaxed italic bg-gray-50/30 p-3.5 rounded-xl border border-gray-100/60 whitespace-pre-wrap">
                                                    "{profile.deskripsi || profile.alasan_hire}"
                                                </p>
                                            </div>
                                        )}

                                        {/* Education Block */}
                                        {profile.pendidikan && (
                                            <div className="space-y-1.5 pt-3 border-t border-gray-100">
                                                <span className="text-[8px] text-gray-400 font-black uppercase tracking-wider block">Education & Credentials</span>
                                                {(() => {
                                                    let parsed: any = null;
                                                    if (typeof profile.pendidikan === 'object' && profile.pendidikan !== null) {
                                                        parsed = profile.pendidikan;
                                                    } else if (typeof profile.pendidikan === 'string') {
                                                        try {
                                                            parsed = JSON.parse(profile.pendidikan);
                                                        } catch (e) {
                                                            // fallback to plain string
                                                        }
                                                    }

                                                    if (Array.isArray(parsed) && parsed.length > 0) {
                                                        return (
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                                {parsed.map((edu: any, i: number) => (
                                                                    <div key={i} className="flex flex-col bg-gray-50/50 p-3 rounded-xl border border-gray-100/60">
                                                                        <span className="text-[10px] font-black text-gray-800 uppercase tracking-tight">{edu.school || edu.institution || 'Institution'}</span>
                                                                        <span className="text-[9px] text-gray-500 font-bold mt-0.5">{edu.degree || 'Degree'}{edu.year ? ` • ${edu.year}` : ''}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        );
                                                    }

                                                    const textValue = typeof profile.pendidikan === 'object' ? JSON.stringify(profile.pendidikan) : String(profile.pendidikan);
                                                    return (
                                                        <p className="text-xs text-gray-600 leading-relaxed font-bold bg-gray-50/30 p-3 rounded-xl border border-gray-100/60">
                                                            {textValue}
                                                        </p>
                                                    );
                                                })()}
                                            </div>
                                        )}

                                        {/* Specializations / Skills */}
                                        {profile.spesialisasi && profile.spesialisasi.split(',').map(s => s.trim()).filter(Boolean).length > 0 && (
                                            <div className="space-y-1.5">
                                                <span className="text-[8px] text-gray-400 font-black uppercase tracking-wider block">Specializations</span>
                                                <div className="flex flex-wrap gap-1">
                                                    {profile.spesialisasi.split(',').map(s => s.trim()).filter(Boolean).map((skill, idx) => (
                                                        <span key={idx} className="px-2.5 py-1 bg-zinc-900/5 text-zinc-600 text-[8px] font-black uppercase tracking-widest rounded-md border border-zinc-950/5">
                                                            {skill}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Portfolio Highlights */}
                                        {portfolios.length > 0 && (
                                            <div className="space-y-2 pt-3 border-t border-gray-100">
                                                <span className="text-[8px] text-gray-400 font-black uppercase tracking-wider block">Portfolio Highlights</span>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                    {portfolios.slice(0, 4).map(p => (
                                                        <div key={p.id} className="rounded-xl overflow-hidden border border-gray-100 bg-white group shadow-sm hover:border-zinc-300 transition-all">
                                                            {p.image_path ? (
                                                                <img src={`/storage/${p.image_path}`} alt={p.title} className="w-full h-16 object-cover" />
                                                            ) : (
                                                                <div className="w-full h-16 bg-gray-50 flex items-center justify-center text-gray-300 text-[8px] font-bold">No Image</div>
                                                            )}
                                                            <div className="p-2 min-w-0">
                                                                <h6 className="text-[9px] font-black text-gray-900 truncate">{p.title}</h6>
                                                                {p.duration && <p className="text-[8px] text-gray-400 mt-0.5 truncate">{p.duration}</p>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Legal/Professional Attachments */}
                                    {(bid.attachment_1 || bid.attachment_2 || bid.attachment_3 || (bid.attachments && bid.attachments.length > 0)) && (
                                        <div className="space-y-2 pt-2">
                                            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                <FileText size={14} className="text-zinc-900" /> Supporting Documents
                                            </label>
                                            <div className="flex flex-wrap gap-2">
                                                {[bid.attachment_1, bid.attachment_2, bid.attachment_3].filter(Boolean).map((url, i) => (
                                                    <a key={i} href={`/storage/${url}`} target="_blank" rel="noopener noreferrer" 
                                                        className="flex items-center gap-2 px-3.5 py-2 bg-zinc-50 border border-zinc-100 rounded-xl hover:bg-zinc-900 hover:text-white transition-all group">
                                                        <FileText size={12} className="text-zinc-400 group-hover:text-white" />
                                                        <span className="text-[9px] font-black uppercase">Document {i + 1}</span>
                                                    </a>
                                                ))}
                                                {Array.isArray(bid.attachments) && bid.attachments.map((url, i) => (
                                                    <a key={`extra-${i}`} href={url} target="_blank" rel="noopener noreferrer" 
                                                        className="flex items-center gap-2 px-3.5 py-2 bg-zinc-50 border border-zinc-100 rounded-xl hover:bg-zinc-900 hover:text-white transition-all group">
                                                        <FileText size={12} className="text-zinc-400 group-hover:text-white" />
                                                        <span className="text-[9px] font-black uppercase">Extra Doc {i + 1}</span>
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="p-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-center">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Full profile data unavailable</p>
                                </div>
                            )}
                        </div>

                        {isContractor && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-gray-100">
                                {/* Cost Breakdown */}
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                        <Construction size={12} /> Cost Allocation (RAB)
                                    </label>
                                    <div className="space-y-2 bg-gray-50 p-4 rounded-2xl">
                                        {bid.cost_breakdown && Object.entries(bid.cost_breakdown).map(([key, val]: [string, any]) => (
                                            <div key={key} className="space-y-1">
                                                <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight">
                                                    <span className="text-gray-500">{key.replace('_', ' ')}</span>
                                                    <span className="text-zinc-900">{val}%</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                                                    <div className="h-full bg-zinc-900 rounded-full" style={{ width: `${val}%` }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Logistics & Capacity */}
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-gray-50 p-4 rounded-2xl border border-transparent hover:border-zinc-200 transition-all">
                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-2">Workforce</label>
                                            <div className="flex items-center gap-2">
                                                <Users size={16} className="text-zinc-900" />
                                                <span className="text-sm font-black text-zinc-900">{bid.workforce_count || 0} People</span>
                                            </div>
                                        </div>
                                        <div className="bg-gray-50 p-4 rounded-2xl border border-transparent hover:border-zinc-200 transition-all">
                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-2">Equipment</label>
                                            <div className="flex items-center gap-2">
                                                <Hammer size={16} className="text-zinc-900" />
                                                <span className="text-[10px] font-bold text-gray-500 truncate" title={bid.equipment_owned}>
                                                    {bid.equipment_owned || 'N/A'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="bg-zinc-900 p-4 rounded-2xl shadow-xl shadow-zinc-100">
                                        <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Payment Terms</label>
                                        <div className="flex items-center gap-2">
                                            <CreditCard size={16} className="text-emerald-400" />
                                            <span className="text-xs font-bold text-white uppercase tracking-tight">
                                                {getPaymentLabel(bid.payment_preference)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Modals - Outside of AnimatePresence & isExpanded to ensure they always render when triggered */}
            {isSignModalOpen && (
                <ContractSignModal 
                    isOpen={isSignModalOpen}
                    onClose={() => setIsSignModalOpen(false)}
                    project={activeProject || { id: projectId, title: 'Project' }}
                    bid={bid}
                    bidType={proType}
                    onSuccess={() => onRefresh?.()}
                />
            )}

            {isProofModalOpen && selectedTermin && (
                <PaymentProofModal 
                    key={`${selectedTermin.type}-${selectedTermin.id}`}
                    isOpen={isProofModalOpen}
                    onClose={() => setIsProofModalOpen(false)}
                    project={activeProject || { id: projectId, title: 'Project' }}
                    termin={selectedTermin}
                    isProfessional={isVerifyingProof}
                    onSuccess={() => onRefresh?.()}
                />
            )}

            {isProposeFeeModalOpen && (
                <ProposeFeeModal
                    bid={bid}
                    project={activeProject}
                    projectId={projectId || activeProject?.id}
                    proType={proType}
                    onClose={() => setIsProposeFeeModalOpen(false)}
                    onSuccess={() => {
                        setIsProposeFeeModalOpen(false);
                        onRefresh?.();
                    }}
                />
            )}

            <ConfirmModal
                isOpen={isConfirmFeeModalOpen}
                title="Confirm Fee Agreement"
                description="Are you sure you want to confirm this fee? This will finalize the agreed price."
                confirmText="Confirm Fee"
                variant="success"
                onConfirm={executeConfirmFeeAction}
                onCancel={() => setIsConfirmFeeModalOpen(false)}
                isLoading={isSubmitting}
            />
        </div>
    );
};
