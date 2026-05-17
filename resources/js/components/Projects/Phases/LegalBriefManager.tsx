import React, { useState, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Lock, ShieldCheck, Clock, CheckCircle2, 
    AlertCircle, Stamp, Loader2, ChevronDown, ChevronRight,
    ListChecks, Send
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { 
    getLegalRequirementById 
} from '../../../constants/LegalStandardPresets';

interface LegalBriefManagerProps {
    project: any;
    onRefresh: () => void;
}

export default function LegalBriefManager({ project, onRefresh }: LegalBriefManagerProps) {
    if (!project) {
        return (
            <div className="py-20 text-center animate-pulse">
                <ShieldCheck size={40} className="mx-auto text-zinc-100 mb-4" />
                <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">Hydrating Brief...</p>
            </div>
        );
    }

    const bid = project.accepted_notaris_bid;
    const isNotary = project.selected_notaris_id != null;
    const isScopeFinalized = Array.isArray(project.legal_requirements) && project.legal_requirements.length > 0;

    // Price display logic (consistent with BidReviewCard)
    const displayPrice = bid?.fee_type === 'percentage' 
        ? (Number(bid.calculated_total) || 0)
        : (Number(bid?.price) || 0);

    const services = useMemo(() => {
        if (!bid?.notaris?.services) return [];
        return bid.notaris.services.map((s: any) => ({
            id: String(s.id),
            label: s.title,
            desc: s.description || 'Professional legal service as defined in the notary\'s catalog.',
            responsibleRole: 'Notary'
        }));
    }, [bid]);

    const negotiatedServiceIds = useMemo(() => {
        if (!Array.isArray(bid?.selected_services)) return [];
        return bid.selected_services.map((item: any) => {
            if (typeof item === 'object' && item !== null && 'id' in item) {
                return String(item.id);
            }
            return String(item);
        });
    }, [bid?.selected_services]);

    const { showToast } = useToast();

    // The scope is now a derived view of either the finalized requirements 
    // or the negotiated services from the bid.
    const finalSelectedIds = useMemo(() => {
        if (project.legal_requirements && project.legal_requirements.length > 0) {
            return project.legal_requirements.map((id: any) => String(id));
        }
        return negotiatedServiceIds;
    }, [project.legal_requirements, negotiatedServiceIds]);

    if (!bid) {
        return (
            <div className="bg-amber-50 border border-amber-100 rounded-3xl p-8 text-center">
                <AlertCircle className="mx-auto text-amber-500 mb-4" size={32} />
                <h3 className="text-amber-900 font-black uppercase tracking-widest text-sm mb-1">Brief Not Available</h3>
                <p className="text-amber-700 text-xs">A Notary must be hired before the legal scope can be defined.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Bid Summary Header */}
            <BidSummaryCard bid={bid} />

            {/* Status Banner */}
            <div className="flex items-center gap-4 p-6 bg-zinc-50 border border-zinc-200 rounded-[2rem]">
                <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-400">
                    <ListChecks size={24} />
                </div>
                <div>
                    <h4 className="text-sm font-black text-zinc-900 uppercase tracking-widest">Scope Alignment</h4>
                    <p className="text-xs text-zinc-500 font-medium mt-0.5">
                        These services were agreed upon during the negotiation and contract phase.
                    </p>
                </div>
            </div>

            {/* Category Checklist */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-xl">
                            <ListChecks size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-zinc-900">Legal Document Checklist</h3>
                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                                {finalSelectedIds.length} agreed services
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {services.map(item => {
                        const isSelected = finalSelectedIds.includes(item.id);
                        if (!isSelected) return null; // Only show selected items as it's a preview

                        return (
                            <div
                                key={item.id}
                                className="flex items-start gap-4 p-5 rounded-[2rem] border-2 border-zinc-100 bg-white"
                            >
                                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 bg-zinc-900 text-white">
                                    <CheckCircle2 size={16} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-black text-zinc-900 leading-tight">{item.label}</span>
                                        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-md">
                                            <Lock size={8} className="fill-current" />
                                            <span className="text-[8px] font-black uppercase tracking-tighter">Agreed</span>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-zinc-400 font-medium leading-relaxed mt-2 line-clamp-2">{item.desc}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>


        </div>
    );
}

/** Extracted sub-component: Bid summary card (read-only) */
function BidSummaryCard({ bid }: { bid: any }) {
    const displayPrice = bid?.fee_type === 'percentage' 
        ? (Number(bid.calculated_total) || 0)
        : (Number(bid?.price) || 0);

    return (
        <div className="bg-zinc-900 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-zinc-800 rounded-full blur-[100px] opacity-20 -translate-y-1/2 translate-x-1/2" />
            
            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-zinc-800 rounded-2xl flex items-center justify-center text-emerald-400 shadow-inner">
                        <Stamp size={28} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-white tracking-tight">Legal Service Contract</h3>
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mt-1 flex items-center gap-2">
                            <Lock size={10} /> Binding Agreement — Legalitas Phase
                        </p>
                    </div>
                </div>
                <div className="px-5 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl w-fit">
                    <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                        <ShieldCheck size={14} /> Executing
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 bg-zinc-800/50 rounded-2xl border border-zinc-700/50">
                    <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Professional Fee</p>
                    <p className="text-lg font-black text-white">Rp {displayPrice.toLocaleString('id-ID')}</p>
                </div>
                <div className="p-5 bg-zinc-800/50 rounded-2xl border border-zinc-700/50">
                    <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Estimated Tax/PNBP</p>
                    <p className="text-lg font-black text-white">Rp {Number(bid.tax_estimate || 0).toLocaleString('id-ID')}</p>
                </div>
                <div className="p-5 bg-zinc-800/50 rounded-2xl border border-zinc-700/50">
                    <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Timeline</p>
                    <p className="text-lg font-black text-white">{bid.estimated_duration} {bid.duration_unit}(s)</p>
                </div>
            </div>

            {bid.proposal && (
                <div className="mt-8 pt-8 border-t border-zinc-800/50">
                    <div className="flex items-center gap-2 mb-3">
                        <Clock size={14} className="text-zinc-500" />
                        <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Initial Proposal Notes</h4>
                    </div>
                    <p className="text-sm text-zinc-400 font-medium italic leading-relaxed">
                        "{bid.proposal}"
                    </p>
                </div>
            )}
        </div>
    );
}
