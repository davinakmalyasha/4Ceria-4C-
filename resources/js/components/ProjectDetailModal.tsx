import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { Info, CheckSquare, MessageCircle, FileText, History, ShieldCheck, ArrowRight } from 'lucide-react';
import ProjectMilestones from './Projects/ProjectMilestones';
import ProjectComments from './Projects/ProjectComments';
import ProjectVault from './Projects/ProjectVault';
import ProjectActivity from './Projects/ProjectActivity';
import ContractReviewModal from './Projects/ContractReviewModal';
import { Project } from '../types/project.types';

interface Bidder {
    id: number;
    name: string;
    phone?: string;
    specialization?: string;
    experience_years?: number;
    rate?: number;
    location?: string;
    user?: { name: string; email: string } | null;
    average_rating?: number;
    review_count?: number;
}

interface Bid {
    id: number;
    price: number;
    proposal: string;
    status: string;
    estimated_duration?: number;
    duration_unit?: string;
    attachments?: string[];
    created_at: string;
    bidder: Bidder | null;
    type: 'arsitek' | 'kontraktor';
}

interface ProjectDetail {
    id: number;
    title: string;
    description: string;
    budget: number;
    location?: string;
    type?: string;
    status: string;
    deadline?: string;
    attachment?: string;
    owner_id?: number;
    selected_architect_id?: number | null;
    selected_contractor_id?: number | null;
    bids_arsitek?: Bid[];
    bids_kontraktor?: Bid[];
    images?: { id: number; url: string; sort_order: number }[];
    review_arsitek?: { rating: number; comment: string; created_at: string } | null;
    review_kontraktor?: { rating: number; comment: string; created_at: string } | null;
}

interface ProjectDetailModalProps {
    project: { id: number; title: string; description: string; budget: number; status: string };
    onClose: () => void;
    formatCurrency: (amount: number) => string;
    onViewProfile: (type: 'architect' | 'constructor', bidderId: number) => void;
    onProjectUpdated?: (updated: Project) => void;
    isManagementView?: boolean;
    onNavigate?: (tab: string) => void;
}

export default function ProjectDetailModal({ project, onClose, formatCurrency, onViewProfile, onProjectUpdated, isManagementView, onNavigate }: ProjectDetailModalProps) {
    const { user } = useAuth();
    const [detail, setDetail] = useState<ProjectDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [lightboxImg, setLightboxImg] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'details' | 'milestones' | 'qa' | 'vault' | 'activity'>('details');

    const [bidDuration, setBidDuration] = useState('');
    const [bidDurationUnit, setBidDurationUnit] = useState('weeks');
    const [bidFiles, setBidFiles] = useState<File[]>([]);
    const [bidSubmitting, setBidSubmitting] = useState(false);
    const [bidMessage, setBidMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [pendingContract, setPendingContract] = useState<{ bidId: number; bidType: 'arsitek' | 'kontraktor'; bidderName: string; bidPrice: number } | null>(null);
    
    // Review state
    const [reviewRating, setReviewRating] = useState(0);
    const [reviewComment, setReviewComment] = useState('');
    const [reviewSubmitting, setReviewSubmitting] = useState(false);
    const [reviewMessage, setReviewMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const isProfessional = user?.role_type === 'arsitek' || user?.role_type === 'kontraktor';

    const fetchDetail = () => {
        setIsLoading(true);
        axios.get(`/projects/${project.id}`)
            .then(res => setDetail(res.data.data))
            .catch(() => setDetail(null))
            .finally(() => setIsLoading(false));
    };

    useEffect(() => {
        fetchDetail();
    }, [project.id]);

    const handleBidAction = async (bidId: number, bidType: 'arsitek' | 'kontraktor', action: 'accept' | 'decline') => {
        if (action === 'accept') {
            const bid = allBids.find(b => b.id === bidId && b.type === bidType);
            setPendingContract({ bidId, bidType, bidderName: bid?.bidder?.name || 'Unknown', bidPrice: bid?.price || 0 });
            return;
        }
        await executeBidAction(bidId, bidType, action);
    };

    const [isSuccess, setIsSuccess] = useState(false);
    const [hiredName, setHiredName] = useState('');

    const executeBidAction = async (bidId: number, bidType: 'arsitek' | 'kontraktor', action: 'accept' | 'decline') => {
        setActionLoading(bidId);
        try {
            const endpoint = action === 'accept' ? 'accept-bid' : 'decline-bid';
            const res = await axios.post(`/projects/${project.id}/${endpoint}`, {
                bid_id: bidId,
                bid_type: bidType,
            });
            const updatedProject = res.data.data;
            setDetail(updatedProject);
            
            if (action === 'accept') {
                const bid = allBids.find(b => b.id === bidId && b.type === bidType);
                setHiredName(bid?.bidder?.name || 'Professional');
                setIsSuccess(true);
            }

            if (onProjectUpdated) {
                onProjectUpdated(updatedProject);
            }
        } catch (err) {
            console.error('Bid action failed:', err);
        } finally {
            setActionLoading(null);
        }
    };

    const allBids: Bid[] = [
        ...(detail?.bids_arsitek?.map(b => ({ ...b, type: 'arsitek' as const })) || []),
        ...(detail?.bids_kontraktor?.map(b => ({ ...b, type: 'kontraktor' as const })) || [])
    ];

    // --- Smart Badges Logic ---
    const lowestPrice = allBids.length > 0 ? Math.min(...allBids.map(b => b.price)) : 0;
    const maxExperience = allBids.length > 0 ? Math.max(...allBids.map(b => b.bidder?.experience_years || 0)) : 0;

    const hasAlreadyBid = allBids.some(bid => 
        (user?.role_type === 'arsitek' && bid.type === 'arsitek' && bid.bidder?.id === user?.arsitek?.id) ||
        (user?.role_type === 'kontraktor' && bid.type === 'kontraktor' && bid.bidder?.id === user?.kontraktor?.id)
    );

    const handleSubmitBid = async (e: React.FormEvent) => {
        e.preventDefault();
        setBidSubmitting(true);
        setBidMessage(null);

        const formData = new FormData();
        formData.append('price', bidPrice);
        formData.append('proposal', bidProposal);
        if (bidDuration) {
            formData.append('estimated_duration', bidDuration);
            formData.append('duration_unit', bidDurationUnit);
        }
        bidFiles.forEach((file, index) => {
            formData.append(`attachment_${index + 1}`, file);
        });

        try {
            await axios.post(`/projects/${project.id}/bid`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setBidMessage({ type: 'success', text: 'Bid submitted successfully!' });
            setBidPrice('');
            setBidProposal('');
            setBidDuration('');
            setBidFiles([]);
            fetchDetail(); // Refresh to show the new bid
        } catch (err: any) {
            setBidMessage({ 
                type: 'error', 
                text: err.response?.data?.message || 'Failed to submit bid. Please check your data.' 
            });
        } finally {
            setBidSubmitting(false);
        }
    };

    const handleSubmitReview = async (e: React.FormEvent) => {
        e.preventDefault();
        if (reviewRating === 0) {
            setReviewMessage({ type: 'error', text: 'Please select a star rating.' });
            return;
        }
        setReviewSubmitting(true);
        setReviewMessage(null);

        try {
            await axios.post(`/projects/${project.id}/review`, {
                rating: reviewRating,
                comment: reviewComment
            });
            setReviewMessage({ type: 'success', text: 'Thank you for your feedback!' });
            fetchDetail();
        } catch (err: any) {
            setReviewMessage({ 
                type: 'error', 
                text: err.response?.data?.message || 'Failed to submit review.' 
            });
        } finally {
            setReviewSubmitting(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'open': return 'bg-gray-900 text-white border-transparent';
            case 'in_progress': return 'bg-gray-100 text-gray-900 border-gray-200';
            case 'completed': return 'bg-gray-100 text-gray-900 border-gray-200';
            case 'accepted': return 'bg-gray-900 text-white border-transparent';
            case 'rejected': return 'bg-red-50 text-[#FF2D20] border-red-100';
            default: return 'bg-gray-50 text-gray-600 border-gray-200';
        }
    };



    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ y: 50, opacity: 0, scale: 0.95 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 20, opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', duration: 0.4 }}
                className="bg-white rounded-3xl overflow-hidden shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col relative"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-extrabold text-gray-900">Project Details</h2>
                        <span className={`text-xs px-3 py-1 rounded-full uppercase tracking-wider font-bold shadow-sm border ${getStatusColor(detail?.status || project.status)}`}>
                            {detail?.status || project.status}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="bg-white text-gray-500 px-4 py-2 rounded-full hover:bg-red-50 hover:text-[#FF2D20] transition-colors shadow-sm border border-gray-200 font-bold text-xs uppercase"
                    >
                        Close
                    </button>
                </div>

                {/* Scrollable Body */}
                <div className="p-6 sm:p-8 overflow-y-auto flex-1">
                    {isSuccess ? (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center justify-center py-12 px-6 text-center h-full"
                        >
                            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 shadow-sm border border-green-200">
                                <ShieldCheck size={40} strokeWidth={2.5} />
                            </div>
                            <h3 className="text-3xl font-black text-gray-900 mb-3 tracking-tight">Hired Successfully!</h3>
                            <p className="text-gray-600 mb-8 max-w-sm text-lg leading-relaxed">
                                You have officially hired <span className="font-bold text-gray-900">{hiredName}</span> for <span className="font-bold text-gray-900">{detail?.title || project.title}</span>.
                            </p>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-md">
                                <button 
                                    onClick={() => {
                                        onClose();
                                        if (onNavigate) onNavigate('projects');
                                    }}
                                    className="flex items-center justify-center gap-2 bg-[#FF2D20] hover:bg-red-700 text-white py-4 px-6 rounded-2xl font-bold transition-all shadow-lg shadow-red-200 active:scale-95 group"
                                >
                                    <FileText size={18} /> Manage Project <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                                </button>
                                <button 
                                    onClick={onClose}
                                    className="flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-700 py-4 px-6 rounded-2xl font-bold transition-all border border-gray-200 active:scale-95"
                                >
                                    Return to Board
                                </button>
                            </div>
                            
                            <p className="mt-8 text-sm text-gray-400">
                                You can now track milestones, communicate with the team, and manage documents from the management board.
                            </p>
                        </motion.div>
                    ) : isLoading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FF2D20]"></div>
                        </div>
                    ) : (
                        <>
                            {/* Tabs Navigation */}
                            <div className="flex border-b border-gray-200 mb-6 overflow-x-auto scrollbar-none">
                                <button onClick={() => setActiveTab('details')} className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'details' ? 'border-[#FF2D20] text-[#FF2D20]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                                    Details & Bids
                                </button>
                                
                                {isManagementView && (
                                    <button onClick={() => setActiveTab('milestones')} className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'milestones' ? 'border-[#FF2D20] text-[#FF2D20]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                                        Milestones
                                    </button>
                                )}

                                <button onClick={() => setActiveTab('qa')} className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'qa' ? 'border-[#FF2D20] text-[#FF2D20]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                                    Q&A Chat
                                </button>

                                {isManagementView && (
                                    <>
                                        <button onClick={() => setActiveTab('vault')} className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'vault' ? 'border-[#FF2D20] text-[#FF2D20]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                                            Vault
                                        </button>
                                        <button onClick={() => setActiveTab('activity')} className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'activity' ? 'border-[#FF2D20] text-[#FF2D20]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                                            Activity
                                        </button>
                                    </>
                                )}
                            </div>

                            <AnimatePresence mode="wait">
                                {activeTab === 'details' && (
                                    <motion.div key="details" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                                        <h3 className="text-2xl font-extrabold text-gray-900 leading-tight mb-2">{detail?.title || project.title}</h3>

                                        <div className="flex flex-wrap gap-3 mb-6">
                                        {detail?.location && (
                                            <span className="text-xs bg-gray-50 text-gray-600 px-3 py-1.5 rounded-full font-bold border border-gray-100">{detail.location}</span>
                                        )}
                                        {detail?.type && (
                                            <span className="text-xs bg-gray-50 text-gray-600 px-3 py-1.5 rounded-full font-bold border border-gray-100 capitalize">{detail.type}</span>
                                        )}
                                        {detail?.deadline && (
                                            <span className="text-xs bg-gray-50 text-gray-600 px-3 py-1.5 rounded-full font-bold border border-gray-100">{new Date(detail.deadline).toLocaleDateString('id-ID')}</span>
                                        )}
                            </div>

                            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 mb-6">
                                <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#FF2D20]"></span> Description
                                </h4>
                                <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">{detail?.description || project.description}</p>
                            </div>

                            {/* Project Images Gallery */}
                            {detail?.images && detail.images.length > 0 && (
                                <div className="mb-6">
                                    <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#FF2D20]"></span> Project Photos
                                        <span className="text-gray-400 font-normal">({detail.images.length})</span>
                                    </h4>
                                    <div className="grid grid-cols-3 gap-3">
                                        {detail.images.map(img => (
                                            <div 
                                                key={img.id} 
                                                className="aspect-square rounded-xl overflow-hidden border border-gray-200 cursor-pointer hover:border-[#FF2D20] hover:shadow-md transition-all group"
                                                onClick={() => setLightboxImg(img.url)}
                                            >
                                                <img src={img.url} alt="Project" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="bg-red-50 px-5 py-4 rounded-2xl border border-red-100 mb-8 inline-block">
                                <p className="text-xs text-red-600 font-bold uppercase tracking-wider mb-1">Budget</p>
                                <p className="text-2xl font-extrabold text-[#FF2D20]">{formatCurrency(detail?.budget || project.budget)}</p>
                            </div>

                            {/* Bidding Progress */}
                            <div className="border-t border-gray-100 pt-6">
                                <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                    Bidding Progress
                                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">
                                        {allBids.length} bid{allBids.length !== 1 ? 's' : ''}
                                    </span>
                                </h4>

                                {allBids.length === 0 ? (
                                    <div className="text-center py-10 bg-gray-50 rounded-2xl border border-gray-200 border-dashed">
                                        <p className="text-gray-400 font-medium text-sm">No bids received yet.</p>
                                    <p className="text-gray-400 text-xs mt-1">Professionals will submit proposals here.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {allBids.map(bid => (
                                            <div key={`${bid.type}-${bid.id}`} className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-gray-300 transition-colors shadow-sm">
                                                {/* Bidder Header */}
                                                <div className="flex items-start justify-between gap-4 mb-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF2D20] to-red-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                                                            {bid.bidder?.name?.charAt(0)?.toUpperCase() || '?'}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className="font-bold text-gray-900">{bid.bidder?.name || 'Unknown'}</p>
                                                                {bid.bidder?.average_rating !== undefined && (
                                                                    <div className="flex items-center gap-1 bg-red-50 px-2 py-0.5 rounded-lg border border-red-100">
                                                                        <span className="text-[#FF2D20] text-xs text-center">★</span>
                                                                        <span className="text-[11px] font-bold text-[#FF2D20]">{bid.bidder.average_rating}</span>
                                                                        <span className="text-[10px] text-red-600/70 font-medium">({bid.bidder.review_count})</span>
                                                                    </div>
                                                                )}
                                                                {/* Smart Badges */}
                                                                {bid.price === lowestPrice && allBids.length > 1 && (
                                                                    <span className="bg-red-50 text-[#FF2D20] text-[10px] px-2 py-0.5 rounded-full font-bold border border-red-100">LOWEST BID</span>
                                                                )}
                                                                {bid.bidder?.experience_years === maxExperience && maxExperience > 0 && allBids.length > 1 && (
                                                                    <span className="bg-gray-900 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">MOST EXPERIENCED</span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="text-xs text-gray-500 capitalize">{bid.type === 'arsitek' ? 'Architect' : 'Contractor'}</span>
                                                                {bid.bidder?.location && <span className="text-xs text-gray-400">• {bid.bidder.location}</span>}
                                                                {bid.bidder?.experience_years && <span className="text-xs text-gray-400">• {bid.bidder.experience_years}yr exp</span>}
                                                                {bid.estimated_duration && (
                                                                    <span className="text-xs text-[#FF2D20] font-bold">• {bid.estimated_duration} {bid.duration_unit}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-2">
                                                        {onViewProfile && bid.bidder && bid.bidder.id && (
                                                            <button 
                                                                onClick={() => onViewProfile(
                                                                    bid.type === 'arsitek' ? 'architect' : 'constructor', 
                                                                    bid.bidder!.id
                                                                )}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-900 rounded-xl font-bold text-[11px] uppercase tracking-wider hover:bg-gray-200 transition-all border border-gray-200 shadow-sm group"
                                                            >
                                                                <span>View Profile</span>
                                                            </button>
                                                        )}
                                                        <span className={`text-xs px-3 py-1 rounded-full uppercase tracking-wider font-bold border shrink-0 ${getStatusColor(bid.status)}`}>
                                                            {bid.status}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Bidder Details */}
                                                <div className="flex flex-wrap gap-2 mb-3 text-xs">
                                                    {bid.bidder?.user?.email && (
                                                        <span className="bg-gray-50 text-gray-600 px-2 py-1 rounded-lg border border-gray-100">{bid.bidder.user.email}</span>
                                                    )}
                                                    {bid.bidder?.phone && (
                                                        <span className="bg-gray-50 text-gray-600 px-2 py-1 rounded-lg border border-gray-100">{bid.bidder.phone}</span>
                                                    )}
                                                    {bid.bidder?.specialization && (
                                                        <span className="bg-gray-50 text-gray-600 px-2 py-1 rounded-lg border border-gray-100">{bid.bidder.specialization}</span>
                                                    )}
                                                </div>

                                                {/* Proposal */}
                                                <div className="bg-gray-50 rounded-xl p-3 mb-4 border border-gray-100">
                                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Proposal</p>
                                                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{bid.proposal}</p>
                                                    
                                                    {bid.attachments && bid.attachments.length > 0 && (
                                                        <div className="mt-3 flex flex-wrap gap-2 pt-3 border-t border-gray-200">
                                                            {bid.attachments.map((url, i) => (
                                                                <a 
                                                                    key={i}
                                                                    href={url} 
                                                                    target="_blank" 
                                                                    rel="noopener noreferrer"
                                                                    className="flex items-center gap-1.5 px-2 py-1 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-500 hover:text-[#FF2D20] hover:border-red-200 transition-all shadow-xs"
                                                                >
                                                                    <FileText size={12} /> Ref {i + 1}
                                                                </a>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Price + Actions */}
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-xs text-gray-500 font-medium">Bid Amount</p>
                                                        <p className="text-xl font-extrabold text-gray-900">{formatCurrency(bid.price)}</p>
                                                    </div>

                                                    {bid.status === 'pending' && detail?.owner_id === user?.id && (
                                                        <div className="flex gap-2">
                                                            <button
                                                                disabled={actionLoading === bid.id}
                                                                onClick={() => handleBidAction(bid.id, bid.type, 'accept')}
                                                                className="bg-gray-900 hover:bg-black text-white px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50 shadow-sm"
                                                            >
                                                                {actionLoading === bid.id ? '...' : 'Accept'}
                                                            </button>
                                                            <button
                                                                disabled={actionLoading === bid.id}
                                                                onClick={() => handleBidAction(bid.id, bid.type, 'decline')}
                                                                className="bg-white hover:bg-red-50 text-[#FF2D20] px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider border border-red-100 transition-colors disabled:opacity-50"
                                                            >
                                                                {actionLoading === bid.id ? '...' : 'Decline'}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Reviews & Ratings Section */}
                            {(detail?.selected_architect_id || detail?.selected_contractor_id) && (
                                <div className="border-t border-gray-100 pt-6 mb-8">
                                    <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                        Professional Review
                                    </h4>

                                    {/* Existing Review Display */}
                                    {(detail.review_arsitek || detail.review_kontraktor) ? (
                                        <div className="bg-red-50 border border-red-100 rounded-2xl p-5 shadow-sm">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="flex text-[#FF2D20]">
                                                    {[...Array(5)].map((_, i) => (
                                                        <span key={i} className="text-lg">
                                                            {i < (detail.review_arsitek?.rating || detail.review_kontraktor?.rating || 0) ? '★' : '☆'}
                                                        </span>
                                                    ))}
                                                </div>
                                                <span className="text-xs text-[#FF2D20] font-bold bg-white px-2 py-0.5 rounded-full border border-red-100">
                                                    {detail.review_arsitek?.rating || detail.review_kontraktor?.rating}/5
                                                </span>
                                            </div>
                                            <p className="text-gray-700 text-sm italic font-medium leading-relaxed">
                                                "{detail.review_arsitek?.comment || detail.review_kontraktor?.comment || 'No comment provided.'}"
                                            </p>
                                            <p className="text-[10px] text-red-600/80 mt-2 font-medium">
                                                Reviewed on {new Date(detail.review_arsitek?.created_at || detail.review_kontraktor?.created_at || '').toLocaleDateString()}
                                            </p>
                                        </div>
                                    ) : (
                                        /* Review Submission Form (Only for Owner) */
                                        detail.owner_id === user?.id && (
                                            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
                                                <h5 className="font-bold text-gray-900 mb-2">Rate your experience</h5>
                                                <p className="text-xs text-gray-500 mb-4">How was the professional's performance and communication?</p>
                                                
                                                {reviewMessage && (
                                                    <div className={`mb-4 p-3 rounded-xl text-sm font-medium border ${
                                                        reviewMessage.type === 'success' 
                                                            ? 'bg-green-50 text-green-800 border-green-200' 
                                                            : 'bg-red-50 text-red-800 border-red-200'
                                                    }`}>
                                                        {reviewMessage.text}
                                                    </div>
                                                )}

                                                <form onSubmit={handleSubmitReview} className="space-y-4">
                                                    <div className="flex gap-2">
                                                        {[1, 2, 3, 4, 5].map((star) => (
                                                            <button
                                                                key={star}
                                                                type="button"
                                                                onClick={() => setReviewRating(star)}
                                                                className={`text-3xl transition-all ${
                                                                    star <= reviewRating ? 'text-[#FF2D20] scale-110' : 'text-gray-300 hover:text-red-200'
                                                                }`}
                                                            >
                                                                ★
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <textarea
                                                        value={reviewComment}
                                                        onChange={e => setReviewComment(e.target.value)}
                                                        placeholder="Write a brief feedback about their work quality, punctuality, etc..."
                                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#FF2D20] focus:ring-2 focus:ring-red-100 outline-none text-sm transition-all resize-none bg-white"
                                                        rows={3}
                                                    />
                                                    <button
                                                        type="submit"
                                                        disabled={reviewSubmitting}
                                                        className="w-full bg-[#FF2D20] hover:bg-red-700 text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50 shadow-md shadow-red-100 active:scale-[0.98]"
                                                    >
                                                        {reviewSubmitting ? 'Posting Review...' : 'Post Review'}
                                                    </button>
                                                </form>
                                            </div>
                                        )
                                    )}
                                </div>
                            )}

                            {/* Bid Submission Form for Professionals */}
                            {isProfessional && detail?.status === 'open' && (
                                <div className="border-t border-gray-100 pt-6">
                                    {hasAlreadyBid ? (
                                        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-6 text-center">
                                            <h4 className="text-lg font-bold text-gray-900 mb-1">Bid Already Submitted</h4>
                                            <p className="text-gray-500 text-sm font-medium">You have already submitted a proposal for this project. Please wait for the client to review it.</p>
                                        </div>
                                    ) : (
                                        <>
                                            <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                                Submit Your Bid
                                            </h4>

                                            {bidMessage && (
                                                <div className={`mb-4 p-3 rounded-xl text-sm font-medium border ${
                                                    bidMessage.type === 'success' 
                                                        ? 'bg-green-50 text-green-800 border-green-200' 
                                                        : 'bg-red-50 text-red-800 border-red-200'
                                                }`}>
                                                    {bidMessage.text}
                                                </div>
                                            )}

                                            <form onSubmit={handleSubmitBid} className="space-y-4">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-sm font-semibold text-gray-700 mb-1">Your Price (IDR)</label>
                                                        <input
                                                            type="number"
                                                            value={bidPrice}
                                                            onChange={e => setBidPrice(e.target.value)}
                                                            required
                                                            min="0"
                                                            placeholder="e.g. 50000000"
                                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#FF2D20] focus:ring-2 focus:ring-red-100 outline-none text-sm transition-all shadow-xs"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-semibold text-gray-700 mb-1">Est. Duration</label>
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="number"
                                                                value={bidDuration}
                                                                onChange={e => setBidDuration(e.target.value)}
                                                                min="1"
                                                                placeholder="e.g. 2"
                                                                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:border-[#FF2D20] focus:ring-2 focus:ring-red-100 outline-none text-sm transition-all shadow-xs"
                                                            />
                                                            <select 
                                                                value={bidDurationUnit}
                                                                onChange={e => setBidDurationUnit(e.target.value)}
                                                                className="px-3 py-3 rounded-xl border border-gray-200 focus:border-[#FF2D20] outline-none text-sm bg-gray-50"
                                                            >
                                                                <option value="days">Days</option>
                                                                <option value="weeks">Weeks</option>
                                                                <option value="months">Months</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Reference Files (Max 3 Images/PDF)</label>
                                                    <input 
                                                        type="file" 
                                                        multiple
                                                        onChange={e => {
                                                            if (e.target.files) {
                                                                const files = Array.from(e.target.files).slice(0, 3);
                                                                setBidFiles(files);
                                                            }
                                                        }}
                                                        accept=".jpg,.jpeg,.png,.pdf"
                                                        className="w-full text-xs text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer"
                                                    />
                                                    {bidFiles.length > 0 && (
                                                        <div className="mt-2 flex gap-2">
                                                            {bidFiles.map((f, i) => (
                                                                <span key={i} className="text-[10px] bg-red-50 text-[#FF2D20] px-2 py-0.5 rounded-full border border-red-100 font-medium">
                                                                    {f.name.length > 15 ? f.name.substring(0, 15) + '...' : f.name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                <div>
                                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Proposal Proposal</label>
                                                    <textarea
                                                        value={bidProposal}
                                                        onChange={e => setBidProposal(e.target.value)}
                                                        required
                                                        maxLength={2000}
                                                        rows={4}
                                                        placeholder="Describe your approach, timeline, and why you're the best fit..."
                                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#FF2D20] focus:ring-2 focus:ring-red-100 outline-none text-sm transition-all resize-none shadow-xs"
                                                    />
                                                </div>
                                                <button
                                                    type="submit"
                                                    disabled={bidSubmitting}
                                                    className="w-full bg-neutral-900 hover:bg-black text-white py-4 rounded-xl font-bold transition-all disabled:opacity-50 shadow-lg shadow-black/5 active:scale-[0.98]"
                                                >
                                                    {bidSubmitting ? 'Sending Proposal...' : 'Submit Professional Bid'}
                                                </button>
                                            </form>
                                        </>
                                    )}
                                </div>
                            )}
                                    </motion.div>
                                )}

                                {activeTab === 'milestones' && (
                                    <motion.div key="milestones" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                                        {detail && (
                                            <ProjectMilestones 
                                                project={detail as unknown as Project} 
                                            isOwnerOrWorker={
                                                user?.id === detail.owner_id || 
                                                (user?.role_type === 'arsitek' && user?.arsitek?.id === detail.selected_architect_id) || 
                                                (user?.role_type === 'kontraktor' && user?.kontraktor?.id === detail.selected_contractor_id)
                                            }
                                            />
                                        )}
                                    </motion.div>
                                )}

                                {activeTab === 'qa' && (
                                    <motion.div key="qa" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                                        {detail && <ProjectComments project={detail as unknown as Project} />}
                                    </motion.div>
                                )}

                                {activeTab === 'vault' && (
                                    <motion.div key="vault" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                                        {detail && <ProjectVault project={detail as unknown as Project} />}
                                    </motion.div>
                                )}

                                {activeTab === 'activity' && (
                                    <motion.div key="activity" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                                        {detail && <ProjectActivity project={detail as unknown as Project} />}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </>
                    )}
                </div>
            </motion.div>
            {lightboxImg && <Lightbox src={lightboxImg} onClose={() => setLightboxImg(null)} />}

            {/* Contract Review Modal */}
            <AnimatePresence>
                {pendingContract && (
                    <ContractReviewModal
                        projectTitle={detail?.title || project.title}
                        bidderName={pendingContract.bidderName}
                        bidPrice={pendingContract.bidPrice}
                        bidType={pendingContract.bidType}
                        formatCurrency={formatCurrency}
                        onAccept={() => {
                            executeBidAction(pendingContract.bidId, pendingContract.bidType, 'accept');
                            setPendingContract(null);
                        }}
                        onCancel={() => setPendingContract(null)}
                    />
                )}
            </AnimatePresence>
        </motion.div>
    );
}

/* Lightbox overlay */
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
            <img src={src} alt="Full" className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain" onClick={e => e.stopPropagation()} />
            <button onClick={onClose} className="absolute top-6 right-6 bg-white/20 hover:bg-white/40 text-white w-10 h-10 rounded-full flex items-center justify-center text-xl backdrop-blur-sm transition-colors">✕</button>
        </div>
    );
}
