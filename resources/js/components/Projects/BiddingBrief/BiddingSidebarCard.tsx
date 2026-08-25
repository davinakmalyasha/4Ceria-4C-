import React from 'react';
import { Calendar, Users, ShieldCheck, CheckCircle2, Lock, ArrowUpRight, ShieldAlert } from 'lucide-react';
import { getProfile } from '../../Shared/ProfilePreviewHelpers';
import { formatCurrency as formatPrice } from '../../../types/explore';

interface BiddingSidebarCardProps {
    project: any;
    user: any;
    userBid: any;
    onOpenBidDrawer: () => void;
}

export const BiddingSidebarCard: React.FC<BiddingSidebarCardProps> = ({ 
    project, user, userBid, onOpenBidDrawer 
}) => {
    const isOwner = user?.id === project?.user_id;
    const canBid = !isOwner && ['arsitek', 'kontraktor', 'notaris', 'interior', 'structural', 'mep', 'project_manager'].includes(user?.role_type);

    const profile = user ? getProfile(user) : null;
    const isVerified = profile?.verification_status === 'verified' || profile?.verification_status === 'approved';

    const totalBidsCount = 
        (project?.bids_arsitek?.length || project?.bids_arsitek_count || 0) +
        (project?.bids_kontraktor?.length || project?.bids_kontraktor_count || 0) +
        (project?.bids_notaris?.length || project?.bids_notaris_count || 0) +
        (project?.bids_interior?.length || project?.bids_interior_count || 0) +
        (project?.bids_structural?.length || project?.bids_structural_count || 0) +
        (project?.bids_mep?.length || project?.bids_mep_count || 0) +
        (project?.bids_project_manager?.length || project?.bids_project_manager_count || 0);

    const deadlineStr = project?.deadline
        ? new Date(project.deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'ASAP';

    return (
        <div className="space-y-6 sticky top-8">
            {/* Stats Card */}
            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Tendering Status</h3>
                
                <div className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-gray-50">
                        <span className="text-xs font-semibold text-gray-400 flex items-center gap-2">
                            <Users size={14} /> Total Proposals
                        </span>
                        <span className="text-xs font-bold text-gray-900">{totalBidsCount} Submitted</span>
                    </div>

                    <div className="flex items-center justify-between pb-3 border-b border-gray-50">
                        <span className="text-xs font-semibold text-gray-400 flex items-center gap-2">
                            <Calendar size={14} /> Deadline
                        </span>
                        <span className="text-xs font-bold text-gray-900">{deadlineStr}</span>
                    </div>
                </div>
            </div>

            {/* Dynamic CTA Card */}
            {userBid ? (
                /* Proposal Submitted View */
                <div className="bg-gradient-to-br from-emerald-900 to-zinc-950 text-white p-6 rounded-[2rem] border border-emerald-500/20 shadow-xl space-y-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-[40px] rounded-full translate-x-8 -translate-y-8" />
                    
                    <div className="relative z-10 space-y-4">
                        <div className="flex items-center gap-2 text-emerald-400">
                            <CheckCircle2 size={20} />
                            <h4 className="text-xs font-black uppercase tracking-widest">Proposal Submitted</h4>
                        </div>

                        <div className="space-y-2">
                            <p className="text-[10px] font-black text-emerald-400/70 uppercase tracking-widest">Your Offer Rate</p>
                            <p className="text-xl font-black">
                                {userBid.fee_type === 'percentage' ? (
                                    userBid.calculated_total && Number(userBid.calculated_total) > 0 ? (
                                        `${userBid.price}% (${formatPrice(Number(userBid.calculated_total))})`
                                    ) : (
                                        `${userBid.price}%`
                                    )
                                ) : (
                                    userBid.calculated_total && Number(userBid.calculated_total) > 0 
                                        ? formatPrice(Number(userBid.calculated_total)) 
                                        : userBid.price ? formatPrice(Number(userBid.price)) : 'Reviewing Rate'
                                )}
                            </p>
                            {userBid.fee_type === 'percentage' && (
                                <p className="text-[9px] font-bold text-emerald-400/60 uppercase tracking-wider">
                                    Percentage of project budget
                                </p>
                            )}
                        </div>

                        <div className="pt-2 border-t border-white/5 space-y-1">
                            <div className="flex items-center justify-between text-xs text-gray-400">
                                <span>Status</span>
                                <span className="font-bold text-emerald-400 uppercase tracking-wider text-[10px]">
                                    {userBid.status === 'contract_pending' ? 'Hired (Pending Signature)' : 
                                     userBid.status === 'shortlisted' ? 'Shortlisted' : 'Under Review'}
                                </span>
                            </div>
                        </div>

                        <p className="text-[10px] text-gray-400 italic font-medium leading-relaxed pt-2">
                            Your proposal is securely delivered. The project owner or PM will reach out directly for details or interviews.
                        </p>
                    </div>
                </div>
            ) : canBid ? (
                /* Bidding Open CTA */
                <div className="bg-zinc-950 text-white p-6 rounded-[2rem] border border-zinc-800 shadow-xl space-y-6 relative overflow-hidden">
                    {isVerified ? (
                        <>
                            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 blur-[40px] rounded-full translate-x-8 -translate-y-8 pointer-events-none" />
                            
                            <div className="relative z-10 space-y-4">
                                <div className="space-y-1">
                                    <h4 className="text-sm font-black uppercase tracking-widest text-red-500">Bidding Open</h4>
                                    <p className="text-xs text-zinc-400 leading-relaxed font-semibold">
                                        Submit a professional proposal to offer your services for this project.
                                    </p>
                                </div>

                                <button 
                                    onClick={onOpenBidDrawer}
                                    className="w-full bg-red-600 hover:bg-red-500 text-white py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300 hover:scale-[1.02] shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 group"
                                >
                                    Submit Proposal
                                    <ArrowUpRight size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-[40px] rounded-full translate-x-8 -translate-y-8 pointer-events-none" />
                            
                            <div className="relative z-10 space-y-4">
                                <div className="space-y-1">
                                    <h4 className="text-sm font-black uppercase tracking-widest text-amber-500 flex items-center gap-1.5">
                                        <ShieldAlert size={16} className="animate-pulse" />
                                        Verification Required
                                    </h4>
                                    <p className="text-xs text-zinc-400 leading-relaxed font-semibold">
                                        You must verify your professional profile before you can submit a proposal.
                                    </p>
                                </div>

                                <button 
                                    onClick={() => {
                                        window.dispatchEvent(new CustomEvent('switchDashboardTab', { detail: 'profile' }));
                                    }}
                                    className="w-full bg-white hover:bg-zinc-100 text-zinc-950 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300 hover:scale-[1.02] shadow-lg flex items-center justify-center gap-2 group"
                                >
                                    I Want to Verify
                                    <ArrowUpRight size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                </button>
                            </div>
                        </>
                    )}
                </div>
            ) : (
                /* Closed / Non-Eligible View */
                <div className="bg-gray-50 border border-gray-200/50 p-6 rounded-[2rem] text-center text-gray-400 space-y-2">
                    <Lock size={20} className="mx-auto text-gray-300" />
                    <p className="text-xs font-bold uppercase tracking-wider">Proposal Portal Closed</p>
                    <p className="text-[10px] leading-relaxed font-medium">
                        {isOwner ? 'Owners cannot submit bids.' : 'You must have a matching professional role to bid.'}
                    </p>
                </div>
            )}
        </div>
    );
};
