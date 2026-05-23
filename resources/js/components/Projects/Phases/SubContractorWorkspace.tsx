import React, { useState } from 'react';
import { Hammer, CalendarDays, FolderOpen, FileText, CheckCircle, Clock, ShieldCheck } from 'lucide-react';
import ConstructionMilestones from './ConstructionMilestones';
import DailySiteLog from './DailySiteLog';
import ProjectDeliverables from './ProjectDeliverables';

interface SubContractorWorkspaceProps {
    project: any;
    currentUser: any;
    activeSub: any;
    activeSubRole: string;
    roleLabel: string;
    scopeNotes?: string;
    rate: number;
}

type TabKey = 'brief' | 'milestones' | 'logs' | 'vault';

export default function SubContractorWorkspace({
    project,
    currentUser,
    activeSub,
    activeSubRole,
    roleLabel,
    scopeNotes,
    rate
}: SubContractorWorkspaceProps): React.ReactElement {
    const [activeTab, setActiveTab] = useState<TabKey>('brief');
    
    // Check if the current user is this specific sub-contractor
    const isUserThisSubPro = Number(currentUser?.id) === Number(activeSub?.user_id);

    // PBG Gate: Only applies to new_build and renovation categories
    const needsPBG = ['new_build', 'renovation'].includes(project?.project_category);
    const isPBGApproved = !needsPBG || project?.milestones?.some((m: any) => 
        (m.content?.req_id === 'pbg_permit' || 
         m.title.toUpperCase().includes('PBG') || 
         m.title.toUpperCase().includes('IMB')) && 
        m.approval_status === 'approved'
    ) || !!project?.pbg_verified_at;

    const TABS = [
        { id: 'brief', label: 'Brief & Scope', icon: FileText },
        { id: 'milestones', label: 'Milestones & Progress', icon: Hammer },
        { id: 'logs', label: 'Daily Site Logs', icon: CalendarDays },
        { id: 'vault', label: 'Vault & Deliverables', icon: FolderOpen },
    ];

    const renderLockScreen = (title: string, description: string) => (
        <div className="p-12 text-center bg-red-50 border border-red-150 rounded-[2rem] space-y-4 max-w-3xl animate-in fade-in zoom-in-95 duration-300">
            <div className="w-14 h-14 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                <ShieldCheck size={28} />
            </div>
            <div className="space-y-1">
                <h4 className="text-base font-black text-red-900 uppercase tracking-tight">{title}</h4>
                <p className="text-xs text-red-700 font-medium leading-relaxed">
                    {description}
                </p>
            </div>
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Elegant Sub-Tab Navigation */}
            <div className="flex items-center gap-1.5 p-1.5 bg-slate-50 border border-slate-100 rounded-2xl w-fit">
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as TabKey)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                active 
                                    ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' 
                                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100/50'
                            }`}
                        >
                            <Icon size={13} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab Contents */}
            <div className="min-h-[400px]">
                {activeTab === 'brief' && (
                    <div className="space-y-6 max-w-3xl">
                        {/* Member card */}
                        <div className="p-6 bg-slate-50 border border-slate-100 rounded-[2rem] flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-white border-2 border-slate-200 flex items-center justify-center text-xl font-black text-slate-700 shadow-sm shrink-0">
                                    {activeSub?.user?.name?.charAt(0) || '?'}
                                </div>
                                <div>
                                    <h5 className="text-base font-black text-slate-900">{activeSub?.user?.name || 'Sub-Contractor'}</h5>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{roleLabel}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-100 rounded-xl">
                                <CheckCircle size={14} className="text-emerald-500" />
                                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Active</span>
                            </div>
                        </div>

                        {/* Scope Notes */}
                        {scopeNotes && (
                            <div className="p-6 bg-white border-2 border-slate-100 rounded-[2rem] shadow-sm">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Scope Notes</p>
                                <p className="text-xs text-slate-600 font-medium leading-relaxed">{scopeNotes}</p>
                            </div>
                        )}

                        {/* Rate Card */}
                        {rate > 0 && (
                            <div className="flex items-center justify-between p-5 bg-slate-50 border border-slate-100 rounded-[2rem]">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Agreed Rate</span>
                                <span className="text-base font-black text-slate-900 bg-white border border-slate-200 px-5 py-2.5 rounded-xl shadow-sm">
                                    Rp {Number(rate).toLocaleString('id-ID')}
                                </span>
                            </div>
                        )}

                        {/* Authority Notice */}
                        {isUserThisSubPro && (
                            <div className="p-4 bg-emerald-50/50 border border-emerald-100/50 rounded-2xl flex items-center gap-3">
                                <CheckCircle className="text-emerald-500 shrink-0" size={16} />
                                <p className="text-[10px] text-emerald-700 font-black uppercase tracking-wider">
                                    You have full developer access to update milestones, submit site logs, and upload technical vault files.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'milestones' && (
                    !isPBGApproved ? (
                        renderLockScreen(
                            "CONSTRUCTION SITE LOCKED",
                            "Physical progress and milestone updates are locked. Regulatory compliance requires the PBG (Building & Planning Permit) to be officially approved before any physical site work begins."
                        )
                    ) : (
                        <ConstructionMilestones
                            project={project}
                            currentUser={currentUser}
                            isContractor={isUserThisSubPro}
                            filterType={activeSubRole}
                        />
                    )
                )}

                {activeTab === 'logs' && (
                    !isPBGApproved ? (
                        renderLockScreen(
                            "CONSTRUCTION SITE LOCKED",
                            "Daily activity logging is locked. Regulatory compliance requires the PBG (Building & Planning Permit) to be officially approved before any physical site work begins."
                        )
                    ) : (
                        <DailySiteLog
                            project={project}
                            isContractor={isUserThisSubPro}
                        />
                    )
                )}

                {activeTab === 'vault' && (
                    <ProjectDeliverables
                        project={project}
                        currentUser={currentUser}
                        isPro={isUserThisSubPro}
                    />
                )}
            </div>
        </div>
    );
}
