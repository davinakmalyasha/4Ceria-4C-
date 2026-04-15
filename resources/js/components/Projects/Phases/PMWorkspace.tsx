import React from 'react';
import { motion } from 'framer-motion';
import { 
    LayoutDashboard, ClipboardList, 
    DollarSign, MessageSquare, BarChart3,
    CheckCircle2, Clock, AlertCircle
} from 'lucide-react';
import ProjectRequirements from '../ProjectRequirements';

interface PMWorkspaceProps {
    project: any;
    user: any;
    onRefresh: () => void;
}

export default function PMWorkspace({ project, user, onRefresh }: PMWorkspaceProps) {
    const milestones = project?.milestones || [];
    const completedCount = milestones.filter((m: any) => m.is_completed).length;
    const progress = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

    return (
        <div className="space-y-8">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard 
                    label="Milestone Progress" 
                    value={`${progress}%`} 
                    subtext={`${completedCount}/${milestones.length} completed`}
                    icon={BarChart3}
                    color="text-blue-600"
                    bg="bg-blue-50"
                />
                <StatCard 
                    label="Active Issues" 
                    value={project?.comments?.length || 0} 
                    subtext="Open discussions"
                    icon={MessageSquare}
                    color="text-red-600"
                    bg="bg-red-50"
                />
                <StatCard 
                    label="Budget Status" 
                    value="Stable" 
                    subtext="View budget tab"
                    icon={DollarSign}
                    color="text-emerald-600"
                    bg="bg-emerald-50"
                />
            </div>

            {/* Procurement / BoM Integration */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-black text-gray-900">Procurement & Resources</h3>
                        <p className="text-sm text-gray-400">Bill of Materials and supply tracking</p>
                    </div>
                </div>
                
                <div className="bg-white rounded-3xl border border-gray-100 p-1 shadow-sm overflow-hidden">
                    <ProjectRequirements 
                        project={project} 
                        user={user}
                        hideInventoryActions={true} 
                    />
                </div>
            </div>

            {/* PM Workflow Notes */}
            <div className="bg-neutral-900 rounded-3xl p-8 text-white relative overflow-hidden">
                <div className="relative z-10">
                    <h3 className="text-xl font-black mb-2 flex items-center gap-2">
                        <LayoutDashboard size={24} className="text-red-500" />
                        Operational Directive
                    </h3>
                    <p className="text-neutral-400 text-sm max-w-xl leading-relaxed">
                        As the Project Manager, you have full oversight across all professional tracks. 
                        Use the **Budget** tab for financial audits and the **QA** tab for vendor coordination.
                        Your milestones are tracked in the global project timeline.
                    </p>
                </div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
            </div>
        </div>
    );
}

function StatCard({ label, value, subtext, icon: Icon, color, bg }: any) {
    return (
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex items-start gap-4">
            <div className={`p-3 rounded-2xl ${bg} ${color}`}>
                <Icon size={24} />
            </div>
            <div>
                <p className="text-sm font-bold text-gray-400">{label}</p>
                <p className="text-2xl font-black text-gray-900 leading-tight my-0.5">{value}</p>
                <p className="text-xs font-medium text-gray-400">{subtext}</p>
            </div>
        </div>
    );
}
