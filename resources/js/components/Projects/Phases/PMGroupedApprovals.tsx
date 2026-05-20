import React from 'react';
import { Check, X, ExternalLink, ShieldCheck } from 'lucide-react';

interface PMGroupedApprovalsProps {
    project: any;
    pendingMilestones: any[];
    pendingHandovers: any[];
    pendingAddendums: any[];
    recommendedBids: any[];
    isLoading: boolean;
    onVerifyMilestone: (id: number, status: 'approved' | 'revision') => void;
    onVerifyHandover: (phase: string, action: 'approve' | 'reject') => void;
    onVerifyAddendum: (addendum: any, status: 'approved' | 'rejected') => void;
}

export default function PMGroupedApprovals({
    project,
    pendingMilestones,
    pendingHandovers,
    pendingAddendums,
    recommendedBids,
    isLoading,
    onVerifyMilestone,
    onVerifyHandover,
    onVerifyAddendum,
}: PMGroupedApprovalsProps) {
    const phases = [
        { key: 'legal', label: 'Legalitas', sub: 'Notaris' },
        { key: 'design', label: 'Desain', sub: 'Arsitek, MEP, Struktur' },
        { key: 'build', label: 'Konstruksi', sub: 'Kontraktor' },
        { key: 'interior', label: 'Interior', sub: 'Interior Designer' },
        { key: 'management', label: 'Manajemen', sub: 'Project Manager' },
    ];

    const getItems = (phaseKey: string) => {
        const ms = pendingMilestones.filter(m => {
            const pc = m.phase_context || '';
            if (phaseKey === 'legal') return pc === 'legal';
            if (phaseKey === 'design') return ['design', 'structural', 'mep'].includes(pc);
            if (phaseKey === 'build') return pc === 'build' || pc === 'construction';
            if (phaseKey === 'interior') return pc === 'interior';
            return pc === 'management' || !['legal', 'design', 'structural', 'mep', 'build', 'construction', 'interior'].includes(pc);
        }).map(m => ({ type: 'milestone', id: m.id, title: m.title, desc: m.description, files: m.content?.gallery, fileNames: m.content?.file_names, raw: m }));

        const ho = pendingHandovers.filter(h => h.phase === (phaseKey === 'build' ? 'build' : phaseKey))
            .map(h => ({ type: 'handover', id: h.phase, title: `Handover: ${h.title}`, desc: h.state === 'awaiting_owner' ? 'PM Sealed - Awaiting Owner' : 'Awaiting PM Seal', raw: h }));

        const ad = pendingAddendums.filter(a => {
            const rt = a.role_type || '';
            if (phaseKey === 'legal') return rt === 'notaris';
            if (phaseKey === 'design') return ['arsitek', 'structural', 'mep'].includes(rt);
            if (phaseKey === 'build') return rt === 'kontraktor';
            if (phaseKey === 'interior') return rt === 'interior';
            return !['notaris', 'arsitek', 'structural', 'mep', 'kontraktor', 'interior'].includes(rt);
        }).map(a => ({ type: 'addendum', id: a.id, title: a.title, desc: `Amount: Rp ${Number(a.amount || 0).toLocaleString('id-ID')}`, raw: a }));

        const rec = phaseKey === 'design' ? recommendedBids.map(b => ({
            type: 'rec_bid', id: b.id, title: `Specialist Bid: ${b.bid_type === 'structural' ? 'Structural' : 'MEP'}`,
            desc: `${b.structural_engineer?.user?.name || b.mep_engineer?.user?.name || 'Engineer'} (Architect Rec)`, raw: b
        })) : [];

        return [...ms, ...ho, ...ad, ...rec];
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {phases.map(p => {
                const list = getItems(p.key);
                return (
                    <div key={p.key} className="bg-white border border-zinc-200 rounded-xl p-3 flex flex-col min-h-[160px]">
                        <div className="border-b border-zinc-900 pb-1.5 mb-2.5">
                            <h4 className="text-[11px] font-bold text-zinc-900 uppercase tracking-wider">{p.label}</h4>
                            <p className="text-[9px] text-zinc-400 font-medium">{p.sub}</p>
                        </div>
                        <div className="flex-1 space-y-2 overflow-y-auto max-h-[250px]">
                            {list.length === 0 ? (
                                <div className="py-6 text-center text-[9px] text-zinc-400 border border-dashed border-zinc-200 rounded-lg bg-zinc-50/50">No pending approvals</div>
                            ) : list.map(item => (
                                <div key={`${item.type}-${item.id}`} className="p-2 border border-zinc-100 rounded-lg bg-zinc-50/50 space-y-1">
                                    <p className="text-[10px] font-bold text-zinc-800 leading-tight">{item.title}</p>
                                    {item.desc && <p className="text-[9px] text-zinc-400 leading-relaxed truncate">{item.desc}</p>}
                                    
                                    {item.files?.map((f: string, i: number) => (
                                        <a key={f} href={`/storage/${f}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[8px] text-zinc-500 hover:text-black underline mr-1.5">
                                            <ExternalLink size={7} /> {item.fileNames?.[f] || `File ${i + 1}`}
                                        </a>
                                    ))}

                                    <div className="flex items-center gap-1 pt-1 border-t border-zinc-100 mt-1.5">
                                        {item.type === 'milestone' && (
                                            <>
                                                <button disabled={isLoading} onClick={() => onVerifyMilestone(item.id, 'approved')} className="flex-1 h-5 bg-black hover:bg-zinc-800 disabled:opacity-50 text-[8px] font-bold text-white rounded flex items-center justify-center gap-0.5"><Check size={8} /> Approve</button>
                                                <button disabled={isLoading} onClick={() => onVerifyMilestone(item.id, 'revision')} className="h-5 w-5 border border-zinc-200 hover:bg-zinc-100 disabled:opacity-50 text-zinc-500 rounded flex items-center justify-center"><X size={8} /></button>
                                            </>
                                        )}
                                        {item.type === 'handover' && item.raw.state === 'awaiting_pm' && (
                                            <>
                                                <button disabled={isLoading} onClick={() => onVerifyHandover(item.id as string, 'approve')} className="flex-1 h-5 bg-black hover:bg-zinc-800 disabled:opacity-50 text-[8px] font-bold text-white rounded flex items-center justify-center gap-0.5"><Check size={8} /> Seal</button>
                                                <button disabled={isLoading} onClick={() => onVerifyHandover(item.id as string, 'reject')} className="h-5 w-5 border border-zinc-200 hover:bg-zinc-100 disabled:opacity-50 text-zinc-500 rounded flex items-center justify-center"><X size={8} /></button>
                                            </>
                                        )}
                                        {item.type === 'handover' && item.raw.state === 'awaiting_owner' && <span className="text-[8px] font-bold text-zinc-400 px-1 py-0.5 bg-zinc-100 rounded">Owner Pending</span>}
                                        {item.type === 'addendum' && (
                                            <>
                                                <button disabled={isLoading} onClick={() => onVerifyAddendum(item.raw, 'approved')} className="flex-1 h-5 bg-black hover:bg-zinc-800 disabled:opacity-50 text-[8px] font-bold text-white rounded flex items-center justify-center gap-0.5"><Check size={8} /> Authorize</button>
                                                <button disabled={isLoading} onClick={() => onVerifyAddendum(item.raw, 'rejected')} className="h-5 w-5 border border-zinc-200 hover:bg-zinc-100 disabled:opacity-50 text-zinc-500 rounded flex items-center justify-center"><X size={8} /></button>
                                            </>
                                        )}
                                        {item.type === 'rec_bid' && <span className="text-[8px] font-bold text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded flex items-center gap-0.5"><ShieldCheck size={8} /> Rec Active</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
