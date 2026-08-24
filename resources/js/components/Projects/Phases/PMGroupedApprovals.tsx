import React from 'react';
import ApprovalCard from './ApprovalCard';

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
    onNavigateToPhase?: (phaseKey: any) => void;
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
    onNavigateToPhase,
}: PMGroupedApprovalsProps) {
    const phases = [
        { key: 'legal', label: 'Legalitas', sub: 'Notaris', accentClass: 'border-t-4 border-slate-500' },
        { key: 'design', label: 'Desain', sub: 'Arsitek, MEP, Struktur', accentClass: 'border-t-4 border-violet-500' },
        { key: 'build', label: 'Konstruksi', sub: 'Kontraktor', accentClass: 'border-t-4 border-amber-500' },
        { key: 'interior', label: 'Interior', sub: 'Interior Designer', accentClass: 'border-t-4 border-rose-500' },
    ];

    const getItems = (phaseKey: string) => {
        const ms = pendingMilestones.filter(m => {
            const pc = m.phase_context || '';
            if (phaseKey === 'legal') return pc === 'legal';
            if (phaseKey === 'design') return ['design', 'structural', 'mep'].includes(pc);
            if (phaseKey === 'build') return pc === 'build' || pc === 'construction';
            if (phaseKey === 'interior') return pc === 'interior';
            return false;
        }).map(m => {
            const linkedTermin = project.payment_termins?.find((t: any) => t.milestone_id === m.id);
            const isSubProfessional = m.type === 'sub_professional';
            
            // Sub-professional fees are already included in initial planning, so we hide their triggers here.
            const terminText = (linkedTermin && !isSubProfessional) 
                ? `Triggers: ${linkedTermin.label} (Rp ${Number(linkedTermin.amount).toLocaleString('id-ID')})`
                : '';

            let assignee = '';
            if (m.arsitek?.user?.name) assignee = `${m.arsitek.user.name} (Architect)`;
            else if (m.kontraktor?.user?.name) assignee = `${m.kontraktor.user.name} (Contractor)`;
            else if (m.notaris?.user?.name) assignee = `${m.notaris.user.name} (Notary)`;
            else if (m.interior?.user?.name) assignee = `${m.interior.user.name} (Interior)`;
            else if (m.pm?.user?.name) assignee = `${m.pm.user.name} (PM)`;
            else if (m.phase_context === 'structural' && project.structural_engineer?.user?.name) assignee = `${project.structural_engineer.user.name} (Structural)`;
            else if (m.phase_context === 'mep' && project.mep_engineer?.user?.name) assignee = `${project.mep_engineer.user.name} (MEP)`;

            // Eagerly match sub-professional assignee if it is a sub-professional milestone
            if (isSubProfessional) {
                if ((m.structural_id || m.title?.toLowerCase().includes('structural') || linkedTermin?.role_type === 'structural') && project.structural_engineer?.user?.name) {
                    assignee = `${project.structural_engineer.user.name} (Structural)`;
                } else if ((m.mep_id || m.title?.toLowerCase().includes('mep') || linkedTermin?.role_type === 'mep') && project.mep_engineer?.user?.name) {
                    assignee = `${project.mep_engineer.user.name} (MEP)`;
                } else if ((m.interior_id || m.title?.toLowerCase().includes('interior') || linkedTermin?.role_type === 'interior') && project.interior?.user?.name) {
                    assignee = `${project.interior.user.name} (Interior)`;
                }
            }

            // Gather deliverables submitted by the sub-professionals
            let files = Array.isArray(m.content?.gallery) ? [...m.content.gallery] : [];
            let fileNames = m.content?.file_names ? { ...m.content.file_names } : {};

            if (isSubProfessional) {
                let role = '';
                if (m.structural_id || m.title?.toLowerCase().includes('structural') || linkedTermin?.role_type === 'structural') {
                    role = 'structural';
                } else if (m.mep_id || m.title?.toLowerCase().includes('mep') || linkedTermin?.role_type === 'mep') {
                    role = 'mep';
                } else if (m.interior_id || m.title?.toLowerCase().includes('interior') || linkedTermin?.role_type === 'interior') {
                    role = 'interior';
                }

                if (role) {
                    const category = role === 'structural' 
                        ? 'structural_calc' 
                        : (role === 'mep' ? 'mep_layout' : 'interior_design');
                    
                    const subDocs = (project?.documents || []).filter((d: any) => d.category === category);
                    subDocs.forEach((d: any) => {
                        if (d.file_path) {
                            if (!files.includes(d.file_path)) {
                                files.push(d.file_path);
                            }
                            fileNames[d.file_path] = d.file_name;
                        }
                    });
                }
            }

            return { 
                type: 'milestone', 
                id: m.id, 
                title: m.title, 
                desc: m.description, 
                files, 
                fileNames, 
                assignee,
                terminText,
                dueDate: m.due_date,
                raw: m 
            };
        });

        const ho = pendingHandovers.filter(h => h.phase === (phaseKey === 'build' ? 'build' : phaseKey))
            .filter(h => h.phase !== 'design')
            .map(h => ({ 
                type: 'handover', 
                id: h.phase, 
                title: `Handover: ${h.title}`, 
                desc: h.state === 'completed' 
                    ? 'Handover Completed & Sealed' 
                    : (h.state === 'awaiting_owner' ? 'PM Sealed - Awaiting Owner' : 'Awaiting PM Seal'), 
                raw: h 
            }));

        const ad = pendingAddendums.filter(a => {
            const rt = a.role_type || '';
            if (phaseKey === 'legal') return rt === 'notaris';
            if (phaseKey === 'design') return ['arsitek', 'structural', 'mep'].includes(rt);
            if (phaseKey === 'build') return rt === 'kontraktor';
            if (phaseKey === 'interior') return rt === 'interior';
            return false;
        }).map(a => ({ type: 'addendum', id: a.id, title: a.title, desc: `Amount: Rp ${Number(a.amount || 0).toLocaleString('id-ID')}`, raw: a }));

        const rec = phaseKey === 'design' ? recommendedBids.map(b => ({
            type: 'rec_bid', id: b.id, title: `Specialist Bid: ${b.bid_type === 'structural' ? 'Structural' : 'MEP'}`,
            desc: `${b.structural_engineer?.user?.name || b.mep_engineer?.user?.name || 'Engineer'} (Architect Rec)`, raw: b
        })) : [];

        return [...ms, ...ho, ...ad, ...rec];
    };

    return (
        <div className="flex gap-4 overflow-x-auto pb-4 pt-1 -mx-2 px-2 scrollbar-thin scrollbar-thumb-zinc-250">
            {phases.map(p => {
                const list = getItems(p.key);
                return (
                    <div key={p.key} className={`w-[410px] min-w-[410px] bg-slate-50 border border-zinc-200/80 rounded-2xl p-4 flex flex-col min-h-[260px] shadow-sm ${p.accentClass} shrink-0`}>
                        <div className="border-b border-zinc-200 pb-3 mb-3 flex items-center justify-between">
                            <div>
                                <h4 className="text-xs font-black text-zinc-900 uppercase tracking-wider">{p.label}</h4>
                                <p className="text-[10px] text-zinc-500 font-medium mt-0.5">{p.sub}</p>
                            </div>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white border border-zinc-250 text-zinc-700 shadow-sm">
                                {list.length}
                            </span>
                        </div>
                        <div className="flex-1 space-y-3 overflow-y-auto max-h-[420px] pr-1 scrollbar-thin scrollbar-thumb-zinc-200">
                            {list.length === 0 ? (
                                <div className="py-8 text-center text-xs text-zinc-400 border border-dashed border-zinc-200 rounded-xl bg-white shadow-sm">
                                    No pending approvals
                                </div>
                            ) : (
                                list.map(item => (
                                    <ApprovalCard
                                        key={`${item.type}-${item.id}`}
                                        item={item}
                                        phaseKey={p.key}
                                        isLoading={isLoading}
                                        onVerifyMilestone={onVerifyMilestone}
                                        onVerifyHandover={onVerifyHandover}
                                        onVerifyAddendum={onVerifyAddendum}
                                        onNavigateToPhase={onNavigateToPhase}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
