import React from 'react';
import { 
    Info, FileText, DollarSign, Calendar, 
    TextQuote, MessageCircle, ExternalLink, ShieldCheck
} from 'lucide-react';
import { formatCurrency } from '../../../types/project.types';

interface ProjectReferenceProps {
    project: any;
    user: any;
    isArchitect: boolean;
}

export default function ProjectReference({ project, user, isArchitect }: ProjectReferenceProps) {
    // Find the accepted bid for the current phase (design)
    const acceptedBid = (project.bids_arsitek || []).find((b: any) => b.status === 'accepted');

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Accepted Proposal Card */}
            <section className="bg-white border-2 border-slate-100 rounded-[2.5rem] overflow-hidden shadow-sm">
                <div className="bg-slate-900 p-8 text-white relative">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-16 -mt-16 blur-3xl" />
                    <div className="relative flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20">
                                <ShieldCheck size={24} className="text-emerald-400" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black tracking-tight">Official Proposal</h3>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">The Binding Agreement for this phase</p>
                            </div>
                        </div>
                        <div className="px-5 py-2.5 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                            Accepted Agreement
                        </div>
                    </div>
                </div>

                <div className="p-8">
                    {acceptedBid ? (
                        <div className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Agreed Fee / Budget</p>
                                    <h4 className="text-xl font-black text-slate-900">{formatCurrency(acceptedBid.price)}</h4>
                                </div>
                                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Estimated Duration</p>
                                    <h4 className="text-xl font-black text-slate-900">
                                        {acceptedBid.estimated_duration} {acceptedBid.duration_unit}
                                    </h4>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <TextQuote size={14} /> Proposal Content
                                </h4>
                                <div className="p-6 bg-slate-50/50 rounded-3xl border border-slate-100 border-l-4 border-l-red-500/20 italic">
                                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">
                                        {(() => {
                                            let cleanProposal = acceptedBid.proposal;
                                            if (cleanProposal.includes('--- PROFESSIONAL MESSAGE ---')) {
                                                cleanProposal = cleanProposal.split('--- PROFESSIONAL MESSAGE ---')[1].split('---')[0].trim();
                                            } else if (cleanProposal.includes('=== ARCHITECTURAL PROPOSAL SUMMARY ===') || 
                                                       cleanProposal.includes('=== CONTRACTOR PROPOSAL SUMMARY ===') ||
                                                       cleanProposal.includes('=== INTERIOR DESIGN PROPOSAL ===')) {
                                                cleanProposal = cleanProposal.split('---').pop()?.trim() || cleanProposal;
                                            }
                                            if (!cleanProposal || cleanProposal.length < 5) cleanProposal = acceptedBid.proposal;
                                            return `"${cleanProposal}"`;
                                        })()}
                                    </p>
                                </div>
                            </div>

                            {acceptedBid.attachments && acceptedBid.attachments.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <FileText size={14} /> Contractual Attachments
                                    </h4>
                                    <div className="flex flex-wrap gap-3">
                                        {acceptedBid.attachments.map((url: string, i: number) => (
                                            <a 
                                                key={i}
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black text-slate-600 uppercase tracking-widest hover:border-slate-900 hover:text-slate-900 transition-all hover:scale-105"
                                            >
                                                <ExternalLink size={14} /> Attachment {i + 1}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="py-10 text-center space-y-4">
                            <Info size={40} className="text-slate-200 mx-auto" />
                            <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">No accepted proposal found for this phase.</p>
                        </div>
                    )}
                </div>
            </section>

            {/* Original Brief section */}
            <section className="bg-white border-2 border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-900 border border-slate-100">
                        <MessageCircle size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-gray-900 tracking-tight">Client's Initial Vision</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">The Original Requirements Brief</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="p-6 bg-amber-50/30 rounded-3xl border border-amber-100/30">
                        <p className="text-sm text-amber-900/80 font-medium leading-relaxed whitespace-pre-wrap italic">
                            {project.description || "No specific description was provided in the original brief."}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl">
                            <MapPin className="text-slate-400" size={16} />
                            <div>
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Location</p>
                                <p className="text-xs font-black text-slate-900">{project.city || project.location}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl">
                            <Calendar className="text-slate-400" size={16} />
                            <div>
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Target Deadline</p>
                                <p className="text-xs font-black text-slate-900">
                                    {project.deadline ? new Date(project.deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Flexible'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

function MapPin(props: any) {
    return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-map-pin"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
}
