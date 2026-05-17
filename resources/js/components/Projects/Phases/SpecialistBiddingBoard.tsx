import React from 'react';
import { Users, HardHat, Zap } from 'lucide-react';

interface SpecialistBiddingBoardProps {
    project: any;
    role: 'structural' | 'mep';
    onShortlist: (bidId: number, role: string) => void;
    onRecommend?: (bidId: number, role: 'structural' | 'mep') => void;
    onOpenChat?: (user: any) => void;
}

export default function SpecialistBiddingBoard({ project, role, onShortlist, onRecommend, onOpenChat }: SpecialistBiddingBoardProps) {
    const bids = role === 'structural' ? project.bids_structural : project.bids_mep;
    
    // Filter pending and shortlisted bids
    const activeBids = (bids || []).filter((b: any) => ['pending', 'shortlisted', 'recommended'].includes(b.status));

    if (activeBids.length === 0) return null;

    return (
        <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden border border-white/10 mb-8">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full -mr-32 -mt-32 blur-3xl opacity-50" />
            <div className="relative z-10 space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 ${role === 'structural' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-amber-500/20 text-amber-400'} rounded-xl flex items-center justify-center`}>
                            <Users size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black tracking-tight capitalize">{role} Candidate Board</h3>
                            <p className="text-[10px] text-white/40 font-black uppercase tracking-widest">Architectural Technical Sourcing</p>
                        </div>
                    </div>
                    <span className="px-4 py-1.5 bg-white/10 rounded-full text-[9px] font-black uppercase tracking-widest text-white/60">
                        {activeBids.length} Candidate{activeBids.length > 1 ? 's' : ''}
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeBids.map((bid: any) => (
                        <div key={bid.id} className="p-5 bg-white/5 border border-white/10 rounded-3xl space-y-4 group hover:bg-white/10 transition-all">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 ${role === 'structural' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-amber-500/20 text-amber-400'} rounded-xl flex items-center justify-center`}>
                                        {role === 'structural' ? <HardHat size={18} /> : <Zap size={18} />}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="text-xs font-black text-white">{bid.bidder?.name || 'Pro candidate'}</p>
                                            {bid.status === 'shortlisted' && (
                                                <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-[8px] font-black uppercase rounded-md border border-indigo-500/30">Interviewing</span>
                                            )}
                                            {bid.status === 'recommended' && (
                                                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[8px] font-black uppercase rounded-md border border-emerald-500/30">Recommended</span>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">{role === 'structural' ? 'Structural Engineer' : 'MEP Engineer'}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-black text-emerald-400">Rp {Number(bid.calculated_total || bid.price).toLocaleString()}</p>
                                    <p className="text-[9px] text-white/30 font-bold uppercase tracking-wider">{bid.fee_type || 'Fixed'}</p>
                                </div>
                            </div>

                            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                <p className="text-[11px] text-white/70 leading-relaxed italic line-clamp-3">
                                    "{bid.proposal}"
                                </p>
                            </div>

                            <div className="flex items-center gap-2 pt-2">
                                {bid.status === 'pending' ? (
                                    <button 
                                        onClick={() => onShortlist(bid.id, role)}
                                        className={`flex-1 h-11 ${role === 'structural' ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-amber-500 hover:bg-amber-600'} text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg`}
                                    >
                                        Shortlist for Interview
                                    </button>
                                ) : (
                                    <>
                                        <button 
                                            onClick={() => onOpenChat?.(bid.bidder?.user)}
                                            className="flex-1 h-11 bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border border-white/5"
                                        >
                                            Chat Candidate
                                        </button>
                                        {bid.status === 'shortlisted' && (
                                            <button 
                                                onClick={() => onRecommend?.(bid.id, role)}
                                                className="flex-1 h-11 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-500/20"
                                            >
                                                Recommend
                                            </button>
                                        )}
                                    </>
                                )}
                                <button className="h-11 px-4 bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all">
                                    Profile
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
