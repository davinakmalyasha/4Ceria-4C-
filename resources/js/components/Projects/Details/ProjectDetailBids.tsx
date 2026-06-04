import React from 'react';
import { 
    Star, User as UserIcon, FileText, ChevronRight, AlertCircle, 
    Box, Layout, Zap, Grid, Eye, Sofa, CheckCircle2,
    Calendar, Clock, ShieldCheck, MapPin
} from 'lucide-react';
import { ARCHITECT_SERVICE_SCOPES, ARCHITECT_DELIVERABLES } from '../../constants/ArchitectStandardPresets';
import { ProjectBidForm } from './ProjectBidForm';

interface Bid {
    id: number;
    price: number;
    price_max?: number;
    fee_type?: string;
    proposal: string;
    status: string;
    type: 'arsitek' | 'kontraktor';
    bidder: any;
    estimated_duration?: number;
    duration_unit?: string;
    attachments?: string[];
    scopes?: string[];
    deliverables?: string[];
    calculated_total?: number | string;
}

interface Props {
    allBids: Bid[];
    detail: any;
    user: any;
    formatCurrency: (amount: number) => string;
    onViewProfile: (type: 'architect' | 'constructor', id: number) => void;
    onBidAction: (id: number, type: 'arsitek' | 'kontraktor', action: 'accept' | 'decline') => void;
    actionLoading: number | null;
    toggleCompareSelection: (id: number, type: string) => void;
    selectedCompareBidIds: string[];
}

export const ProjectDetailBids: React.FC<Props> = ({ 
    allBids, detail, user, formatCurrency, onViewProfile, onBidAction, 
    actionLoading, toggleCompareSelection, selectedCompareBidIds 
}) => {
    const professionalRoles = ['arsitek', 'kontraktor', 'notaris', 'interior', 'structural', 'mep', 'project_manager'];
    const isProfessional = professionalRoles.includes(user?.role_type);
    
    // Use the backend-calculated has_submitted_bid if available, otherwise fallback to local check
    const hasAlreadyBid = detail?.has_submitted_bid ?? allBids.some(b => {
        if (!user) return false;
        const role = user.role_type;
        const profileId = user[role]?.id || user[`${role}_profile`]?.id;
        
        // If we have a specific profile match logic for standard roles
        if (role === 'arsitek') return b.type === 'arsitek' && b.bidder?.id === profileId;
        if (role === 'kontraktor') return b.type === 'kontraktor' && b.bidder?.id === profileId;
        
        // Match via nested user ID (Project Manager, Structural, MEP)
        if (b.bidder?.user?.id === user.id) return true;
        if (b.bidder?.user_id === user.id) return true;

        // General check for others if they are in allBids
        return b.bidder?.id === profileId || b.pm_id === profileId || b.structural_id === profileId || b.mep_id === profileId;
    });

    const isPublishedRole = detail?.published_bidding_roles?.includes(user?.role_type);
    const isTargetRole = detail?.target_role === 'both' || detail?.target_role === user?.role_type || isPublishedRole;
    
    const canBid = isProfessional && !hasAlreadyBid && isTargetRole && 
        ['open', 'accepted_arsitek', 'accepted_kontraktor', 'procurement', 'in_progress', 'awaiting_payment', 'contract_pending', 'planning'].includes(detail?.status);

    const getBidPrice = (b: Bid) => b.calculated_total && Number(b.calculated_total) > 0 ? Number(b.calculated_total) : b.price;
    const lowestPrice = allBids.length > 0 ? Math.min(...allBids.map(getBidPrice)) : 0;
    const maxExperience = allBids.length > 0 ? Math.max(...allBids.map(b => b.bidder?.experience_years || 0)) : 0;

    const getStatusColor = (status?: string) => {
        if (!status) return 'bg-gray-50 text-gray-400 border-gray-100';
        const s = status.toLowerCase();
        switch (s) {
            case 'pending': return 'bg-amber-50 text-amber-600 border-amber-100';
            case 'accepted': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
            case 'declined': return 'bg-red-50 text-red-600 border-red-100';
            default: return 'bg-gray-50 text-gray-400 border-gray-100';
        }
    };

    return (
        <div className="space-y-6 pt-8 border-t border-gray-100">
            <div className="flex items-center justify-between">
                <h4 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                    Bidding Proposals
                    <span className="text-[10px] bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full font-black uppercase tracking-widest">{allBids.length} Total</span>
                </h4>
            </div>

            {canBid && (
                <div className="mb-12">
                    <ProjectBidForm 
                        project={detail} 
                        user={user} 
                        onSuccess={() => {
                            // OnSuccess is usually handled by parent refreshing detail
                            window.location.reload(); // Simple refresh for now to see new bid
                        }} 
                    />
                </div>
            )}

            {allBids.length === 0 ? (
                <div className="bg-gray-50/50 rounded-3xl border-2 border-dashed border-gray-100 py-16 flex flex-col items-center text-center px-6">
                    <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center text-gray-300 mb-4 animate-pulse">
                        <FileText size={32} />
                    </div>
                    <h5 className="text-gray-900 font-bold text-lg mb-1">Waiting for Proposals</h5>
                    <p className="text-gray-400 text-sm max-w-xs">This project is currently open for bids. Professionals will submit their proposals here.</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {allBids.map(bid => (
                        <div key={`${bid.type}-${bid.id}`} className="bg-white rounded-3xl border border-zinc-100 p-8 shadow-sm hover:shadow-xl hover:border-zinc-200 transition-all group relative overflow-hidden">
                            {/* Comparison Checkbox */}
                            {detail?.owner_id === user?.id && bid.status === 'pending' && (
                                <div className="absolute top-8 right-8 flex items-center gap-2 z-10 bg-white/50 backdrop-blur-sm pl-4 py-1 rounded-full border border-gray-100">
                                    <label htmlFor={`compare-${bid.type}-${bid.id}`} className="text-[9px] font-black text-gray-400 uppercase tracking-widest cursor-pointer select-none">Compare</label>
                                    <input 
                                        type="checkbox"
                                        id={`compare-${bid.type}-${bid.id}`}
                                        checked={selectedCompareBidIds.includes(`${bid.type}-${bid.id}`)}
                                        onChange={() => toggleCompareSelection(bid.id, bid.type)}
                                        className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                                    />
                                </div>
                            )}

                            {/* Bidder Header */}
                            <div className="flex items-start gap-5 mb-8">
                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white font-black text-xl shadow-lg ring-4 ring-red-50/50">
                                    {bid.bidder?.name?.charAt(0)?.toUpperCase()}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-1">
                                        <h5 className="font-extrabold text-xl text-gray-900 tracking-tight">{bid.bidder?.name}</h5>
                                        {bid.bidder?.average_rating !== undefined && (
                                            <div className="flex items-center gap-1.5 bg-amber-50 px-3 py-1 rounded-full border border-amber-100 shadow-sm">
                                                <Star size={12} className="fill-amber-400 text-amber-400" />
                                                <span className="text-xs font-black text-amber-700">{bid.bidder.average_rating}</span>
                                            </div>
                                        )}
                                        {/* Smart Badges */}
                                        {getBidPrice(bid) === lowestPrice && allBids.length > 1 && (
                                            <span className="bg-emerald-50 text-emerald-600 text-[9px] px-3 py-1 rounded-full font-black uppercase tracking-[0.1em] border border-emerald-100">Lowest Bid</span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                                        <span className="text-red-500">{bid.type === 'arsitek' ? 'Architect' : 'Contractor'}</span>
                                        <span>• {bid.bidder?.location || 'Remote'}</span>
                                        {bid.bidder?.experience_years && <span>• {bid.bidder.experience_years}yr Exp</span>}
                                    </div>
                                </div>
                            </div>

                            {/* Proposal Details */}
                            <div className="bg-zinc-50 rounded-[2rem] p-8 mb-8 border border-zinc-100/50 shadow-inner">
                                {(() => {
                                    const hasStructuredData = (bid.scopes && bid.scopes.length > 0) || (bid.deliverables && bid.deliverables.length > 0);
                                    
                                    // EXTRACT PROFESSIONAL MESSAGE (Universal Cleaning)
                                    // We split by standard markers used in our formatting helpers
                                    let cleanProposal = bid.proposal;
                                    
                                    // Try to isolate the message between the summary footer and the professional message header
                                    if (bid.proposal.includes('--- PROFESSIONAL MESSAGE ---')) {
                                        cleanProposal = bid.proposal.split('--- PROFESSIONAL MESSAGE ---')[1].split('---')[0].trim();
                                    } else if (bid.proposal.includes('=== ARCHITECTURAL PROPOSAL SUMMARY ===')) {
                                        // Fallback if the standard markers are slightly different or missing the end marker
                                        cleanProposal = bid.proposal.split('---').pop()?.trim() || bid.proposal;
                                    }

                                    // Final fallbacks if cleaning resulted in empty string or if markers weren't found
                                    if (!cleanProposal || cleanProposal.length < 5) cleanProposal = bid.proposal;

                                    if (hasStructuredData) {
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
                                            <div className="space-y-6">
                                                {/* Professional Message */}
                                                <div>
                                                    <p className="text-[15px] text-zinc-800 font-medium leading-relaxed italic border-l-4 border-red-500/20 pl-6 py-1">
                                                        "{cleanProposal}"
                                                    </p>
                                                </div>

                                                {/* Deliverables Grid */}
                                                {bid.deliverables && bid.deliverables.length > 0 && (
                                                    <div className="pt-6 border-t border-zinc-200/40">
                                                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                            <CheckCircle2 size={12} className="text-emerald-500" /> Promised Deliverables
                                                        </p>
                                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                            {bid.deliverables.map(id => {
                                                                const del = ARCHITECT_DELIVERABLES.find(d => d.id === id);
                                                                const label = del ? del.label : id;
                                                                
                                                                // Icon mapping
                                                                const IconMap: Record<string, any> = { Box, Layout, Zap, Grid, Eye, Sofa };
                                                                const Icon = del ? (IconMap[del.icon as string] || FileText) : FileText;

                                                                return (
                                                                    <div key={id} className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-2xl border border-zinc-100 shadow-sm group-hover:border-zinc-200 transition-colors">
                                                                        <div className="w-8 h-8 rounded-lg bg-zinc-50 flex items-center justify-center text-zinc-400">
                                                                            <Icon size={14} />
                                                                        </div>
                                                                        <span className="text-[10px] font-black text-zinc-900 leading-tight">{label}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Scopes Badges */}
                                                {bid.scopes && bid.scopes.length > 0 && (
                                                    <div className="flex flex-wrap gap-2">
                                                        {bid.scopes.map(id => {
                                                            const scope = ARCHITECT_SERVICE_SCOPES.find(s => s.id === id);
                                                            return (
                                                                <span key={id} className="px-3 py-1 bg-zinc-900/5 text-zinc-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-zinc-950/5">
                                                                    {scope?.label || id}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                                
                                                {/* Extracted Details */}
                                                {bid.proposal.includes('=== ARCHITECTURAL PROPOSAL SUMMARY ===') && (
                                                    <div className="mt-6 pt-6 border-t border-zinc-200/50 grid grid-cols-1 sm:grid-cols-3 gap-6">
                                                        <div>
                                                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">Proposed Style</p>
                                                            <p className="text-xs font-black text-zinc-900">{style}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">Revisions Allowed</p>
                                                            <p className="text-xs font-black text-zinc-900">{revisions.replace('Times', '')} Times</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black text-emerald-600/60 uppercase tracking-widest mb-1.5">Professional Fee Info</p>
                                                            <p className="text-xs font-black text-zinc-900 flex items-baseline gap-2">
                                                                {feeStructure}
                                                                <span className="text-emerald-600 text-[13px]">(@ Rp {Number(bid.price).toLocaleString('id-ID')})</span>
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    }

                                    // Legacy Rendering
                                    return (
                                        <p className="text-[14px] text-zinc-700 leading-relaxed italic border-l-4 border-zinc-200/50 pl-6 py-1 whitespace-pre-wrap">
                                            "{cleanProposal}"
                                        </p>
                                    );
                                })()}
                                
                                {bid.attachments && bid.attachments.length > 0 && (
                                    <div className="mt-8 pt-6 border-t border-zinc-200/40 flex flex-wrap gap-2">
                                        {bid.attachments.map((url, i) => (
                                            <a key={i} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-100 rounded-xl text-[10px] font-black text-gray-400 hover:text-red-600 hover:border-red-100 transition-all shadow-sm group/att">
                                                <FileText size={14} className="group-hover/att:scale-110 transition-transform" /> Attachment {i + 1}
                                            </a>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Footer (Price + Actions) */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Investment Bid</p>
                                    <p className="text-2xl font-black text-gray-900 tracking-tight">
                                        {bid.fee_type === 'percentage' ? (
                                            bid.price_max && Number(bid.price_max) > 0 ? (
                                                detail?.budget ? (
                                                    `${formatCurrency((Number(bid.price) / 100) * detail.budget)} - ${formatCurrency((Number(bid.price_max) / 100) * detail.budget)}`
                                                ) : (
                                                    `${Number(bid.price)}% - ${Number(bid.price_max)}%`
                                                )
                                            ) : (
                                                detail?.budget ? formatCurrency((Number(bid.price) / 100) * detail.budget) : `${Number(bid.price)}%`
                                            )
                                        ) : (
                                            bid.price_max && Number(bid.price_max) > 0 ? (
                                                `${formatCurrency(bid.price)} - ${formatCurrency(bid.price_max)}`
                                            ) : (
                                                formatCurrency(bid.calculated_total && Number(bid.calculated_total) > 0 ? Number(bid.calculated_total) : bid.price)
                                            )
                                        )}
                                    </p>
                                    <p className="text-[11px] font-bold text-gray-400 capitalize">
                                        {bid.fee_type === 'percentage' ? (
                                            bid.price_max && Number(bid.price_max) > 0 ? (
                                                `Ballpark: ${Number(bid.price)}% - ${Number(bid.price_max)}% of budget • ETA: ${bid.estimated_duration} ${bid.duration_unit}`
                                            ) : (
                                                `Fee: ${Number(bid.price)}% of budget • ETA: ${bid.estimated_duration} ${bid.duration_unit}`
                                            )
                                        ) : (
                                            bid.price_max && Number(bid.price_max) > 0 ? (
                                                `Ballpark price range • ETA: ${bid.estimated_duration} ${bid.duration_unit}`
                                            ) : (
                                                `Estimated fee • ETA: ${bid.estimated_duration} ${bid.duration_unit}`
                                            )
                                        )}
                                    </p>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button 
                                        onClick={() => onViewProfile(bid.type === 'arsitek' ? 'architect' : 'constructor', bid.bidder?.id)}
                                        className="px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-zinc-500 hover:text-zinc-900 transition-colors"
                                    >
                                        Visit Profile
                                    </button>
                                    
                                    {bid.status === 'pending' && detail?.owner_id === user?.id && (
                                        <div className="flex gap-2">
                                            <button
                                                disabled={actionLoading === bid.id}
                                                onClick={() => onBidAction(bid.id, bid.type, 'accept')}
                                                className="bg-zinc-900 hover:bg-black text-white px-6 py-3 rounded-xl font-black text-[11px] uppercase tracking-[0.2em] shadow-xl shadow-zinc-200 transition-all active:scale-95 disabled:opacity-50"
                                            >
                                                {actionLoading === bid.id ? '...' : 'Hire Pro'}
                                            </button>
                                            <button
                                                disabled={actionLoading === bid.id}
                                                onClick={() => onBidAction(bid.id, bid.type, 'decline')}
                                                className="bg-white border border-red-100 text-red-600 px-6 py-3 rounded-xl font-black text-[11px] uppercase tracking-[0.2em] hover:bg-red-50 transition-all active:scale-95 disabled:opacity-50"
                                            >
                                                {actionLoading === bid.id ? '...' : 'Decline'}
                                            </button>
                                        </div>
                                    )}
                                    
                                    {bid.status !== 'pending' && (
                                        <span className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest border ${getStatusColor(bid.status)}`}>
                                            {bid.status}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
